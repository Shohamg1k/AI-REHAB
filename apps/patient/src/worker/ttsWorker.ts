/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import type { TtsToMainMessage, MainToTtsMessage } from "./ttsProtocol.js";

/**
 * H9/ADR-0011 — bundled neural speech synthesis, off the main thread.
 *
 * Runs Piper: espeak-ng phonemises the text to phoneme ids, then a small VITS
 * ONNX graph turns those into PCM. Both are served from our own origin (see
 * `scripts/fetch-tts-assets.mjs`), so this works on a network that blocks
 * CDNs and without announcing a session to a third party.
 *
 * **Why a worker.** Measured in a browser, one cue costs ~5s of
 * inference and the ONNX session takes several seconds to create. On the main
 * thread that would stall the capture loop — ADR-0001's per-frame budget is
 * 40ms. Nothing here is in the per-frame path; it is called between sets and
 * during the countdown.
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope;

type PhonemizeFactory = (options: {
  print: (data: string) => void;
  printErr: (message: string) => void;
  locateFile: (url: string) => string;
}) => Promise<{ callMain: (args: string[]) => void }>;

let basePath = "/tts";
let espeakVoice = "hi";
let session: ort.InferenceSession | null = null;
let phonemizeFactory: PhonemizeFactory | null = null;
let inference = { noise_scale: 0.667, length_scale: 1.0, noise_w: 0.8 };
let sampleRate = 22050;

/**
 * The phonemizer is an Emscripten module that writes its result to `print`
 * as JSON and expects to be re-created per call — `callMain` runs a CLI
 * `main()`, which is not re-entrant.
 */
async function phonemize(text: string): Promise<number[]> {
  if (!phonemizeFactory) {
    const module = (await import(/* @vite-ignore */ `${basePath}/piper_phonemize.mjs`)) as {
      default: PhonemizeFactory;
    };
    phonemizeFactory = module.default;
  }

  return new Promise<number[]>((resolve, reject) => {
    let settled = false;
    phonemizeFactory!({
      print: (data) => {
        if (settled) return;
        settled = true;
        try {
          resolve(JSON.parse(data).phoneme_ids as number[]);
        } catch (error) {
          reject(new Error(`phonemizer returned unparseable output: ${String(error)}`));
        }
      },
      printErr: (message) => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      },
      locateFile: (url) =>
        url.endsWith(".wasm")
          ? `${basePath}/piper_phonemize.wasm`
          : url.endsWith(".data")
            ? `${basePath}/piper_phonemize.data`
            : url
    })
      .then((module) =>
        module.callMain([
          "-l",
          espeakVoice,
          "--input",
          JSON.stringify([{ text: text.trim() }]),
          // A path inside the Emscripten virtual filesystem, which the .data
          // file mounts — not a URL. `locateFile` above is what points the
          // runtime at our origin for the real downloads.
          "--espeak_data",
          "/espeak-ng-data"
        ])
      )
      .catch(reject);
  });
}

async function init(message: Extract<MainToTtsMessage, { type: "init" }>): Promise<void> {
  basePath = message.basePath;
  ort.env.wasm.wasmPaths = `${basePath}/ort/`;
  // Single-threaded: cross-origin isolation (COOP/COEP) is not something this
  // app can assume of whoever deploys it, and without it threaded wasm will
  // not start at all. This is the single largest cost here (~5s a cue) and
  // the reason cue audio is rendered ahead of time rather than on demand.
  ort.env.wasm.numThreads = 1;

  const configResponse = await fetch(`${basePath}/voices/${message.voiceId}.onnx.json`);
  if (!configResponse.ok) throw new Error(`voice config ${configResponse.status}`);
  const config = (await configResponse.json()) as {
    espeak: { voice: string };
    inference: typeof inference;
    audio: { sample_rate: number };
  };
  espeakVoice = config.espeak.voice;
  inference = config.inference;
  sampleRate = config.audio.sample_rate;

  session = await ort.InferenceSession.create(`${basePath}/voices/${message.voiceId}.onnx`, {
    executionProviders: ["wasm"]
  });
}

async function synthesise(text: string): Promise<{ pcm: Float32Array; sampleRate: number }> {
  if (!session) throw new Error("TTS worker used before init");

  const ids = await phonemize(text);
  if (ids.length === 0) throw new Error("phonemizer produced no phonemes");

  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)])),
    scales: new ort.Tensor(
      "float32",
      Float32Array.from([inference.noise_scale, inference.length_scale, inference.noise_w])
    )
  };

  const output = await session.run(feeds);
  const first = output[session.outputNames[0]!];
  if (!first) throw new Error("model returned no output");
  return { pcm: first.data as Float32Array, sampleRate };
}

ctx.onmessage = async (event: MessageEvent<MainToTtsMessage>) => {
  const message = event.data;
  try {
    switch (message.type) {
      case "init":
        await init(message);
        ctx.postMessage({ type: "ready" } satisfies TtsToMainMessage);
        break;
      case "synth": {
        const { pcm, sampleRate: rate } = await synthesise(message.text);
        // Transferred, not copied — a few seconds of 22kHz float audio is
        // hundreds of kilobytes and there is no reason to clone it.
        ctx.postMessage({ type: "audio", id: message.id, pcm, sampleRate: rate }, [pcm.buffer]);
        break;
      }
      case "dispose":
        await session?.release();
        session = null;
        break;
    }
  } catch (error) {
    ctx.postMessage({
      type: "error",
      id: message.type === "synth" ? message.id : null,
      message: error instanceof Error ? error.message : String(error)
    } satisfies TtsToMainMessage);
  }
};
