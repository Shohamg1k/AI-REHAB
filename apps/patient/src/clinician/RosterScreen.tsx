import { useEffect, useState } from "react";
import type { User } from "@ai-rehab/contracts";
import { ApiError, createInvite, fetchPatients } from "../lib/api.js";
import { Button } from "../components/Button.js";

export function RosterScreen({ onSelectPatient }: { onSelectPatient: (patientId: string) => void }) {
  const [patients, setPatients] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    fetchPatients()
      .then(setPatients)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your roster."));
  }, []);

  async function handleInvite() {
    setInviteBusy(true);
    setError(null);
    try {
      setInvite(await createInvite());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create an invite code.");
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-16">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-ink">Your patients</h1>
        <Button onClick={handleInvite} disabled={inviteBusy}>
          Invite a patient
        </Button>
      </div>

      {invite && (
        <div className="rounded-lg border border-teal-wash bg-teal-wash p-16">
          <p className="text-b2 font-medium text-teal">Share this code</p>
          <p className="mt-4 text-h1 tabular-nums text-ink">{invite.code}</p>
          <p className="mt-4 text-cap text-ink-3">
            Expires {new Date(invite.expiresAt).toLocaleDateString()}. The patient enters it when they sign up.
          </p>
        </div>
      )}

      {error && <p className="text-b2 text-dang">{error}</p>}

      {patients === null && !error && <p className="text-b2 text-ink-2">Loading…</p>}

      {patients && patients.length === 0 && (
        <p className="text-b2 text-ink-2">
          No patients yet. Invite one with the button above.
        </p>
      )}

      {patients && patients.length > 0 && (
        <ul className="flex flex-col gap-8">
          {patients.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => onSelectPatient(patient.id)}
                className="min-h-touch w-full rounded-lg border border-line bg-surf px-16 py-12 text-left hover:bg-sunk"
              >
                <div className="text-b1 font-medium text-ink">{patient.displayName}</div>
                <div className="text-cap text-ink-3">{patient.email}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
