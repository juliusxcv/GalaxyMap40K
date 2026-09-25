import { TERRA_OFFSET } from "./galaxyRegions";

// The procedural galaxy (volumetric gas/dust in GalaxyVolume, decorative
// stars in GalaxyStars) is modelled in its own "galaxy space": origin at the
// galactic core, +Y out of the disc, the luminous disc fading out around
// r ≈ 1. Everything here is shared by the GLSL (via galaxyGlslDefines) and
// the JS star generator, so gas arms, dust lanes and star clusters coincide.

/** World position of the galactic core. It is deliberately NOT Terra: the
 * segmentum wheel is Terra-centered, but the galaxy's true center lies out in
 * Segmentum Ultima. Fit to the data: the center of the smallest disc holding
 * 97% of placed systems (accuracy ≥ 0.6) lands at ≈(32, −12) — 17 units from
 * Terra at 315°, inside Ultima's 288.5°–376.9° wedge — and that disc's
 * radius (~44) sets GALAXY_SCALE below. */
export const GALACTIC_CORE: [number, number, number] = [32, 0, -12];

/** World units per galaxy-space unit. */
export const GALAXY_SCALE = 44;

// Logarithmic spiral: an arm is the curve θ = ARM_PHASE + ARM_TWIST·ln(r + ARM_R0)
// (+π for the opposite arm). ARM_TWIST 3.6 ≈ a 15.5° pitch angle.
export const ARM_TWIST = 3.6;
export const ARM_R0 = 0.04;
/** Half-length of the central bar; the two major arms leave from its ends. */
export const BAR_HALF_LENGTH = 0.2;
export const ARM_PHASE = -ARM_TWIST * Math.log(BAR_HALF_LENGTH + ARM_R0);
/** Spurs branch off the major arms at SPUR_ROOT with a looser pitch. */
export const SPUR_TWIST = ARM_TWIST * 0.72;
const SPUR_ROOT = 0.35;
export const SPUR_PHASE = (ARM_TWIST - SPUR_TWIST) * Math.log(SPUR_ROOT + ARM_R0) + ARM_PHASE;
/** Dust lanes ride the inner (concave) edge of each arm, this far ahead in
 * arm phase. */
export const LANE_OFFSET = 0.2;

// Rotate the whole galaxy about the core so Terra sits on a minor arm
// between the two major arms — the Sun's place in the Orion Spur.
const terraDx = TERRA_OFFSET[0] - GALACTIC_CORE[0];
const terraDz = TERRA_OFFSET[2] - GALACTIC_CORE[2];
const terraRadius = Math.hypot(terraDx, terraDz) / GALAXY_SCALE;
export const GALAXY_ORIENTATION =
  Math.atan2(terraDz, terraDx) - ARM_TWIST * Math.log(terraRadius + ARM_R0) - ARM_PHASE - Math.PI / 2;

const cosO = Math.cos(GALAXY_ORIENTATION);
const sinO = Math.sin(GALAXY_ORIENTATION);

export function worldToGalaxy(x: number, y: number, z: number): [number, number, number] {
  const dx = (x - GALACTIC_CORE[0]) / GALAXY_SCALE;
  const dz = (z - GALACTIC_CORE[2]) / GALAXY_SCALE;
  return [cosO * dx + sinO * dz, (y - GALACTIC_CORE[1]) / GALAXY_SCALE, -sinO * dx + cosO * dz];
}

export function galaxyToWorld(gx: number, gy: number, gz: number): [number, number, number] {
  return [
    GALACTIC_CORE[0] + GALAXY_SCALE * (cosO * gx - sinO * gz),
    GALACTIC_CORE[1] + GALAXY_SCALE * gy,
    GALACTIC_CORE[2] + GALAXY_SCALE * (sinO * gx + cosO * gz),
  ];
}

export type ArmKind = "major" | "minor" | "spur";

/** Galaxy-space angle of an arm's ridge at radius r. `side` 0/1 picks one of
 * the two point-symmetric copies. */
export function armTheta(kind: ArmKind, side: number, r: number): number {
  const lr = Math.log(r + ARM_R0);
  if (kind === "spur") return SPUR_PHASE + SPUR_TWIST * lr + side * Math.PI;
  return ARM_PHASE + ARM_TWIST * lr + side * Math.PI + (kind === "minor" ? Math.PI / 2 : 0);
}

function armProfile(x: number, sharpness: number): number {
  return Math.pow(0.5 + 0.5 * Math.cos(x), sharpness);
}

/** Noise-free arm strength at a galaxy-plane point — the JS twin of the
 * GLSL spiralArms(), used to bias where field stars are placed. */
export function armStrength(r: number, theta: number): number {
  const lr = Math.log(r + ARM_R0);
  const phi = theta - ARM_TWIST * lr - ARM_PHASE;
  const major = armProfile(2 * phi, 6);
  const minor = armProfile(2 * phi - Math.PI + 0.35 * Math.sin(r * 9 + 1.3), 9);
  const spurPhi = theta - SPUR_TWIST * lr - SPUR_PHASE;
  const spur = armProfile(2 * spurPhi, 12) * smoothstep(0.3, 0.48, r) * (1 - smoothstep(0.75, 1.0, r));
  const fadeIn = smoothstep(BAR_HALF_LENGTH * 0.55, BAR_HALF_LENGTH * 1.5, r);
  return (major + 0.55 * minor + 0.4 * spur) * fadeIn;
}

/** Gaussian scale height of the gas disc (galaxy units). */
export function discHeight(r: number, arms: number): number {
  return 0.022 + 0.018 * arms + 0.024 * Math.exp(-r * 5) + 0.018 * smoothstep(0.6, 1.2, r);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const glslFloat = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : v.toPrecision(9));

/** The shared constants as GLSL #defines, so shaders and JS can't drift. */
export function galaxyGlslDefines(): string {
  const defines: Record<string, number> = {
    GALAXY_SCALE,
    ARM_TWIST,
    ARM_R0,
    ARM_PHASE,
    SPUR_TWIST,
    SPUR_PHASE,
    BAR_HALF: BAR_HALF_LENGTH,
    LANE_OFFSET,
    ORIENT_COS: cosO,
    ORIENT_SIN: sinO,
  };
  return [
    ...Object.entries(defines).map(([name, value]) => `#define ${name} ${glslFloat(value)}`),
    `#define GALACTIC_CORE vec3(${GALACTIC_CORE.map(glslFloat).join(", ")})`,
  ].join("\n");
}
