import {
  armStrength,
  armTheta,
  BAR_HALF_LENGTH,
  discHeight,
  galaxyToWorld,
  GALAXY_SCALE,
  type ArmKind,
} from "../../data/galaxyStructure";

// Decorative star population (not data — these aren't clickable systems):
// OB clusters strung along the arms, an arm-biased disc field, the bulge and
// bar, and a faint distant sky. Deterministic, so every load looks the same.

export interface StarField {
  count: number;
  /** World-space positions. */
  positions: Float32Array;
  /** Linear RGB, already scaled by luminosity. */
  colors: Float32Array;
  sizes: Float32Array;
}

export interface ClusterLight {
  /** Galaxy-space position. */
  position: [number, number, number];
  /** Galaxy-space reach. */
  radius: number;
  color: [number, number, number];
}

const CLUSTER_COUNT = 300;
const CLUSTER_STARS = 34000;
const FIELD_STARS = 26000;
const BULGE_STARS = 7000;
const SKY_STARS = 4000;
export const CLUSTER_LIGHT_COUNT = 8;

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

type RGB = [number, number, number];
const DEEP_BLUE: RGB = [0.42, 0.6, 1.0];
const BLUE_WHITE: RGB = [0.66, 0.8, 1.0];
const WHITE: RGB = [1.0, 0.95, 0.9];
const YELLOW: RGB = [1.0, 0.82, 0.56];
const ORANGE: RGB = [1.0, 0.58, 0.3];

class Builder {
  positions: number[] = [];
  colors: number[] = [];
  sizes: number[] = [];

  add(galaxy: [number, number, number], color: RGB, light: number, size: number) {
    const w = galaxyToWorld(galaxy[0], galaxy[1], galaxy[2]);
    this.positions.push(w[0], w[1], w[2]);
    this.colors.push(color[0] * light, color[1] * light, color[2] * light);
    this.sizes.push(size);
  }
}

/** Bright young stars in clusters along the arms. Returns the clusters so
 * the biggest can light the surrounding gas. */
function addClusters(b: Builder, rand: () => number) {
  const clusters = Array.from({ length: CLUSTER_COUNT }, () => {
    const pick = rand();
    const kind: ArmKind = pick < 0.62 ? "major" : pick < 0.88 ? "minor" : "spur";
    const side = rand() < 0.5 ? 0 : 1;
    const r = kind === "spur" ? 0.36 + rand() * 0.5 : 0.17 + Math.pow(rand(), 0.85) * 0.88;
    // Slightly downstream of the ridge — the dust lanes sit on the inner edge.
    const theta = armTheta(kind, side, r) - 0.03 + gaussian(rand) * 0.04;
    const spread = 0.005 + Math.pow(rand(), 1.6) * 0.024;
    return { r, theta, spread, weight: Math.pow(spread, 1.3) * (0.5 + rand()) };
  });
  const totalWeight = clusters.reduce((sum, c) => sum + c.weight, 0);

  for (const cluster of clusters) {
    const members = Math.round((cluster.weight / totalWeight) * CLUSTER_STARS);
    const cos = Math.cos(cluster.theta);
    const sin = Math.sin(cluster.theta);
    for (let i = 0; i < members; i++) {
      const radial = gaussian(rand) * cluster.spread;
      const along = gaussian(rand) * cluster.spread * 2.2;
      const x = cos * (cluster.r + radial) - sin * along;
      const z = sin * (cluster.r + radial) + cos * along;
      const y = gaussian(rand) * (0.006 + cluster.spread * 0.6);
      const warmth = rand();
      const luminosity = rand();
      const rare = Math.pow(Math.max(0, (luminosity - 0.985) / 0.015), 2);
      const color = warmth < 0.08 ? ORANGE : warmth < 0.3 ? WHITE : warmth < 0.82 ? BLUE_WHITE : DEEP_BLUE;
      const light = 0.22 + Math.pow(luminosity, 3) * 0.6 + rare * 2.6;
      b.add([x, y, z], color, light, 0.75 + Math.pow(rand(), 6) * 1.1 + rare * 1.4);
    }
  }
  return clusters;
}

/** Older disc stars, exponential in radius, favouring the arms. */
function addField(b: Builder, rand: () => number) {
  let placed = 0;
  while (placed < FIELD_STARS) {
    const r = -0.32 * Math.log(1 - rand() * 0.98);
    if (r < 0.05 || r > 1.2) continue;
    const theta = rand() * Math.PI * 2;
    const arms = armStrength(r, theta);
    if (rand() > 0.22 + 0.78 * Math.min(1, arms)) continue;
    placed++;
    const y = gaussian(rand) * discHeight(r, arms) * 0.8;
    const inner = Math.max(0, 1 - r / 0.45);
    const pick = rand();
    const color = pick < 0.15 + inner * 0.35 ? YELLOW : pick < 0.25 + inner * 0.45 ? ORANGE : pick < 0.75 ? WHITE : BLUE_WHITE;
    const luminosity = rand();
    b.add([Math.cos(theta) * r, y, Math.sin(theta) * r], color, 0.14 + Math.pow(luminosity, 4) * 0.5, 0.65 + rand() * 0.5);
  }
}

/** Warm, crowded bulge and bar. */
function addBulge(b: Builder, rand: () => number) {
  for (let i = 0; i < BULGE_STARS; i++) {
    let x: number, y: number, z: number;
    if (rand() < 0.55) {
      x = gaussian(rand) * BAR_HALF_LENGTH * 0.5;
      z = gaussian(rand) * BAR_HALF_LENGTH * 0.17;
      y = gaussian(rand) * 0.028;
    } else {
      const scale = 0.035 + Math.abs(gaussian(rand)) * 0.035;
      x = gaussian(rand) * scale;
      z = gaussian(rand) * scale;
      y = gaussian(rand) * scale * 0.7;
    }
    const pick = rand();
    const color = pick < 0.45 ? YELLOW : pick < 0.8 ? ORANGE : WHITE;
    b.add([x, y, z], color, 0.05 + Math.pow(rand(), 6) * 0.3, 0.6 + rand() * 0.5);
  }
}

/** Distant background stars on a shell well outside the galaxy. */
function addSky(b: Builder, rand: () => number) {
  for (let i = 0; i < SKY_STARS; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const radius = (240 + rand() * 100) / GALAXY_SCALE;
    const color = rand() < 0.25 ? YELLOW : rand() < 0.5 ? WHITE : BLUE_WHITE;
    b.add([Math.cos(a) * s * radius, u * radius, Math.sin(a) * s * radius], color, 0.05 + Math.pow(rand(), 3) * 0.25, 0.6 + rand() * 0.6);
  }
}

/** The largest clusters, kept apart, become point lights that make the
 * surrounding gas glow blue or orange. */
function pickClusterLights(clusters: { r: number; theta: number; spread: number; weight: number }[], rand: () => number): ClusterLight[] {
  const lights: ClusterLight[] = [];
  const candidates = clusters.filter((c) => c.r > 0.22 && c.r < 0.95).sort((a, b) => b.weight - a.weight);
  for (const c of candidates) {
    const position: [number, number, number] = [Math.cos(c.theta) * c.r, 0, Math.sin(c.theta) * c.r];
    const tooClose = lights.some((l) => Math.hypot(l.position[0] - position[0], l.position[2] - position[2]) < 0.22);
    if (tooClose) continue;
    const warm = rand() < 0.3;
    lights.push({
      position,
      radius: 0.11 + c.spread * 2.2,
      color: warm ? [1.0, 0.56, 0.25] : rand() < 0.5 ? [0.4, 0.66, 1.0] : [0.5, 0.85, 1.0],
    });
    if (lights.length === CLUSTER_LIGHT_COUNT) break;
  }
  return lights;
}

function buildStarField(): { stars: StarField; clusterLights: ClusterLight[] } {
  const rand = mulberry32(0x9a1a7c);
  const b = new Builder();
  const clusters = addClusters(b, rand);
  addField(b, rand);
  addBulge(b, rand);
  addSky(b, rand);
  return {
    stars: {
      count: b.sizes.length,
      positions: new Float32Array(b.positions),
      colors: new Float32Array(b.colors),
      sizes: new Float32Array(b.sizes),
    },
    clusterLights: pickClusterLights(clusters, rand),
  };
}

export const { stars: GALAXY_STAR_FIELD, clusterLights: GALAXY_CLUSTER_LIGHTS } = buildStarField();
