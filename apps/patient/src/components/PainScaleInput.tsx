const SCALE_WORDS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "None",
  2: "Mild",
  3: "Moderate",
  4: "Strong",
  5: "Severe"
};

/**
 * `Input/Pain Scale` (B2 + B6) — docs/UX-SPEC.md §3: "1-5 with words;
 * footer states the answer is what gets recorded." Copy rule (§5): never
 * "pain level 3" as a system statement — always "you said 3".
 */
export function PainScaleInput({
  value,
  onChange
}: {
  value: number | null;
  onChange: (severity: number) => void;
}) {
  return (
    <div className="flex flex-col gap-12">
      <div className="flex gap-8">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 min-h-touch rounded-md border text-b1 font-medium flex flex-col items-center justify-center gap-2 transition-colors ${
              value === n
                ? "bg-pain text-white border-pain"
                : "bg-surf text-ink border-line hover:bg-sunk"
            }`}
          >
            <span className="text-h2">{n}</span>
            <span className="text-cap">{SCALE_WORDS[n]}</span>
          </button>
        ))}
      </div>
      <p className="text-cap text-ink-3">
        This is what gets recorded — not a guess based on your movement.
      </p>
    </div>
  );
}
