import { useState } from "react";
import type { BodyRegion } from "@ai-rehab/contracts";
import { BodyMap } from "../components/BodyMap.js";
import { PainScaleInput } from "../components/PainScaleInput.js";
import { Button } from "../components/Button.js";
import { Chip } from "../components/Chip.js";
import { Disclaimer } from "../components/Disclaimer.js";

/**
 * M7 — Rest check-in. B2's self-report, asked between sets.
 *
 * B6 is the load-bearing rule here: the patient's answer is what gets
 * recorded, full stop. Anything the system noticed only decided *which*
 * question to ask — it never becomes the recorded value.
 *
 * The design also shows a skeleton replay of the flagged rep, scrubbable,
 * with the pain moment marked on the timeline. That is not built and cannot
 * be without changing what this product stores: ADR-0002 means no landmark
 * sequence is ever persisted past the pose worker, so there is nothing to
 * replay. The design's own caption for it — "there is no video of this rep,
 * because none was ever kept" — is true of the skeleton too.
 */
export function PainCheckInScreen({
  bookmarked,
  onSubmit,
  onSkip
}: {
  bookmarked: boolean;
  onSubmit: (region: BodyRegion | null, severity: number) => void;
  onSkip: () => void;
}) {
  const [region, setRegion] = useState<BodyRegion | null>(null);
  const [severity, setSeverity] = useState<number | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="flex items-start gap-12 px-20 pb-12 pt-6">
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-h1 text-ink">Set done</h1>
          <span className="font-mono text-[11.5px] uppercase text-ink-3">
            Rest · 2 questions
          </span>
        </div>
        {bookmarked && <Chip tone="pain">Rep flagged</Chip>}
      </div>

      <div className="flex flex-col gap-12 px-20">
        <div className="ds-card-hair flex flex-col gap-10">
          <h2 className="text-h2 text-ink">Where was it?</h2>
          <BodyMap value={region} onChange={setRegion} />
          <p className="text-cap text-ink-3">
            Tap the spot. We log the region, not a diagnosis.
          </p>
        </div>

        <div className="ds-card-hair flex flex-col gap-10">
          <h2 className="text-h2 text-ink">
            {region
              ? `How did that ${region.replace(/_/g, " ")} feel?`
              : "How did that feel?"}
          </h2>
          <PainScaleInput value={severity} onChange={setSeverity} />
        </div>

        <Disclaimer icon="lock">
          Skeleton only — there is no video of this set, because none was ever kept.
        </Disclaimer>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-9 px-20 pb-16 pt-20">
        <Button onClick={() => onSubmit(region, severity ?? 1)} disabled={severity === null}>
          Continue
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="p-4 text-center text-[14.5px] font-medium text-ink-2"
        >
          No pain to report
        </button>
      </div>
    </div>
  );
}
