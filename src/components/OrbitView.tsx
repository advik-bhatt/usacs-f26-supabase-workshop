import { useMemo } from "react";
import { orbitPath, stateAt, type Elements } from "../../supabase/functions/_shared/orbit.ts";

// Top-down view of the inner solar system, looking down on the plane of
// Earth's orbit. 1 AU is Earth's distance from the Sun.

type Mark = { jd: number; label: string; className: string };

export function OrbitView({
  orbits,
  marks = [],
  highlight,
  size = 320,
}: {
  orbits: (Elements & { key: string | number })[];
  marks?: (Mark & { el: Elements })[];
  highlight?: string | number;
  size?: number;
}) {
  const paths = useMemo(() => orbits.map((o) => ({ key: o.key, pts: orbitPath(o, 160) })), [orbits]);

  // fit everything, but never zoom in tighter than Earth's orbit or out past Mars-ish
  const reach = Math.min(
    3.2,
    Math.max(1.3, ...paths.flatMap((p) => p.pts.map(([x, y]) => Math.hypot(x, y)))) * 1.08,
  );
  const s = size / 2 / reach;
  const X = (x: number) => size / 2 + x * s;
  const Y = (y: number) => size / 2 - y * s;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="orbits" role="img" aria-label="Orbit view">
      <circle cx={X(0)} cy={Y(0)} r={1 * s} className="earth-orbit" />
      {reach > 1.6 && <circle cx={X(0)} cy={Y(0)} r={1.524 * s} className="mars-orbit" />}
      <circle cx={X(0)} cy={Y(0)} r={5} className="sun" />
      {paths.map((p) => (
        <polyline
          key={p.key}
          points={p.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")}
          className={`path ${highlight === undefined || p.key === highlight ? "hot" : ""}`}
        />
      ))}
      {marks.map((m) => {
        const [x, y] = stateAt(m.el, m.jd).r;
        return (
          <g key={m.label} className={m.className}>
            <circle cx={X(x)} cy={Y(y)} r={4.5} />
            <text x={X(x) + 7} y={Y(y) + 4}>{m.label}</text>
          </g>
        );
      })}
      <text x={6} y={size - 8} className="scale">ring = Earth's orbit (1 AU)</text>
    </svg>
  );
}

// The B-plane: stand on Earth and look at the incoming asteroid. Without a
// push it comes straight at the middle. The impactor moves the dot.
export function BPlane({ b, captureKm }: { b: [number, number] | null; captureKm: number }) {
  const size = 200;
  const dist = b ? Math.hypot(b[0], b[1]) : 0;
  const reach = Math.max(captureKm * 2.5, dist * 1.3);
  const s = size / 2 / reach;
  const C = size / 2;
  const saved = dist > captureKm;
  const clamp = (v: number) => Math.max(8, Math.min(size - 8, v));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="bplane" role="img" aria-label="Where it crosses Earth's target plane">
      <circle cx={C} cy={C} r={captureKm * s} className="capture" />
      <circle cx={C} cy={C} r={6371 * s} className="earth" />
      {b && (
        <>
          <line x1={C} y1={C} x2={clamp(C + b[0] * s)} y2={clamp(C - b[1] * s)} className="miss-line" />
          <circle cx={clamp(C + b[0] * s)} cy={clamp(C - b[1] * s)} r={5} className={saved ? "rock safe" : "rock hit"} />
        </>
      )}
      <text x={6} y={14} className="scale">dashed = capture radius</text>
    </svg>
  );
}
