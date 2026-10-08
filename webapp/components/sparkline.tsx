/** A tiny line chart of a series of numbers (server-renderable). */
export function Sparkline({ values, color = "#0E7C86", height = 44, label = "Value over the last year" }: { values: number[]; color?: string; height?: number; label?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const w = 240, pad = 3;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - pad * 2) + pad).toFixed(1)},${(height - pad - ((v - min) / span) * (height - pad * 2)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-11 w-full" role="img" aria-label={label}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}
