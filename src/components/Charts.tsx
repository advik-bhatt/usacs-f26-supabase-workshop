import type { Book } from "../lib/supabase";
import { usd } from "../lib/supabase";

// Hand-rolled SVG. No chart library, so you can read exactly what gets drawn
// from what data.

export const COLORS: Record<string, string> = {
  BREW: "#f5b942",
  BYTE: "#6ab0f3",
  ORBIT: "#c792ea",
  SLICE: "#f26d6d",
  VOLT: "#3ecf8e",
};
const color = (sym: string) => COLORS[sym] ?? "#cccccc";

export function Sparkline({ values, up, width = 120, height = 36 }: { values: number[]; up: boolean; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark" aria-hidden="true">
      <path d={d} fill="none" stroke={up ? "#3ecf8e" : "#f26d6d"} strokeWidth={1.8} />
    </svg>
  );
}

const W = 600;
const H = 220;
const PAD = 30;

// Every stock on one chart, as % change from today's open, so a $9 scooter
// stock and a $118 asteroid miner share an axis.
export function MarketChart({
  series,
  opens,
  now,
  minutes = 10,
}: {
  series: { at: string; symbol: string; last_cents: number }[];
  opens: Record<string, number>;
  now: number;
  minutes?: number;
}) {
  const windowMs = minutes * 60_000;
  const change = (sym: string, c: number) => (c - opens[sym]) / opens[sym];
  const all = series.map((p) => change(p.symbol, p.last_cents));
  const reach = Math.max(0.02, ...all.map(Math.abs)) * 1.15;
  const x = (at: string) => PAD + (1 - (now - new Date(at).getTime()) / windowMs) * (W - PAD * 2);
  const y = (v: number) => H / 2 - (v / reach) * (H / 2 - PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Every stock's change since the open">
      <g className="grid">
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} />
        <text x={PAD - 4} y={y(0) + 4} textAnchor="end">0%</text>
        <text x={PAD - 4} y={y(reach) + 10} textAnchor="end">+{(reach * 100).toFixed(0)}%</text>
        <text x={PAD - 4} y={y(-reach) - 2} textAnchor="end">-{(reach * 100).toFixed(0)}%</text>
        <text x={PAD} y={H - 4}>{minutes} min ago</text>
        <text x={W - PAD} y={H - 4} textAnchor="end">now</text>
      </g>
      {Object.keys(opens).map((sym) => {
        const pts = series.filter((p) => p.symbol === sym);
        const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(change(sym, p.last_cents)).toFixed(1)}`).join(" ");
        const last = pts.at(-1);
        return (
          <g key={sym}>
            <path d={d} fill="none" stroke={color(sym)} strokeWidth={2.2} />
            {last && (
              <text x={x(last.at) + 4} y={y(change(sym, last.last_cents)) + 4} className="line-label" fill={color(sym)}>
                {sym}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// The order book: asks on top (cheapest at the bottom, nearest the spread),
// bids below (highest at the top). Bar length is how many shares wait there.
export function BookView({ book, onPick }: { book: Book | null; onPick?: (cents: number) => void }) {
  if (!book) return <div className="muted small">Loading the book…</div>;
  const asks = [...book.asks].slice(0, 6).reverse();
  const bids = book.bids.slice(0, 6);
  const max = Math.max(1, ...asks.map((l) => l.qty), ...bids.map((l) => l.qty));
  const bestAsk = book.asks[0]?.price_cents;
  const bestBid = book.bids[0]?.price_cents;

  const row = (l: { price_cents: number; qty: number; orders: number }, side: "ask" | "bid") => (
    <button key={side + l.price_cents} className={`level ${side}`} onClick={() => onPick?.(l.price_cents)} type="button">
      <span className="bar" style={{ width: `${(l.qty / max) * 100}%` }} />
      <span className="px">{usd(l.price_cents)}</span>
      <span className="qty">{l.qty}</span>
      <span className="n">{l.orders} order{l.orders === 1 ? "" : "s"}</span>
    </button>
  );

  return (
    <div className="book">
      <div className="book-head"><span>price</span><span>shares</span><span /></div>
      {asks.length ? asks.map((l) => row(l, "ask")) : <div className="empty">nobody's selling</div>}
      <div className="spread">
        {bestAsk && bestBid ? <>spread {usd(bestAsk - bestBid)}</> : <>no spread: one side is empty</>}
      </div>
      {bids.length ? bids.map((l) => row(l, "bid")) : <div className="empty">nobody's buying</div>}
    </div>
  );
}
