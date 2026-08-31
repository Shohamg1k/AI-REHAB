import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@ai-rehab/contracts";
import { loadRoutine, pushRoutine, reconcileRoutine, saveRoutine } from "./routine.js";
import { clearSession, setSession } from "./authStore.js";

const PATIENT: User = {
  id: "pat-1",
  tenantId: "tenant-1",
  email: "pat@example.com",
  displayName: "Pat",
  role: "patient",
  contraindicatedRegions: [],
  dataSharingEnabled: true,
  routine: [],
  createdAt: "2026-01-01T00:00:00.000Z"
};

function signedIn(user: User = PATIENT) {
  setSession({ token: "t", user });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_API_URL", "http://test.local");
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => PATIENT }) as unknown as typeof fetch;
});

afterEach(() => {
  clearSession();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * The conflict policy is blunt on purpose — server wins on sign-in, last
 * save wins after — so it needs to be *predictable*, which is what these
 * pin down. The alternative (merging two device's routines) produces a
 * combined list neither patient asked for.
 */
describe("reconcileRoutine", () => {
  it("takes the server's routine, because that is the copy that followed the patient here", () => {
    saveRoutine(["sit-to-stand"]);
    signedIn();

    const changed = reconcileRoutine({ ...PATIENT, routine: ["seated-neck-side-tilt"] });

    expect(changed).toBe(true);
    expect(loadRoutine()).toEqual(["seated-neck-side-tilt"]);
  });

  it("pushes a local routine up when the server has none — the first sync after signing up", async () => {
    saveRoutine(["seated-elbow-flexion"]);
    signedIn();

    reconcileRoutine({ ...PATIENT, routine: [] });

    expect(loadRoutine()).toEqual(["seated-elbow-flexion"]);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toContain("/me/routine");
    expect(JSON.parse(init.body)).toEqual({ exerciseIds: ["seated-elbow-flexion"] });
  });

  it("reports no change when both copies already agree, so nothing re-renders needlessly", () => {
    saveRoutine(["sit-to-stand", "seated-neck-side-tilt"]);
    signedIn();

    const changed = reconcileRoutine({
      ...PATIENT,
      routine: ["sit-to-stand", "seated-neck-side-tilt"]
    });

    expect(changed).toBe(false);
  });

  it("drops server exercises this build no longer has", () => {
    signedIn();
    reconcileRoutine({ ...PATIENT, routine: ["sit-to-stand", "removed-in-a-later-release"] });
    expect(loadRoutine()).toEqual(["sit-to-stand"]);
  });

  it("does nothing for a clinician, who has no routine of their own", () => {
    saveRoutine(["sit-to-stand"]);
    signedIn();

    const changed = reconcileRoutine({ ...PATIENT, role: "clinician", routine: [] });

    expect(changed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("leaves a guest alone entirely", () => {
    saveRoutine(["sit-to-stand"]);
    // No session at all.
    pushRoutine(["sit-to-stand"]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(loadRoutine()).toEqual(["sit-to-stand"]);
  });
});

describe("pushRoutine", () => {
  it("never lets a failed sync lose the patient's choice", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    signedIn();
    saveRoutine(["sit-to-stand"]);

    expect(() => pushRoutine(["sit-to-stand"])).not.toThrow();
    await Promise.resolve();

    // Local is the copy the UI reads, and it survives the server being down.
    expect(loadRoutine()).toEqual(["sit-to-stand"]);
  });
});
