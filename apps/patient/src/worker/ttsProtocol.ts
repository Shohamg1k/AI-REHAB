/** Main thread -> TTS worker (ADR-0011). */
export type MainToTtsMessage =
  | { type: "init"; basePath: string; voiceId: string }
  /** `id` correlates the reply; synthesis is slow enough that several can be in flight. */
  | { type: "synth"; id: string; text: string }
  | { type: "dispose" };

/** TTS worker -> main thread. */
export type TtsToMainMessage =
  | { type: "ready" }
  | { type: "audio"; id: string; pcm: Float32Array; sampleRate: number }
  /** `id` is null for failures that are not tied to one request, such as init. */
  | { type: "error"; id: string | null; message: string };
