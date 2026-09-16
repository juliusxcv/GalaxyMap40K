import { SOLAR_RADIUS } from "./proceduralGalaxy";

export interface Segmentum {
  id: string;
  name: string;
  /** Center of the quadrant wedge in degrees (0 = +X/east), or null for
   * Segmentum Solar, which has no angular restriction — it's the central disc. */
  centerAngleDeg: number | null;
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

// Radius bands are asymmetric, not a uniform wheel — derived from real
// distance-from-Terra distributions on a curated reference map
// (jambonium.co.uk/40kmap), which is a far better-sourced approximation of
// relative POI placement than an even split. Segmentum Ultima genuinely
// reaches much further from Terra than, say, Pacificus.
export const SEGMENTA: Segmentum[] = [
  { id: "solar", name: "Segmentum Solar", centerAngleDeg: null, radiusInner: 0, radiusOuter: SOLAR_RADIUS, color: "#f6d67a" },
  { id: "ultima", name: "Segmentum Ultima", centerAngleDeg: 0, radiusInner: SOLAR_RADIUS, radiusOuter: 58, color: "#7ac9f6" },
  { id: "obscurus", name: "Segmentum Obscurus", centerAngleDeg: 90, radiusInner: SOLAR_RADIUS, radiusOuter: 32, color: "#c97af6" },
  { id: "pacificus", name: "Segmentum Pacificus", centerAngleDeg: 180, radiusInner: SOLAR_RADIUS, radiusOuter: 20, color: "#7af6a3" },
  { id: "tempestus", name: "Segmentum Tempestus", centerAngleDeg: 270, radiusInner: SOLAR_RADIUS, radiusOuter: 42, color: "#f67a7a" },
];

export const SEGMENTUM_WEDGE_DEG = 90;
