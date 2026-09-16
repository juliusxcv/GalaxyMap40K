import * as THREE from "three";

// Location-confidence color code, five graduated tiers instead of a raw
// 2-stop lerp (which crossed through a muddy pink) or a flat warm-only ramp
// (which made the whole range read as similarly bright, dim, uniform hues):
// a deep, dim "demon's eye" red for totally unknown positions, warming
// through orange and yellow as sourcing firms up, then cooling into a dim
// blue and finally a bright blue-white for an explicit, confirmed distance
// from Terra. Brightness climbs alongside confidence the whole way, so the
// progression reads as one smooth gradient instead of a jump between a
// washed-out low tier and a blazing high one.
const STOPS = [
  new THREE.Color("#7a0f0f"), // 0.00 — unknown: deep, dim red (a demon's eye)
  new THREE.Color("#e8720c"), // 0.25 — more approximate: orange
  new THREE.Color("#f4c430"), // 0.50 — approximate: yellow
  new THREE.Color("#4a7fd6"), // 0.75 — semi-high: dimmer blue
  new THREE.Color("#eaf4ff"), // 1.00 — high confidence: bright blue-white
];

const STOP_HEXES = STOPS.map((c) => c.getHexString());

export function accuracyToColor(accuracy: number, target = new THREE.Color()): THREE.Color {
  const t = Math.min(1, Math.max(0, accuracy));
  const segments = STOPS.length - 1;
  const scaled = t * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - i;
  return target.copy(STOPS[i]).lerp(STOPS[i + 1], localT);
}

/** CSS-usable version for UI (info panel, legend). */
export function accuracyToCss(accuracy: number): string {
  return `#${accuracyToColor(accuracy).getHexString()}`;
}

export function accuracyLabel(accuracy: number): string {
  if (accuracy >= 0.85) return "Confirmed";
  if (accuracy >= 0.5) return "Approximate";
  if (accuracy >= 0.25) return "Regional estimate";
  return "Unknown";
}

export const ACCURACY_GRADIENT_CSS = `linear-gradient(90deg, ${STOP_HEXES.map((h) => `#${h}`).join(", ")})`;
