/**
 * `Card/Metric` — docs/UX-SPEC.md §3: "value + delta + caption; a bare
 * number is not shippable." `caption` is required, not optional, on purpose.
 */
export function MetricCard({
  label,
  value,
  delta,
  caption
}: {
  label: string;
  value: string | number;
  delta?: string;
  caption: string;
}) {
  return (
    <div className="bg-surf border border-line rounded-lg p-16 flex flex-col gap-4">
      <span className="text-b2 font-medium text-ink-2 uppercase tracking-wide">{label}</span>
      <div className="flex items-baseline gap-8">
        <span className="text-metric text-ink">{value}</span>
        {delta && <span className="text-b2 text-ink-2">{delta}</span>}
      </div>
      <span className="text-cap text-ink-3">{caption}</span>
    </div>
  );
}
