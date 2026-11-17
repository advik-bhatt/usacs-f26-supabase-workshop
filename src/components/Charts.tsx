// Tiny hand-rolled SVG charts. No chart library, so you can read exactly what
// gets drawn from what data.

const W = 600;
const H = 160;
const PAD = 24;

export type DepthPoint = { at: string; waiting: number; cooking: number };
export type FlowPoint = { t: string; placed: number; served: number; botched: number; walked_out: number };

const WINDOW_MS = 5 * 60 * 1000;

function x(at: string, now: number) {
  const age = now - new Date(at).getTime();
  return PAD + (1 - age / WINDOW_MS) * (W - PAD * 2);
}

export function DepthChart({ points, now }: { points: DepthPoint[]; now: number }) {
  const max = Math.max(4, ...points.map((p) => p.waiting + p.cooking));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = (key: "waiting" | "cooking") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(p.at, now).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Tickets waiting and cooking over the last five minutes">
      <Grid max={max} y={y} />
      <path d={line("waiting")} className="ln waiting" />
      <path d={line("cooking")} className="ln cooking" />
      <text x={W - PAD} y={14} textAnchor="end" className="legend">
        <tspan className="waiting">━ waiting</tspan> <tspan className="cooking">━ cooking</tspan>
      </text>
    </svg>
  );
}

export function FlowChart({ points, now }: { points: FlowPoint[]; now: number }) {
  const max = Math.max(3, ...points.map((p) => Math.max(p.placed, p.served + p.botched + p.walked_out)));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const bw = ((W - PAD * 2) / 30) * 0.42; // 30 ten-second buckets in five minutes

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Orders placed versus finished every ten seconds">
      <Grid max={max} y={y} />
      {points.map((p) => {
        const cx = x(p.t, now) + bw;
        const done = [
          ["served", p.served],
          ["botched", p.botched],
          ["walked", p.walked_out],
        ] as const;
        let top = H - PAD;
        return (
          <g key={p.t}>
            <rect className="bar placed" x={cx - bw - 1} y={y(p.placed)} width={bw} height={H - PAD - y(p.placed)} />
            {done.map(([cls, v]) => {
              const h = H - PAD - y(v);
              top -= h;
              return <rect key={cls} className={`bar ${cls}`} x={cx + 1} y={top} width={bw} height={h} />;
            })}
          </g>
        );
      })}
      <text x={W - PAD} y={14} textAnchor="end" className="legend">
        <tspan className="placed">■ in</tspan> <tspan className="served">■ served</tspan>{" "}
        <tspan className="botched">■ botched</tspan> <tspan className="walked">■ walked out</tspan>
      </text>
    </svg>
  );
}

function Grid({ max, y }: { max: number; y: (v: number) => number }) {
  return (
    <g className="grid">
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} />
      <line x1={PAD} x2={W - PAD} y1={y(max)} y2={y(max)} />
      <text x={PAD - 4} y={y(max) + 4} textAnchor="end">{max}</text>
      <text x={PAD - 4} y={y(0) + 4} textAnchor="end">0</text>
      <text x={PAD} y={H - 6}>5 min ago</text>
      <text x={W - PAD} y={H - 6} textAnchor="end">now</text>
    </g>
  );
}
