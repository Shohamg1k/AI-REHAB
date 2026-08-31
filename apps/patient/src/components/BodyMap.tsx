import type { BodyRegion } from "@ai-rehab/contracts";

/**
 * M7's body map — tap where it hurt, rather than picking from a list of
 * region names. Closer to how someone actually reports pain, and it removes
 * the guess about whether "lower back" means the same thing to the patient
 * as it does to the label.
 *
 * Hit targets are generous circles over a simple figure; the figure itself
 * is decorative and non-interactive. Every region is also reachable as a
 * real `<button>` with an accessible name, so this is not a mouse-only
 * control — it is a normal radio-style group that happens to be laid out
 * anatomically.
 *
 * The region is all that is recorded. It is not a diagnosis, and the copy
 * on the screen says so (B6).
 */

type Spot = { region: BodyRegion; cx: number; cy: number; label: string };

// Front-facing figure in a 200×260 viewBox. Left/right are the viewer's,
// which is what someone pointing at a picture of a body means.
const SPOTS: Spot[] = [
  { region: "neck", cx: 100, cy: 44, label: "Neck" },
  { region: "shoulder", cx: 66, cy: 66, label: "Shoulder" },
  { region: "elbow", cx: 52, cy: 112, label: "Elbow" },
  { region: "wrist", cx: 44, cy: 152, label: "Wrist" },
  { region: "lower_back", cx: 100, cy: 118, label: "Lower back" },
  { region: "hip", cx: 122, cy: 142, label: "Hip" },
  { region: "knee", cx: 116, cy: 196, label: "Knee" },
  { region: "ankle", cx: 114, cy: 240, label: "Ankle" }
];

const FIGURE = "#B9C4C6";

export function BodyMap({
  value,
  onChange
}: {
  value: BodyRegion | null;
  onChange: (region: BodyRegion) => void;
}) {
  const selected = SPOTS.find((s) => s.region === value) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="relative rounded bg-sunk py-8">
        <svg viewBox="0 0 200 260" className="mx-auto h-[186px]" role="group" aria-label="Body map">
          <g fill={FIGURE} aria-hidden>
            <ellipse cx="100" cy="26" rx="17" ry="19" />
            <rect x="76" y="50" width="48" height="62" rx="12" />
            <rect x="55" y="56" width="16" height="52" rx="8" />
            <rect x="129" y="56" width="16" height="52" rx="8" />
            <rect x="47" y="106" width="14" height="48" rx="7" />
            <rect x="139" y="106" width="14" height="48" rx="7" />
            <rect x="78" y="112" width="20" height="70" rx="9" />
            <rect x="102" y="112" width="20" height="70" rx="9" />
            <rect x="80" y="180" width="17" height="66" rx="8" />
            <rect x="103" y="180" width="17" height="66" rx="8" />
          </g>

          {selected && (
            <g aria-hidden>
              <circle cx={selected.cx} cy={selected.cy} r="20" fill="#B5410A" opacity=".42" />
              <circle cx={selected.cx} cy={selected.cy} r="13" fill="#B5410A" />
            </g>
          )}

          {SPOTS.map((spot) => (
            <circle
              key={spot.region}
              cx={spot.cx}
              cy={spot.cy}
              r="17"
              fill="transparent"
              className="cursor-pointer"
              onClick={() => onChange(spot.region)}
            />
          ))}
        </svg>

        {selected && (
          <span className="absolute left-14 top-8 font-mono text-[11px] font-semibold uppercase text-pain">
            {selected.label}
          </span>
        )}
      </div>

      {/*
        The same eight regions as real buttons. The SVG hit areas above are a
        convenience, not the only way in — a keyboard or screen-reader user
        gets an ordinary labelled control set.
      */}
      <div className="flex flex-wrap gap-6">
        {SPOTS.map((spot) => (
          <button
            key={spot.region}
            type="button"
            onClick={() => onChange(spot.region)}
            aria-pressed={value === spot.region}
            className={`ds-chip ${
              value === spot.region ? "bg-pain-wash text-pain" : "bg-surf text-ink-2 shadow-hair"
            }`}
          >
            {spot.label}
          </button>
        ))}
      </div>
    </div>
  );
}
