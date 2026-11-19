import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { COOKING, gradeTap, type Grade } from "../game/store";
import { spriteUrl } from "../game/sprites";
import { jukebox } from "../game/music";
import type { Recipe, Run } from "../pages/Play";

// Cooking: each step is a timing bar. A marker sweeps back and forth; tap when
// it's in the sweet spot. The closer to the middle, the better the grade, and
// the worst grade is "OK". Harder dishes have more steps, a smaller sweet spot
// and a faster sweep.

export type Finished = {
  score: number;
  rating: Grade;
  spent_cents: number;
  budget_cents: number;
  result: {
    dishes: { recipe: string; name: string; accuracy: number; points: number; grade: Grade }[];
    speed: number;
    seconds: number;
    par: number;
    missed: string[];
  };
};

export function Kitchen({ run, recipes, onFinished }: { run: Run; recipes: Recipe[]; onFinished: (f: Finished) => void }) {
  const [cookable, setCookable] = useState<string[] | null>(null);
  const [dishIdx, setDishIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [scores, setScores] = useState<Record<string, number[]>>({});
  const [flash, setFlash] = useState<{ grade: Grade; id: number } | null>(null);
  const [zone, setZone] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const marker = useRef(0);
  const bar = useRef<HTMLDivElement>(null);
  const locked = useRef(false);

  // the server decides what you can cook from what you bought
  useEffect(() => {
    supabase.rpc("cookable", { p_run: run.id }).then(({ data }) => setCookable((data as string[]) ?? []));
  }, [run.id]);

  const dishes = (cookable ?? []).map((slug) => recipes.find((r) => r.slug === slug)!).filter(Boolean);
  const missed = run.recipes.filter((slug) => !(cookable ?? []).includes(slug));
  const dish = dishes[dishIdx];
  const tuning = dish ? COOKING[dish.stars as 1 | 2 | 3 | 4] : COOKING[1];

  // the sweeping marker
  useEffect(() => {
    if (!dish) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) / 1000) * tuning.speed;
      marker.current = 1 - Math.abs(((t % 2) + 2) % 2 - 1); // 0 -> 1 -> 0 -> ...
      if (bar.current) bar.current.style.setProperty("--m", String(marker.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dish, stepIdx, tuning.speed]);

  // a new sweet spot for every step
  useEffect(() => {
    setZone(0.25 + Math.random() * 0.5);
  }, [dishIdx, stepIdx]);

  async function finish(all: Record<string, number[]>) {
    setFinishing(true);
    const accuracy = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
    const { data, error } = await supabase.rpc("finish_run", { p_run: run.id, p_accuracy: accuracy });
    const r = data as (Finished & { error?: string }) | null;
    if (error || r?.error) {
      setError(r?.error ?? error!.message);
      setFinishing(false);
      return;
    }
    onFinished(r!);
  }

  function tap() {
    if (!dish || locked.current) return;
    locked.current = true;
    const half = tuning.zone / 2;
    const { grade, score } = gradeTap(Math.abs(marker.current - zone), half);
    jukebox.sfx(grade);
    setFlash({ grade, id: Date.now() });
    const next = { ...scores, [dish.slug]: [...(scores[dish.slug] ?? []), score] };
    setScores(next);

    setTimeout(() => {
      locked.current = false;
      if (stepIdx + 1 < dish.steps.length) setStepIdx(stepIdx + 1);
      else if (dishIdx + 1 < dishes.length) {
        setDishIdx(dishIdx + 1);
        setStepIdx(0);
      } else finish(next);
    }, 650);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        tap();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  if (cookable === null) return <div className="panel center-text">Unpacking the groceries…</div>;

  return (
    <section className="kitchen">
      {missed.length > 0 && (
        <div className="panel gentle">
          Missing a few things for {missed.map((m) => recipes.find((r) => r.slug === m)?.name ?? m).join(" and ")}.
          No worries, we'll make the rest!
        </div>
      )}

      {dishes.length === 0 ? (
        <div className="panel center-text">
          <p>Nothing to cook this time, and that's OK!</p>
          <button className="pixel-btn go" disabled={finishing} onClick={() => finish({})}>See how it went</button>
        </div>
      ) : dish ? (
        <div className="panel stove">
          <div className="stove-head">
            <img src={spriteUrl("dish", dish.slug, 5)} alt="" className="pixel" />
            <div>
              <div className="dish-name">{dish.name}</div>
              <div className="muted small">
                dish {dishIdx + 1} of {dishes.length} · step {stepIdx + 1} of {dish.steps.length}
              </div>
            </div>
          </div>

          <div className="bar" ref={bar} style={{ "--z": zone, "--w": tuning.zone } as React.CSSProperties}>
            <div className="sweet" />
            <div className="marker" />
          </div>

          <button className="pixel-btn big-tap" onClick={tap} onPointerDown={() => jukebox.unlock()}>
            {dish.steps[stepIdx]}!
          </button>
          <div className="muted small center-text">Tap (or press space) when the marker is in the green.</div>

          {flash && (
            <div key={flash.id} className={`grade grade-${flash.grade.replace("!", "").toLowerCase()}`}>
              {flash.grade}
            </div>
          )}
        </div>
      ) : (
        <div className="panel center-text">Plating up…</div>
      )}

      {error && (
        <div className="panel gentle">
          {error}{" "}
          <button className="pixel-btn" disabled={finishing} onClick={() => finish(scores)}>Plate it up</button>
        </div>
      )}
    </section>
  );
}
