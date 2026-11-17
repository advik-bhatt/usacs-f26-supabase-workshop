// Orbital mechanics for the planetary defense drill.
//
// This one file runs in three places: the browser (preview), the `deflect`
// Edge Function (the grade that counts), and the bots. Same code everywhere,
// so the server can re-run any result instead of trusting it.
//
// Model:
//   - The asteroid's orbit comes from NASA/JPL's Small-Body Database
//     (osculating elements at an epoch). Two-body: the Sun pulls, nothing else.
//   - The drill assumes the asteroid is going to hit Earth at its real close
//     approach time. We put Earth exactly where the asteroid will be then, and
//     move it along at Earth's orbital speed so the geometry stays honest.
//   - A kinetic impactor (like DART) hits the asteroid `leadDays` before
//     arrival and changes its velocity by dv = beta * m * v / M.
//   - We integrate the nudged orbit forward and measure how far from Earth's
//     center it passes. It's a save if that's more than Earth's capture radius
//     (Earth's radius, widened by gravitational focusing).
//
// Units inside: AU, days. Outside: km, m/s, kg.

export const AU_KM = 149_597_870.7;
export const DAY_S = 86_400;
const GM_SUN = 2.959122082855911e-4; // AU^3 / day^2 (Gaussian constant squared)
const EARTH_RADIUS_KM = 6371;
const EARTH_ESCAPE_KMS = 11.186;
const EARTH_RATE = (2 * Math.PI) / 365.256363; // rad / day

// DART measured beta ≈ 3.6 at Dimorphos: the debris kicked off the surface
// pushed the asteroid 3.6x harder than the spacecraft's momentum alone.
export const BETA = 3.6;
export const IMPACT_SPEED_KMS = 6.1; // DART hit at about 6.1 km/s
export const DENSITY_KG_M3 = 2000; // assumed; real rubble piles are 1200 to 3000

export type Elements = {
  a: number; // semi-major axis, AU
  e: number; // eccentricity
  i: number; // inclination, deg
  om: number; // longitude of ascending node, deg
  w: number; // argument of perihelion, deg
  ma: number; // mean anomaly at epoch, deg
  epoch: number; // Julian date
};

export type Asteroid = Elements & {
  ca_jd: number; // close approach time (Julian date)
  v_inf_kms: number; // approach speed relative to Earth, km/s
  diameter_km: number;
};

export type Direction = "prograde" | "retrograde" | "radial" | "normal";

export type Plan = {
  leadDays: number; // how long before arrival the impactor hits
  massKg: number; // spacecraft mass
  direction: Direction; // which way to push
};

export type Outcome = {
  saved: boolean;
  missKm: number; // closest approach to Earth's center after deflection
  captureKm: number; // anything inside this hits Earth
  dvMs: number; // velocity change delivered, m/s
  asteroidMassKg: number;
  bPlaneKm: [number, number]; // where it crosses, in the plane facing the incoming asteroid
};

type Vec = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec) => Math.sqrt(dot(a, a));
const unit = (a: Vec) => mul(a, 1 / norm(a));
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function asteroidMassKg(diameterKm: number) {
  const r = (diameterKm * 1000) / 2;
  return DENSITY_KG_M3 * (4 / 3) * Math.PI * r ** 3;
}

// Size from brightness when JPL doesn't have a measured diameter.
// H is absolute magnitude; 0.14 is a typical albedo.
export function diameterFromH(H: number, albedo = 0.14) {
  return (1329 / Math.sqrt(albedo)) * 10 ** (-H / 5);
}

export function captureRadiusKm(vInfKms: number) {
  return EARTH_RADIUS_KM * Math.sqrt(1 + (EARTH_ESCAPE_KMS / vInfKms) ** 2);
}

// Kepler's equation, M = E - e sin E, solved for E by Newton's method.
function eccentricAnomaly(M: number, e: number) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

// Heliocentric ecliptic position (AU) and velocity (AU/day) at time jd.
export function stateAt(el: Elements, jd: number): { r: Vec; v: Vec } {
  const n = Math.sqrt(GM_SUN / el.a ** 3);
  const M = rad(el.ma) + n * (jd - el.epoch);
  const E = eccentricAnomaly(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const b = el.a * Math.sqrt(1 - el.e ** 2);

  // position and velocity in the orbit's own plane
  const xp = el.a * (cosE - el.e);
  const yp = b * sinE;
  const edot = n / (1 - el.e * cosE);
  const vxp = -el.a * sinE * edot;
  const vyp = b * cosE * edot;

  // rotate into the ecliptic: by w, then i, then om
  const [cw, sw] = [Math.cos(rad(el.w)), Math.sin(rad(el.w))];
  const [ci, si] = [Math.cos(rad(el.i)), Math.sin(rad(el.i))];
  const [co, so] = [Math.cos(rad(el.om)), Math.sin(rad(el.om))];
  const rot = (x: number, y: number): Vec => [
    (co * cw - so * sw * ci) * x + (-co * sw - so * cw * ci) * y,
    (so * cw + co * sw * ci) * x + (-so * sw + co * cw * ci) * y,
    sw * si * x + cw * si * y,
  ];
  return { r: rot(xp, yp), v: rot(vxp, vyp) };
}

function accel(r: Vec): Vec {
  const d = norm(r);
  return mul(r, -GM_SUN / (d * d * d));
}

// One RK4 step of Newtonian gravity around the Sun.
function step(r: Vec, v: Vec, h: number): { r: Vec; v: Vec } {
  const k1r = v, k1v = accel(r);
  const k2r = add(v, mul(k1v, h / 2)), k2v = accel(add(r, mul(k1r, h / 2)));
  const k3r = add(v, mul(k2v, h / 2)), k3v = accel(add(r, mul(k2r, h / 2)));
  const k4r = add(v, mul(k3v, h)), k4v = accel(add(r, mul(k3r, h)));
  return {
    r: add(r, mul(add(add(k1r, mul(k2r, 2)), add(mul(k3r, 2), k4r)), h / 6)),
    v: add(v, mul(add(add(k1v, mul(k2v, 2)), add(mul(k3v, 2), k4v)), h / 6)),
  };
}

// Integrate from t0 to t1, calling visit(t, r) at every step. Returns the final state.
function fly(r0: Vec, v0: Vec, t0: number, t1: number, h: number, visit?: (t: number, r: Vec) => void) {
  let s = { r: r0, v: v0 };
  const steps = Math.max(1, Math.ceil((t1 - t0) / h));
  const dt = (t1 - t0) / steps;
  visit?.(t0, s.r);
  for (let k = 1; k <= steps; k++) {
    s = step(s.r, s.v, dt);
    visit?.(t0 + k * dt, s.r);
  }
  return s;
}

function pushDirection(dir: Direction, r: Vec, v: Vec): Vec {
  switch (dir) {
    case "prograde": return unit(v);
    case "retrograde": return mul(unit(v), -1);
    case "radial": return unit(r);
    case "normal": return unit(cross(r, v));
  }
}

export function simulate(ast: Asteroid, plan: Plan): Outcome {
  const M = asteroidMassKg(ast.diameter_km);
  const dvMs = (BETA * plan.massKg * IMPACT_SPEED_KMS * 1000) / M;
  const captureKm = captureRadiusKm(ast.v_inf_kms);

  const t0 = ast.ca_jd - plan.leadDays;
  const window = 3; // days either side of arrival to look for closest approach
  const { r: r0, v: v0 } = stateAt(ast, t0);

  // smaller steps for short flights so the answer doesn't depend on step size
  const h = Math.min(0.25, Math.max(plan.leadDays / 400, 0.002));

  // Fly the untouched asteroid with the same integrator. Where it ends up at
  // ca_jd is where Earth is in this drill.
  const earthAtCa = fly(r0, v0, t0, ast.ca_jd, h).r;

  // Earth keeps moving: rotate its position about the ecliptic pole.
  const earthAt = (t: number): Vec => {
    const a = EARTH_RATE * (t - ast.ca_jd);
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [c * earthAtCa[0] - s * earthAtCa[1], s * earthAtCa[0] + c * earthAtCa[1], earthAtCa[2]];
  };

  // Hit it.
  const v1 = add(v0, mul(pushDirection(plan.direction, r0, v0), (dvMs / 1000) * (DAY_S / AU_KM)));

  // Fly the nudged asteroid up to the encounter window, then through it in
  // ~3 minute steps, tracking its closest approach to Earth's center.
  const tNear = Math.max(t0, ast.ca_jd - window);
  const near = tNear > t0 ? fly(r0, v1, t0, tNear, h) : { r: r0, v: v1 };

  let best = Infinity;
  let bestRel: Vec = [0, 0, 0];
  let last: Vec | null = null;
  fly(near.r, near.v, tNear, ast.ca_jd + window, 0.002, (t, r) => {
    const rel = sub(r, earthAt(t));
    if (last) {
      // closest point on the straight line between this sample and the last
      const d = sub(rel, last);
      const u = Math.max(0, Math.min(1, -dot(last, d) / (dot(d, d) || 1)));
      const p = add(last, mul(d, u));
      if (norm(p) < best) {
        best = norm(p);
        bestRel = p;
      }
    }
    last = rel;
  });

  // B-plane: the plane through Earth's center facing the incoming asteroid.
  const vAtCa = stateAt(ast, ast.ca_jd).v;
  const incoming = unit(sub(vAtCa, mul([-earthAtCa[1], earthAtCa[0], 0], EARTH_RATE)));
  const e1 = unit(cross(incoming, [0, 0, 1]));
  const e2 = cross(incoming, e1);
  const toKm = (x: number) => x * AU_KM;

  const missKm = toKm(best);
  return {
    saved: missKm > captureKm,
    missKm,
    captureKm,
    dvMs,
    asteroidMassKg: M,
    bPlaneKm: [toKm(dot(bestRel, e1)), toKm(dot(bestRel, e2))],
  };
}

// Points on the orbit for drawing: n positions spread over one revolution.
export function orbitPath(el: Elements, n = 180): Vec[] {
  const period = 2 * Math.PI / Math.sqrt(GM_SUN / el.a ** 3);
  return Array.from({ length: n + 1 }, (_, k) => stateAt(el, el.epoch + (period * k) / n).r);
}

export function jdNow() {
  return Date.now() / DAY_S / 1000 + 2440587.5;
}
