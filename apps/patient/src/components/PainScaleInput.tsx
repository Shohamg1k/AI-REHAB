const SCALE: Array<{ n: 1 | 2 | 3 | 4 | 5; word: string; bg: string; fg: string; ring: string }> = [
  { n: 1, word: "None", bg: "bg-ok-wash", fg: "text-ok", ring: "shadow-[inset_0_0_0_2px_#1F7A4D]" },
  { n: 2, word: "Mild", bg: "bg-[#EAF2E2]", fg: "text-[#4F7A1F]", ring: "shadow-[inset_0_0_0_2px_#4F7A1F]" },
  { n: 3, word: "Moderate", bg: "bg-warn-wash", fg: "text-warn", ring: "shadow-[inset_0_0_0_2px_#A75A0B]" },
  { n: 4, word: "Strong", bg: "bg-pain-wash", fg: "text-pain", ring: "shadow-[inset_0_0_0_2px_#B5410A]" },
  { n: 5, word: "Severe", bg: "bg-dang-wash", fg: "text-dang", ring: "shadow-[inset_0_0_0_2px_#A32218]" }
];

/**
 * `Input/Pain Scale` (B2 + B6) — 1-5 with words, each step carrying its own
 * colour so the scale reads as a gradient rather than five identical
 * buttons. Selection is an inset ring, not a fill swap, so the step's own
 * colour stays legible when chosen.
 *
 * Copy rule (docs/UX-SPEC.md §5): never "pain level 3" as a system
 * statement — always "you said 3". The footer line is load-bearing, not
 * decoration: it is what keeps an inferred signal from being mistaken for
 * the patient's own answer (B6).
 */
export function PainScaleInput({
  value,
  onChange
}: {
  value: number | null;
  onChange: (severity: number) => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex gap-7">
        {SCALE.map((step) => (
          <button
            key={step.n}
            type="button"
            onClick={() => onChange(step.n)}
            aria-pressed={value === step.n}
            className={`flex flex-1 flex-col items-center gap-2 rounded py-9 transition-shadow ${step.bg} ${step.fg} ${
              value === step.n ? step.ring : ""
            }`}
          >
            <span className="font-mono text-h2 font-semibold">{step.n}</span>
            <span className="text-[10.5px]">{step.word}</span>
          </button>
        ))}
      </div>
      <p className="text-cap text-ink-3">
        Your answer is what gets recorded. What we saw only decided which question to ask.
      </p>
    </div>
  );
}
