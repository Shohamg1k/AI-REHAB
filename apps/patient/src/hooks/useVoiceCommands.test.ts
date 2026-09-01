import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVoiceCommands } from "./useVoiceCommands.js";
import type { VoiceCommand } from "../lib/voice/commands.js";

/**
 * The `SpeechRecognition` plumbing, driven by a fake recogniser.
 *
 * The matcher is tested separately and purely; what is left here is the part
 * that is easy to get wrong and impossible to see: "continuous" listening is
 * really "restart it every time the browser stops it", and the browser stops
 * it constantly.
 */
class FakeRecognition {
  static instances: FakeRecognition[] = [];

  lang = "";
  continuous = false;
  interimResults = true;
  maxAlternatives = 0;
  started = 0;
  aborted = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started += 1;
  }
  stop() {}
  abort() {
    this.aborted += 1;
  }

  /** Deliver a final transcript, as the browser would. */
  say(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { length: 1, isFinal: true, 0: { transcript } } }
    });
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1]!;

describe("useVoiceCommands", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const setup = (enabled = true, onCommand: (c: VoiceCommand) => void = vi.fn()) => {
    const view = renderHook(() => useVoiceCommands({ enabled, locale: "en", onCommand }));
    return { view, onCommand };
  };

  it("does not touch the microphone while disabled", () => {
    const { view } = setup(false);
    expect(FakeRecognition.instances).toHaveLength(0);
    expect(view.result.current.status).toBe("off");
  });

  it("listens in the patient's language once enabled", () => {
    const { view } = setup(true);
    expect(latest().started).toBe(1);
    expect(latest().lang).toBe("en-US");
    expect(latest().continuous).toBe(true);
    // Final results only — interim results fire repeatedly for one phrase and
    // would write several pain bookmarks for one complaint.
    expect(latest().interimResults).toBe(false);
    expect(view.result.current.status).toBe("listening");
  });

  it("passes matched commands through and ignores everything else", () => {
    const heard: VoiceCommand[] = [];
    setup(true, (c) => {
      heard.push(c);
    });

    act(() => latest().say("pause"));
    act(() => latest().say("what time is dinner"));
    act(() => latest().say("my shoulder hurts"));

    expect(heard).toEqual([{ kind: "pause" }, { kind: "pain", region: "shoulder" }]);
  });

  /** The browser ends the stream after silence — someone exercising is quiet. */
  it("restarts itself when the browser stops the stream", () => {
    setup(true);
    const recognition = latest();
    expect(recognition.started).toBe(1);

    act(() => recognition.onend?.());
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(recognition.started).toBe(2);
  });

  /**
   * A declined microphone is an answer, not an error to retry. Restarting
   * would re-prompt the patient indefinitely.
   */
  it("stops for good when microphone access is declined", () => {
    const { view } = setup(true);
    const recognition = latest();

    act(() => recognition.onerror?.({ error: "not-allowed" }));
    expect(view.result.current.status).toBe("denied");

    act(() => recognition.onend?.());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(recognition.started).toBe(1); // never retried
  });

  it("aborts rather than stops when the screen goes away", () => {
    const { view } = setup(true);
    const recognition = latest();

    view.unmount();

    // `stop` waits to deliver one more result; a command arriving after the
    // screen is gone has nowhere to go.
    expect(recognition.aborted).toBe(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(recognition.started).toBe(1);
  });

  it("reports unsupported when the browser has no recogniser", () => {
    vi.unstubAllGlobals();
    const { view } = setup(true);
    expect(view.result.current.status).toBe("unsupported");
  });
});
