import { Button } from "../components/Button.js";
import { Disclaimer } from "../components/Disclaimer.js";
import { Icon, type IconName } from "../components/Icon.js";
import { isApiConfigured } from "../lib/api.js";
import { getSession } from "../lib/authStore.js";

/**
 * M1 — Welcome. A full session before any signup form (H7), and the three
 * promises the product is actually making, stated up front.
 *
 * The design's hero is a mocked camera view with a skeleton drawn over it.
 * That is not reproduced: a still illustration of tracking, shown before any
 * camera is running, would be showing the patient a result the app has not
 * produced. The claims below it are the honest version of the same pitch.
 */

const PROMISES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "lock",
    title: "The video stays on your device",
    body: "Nothing is recorded or uploaded — we keep the joint positions, never the picture."
  },
  {
    icon: "cam",
    title: "No wearables, no signal needed",
    body: "One ordinary camera, working offline."
  },
  {
    icon: "shield",
    title: "It will never tell you to push through",
    body: "If something looks unsafe, the set stops."
  }
];

export function WelcomeScreen({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  const session = getSession();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="flex flex-col gap-16 px-20 pt-8">
        <div className="flex items-center gap-9">
          <span className="h-26 w-26 rounded-sm bg-teal" />
          <span className="text-h2 text-ink">Rehab Coach</span>
        </div>

        <h1 className="text-d1 text-ink">
          See yourself the way
          <br />
          your physio does.
        </h1>

        <p className="text-b2 text-ink-2">
          Prop your device up, step back, and do your exercises. We count the reps, correct the form
          as you go, and remember exactly where it hurt.
        </p>

        <div className="flex flex-col gap-13 pt-2">
          {PROMISES.map((p) => (
            <div key={p.title} className="flex items-start gap-11">
              <Icon name={p.icon} size={19} className="mt-1 flex-none text-teal" />
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-ink">{p.title}</span>
                <span className="text-b2 text-ink-2">{p.body}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-9 px-20 pb-18 pt-24">
        <Button onClick={onStart}>
          {isApiConfigured() && session ? "Start a session" : "Try a session — no account"}
        </Button>

        {isApiConfigured() && !session && (
          <Button variant="secondary" onClick={onSignIn}>
            I have a code from my physio
          </Button>
        )}
        {isApiConfigured() && session && (
          <p className="text-cap text-ink-3">Signed in as {session.user.displayName}.</p>
        )}
        {!isApiConfigured() && (
          <p className="text-cap text-ink-3">
            No account needed. Your session stays on this device.
          </p>
        )}

        <Disclaimer>
          Coaching aid — not a medical device. It does not diagnose or replace your clinician.
        </Disclaimer>
      </div>
    </div>
  );
}
