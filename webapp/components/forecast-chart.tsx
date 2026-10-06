/** End-of-day cash balance as a step line; the part below zero is red. Server-renderable. */
export function ForecastChart({ points, lowIndex, label }: { points: number[]; lowIndex: number; label: string }) {
  if (points.length < 2) return null;
  const W = 600, H = 150, padX = 4, padT = 10, padB = 10;
  const lo = Math.min(0, ...points);
  const hi = Math.max(0, ...points);
  const span = hi - lo || 1;
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  let line = `M${x(0).toFixed(1)},${y(points[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) line += ` L${x(i).toFixed(1)},${y(points[i - 1]).toFixed(1)} L${x(i).toFixed(1)},${y(points[i]).toFixed(1)}`;
  const base = H - padB;
  const area = `${line} L${x(points.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
  const zeroY = y(0);
  const crosses = lo < 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <clipPath id="fc-above"><rect x="0" y="0" width={W} height={crosses ? zeroY : H} /></clipPath>
        <clipPath id="fc-below"><rect x="0" y={zeroY} width={W} height={Math.max(0, H - zeroY)} /></clipPath>
      </defs>
      <g clipPath="url(#fc-above)">
        <path d={area} fill="#2E6BE6" opacity="0.12" />
        <path d={line} fill="none" stroke="#2E6BE6" strokeWidth="2.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
      {crosses && (
        <g clipPath="url(#fc-below)">
          <path d={area} fill="#DC2626" opacity="0.14" />
          <path d={line} fill="none" stroke="#DC2626" strokeWidth="2.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {crosses && <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="#DC2626" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" vectorEffect="non-scaling-stroke" />}
      <circle cx={x(lowIndex)} cy={y(points[lowIndex])} r="4.5" fill={points[lowIndex] < 0 ? "#DC2626" : "#2E6BE6"} stroke="white" strokeWidth="1.5" />
    </svg>
  );
}
