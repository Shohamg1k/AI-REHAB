import { useState } from "react";
import type { Role, User } from "@ai-rehab/contracts";
import { ApiError, login, signup } from "../lib/api.js";
import { setSession } from "../lib/authStore.js";
import { Button } from "../components/Button.js";

/**
 * Optional account layer (G3/G4). Reachable only from a link on
 * WelcomeScreen — never inserted into the guest flow itself. H7 stays the
 * default: a full session works with zero taps here.
 *
 * `onDone` hands back the signed-in user so the caller can role-gate —
 * ADR-0005: a clinician gets an entirely different app shell, not just a
 * different screen (see ClinicianApp.tsx).
 */
export function AuthScreen({ onDone, onBack }: { onDone: (user: User) => void; onBack: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<Role>("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === "signin"
          ? await login(email, password)
          : await signup({ email, password, displayName, role, inviteCode: inviteCode || undefined });
      setSession(result);
      onDone(result.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-20 px-16 py-24 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-h1 text-ink">{mode === "signin" ? "Sign in" : "Create an account"}</h1>
        <p className="text-b2 text-ink-2 mt-4">
          Optional — syncs your sessions across devices. You never need this to use the app.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-16">
        {mode === "signup" && (
          <>
            <label className="flex flex-col gap-4">
              <span className="text-b2 font-medium text-ink-2">Name</span>
              <input
                className="min-h-touch rounded-md border border-line px-16"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <div className="flex gap-8">
              {(["patient", "clinician"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 min-h-touch rounded-md border capitalize ${
                    role === r ? "bg-teal text-white border-teal" : "bg-surf border-line"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {role === "patient" && (
              <label className="flex flex-col gap-4">
                <span className="text-b2 font-medium text-ink-2">Clinician invite code (optional)</span>
                <input
                  className="min-h-touch rounded-md border border-line px-16"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="Leave blank for a personal account"
                />
              </label>
            )}
          </>
        )}

        <label className="flex flex-col gap-4">
          <span className="text-b2 font-medium text-ink-2">Email</span>
          <input
            type="email"
            className="min-h-touch rounded-md border border-line px-16"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="flex flex-col gap-4">
          <span className="text-b2 font-medium text-ink-2">Password</span>
          <input
            type="password"
            className="min-h-touch rounded-md border border-line px-16"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {error && <p className="text-b2 text-dang">{error}</p>}

        <Button type="submit" disabled={busy}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        className="text-b2 text-teal underline"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>

      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
