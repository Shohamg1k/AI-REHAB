import { useState } from "react";
import type { BodyRegion } from "@ai-rehab/contracts";
import { PainScaleInput } from "../components/PainScaleInput.js";
import { Button } from "../components/Button.js";

const REGIONS: BodyRegion[] = ["shoulder", "elbow", "wrist", "lower_back", "hip", "knee", "ankle", "neck"];

/** B2 — self-report pain check-in. B6: the self-report is what gets recorded, full stop. */
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
    <div className="flex flex-col gap-20 px-16 py-24 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-h1 text-ink">How did that feel?</h1>
        {bookmarked && (
          <p className="text-b2 text-pain mt-4">You flagged a rep during that set — tell us more.</p>
        )}
      </div>

      <div>
        <span className="text-b2 font-medium text-ink-2 mb-8 block">Where, if anywhere?</span>
        <div className="flex flex-wrap gap-8">
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className={`px-16 min-h-touch rounded-pill border text-b2 capitalize transition-colors ${
                region === r
                  ? "bg-teal text-white border-teal"
                  : "bg-surf text-ink border-line hover:bg-sunk"
              }`}
            >
              {r.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-b2 font-medium text-ink-2 mb-8 block">How much did it hurt?</span>
        <PainScaleInput value={severity} onChange={setSeverity} />
      </div>

      <div className="flex flex-col gap-8">
        <Button
          onClick={() => onSubmit(region, severity ?? 1)}
          disabled={severity === null}
        >
          Save and continue
        </Button>
        <Button variant="secondary" onClick={onSkip}>
          No pain to report
        </Button>
      </div>
    </div>
  );
}
