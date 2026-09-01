import { useEffect, useState } from "react";
import type { AuditEntry, User } from "@ai-rehab/contracts";
import { ApiError, fetchAuditLog, fetchMe, joinWithCode, updateDataSharing } from "../lib/api.js";
import { setSession } from "../lib/authStore.js";
import { Button } from "../components/Button.js";
import { Icon } from "../components/Icon.js";
import { MessageThread } from "../components/MessageThread.js";

/**
 * M10 — Sharing & privacy. G5's consent half and access log, on their own
 * screen instead of buried at the bottom of Progress.
 *
 * The design shows three recipients (a physiotherapist, a caregiver, a
 * research study). Only the first exists in this system: `dataSharingEnabled`
 * gates a clinician's read of a patient's sessions and is enforced in
 * `apps/api/src/routes/patients.ts`. Caregiver and study sharing are not
 * built, so they are not shown — a consent toggle that controls nothing is
 * worse than an absent one, because it tells the patient their data is
 * restricted when nothing is restricting it.
 *
 * The design's "Download or delete everything" button is likewise omitted:
 * export and erasure are real obligations, not decoration, and there is no
 * endpoint behind it yet. Both gaps are tracked in docs/STATUS.md.
 */

function Toggle({
  on,
  disabled,
  label,
  onChange
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-26 w-[44px] flex-none rounded-pill transition-colors disabled:opacity-50 ${
        on ? "bg-teal" : "bg-line-strong"
      }`}
    >
      <span
        className={`absolute top-[3px] h-20 w-20 rounded-pill bg-white transition-all ${
          on ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

export function SharingScreen({
  user,
  signedIn,
  onSignIn,
  onSignOut,
  onUserChanged
}: {
  user: User | null;
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onUserChanged: (user: User) => void;
}) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    Promise.all([fetchMe(), fetchAuditLog()])
      .then(([me, log]) => {
        setSharing(me.dataSharingEnabled);
        setAuditLog(log);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Couldn't load your sharing settings.")
      );
  }, [signedIn]);

  async function handleJoin() {
    setJoinError(null);
    setJoining(true);
    try {
      const result = await joinWithCode(code.trim());
      // The tenant changed, so the old token is stale — replace the whole
      // session, not just the user.
      setSession({ token: result.token, user: result.user });
      onUserChanged(result.user);
      setLinked(true);
      setCode("");
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.message : "Couldn't use that code. Check it and try again."
      );
    } finally {
      setJoining(false);
    }
  }

  async function toggleSharing() {
    if (sharing === null) return;
    setSaving(true);
    try {
      const updated = await updateDataSharing(!sharing);
      setSharing(updated.dataSharingEnabled);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update sharing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="flex flex-col gap-5 px-20 pt-8">
        <h1 className="text-d1 text-ink">
          Who can see
          <br />
          your data
        </h1>
        <p className="text-b2 text-ink-2">
          Switch any of this off at any time. It takes effect immediately.
        </p>
      </div>

      <div className="flex flex-col gap-10 px-20 pt-14">
        {/* True of the architecture, not a promise about policy — see ADR-0002. */}
        <div className="flex flex-col gap-6 rounded-md bg-teal-wash p-14">
          <div className="flex items-center gap-6">
            <Icon name="lock" size={15} className="text-teal-deep" />
            <span className="ds-label text-teal-deep">Never shared, by design</span>
          </div>
          <p className="text-b2 text-teal-deep">
            Camera video. Pose runs on this device and each frame is dropped as it is read — there is
            nothing to share, not even with us.
          </p>
        </div>

        {/*
          Added with ADR-0009. This screen is where a patient comes to find
          out who can see their data, so a service that processes it cannot
          be mentioned only in a footnote on another screen.
        */}
        <div className="ds-card-hair flex flex-col gap-6">
          <div className="flex items-center gap-6">
            <Icon name="warning" size={15} className="text-warn" />
            <span className="ds-label text-warn">Sent to an AI service</span>
          </div>
          <p className="text-b2 text-ink-2">
            When you ask the coach a question after a set, that set's figures — reps, form scores,
            what you said about pain — are sent to Groq to answer it. Your camera video is not, and
            neither is your name or email. If you never ask, nothing is sent.
          </p>
        </div>

        {error && <p className="text-b2 text-dang">{error}</p>}

        {!signedIn && (
          <div className="ds-card-hair flex flex-col gap-9">
            <p className="text-b2 text-ink-2">
              You're using Rehab Coach without an account, so nothing is shared with anyone. Sign in
              to connect a clinician and control what they can see.
            </p>
            <Button variant="secondary" onClick={onSignIn}>
              Sign in
            </Button>
          </div>
        )}

        {signedIn && sharing !== null && (
          <div className="ds-card-hair flex flex-col gap-9">
            <div className="flex items-center gap-11">
              <span className="flex h-36 w-36 flex-none items-center justify-center rounded-pill bg-teal-wash text-teal">
                <Icon name="shield" size={18} />
              </span>
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-b1 font-medium text-ink">Your clinician</span>
                <span className="font-mono text-lb uppercase text-ink-3">
                  {sharing ? "Sharing on" : "Sharing off"}
                </span>
              </span>
              <Toggle
                on={sharing}
                disabled={saving}
                label="Share my sessions with my clinician"
                onChange={toggleSharing}
              />
            </div>
            <p className="text-b2 text-ink-2">
              {sharing
                ? "Sessions, form scores, pain reports and safety events."
                : "Your clinician cannot open your sessions while this is off. They stay on your roster."}
            </p>
          </div>
        )}

        {signedIn && !linked && (
          <div className="ds-card-hair flex flex-col gap-9">
            <span className="ds-label">Connect a clinician</span>
            <p className="text-b2 text-ink-2">
              If your physiotherapist gave you a code, enter it here. You can do this at any time —
              you don't have to have used it when you signed up.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Invite code"
              aria-label="Invite code"
              autoCapitalize="characters"
              spellCheck={false}
              className="min-h-touch rounded border-0 bg-sunk px-14 font-mono text-b1 uppercase tracking-[.08em] text-ink shadow-hair placeholder:tracking-normal placeholder:text-ink-3"
            />
            {joinError && <p className="text-b2 text-dang">{joinError}</p>}
            <Button onClick={handleJoin} disabled={joining || code.trim().length === 0}>
              {joining ? "Connecting…" : "Connect"}
            </Button>
          </div>
        )}

        {linked && (
          <div className="flex flex-col gap-6 rounded-md bg-ok-wash p-14">
            <span className="ds-label text-ok">Connected</span>
            <p className="text-b2 text-ok">
              Your clinician can now see your sessions. Turn that off above whenever you want.
            </p>
          </div>
        )}

        {signedIn && auditLog && (
          <div className="ds-sunk flex flex-col gap-8">
            <span className="ds-label">Who opened your data</span>
            {auditLog.length === 0 && (
              <p className="text-b2 text-ink-2">No clinician has opened your data.</p>
            )}
            {auditLog.map((entry) => (
              <div key={entry.id} className="flex items-baseline gap-11">
                <span className="flex-1 text-b2 text-ink-2">
                  {entry.actorDisplayName} — {entry.action.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-lb uppercase text-ink-3">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {signedIn && user && (
          <div className="ds-card-hair flex flex-col gap-10">
            <span className="ds-label">Messages with your clinician</span>
            <MessageThread
              currentUserId={user.id}
              emptyHint="No messages yet. You can ask your clinician about an exercise, or tell them how something felt."
            />
          </div>
        )}
      </div>

      <div className="flex-1" />

      {signedIn && (
        <div className="flex flex-col gap-9 px-20 pb-12 pt-20">
          <span className="text-cap text-ink-3">
            Signed in as {user?.displayName ?? "your account"}.
          </span>
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
