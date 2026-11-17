export const AU_KM = 149_597_870.7;
const LUNAR_KM = 384_400;

export function km(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million km`;
  if (n >= 1e4) return `${Math.round(n / 1000).toLocaleString()} thousand km`;
  return `${Math.round(n).toLocaleString()} km`;
}

export function lunar(n: number) {
  const ld = n / LUNAR_KM;
  return ld < 1 ? `${(ld * 100).toFixed(0)}% of the way to the Moon` : `${ld.toFixed(1)}× the Moon's distance`;
}

export function size(kmDiameter: number) {
  return kmDiameter < 1 ? `${Math.round(kmDiameter * 1000)} m` : `${kmDiameter.toFixed(1)} km`;
}

export function kg(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} trillion kg`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion kg`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million kg`;
  if (n >= 1e4) return `${Math.round(n / 1000)} t`;
  return `${Math.round(n).toLocaleString()} kg`;
}

export function speed(ms: number) {
  if (ms >= 1) return `${ms.toFixed(2)} m/s`;
  if (ms >= 0.001) return `${(ms * 1000).toFixed(2)} mm/s`;
  return `${(ms * 1e6).toFixed(1)} µm/s`;
}

export function days(d: number) {
  if (d >= 365) return `${(d / 365.25).toFixed(1)} years`;
  if (d >= 1) return `${Math.round(d)} days`;
  return `${Math.round(d * 24)} hours`;
}
