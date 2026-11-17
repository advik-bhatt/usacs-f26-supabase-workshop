import { usd, pct, isHalted, type Stock } from "../lib/supabase";
import { Sparkline } from "./Charts";

export type Quotes = Record<string, { bid: number | null; ask: number | null }>;

// green for up, red for down, gray for "hasn't really moved"
const tone = (now: number, open: number) => {
  const p = (now - open) / open;
  return p >= 0.0005 ? "good" : p <= -0.0005 ? "bad" : "muted";
};

// The first thing a new trader sees, once. Three sentences, then trade.
export function Intro({ onDone }: { onDone: () => void }) {
  return (
    <main className="signup intro">
      <h1>How this works</h1>
      <ol>
        <li>
          <b>You start with $10,000 and 20 shares</b> of each of five made-up companies.
        </li>
        <li>
          <b>Prices only move when people trade.</b> When lots of people buy, the price goes up. When lots of people
          sell, it goes down. Everyone in this room is the market.
        </li>
        <li>
          <b>Buy low, sell high.</b> Whoever ends up worth the most wins.
        </li>
      </ol>
      <p className="muted small">Watch the big screen for breaking news. It moves prices.</p>
      <button className="primary" onClick={onDone}>Start trading</button>
    </main>
  );
}

// Simple mode: every stock, one tap to buy or sell a single share.
export function SimpleBoard({
  stocks,
  quotes,
  owned,
  samples,
  busy,
  onTrade,
}: {
  stocks: Stock[];
  quotes: Quotes;
  owned: Record<string, number>;
  samples: Record<string, number[]>;
  busy: string | null;
  onTrade: (symbol: string, side: "buy" | "sell") => void;
}) {
  return (
    <section className="simple">
      {stocks.map((s) => {
        const q = quotes[s.symbol] ?? { bid: null, ask: null };
        const halted = isHalted(s);
        const mine = owned[s.symbol] ?? 0;
        return (
          <div key={s.symbol} className={`simple-card ${halted ? "halted" : ""}`}>
            <div className="simple-top">
              <div>
                <div className="simple-name">
                  {s.name} <span className="muted small">{s.symbol}</span>
                  {halted && <span className="halt-badge">PAUSED</span>}
                </div>
                <div className="muted small">{s.blurb}</div>
              </div>
              <div className="simple-price">
                {usd(s.last_cents)}
                <div className={`small ${tone(s.last_cents, s.open_cents)}`}>{pct(s.last_cents, s.open_cents)} today</div>
              </div>
            </div>
            <Sparkline values={[...(samples[s.symbol] ?? []), s.last_cents]} up={s.last_cents >= s.open_cents} width={300} height={30} />
            <div className="simple-own small">You own <b>{mine}</b> {mine === 1 ? "share" : "shares"}{mine ? `, worth ${usd(mine * s.last_cents)}` : ""}</div>
            <div className="simple-actions">
              <button
                className="buy"
                disabled={halted || !q.ask || busy !== null}
                onClick={() => onTrade(s.symbol, "buy")}
              >
                <b>Buy 1</b>
                <span>{q.ask ? `costs about ${usd(q.ask)}` : "nobody's selling"}</span>
              </button>
              <button
                className="sell"
                disabled={halted || !q.bid || mine < 1 || busy !== null}
                onClick={() => onTrade(s.symbol, "sell")}
              >
                <b>Sell 1</b>
                <span>{mine < 1 ? "you have none" : q.bid ? `get about ${usd(q.bid)}` : "nobody's buying"}</span>
              </button>
            </div>
            {halted && <div className="small muted">Trading is paused for a minute because the price moved too fast.</div>}
          </div>
        );
      })}
    </section>
  );
}
