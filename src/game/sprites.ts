// Pixel art, drawn from little text grids. One letter per pixel; "." is empty.
// Characters share one body shape and swap palettes; dishes each get a grid.

type Palette = Record<string, string>;

// 12 x 16 character, two walking frames (only the legs change)
const BODY = [
  "....HHHH....",
  "...HHHHHH...",
  "..HHHHHHHH..",
  "..HSSSSSSH..",
  "..SSESSESS..",
  "..SSSSSSSS..",
  "..SRSMMSRS..",
  "...SSSSSS...",
  "..AAAAAAAA..",
  ".STTTTTTTTS.",
  ".STTTTTTTTS.",
  ".STTTTTTTTS.",
  "..PPPPPPPP..",
];
const LEGS_A = ["..PPP..PPP..", "..PPP..PPP..", "..BBB..BBB.."];
const LEGS_B = ["..PPP...PPP.", ".PPP....PPP.", ".BBB.....BBB"];

// Hats replace the top rows for some characters.
const HATS: Record<string, string[]> = {
  pilgrim: ["...KKKKKK...", "...KYYYYK...", "..KKKKKKKK.."],
  beanie: ["....AAAA....", "...AAAAAA...", "..AAAAAAAA.."],
  chef: ["...WWWWWW...", "..WWWWWWWW..", "...WWWWWW..."],
  none: [],
};

export const CHARACTERS: { name: string; hat: keyof typeof HATS; palette: Palette }[] = [
  { name: "Maple", hat: "beanie", palette: { H: "#5a3418", S: "#f1c9a5", A: "#d9582b", T: "#e07b39", P: "#3b4a6b", B: "#2a2a2a" } },
  { name: "Clove", hat: "pilgrim", palette: { H: "#1d1d1d", S: "#8d5a3b", A: "#f2e6c9", T: "#3a3a3a", P: "#4b3a2a", B: "#1a1a1a" } },
  { name: "Sage", hat: "none", palette: { H: "#c2852f", S: "#f6d7b8", A: "#7a9a4a", T: "#5f7f3a", P: "#2f3b55", B: "#3a2a1a" } },
  { name: "Juniper", hat: "chef", palette: { H: "#2b1a12", S: "#c68a5c", A: "#c94a4a", T: "#efe7da", P: "#3a3a4a", B: "#222222" } },
  { name: "Pecan", hat: "none", palette: { H: "#2a1810", S: "#6b4226", A: "#e2b13c", T: "#8a4b2a", P: "#2f2f3f", B: "#1a1a1a" } },
  { name: "Cider", hat: "beanie", palette: { H: "#d6a23c", S: "#fbe0c8", A: "#9b3b5a", T: "#c46a7a", P: "#43506e", B: "#2a2a2a" } },
  { name: "Acorn", hat: "pilgrim", palette: { H: "#6b4a2a", S: "#e8b98e", A: "#f2e6c9", T: "#5b6b3a", P: "#3b2f2a", B: "#1a1a1a" } },
  { name: "Nutmeg", hat: "none", palette: { H: "#151515", S: "#a8714a", A: "#4a7ab0", T: "#2f5f8a", P: "#2a2a2a", B: "#111111" } },
];

const COMMON: Palette = { E: "#1a1a1a", M: "#b5503c", R: "#f0a0a0", K: "#222222", Y: "#d9b44a", W: "#fafafa" };

export function characterGrid(sprite: number, frame = 0): { grid: string[]; palette: Palette } {
  const c = CHARACTERS[((sprite % 8) + 8) % 8];
  const hat = HATS[c.hat];
  const body = [...BODY];
  hat.forEach((row, i) => (body[i] = row));
  return { grid: [...body, ...(frame ? LEGS_B : LEGS_A)], palette: { ...COMMON, ...c.palette } };
}

// 10 x 10 dishes
const DISHES: Record<string, { grid: string[]; palette: Palette }> = {
  "roast-turkey": {
    grid: [
      "..........",
      "...BBBB...",
      "..BBBBBB..",
      ".BBLBBBBB.",
      ".BBBBBBBBW",
      ".BBBBBBBWW",
      "..BBBBBB..",
      ".PPPPPPPP.",
      "PPPPPPPPPP",
      ".PPPPPPPP.",
    ],
    palette: { B: "#a8642c", L: "#d8964a", W: "#f4ead8", P: "#cfd6dc" },
  },
  "pumpkin-pie": {
    grid: [
      "..........",
      "..........",
      "....CC....",
      "...COOC...",
      "..COOOOC..",
      ".COOOOOOC.",
      "COOOOOOOOC",
      "CCCCCCCCCC",
      "..........",
      "..........",
    ],
    palette: { C: "#d8a25a", O: "#e0782c" },
  },
  "mashed-potatoes": {
    grid: [
      "..........",
      "....YY....",
      "...WYYW...",
      "..WWWWWW..",
      ".WWWWWWWW.",
      "DDDDDDDDDD",
      ".DDDDDDDD.",
      "..DDDDDD..",
      "..........",
      "..........",
    ],
    palette: { W: "#f3eee2", Y: "#f2d24a", D: "#5a7fa8" },
  },
  "cranberry-sauce": {
    grid: [
      "..........",
      "...RRRR...",
      "..RrRRRR..",
      "..RRRRRR..",
      "..RRRrRR..",
      "..RRRRRR..",
      "PPPPPPPPPP",
      ".PPPPPPPP.",
      "..........",
      "..........",
    ],
    palette: { R: "#b0213a", r: "#e0506a", P: "#dfe3e8" },
  },
  cornbread: {
    grid: [
      "..........",
      "..........",
      ".GGGGGGGG.",
      ".GYYYGYYG.",
      ".GYYYGYYG.",
      ".GGGGGGGG.",
      ".GYYYGYYG.",
      ".GGGGGGGG.",
      "..........",
      "..........",
    ],
    palette: { G: "#c8962e", Y: "#f0c94a" },
  },
  "green-bean-bake": {
    grid: [
      "..........",
      "..O.O..O..",
      ".OGOGGOGO.",
      ".GGGGGGGG.",
      ".GgGGgGGG.",
      "DDDDDDDDDD",
      "DDDDDDDDDD",
      ".DDDDDDDD.",
      "..........",
      "..........",
    ],
    palette: { O: "#c98a3a", G: "#4f8f3a", g: "#7fbf5a", D: "#b5603a" },
  },
  "mac-and-cheese": {
    grid: [
      "..........",
      "..........",
      "..YOYYOY..",
      ".YYOYYOYY.",
      ".OYYOYYOY.",
      "BBBBBBBBBB",
      ".BBBBBBBB.",
      "..BBBBBB..",
      "..........",
      "..........",
    ],
    palette: { Y: "#f2c23a", O: "#e0902a", B: "#3f6f9a" },
  },
  stuffing: {
    grid: [
      "..........",
      "..........",
      "..bTbbTb..",
      ".bbGbbbGb.",
      ".TbbbTbbb.",
      "DDDDDDDDDD",
      ".DDDDDDDD.",
      "..DDDDDD..",
      "..........",
      "..........",
    ],
    palette: { b: "#a8743a", T: "#6b4a2a", G: "#6f9a4a", D: "#c9c2b5" },
  },
};

export function dishGrid(slug: string) {
  return DISHES[slug] ?? DISHES["cornbread"];
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  palette: Palette,
  x: number,
  y: number,
  px: number,
) {
  grid.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = palette[row[i]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x + i * px), Math.round(y + j * px), Math.ceil(px), Math.ceil(px));
    }
  });
}

// For <img> tags outside the canvas: render once, cache the data URL.
const cache = new Map<string, string>();
export function spriteUrl(kind: "character" | "dish", id: string | number, scale = 4, frame = 0) {
  const key = `${kind}:${id}:${scale}:${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { grid, palette } = kind === "character" ? characterGrid(Number(id), frame) : dishGrid(String(id));
  const canvas = document.createElement("canvas");
  canvas.width = grid[0].length * scale;
  canvas.height = grid.length * scale;
  drawGrid(canvas.getContext("2d")!, grid, palette, 0, 0, scale);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
