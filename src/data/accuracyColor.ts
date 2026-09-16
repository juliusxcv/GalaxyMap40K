import * as THREE from "three";

// Location-confidence color code: bright, near-white blue = an explicit
// distance/direction from Terra was found in the source; red = unknown.
const ACCURATE_COLOR = new THREE.Color("#eaf4ff");
const UNKNOWN_COLOR = new THREE.Color("#ff3b3b");

const accurateHex = ACCURATE_COLOR.getHexString();
const unknownHex = UNKNOWN_COLOR.getHexString();

export function accuracyToColor(accuracy: number, target = new THREE.Color()): THREE.Color {
  const t = Math.min(1, Math.max(0, accuracy));
  return target.copy(UNKNOWN_COLOR).lerp(ACCURATE_COLOR, t);
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

export const ACCURACY_GRADIENT_CSS = `linear-gradient(90deg, #${unknownHex}, #${accurateHex})`;
