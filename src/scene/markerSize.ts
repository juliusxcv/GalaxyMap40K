import type { StarSystem } from "../data/types";
import { SOL_SYSTEM_ID } from "../data/galaxyRegions";

// Data-marker sizing shared by StarSystem's shader inputs and anything that
// has to sit around a marker on screen (the selection ring).

export const BASE_SIZE = 0.6;
export const HOVER_SCALE = 2.4;
export const SELECT_SCALE = 1.8;
// Terra's home system anchors the galaxy's brightest, most confident marker
// — its glow is boosted past what accuracy=1 alone would give it.
export const SOL_GLOW_BOOST = 1.6;

export function markerGlow(system: StarSystem): number {
  return system.id === SOL_SYSTEM_ID ? SOL_GLOW_BOOST : Math.min(1, Math.max(0, system.accuracy));
}

/** On-screen diameter (px) of a marker's point sprite — the JS twin of the
 * gl_PointSize calculation in StarSystem.tsx's vertex shader. */
export function markerSpriteDiameterPx(system: StarSystem, cameraDistance: number, scale = 1): number {
  const glow = markerGlow(system);
  const sol = glow > 1.05;
  const glowSize = BASE_SIZE * system.size * scale * (1.35 + glow * 0.55) * (sol ? 2.6 : 1);
  const perspective = glowSize * (180 / Math.max(cameraDistance, 1e-3));
  return Math.max(perspective, glowSize * 9, sol ? 16 : 0);
}
