// The grocery store: a 24 x 16 tile grid. Shared by the game, the live
// dashboard and the bots, so everyone agrees on where the shelves are.
//
// Which ingredient sits on which shelf comes from the database
// (public.ingredients.x / .y, filled by seed.sql). This file only knows the
// shape of the room.

export const W = 24;
export const H = 16;

// The door everyone walks in through, and out of on the way home.
export const DOOR = { x: 11, y: 14 };
export const SPAWN = { x: 11, y: 13 };

// Shelf columns, top to bottom, one section each.
export const AISLES = [
  { x: 3, name: "Produce", color: "#5fae4f" },
  { x: 7, name: "Dairy & Eggs", color: "#7fb4e8" },
  { x: 11, name: "Bakery", color: "#d9a05b" },
  { x: 15, name: "Pantry", color: "#c9b458" },
  { x: 19, name: "Meat & Spices", color: "#d06a5a" },
] as const;

export const SHELF_TOP = 2;
export const SHELF_BOTTOM = 10;

export type Tile = "wall" | "floor" | "shelf" | "door" | "mat";

export function tileAt(x: number, y: number): Tile {
  if (x === DOOR.x && y === H - 1) return "door";
  if (x === DOOR.x + 1 && y === H - 1) return "door";
  if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return "wall";
  if (y >= SHELF_TOP && y <= SHELF_BOTTOM && AISLES.some((a) => a.x === x)) return "shelf";
  if (y === H - 2 && (x === DOOR.x || x === DOOR.x + 1)) return "mat";
  return "floor";
}

export const walkable = (x: number, y: number) => {
  const t = tileAt(x, y);
  return t === "floor" || t === "mat";
};

// Standing on the mat by the door means "I'm done shopping, take me home".
export const atExit = (x: number, y: number) => tileAt(x, y) === "mat";

// Where you are, in words, for the live dashboard.
export function zoneName(x: number, y: number): string {
  if (y >= SHELF_TOP - 1 && y <= SHELF_BOTTOM + 1) {
    const near = AISLES.reduce((best, a) => (Math.abs(a.x - x) < Math.abs(best.x - x) ? a : best));
    if (Math.abs(near.x - x) <= 1) return near.name;
  }
  if (y >= H - 3) return "Front of store";
  return "Store";
}

export const aisleColor = (x: number) => AISLES.find((a) => a.x === x)?.color ?? "#888";

// The shelf tiles you can reach from where you stand (left or right of you).
export function reachableShelves(x: number, y: number) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
  ].filter((p) => tileAt(p.x, p.y) === "shelf");
}

// Shortest walk from a to b on the grid (breadth-first search). The bots use
// it; the dashboard could too. Returns the tiles to step through, not
// including the start.
export function path(from: { x: number; y: number }, to: { x: number; y: number }) {
  const key = (x: number, y: number) => y * W + x;
  const prev = new Map<number, number>();
  const queue = [key(from.x, from.y)];
  prev.set(queue[0], -1);
  while (queue.length) {
    const k = queue.shift()!;
    const x = k % W;
    const y = Math.floor(k / W);
    if (x === to.x && y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = key(nx, ny);
      if (prev.has(nk) || !walkable(nx, ny)) continue;
      prev.set(nk, k);
      queue.push(nk);
    }
  }
  const out: { x: number; y: number }[] = [];
  let k = key(to.x, to.y);
  if (!prev.has(k)) return out;
  while (k !== key(from.x, from.y)) {
    out.unshift({ x: k % W, y: Math.floor(k / W) });
    k = prev.get(k)!;
  }
  return out;
}

// A spot next to a shelf tile where you can stand and grab from it.
export function standingSpotFor(shelf: { x: number; y: number }) {
  return walkable(shelf.x + 1, shelf.y) ? { x: shelf.x + 1, y: shelf.y } : { x: shelf.x - 1, y: shelf.y };
}

// ---------------------------------------------------------------- cooking

// How a timing tap is judged. Nothing here says "bad": the worst you get is OK.
export type Grade = "Super!" | "Great!" | "Good" | "OK";

export function gradeTap(distanceFromCenter: number, zoneHalfWidth: number): { grade: Grade; score: number } {
  if (distanceFromCenter <= zoneHalfWidth * 0.35) return { grade: "Super!", score: 1 };
  if (distanceFromCenter <= zoneHalfWidth) return { grade: "Great!", score: 0.85 };
  if (distanceFromCenter <= zoneHalfWidth * 1.8) return { grade: "Good", score: 0.65 };
  return { grade: "OK", score: 0.45 };
}

export function gradeFor(accuracy: number): Grade {
  return accuracy >= 0.9 ? "Super!" : accuracy >= 0.75 ? "Great!" : accuracy >= 0.58 ? "Good" : "OK";
}

// Harder dishes: more steps, a smaller sweet spot, a faster sweep.
export const COOKING = {
  1: { zone: 0.3, speed: 0.75 },
  2: { zone: 0.24, speed: 0.95 },
  3: { zone: 0.18, speed: 1.15 },
  4: { zone: 0.14, speed: 1.35 },
} as const;
