import { Button } from "../components/Button.js";

/** M1 — welcome / guest session (H7, E4): a full session before any signup form. */
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-24 py-40 text-center gap-24">
      <div className="text-heading-24 text-text-primary">AI Rehab Coach</div>
      <p className="text-body text-text-secondary max-w-md">
        Your camera watches how you move, counts your reps, and tells you what to fix while
        you're doing it — right in your browser. Nothing is recorded or sent anywhere.
      </p>
      <Button onClick={onStart} className="mt-8">
        Start a session
      </Button>
      <p className="text-caption text-text-muted max-w-sm">
        No account needed. Your session stays on this device.
      </p>
    </div>
  );
}
