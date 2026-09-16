/** Smoothstepped 0→1 ramp as `distance` moves from `start` to `end` (works
 * for either direction — `start` can be bigger or smaller than `end`),
 * clamped flat outside that range. */
function edgeRamp(distance: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (distance - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export interface LabelBand {
  /** Below this distance, fully gone — too close, would be in the way. */
  vanish: number;
  /** At/beyond this distance (coming from `vanish`), fully shown. */
  fullNear: number;
  /** Up to this distance, still fully shown. */
  fullFar: number;
  /** At/beyond this distance, fully gone — too far out to be relevant yet. */
  appear: number;
}

/** Segmentum/sector overlay labels are a middle-distance layer: invisible
 * both when you're zoomed out over the whole galaxy (so the star field
 * itself is what you see) and when you're in close on individual stars (so
 * they don't get in the way), visible only in the band between. Opacity
 * follows that full band; scale only shrinks on the close side, since the
 * far side disappears by fading out rather than shrinking away. */
export function labelDistanceStyle(distance: number, band: LabelBand, minScale = 0.5): { scale: number; opacity: number } {
  const near = edgeRamp(distance, band.vanish, band.fullNear);
  const far = 1 - edgeRamp(distance, band.fullFar, band.appear);
  return { scale: minScale + (1 - minScale) * near, opacity: near * far };
}
