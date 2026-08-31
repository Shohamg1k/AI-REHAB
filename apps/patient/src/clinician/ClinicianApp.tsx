import { useState } from "react";
import type { User } from "@ai-rehab/contracts";
import { RosterScreen } from "./RosterScreen.js";
import { PatientDetailScreen } from "./PatientDetailScreen.js";

/**
 * ADR-0005: a clinician gets an entirely different app shell on the same
 * codebase, not a role-gated screen inside the patient flow — a clinician
 * never does an exercise, so none of the camera/session machinery applies.
 * F6's other half: apps/api's clinician endpoints (roster, program
 * assignment) had no UI before this — see docs/STATUS.md.
 */
export function ClinicianApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-16 px-16 py-16">
      <header className="flex items-center justify-between border-b border-line pb-12">
        <div>
          <div className="text-h2 text-ink">{user.displayName}</div>
          <div className="text-cap text-ink-3">Clinician</div>
        </div>
        <button type="button" className="text-b2 text-teal underline" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      {selectedPatientId ? (
        <PatientDetailScreen patientId={selectedPatientId} onBack={() => setSelectedPatientId(null)} />
      ) : (
        <RosterScreen onSelectPatient={setSelectedPatientId} />
      )}
    </div>
  );
}
