import { galaxyGlslDefines } from "../../data/galaxyStructure";

/** Animation clock for the cloud noise, advanced by GalaxyVolume and read
 * by GalaxyStars so star dimming follows the same drifting dust. */
export const galaxyClock = { time: 0 };

/** GLSL shared by the cloud volume and the decorative stars: galaxy-space
 * transforms, integer-hash value noise, the spiral skeleton, and a coarse
 * (low-noise) dust density used for shadows and star extinction. Requires
 * GLSL 3 (unsigned integer hashing). Declares `uTime`. */
export const GALAXY_SHADER_COMMON = /* glsl */ `
${galaxyGlslDefines()}
#define PI 3.14159265
// Dust is ~16x more absorbing than the glowing gas, per unit density.
#define GAS_EXTINCTION 0.16
#define DUST_EXTINCTION 2.6
// Shear applied to the noise domain so clouds stretch along the spiral.
#define CLOUD_SWIRL 0.35
// Dust layer thickness relative to the gas layer.
#define DUST_HEIGHT 0.8

uniform float uTime;

vec3 worldToGalaxy(vec3 w) {
  vec3 d = (w - GALACTIC_CORE) / GALAXY_SCALE;
  return vec3(ORIENT_COS * d.x + ORIENT_SIN * d.z, d.y, -ORIENT_SIN * d.x + ORIENT_COS * d.z);
}

vec3 worldDirToGalaxy(vec3 v) {
  return vec3(ORIENT_COS * v.x + ORIENT_SIN * v.z, v.y, -ORIENT_SIN * v.x + ORIENT_COS * v.z);
}

// lowbias32 (Chris Wellons) over a mixed lattice coordinate.
float hashCell(ivec3 c) {
  uint h = uint(c.x) * 0x8da6b343u ^ uint(c.y) * 0xd8163841u ^ uint(c.z) * 0xcb1ab31fu;
  h ^= h >> 16u; h *= 0x7feb352du;
  h ^= h >> 15u; h *= 0x846ca68bu;
  h ^= h >> 16u;
  return float(h >> 8u) * (1.0 / 16777215.0);
}

float hashUint(uint h) {
  h ^= h >> 16u; h *= 0x7feb352du;
  h ^= h >> 15u; h *= 0x846ca68bu;
  h ^= h >> 16u;
  return float(h >> 8u) * (1.0 / 16777215.0);
}

// Value noise with quintic fade, 0..1.
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec3 c = ivec3(i);
  float a = mix(hashCell(c), hashCell(c + ivec3(1, 0, 0)), u.x);
  float b = mix(hashCell(c + ivec3(0, 1, 0)), hashCell(c + ivec3(1, 1, 0)), u.x);
  float d = mix(hashCell(c + ivec3(0, 0, 1)), hashCell(c + ivec3(1, 0, 1)), u.x);
  float e = mix(hashCell(c + ivec3(0, 1, 1)), hashCell(c + ivec3(1, 1, 1)), u.x);
  return mix(mix(a, b, u.y), mix(d, e, u.y), u.z);
}

// Orthonormal rotation between octaves hides the value-noise lattice.
const mat3 OCTAVE_ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

float armProfile(float x, float sharpness) {
  return pow(0.5 + 0.5 * cos(x), sharpness);
}

// Arm strength at a galaxy-plane point (JS twin: armStrength in
// galaxyStructure.ts). phi is the arm phase: 0/π on major-arm ridges.
float spiralArms(float r, float theta, out float phi) {
  float lr = log(r + ARM_R0);
  phi = theta - ARM_TWIST * lr - ARM_PHASE;
  float major = armProfile(2.0 * phi, 6.0);
  float minor = armProfile(2.0 * phi - PI + 0.35 * sin(r * 9.0 + 1.3), 9.0);
  float spurPhi = theta - SPUR_TWIST * lr - SPUR_PHASE;
  float spur = armProfile(2.0 * spurPhi, 12.0) * smoothstep(0.3, 0.48, r) * (1.0 - smoothstep(0.75, 1.0, r));
  float fadeIn = smoothstep(BAR_HALF * 0.55, BAR_HALF * 1.5, r);
  return (major + 0.55 * minor + 0.4 * spur) * fadeIn;
}

float discEnvelope(float r) {
  return exp(-r * 1.7) * (1.0 - smoothstep(0.88, 1.3, r));
}

float discHeight(float r, float arms) {
  return 0.022 + 0.018 * arms + 0.024 * exp(-r * 5.0) + 0.018 * smoothstep(0.6, 1.2, r);
}

// The dust layer is thinner than the gas and, unlike it, doesn't puff up
// around the bulge — edge-on it's a narrow band across the core.
float dustHeight(float r, float arms) {
  return DUST_HEIGHT * (0.022 + 0.018 * arms + 0.018 * smoothstep(0.6, 1.2, r));
}

// Integral-normalised Gaussian: the column density through the disc is
// independent of its thickness.
float gaussianLayer(float y, float h) {
  return exp(-0.5 * y * y / (h * h)) / (h * 2.5066283);
}

// Outer-disc warp, like the Milky Way's.
float discWarp(float r, float theta) {
  return 0.03 * smoothstep(0.55, 1.15, r) * sin(theta - 0.6);
}

vec2 cloudSwirl(vec2 p, float r) {
  float a = CLOUD_SWIRL * log(r + 0.08);
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float broadCloudNoise(vec3 field) {
  return vnoise(field * 12.0 + vec3(0.0, uTime * 0.011, 0.0));
}

// Dust lane structure given arm phase and two noise values: sharp lanes on
// the inner edge of each arm, bent and broken up by the noise.
float dustLanes(float phi, float r, float broad, float fibers) {
  float lanePhase = phi + (broad - 0.5) * 0.22;
  float spine = armProfile(2.0 * (lanePhase - LANE_OFFSET), 34.0);
  float fork = armProfile(2.0 * (lanePhase - LANE_OFFSET - 0.17 - 0.12 * sin(r * 16.0 + broad * 2.5)), 72.0);
  float minorLane = 0.55 * armProfile(2.0 * (lanePhase - LANE_OFFSET * 0.7) - PI, 52.0);
  float continuity = smoothstep(0.18, 0.68, 0.62 * broad + 0.38 * fibers);
  return (3.0 * spine + 1.4 * fork + minorLane) * (0.3 + 0.95 * continuity);
}

// Point-symmetric dust lanes along the bar's leading edges.
float barLanes(vec2 p) {
  float side = p.x >= 0.0 ? 1.0 : -1.0;
  float offset = (p.y * side - 0.028) / 0.009;
  return exp(-offset * offset) * smoothstep(0.02, 0.07, abs(p.x)) * (1.0 - smoothstep(BAR_HALF * 0.9, BAR_HALF * 1.3, abs(p.x)));
}

// Coarse dust density: same lanes and layer as the volume, one noise octave.
float coarseDust(vec3 g) {
  float r = length(g.xz);
  if (r > 1.25 || abs(g.y) > 0.12) return 0.0;
  float theta = atan(g.z, g.x);
  float phi;
  float arms = spiralArms(r, theta, phi);
  float y = g.y - discWarp(r, theta);
  float vertical = gaussianLayer(y + 0.004, dustHeight(r, arms));
  if (vertical < 0.01) return 0.0;
  vec2 ps = cloudSwirl(g.xz, r);
  float broad = broadCloudNoise(vec3(ps.x, y * 1.5, ps.y));
  float lanes = dustLanes(phi, r, broad, 0.5);
  float disc = discEnvelope(r);
  float density = disc * (0.05 + lanes) * smoothstep(0.07, 0.24, r) + 0.9 * disc * barLanes(g.xz);
  return density * vertical * (0.5 + 0.7 * smoothstep(0.24, 0.76, broad));
}
`;
