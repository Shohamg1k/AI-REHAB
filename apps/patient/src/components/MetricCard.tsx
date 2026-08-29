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
    <div className="bg-surface border border-border rounded-lg p-16 flex flex-col gap-4">
      <span className="text-label text-text-secondary uppercase tracking-wide">{label}</span>
      <div className="flex items-baseline gap-8">
        <span className="text-metric text-text-primary">{value}</span>
        {delta && <span className="text-body-sm text-text-secondary">{delta}</span>}
      </div>
      <span className="text-caption text-text-muted">{caption}</span>
    </div>
  );
}
