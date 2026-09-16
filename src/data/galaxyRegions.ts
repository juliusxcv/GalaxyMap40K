import { SOLAR_RADIUS } from "./proceduralGalaxy";

export interface Segmentum {
  id: string;
  name: string;
  /** Angular span in degrees (0 = +X/east, increasing counterclockwise),
   * going from angleStart to angleEnd — may wrap past 360. `null` for
   * Segmentum Solar, which has no angular restriction: it's the central disc. */
  angleStart: number | null;
  angleEnd: number | null;
  radiusInner: number;
  radiusOuter: number;
  color: string;
}

// Terra isn't the galactic center — it just LOOKS that way on Imperial star
// charts because the segmentum wheel is drawn centered on Terra, not on the
// galaxy's true core. So: the ambient dust field (proceduralGalaxy.ts) is
// centered on the true galactic center at the world origin, while the
// segmentum wheel and every system position are centered on TERRA_OFFSET —
// a point out within the dust field, standing in for Terra/Sol.
export const TERRA_OFFSET: [number, number, number] = [20, 0, 0];

// These boundaries are fit directly to the scraped star data rather than a
// clean 4-even-quadrants split: for every star with a `segmentum` label,
// its angle and distance from Terra were computed, then each segmentum's
// angular span was set to the midpoint between its circular-mean angle and
// its neighbors', and radiusOuter to the 95th percentile of that
// segmentum's own stars' distance (so a handful of extreme outliers don't
// blow the wedge out, while the bulk of real member stars land inside it).
// This took the geometric "does this star's position actually fall inside
// its own labeled segmentum's wedge" match rate from 60% to 88% versus the
// original round-number quadrants. Regenerate by rerunning the fit script
// (see scripts/, or the crosscheck described in project notes) if
// starSystems.json changes meaningfully.
export const SEGMENTA: Segmentum[] = [
  { id: "solar", name: "Segmentum Solar", angleStart: null, angleEnd: null, radiusInner: 0, radiusOuter: SOLAR_RADIUS, color: "#f6d67a" },
  { id: "ultima", name: "Segmentum Ultima", angleStart: 288.5, angleEnd: 376.9, radiusInner: SOLAR_RADIUS, radiusOuter: 58.8, color: "#7ac9f6" },
  { id: "obscurus", name: "Segmentum Obscurus", angleStart: 16.9, angleEnd: 118.5, radiusInner: SOLAR_RADIUS, radiusOuter: 33.5, color: "#c97af6" },
  { id: "pacificus", name: "Segmentum Pacificus", angleStart: 118.5, angleEnd: 210.2, radiusInner: SOLAR_RADIUS, radiusOuter: 27.9, color: "#7af6a3" },
  { id: "tempestus", name: "Segmentum Tempestus", angleStart: 210.2, angleEnd: 288.5, radiusInner: SOLAR_RADIUS, radiusOuter: 44.6, color: "#f67a7a" },
];
