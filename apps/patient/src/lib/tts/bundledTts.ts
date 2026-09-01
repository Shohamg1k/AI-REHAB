import type { Locale } from "@ai-rehab/contracts";
import type { MainToTtsMessage, TtsToMainMessage } from "../../worker/ttsProtocol.js";

/**
 * H9/ADR-0011 — client for the bundled neural voice.
 *
 * Exists because the device's own voices are not universal: a machine with no
 * Hindi voice installed cannot speak Hindi at all, and telling a patient to go
 * and install one is not a product. This ships a voice with the app.
 *
 * **The cache is the feature, not an optimisation.** Measured in the browser:
 * ~5s to synthesise one cue (single-threaded wasm; the Node spike's 1.4s was
 * misleading). Speaking a correction 5s after the rep it refers to is
 * worse than not speaking it. So cue audio is rendered *ahead of time* — from
 * the moment the session mounts — and played from memory in half a
 * millisecond. Anything
 * that cannot be rendered ahead (a safety reason quoting live numbers) falls
 * back to the device voice, which is slower to sound good but immediate.
 */

const BASE_PATH = "/tts";

export type BundledVoice = {
  locale: Locale;
  id: string;
  licence: string;
  nonCommercial: boolean;
  attribution: string;
  approxBytes: number;
};

type Manifest = { stagedAt: string; voices: BundledVoice[] };

let manifestPromise: Promise<Manifest | null> | null = null;

/**
 * What the server actually has. Null when `pnpm setup:tts` was never run,
 * which is a supported state — the app falls back to device voices and says
 * so, rather than 404ing on a 60MB file mid-session.
 */
export function loadManifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch(`${BASE_PATH}/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

export async function bundledVoiceFor(locale: Locale): Promise<BundledVoice | null> {
  const manifest = await loadManifest();
  return manifest?.voices.find((v) => v.locale === locale) ?? null;
}

export type SynthesisedClip = { pcm: Float32Array; sampleRate: number };

class BundledTtsEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<
    string,
    { resolve: (clip: SynthesisedClip) => void; reject: (error: Error) => void }
  >();
  private nextId = 0;
  /** Rendered audio, keyed by the exact text. Cleared when the voice changes. */
  private cache = new Map<string, SynthesisedClip>();
  private voiceId: string | null = null;

  private start(voiceId: string): Promise<void> {
    if (this.worker && this.voiceId === voiceId && this.ready) return this.ready;

    this.dispose();
    this.voiceId = voiceId;

    const worker = new Worker(new URL("../../worker/ttsWorker.ts", import.meta.url), {
      type: "module"
    });
    this.worker = worker;

    this.ready = new Promise<void>((resolve, reject) => {
      const onReady = (event: MessageEvent<TtsToMainMessage>) => {
        const message = event.data;
        if (message.type === "ready") resolve();
        else if (message.type === "error" && message.id === null) reject(new Error(message.message));
      };
      worker.addEventListener("message", onReady);
    });

    worker.addEventListener("message", (event: MessageEvent<TtsToMainMessage>) => {
      const message = event.data;
      if (message.type === "audio") {
        this.pending.get(message.id)?.resolve({ pcm: message.pcm, sampleRate: message.sampleRate });
        this.pending.delete(message.id);
      } else if (message.type === "error" && message.id) {
        this.pending.get(message.id)?.reject(new Error(message.message));
        this.pending.delete(message.id);
      }
    });

    const init: MainToTtsMessage = { type: "init", basePath: BASE_PATH, voiceId };
    worker.postMessage(init);
    return this.ready;
  }

  /** Already-rendered audio for this text, or null. Never triggers synthesis. */
  cached(text: string): SynthesisedClip | null {
    return this.cache.get(text) ?? null;
  }

  async synthesise(voiceId: string, text: string): Promise<SynthesisedClip> {
    const hit = this.cache.get(text);
    if (hit) return hit;

    await this.start(voiceId);
    const worker = this.worker;
    if (!worker) throw new Error("TTS worker unavailable");

    const id = String(this.nextId++);
    const clip = await new Promise<SynthesisedClip>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message: MainToTtsMessage = { type: "synth", id, text };
      worker.postMessage(message);
    });

    this.cache.set(text, clip);
    return clip;
  }

  /**
   * Render several lines ahead of use, one at a time.
   *
   * Sequential on purpose: the worker runs `callMain` on a non-reentrant
   * Emscripten module, and parallel requests would interleave inside it.
   * Failures are swallowed per line — a cue we could not render is a cue
   * spoken by the device voice instead, not a broken session.
   */
  async prerender(voiceId: string, texts: readonly string[]): Promise<number> {
    let rendered = 0;
    for (const text of texts) {
      if (this.cache.has(text)) continue;
      try {
        await this.synthesise(voiceId, text);
        rendered += 1;
      } catch {
        // Deliberately ignored — see above.
      }
    }
    return rendered;
  }

  dispose(): void {
    if (this.worker) {
      const message: MainToTtsMessage = { type: "dispose" };
      this.worker.postMessage(message);
      this.worker.terminate();
    }
    this.worker = null;
    this.ready = null;
    this.voiceId = null;
    this.pending.clear();
    this.cache.clear();
  }
}

export const bundledTts = new BundledTtsEngine();

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

/**
 * Play a rendered clip. Separate from synthesis so that cached audio can be
 * played on the same tick a cue fires, with no await in between.
 */
export function playClip(clip: SynthesisedClip): void {
  audioContext ??= new AudioContext();
  // Autoplay policy parks the context until a gesture; every path here is
  // downstream of the patient pressing something.
  void audioContext.resume();

  stopClip();

  const buffer = audioContext.createBuffer(1, clip.pcm.length, clip.sampleRate);
  // Copied into a plain ArrayBuffer view: onnxruntime may hand back a
  // SharedArrayBuffer-backed array, which `copyToChannel` will not accept.
  buffer.copyToChannel(new Float32Array(clip.pcm), 0);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.onended = () => {
    if (currentSource === source) currentSource = null;
  };
  source.start();
  currentSource = source;
}

export function stopClip(): void {
  if (!currentSource) return;
  try {
    currentSource.stop();
  } catch {
    // Already finished.
  }
  currentSource = null;
}
