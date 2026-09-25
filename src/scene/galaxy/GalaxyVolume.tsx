import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GALAXY_SCALE, smoothstep } from "../../data/galaxyStructure";
import { GALAXY_SHADER_COMMON, galaxyClock } from "./galaxyShaderCommon";
import { CLUSTER_LIGHT_COUNT, GALAXY_CLUSTER_LIGHTS } from "./galaxyStarField";

// The galaxy's gas and dust: one fullscreen fragment shader raymarches a
// procedural 3D density field (spiral arms, Gaussian disc, layered noise,
// sharp dust lanes) with emission–absorption integration, core light
// scattered through shadowing dust, and a filmic curve. It's rendered into a
// reduced-resolution buffer, accumulated over frames while the camera is
// still (the ray jitter changes every frame, so a resting view converges to
// a clean image), then composited behind everything else with premultiplied
// alpha. Stars stay full resolution and are dimmed separately.

const MAX_STEPS = 112;

/** Resolution scale of the volume buffer, ray steps, and whether the extra
 * detail octaves run. Level 1 is the start; slow frames step down, a long
 * run of fast frames steps up. */
const QUALITY_LEVELS = [
  { scale: 0.8, steps: 96, highDetail: true },
  { scale: 0.62, steps: 80, highDetail: true },
  { scale: 0.5, steps: 60, highDetail: false },
  { scale: 0.4, steps: 44, highDetail: false },
];
const START_LEVEL = 1;
/** Frames averaged once the camera rests; beyond this it's a moving average
 * so the slowly drifting clouds stay current. */
const MAX_ACCUMULATED_FRAMES = 24;
/** Once converged, re-render the volume only every Nth frame. */
const SETTLED_REFRESH_INTERVAL = 4;
const SLOW_FRAME_MS = 24;
const FAST_FRAME_MS = 17.5;

const VOLUME_VERTEX = /* glsl */ `
uniform vec2 uPixelJitter;
varying vec2 vNdc;
void main() {
  // Sub-pixel ray jitter (in NDC); accumulation turns it into anti-aliasing.
  vNdc = position.xy + uPixelJitter;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const ACCUMULATE_FRAGMENT = /* glsl */ `
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform float uBlend;
varying vec2 vUv;
void main() {
  gl_FragColor = mix(texture2D(uHistory, vUv), texture2D(uCurrent, vUv), uBlend);
}
`;

const VOLUME_FRAGMENT = /* glsl */ `
#define MAX_STEPS ${MAX_STEPS}
#define CLUSTER_LIGHTS ${CLUSTER_LIGHT_COUNT}
${GALAXY_SHADER_COMMON}

uniform mat4 uInvViewProj;
uniform vec3 uCameraWorld;
uniform int uSteps;
uniform bool uHighDetail;
uniform float uZoomDetail;
uniform float uExposure;
uniform float uFrameJitter;
uniform vec4 uLights[CLUSTER_LIGHTS];      // xyz galaxy position, w reach
uniform vec3 uLightColors[CLUSTER_LIGHTS];

varying vec2 vNdc;
layout(location = 0) out highp vec4 fragColor;

const vec3 VOLUME_HALF = vec3(1.3, 0.2, 1.3);
const vec3 CORE_LIGHT = vec3(0.0, 0.02, 0.0);

vec2 boxHit(vec3 o, vec3 d) {
  vec3 safe = vec3(
    d.x >= 0.0 ? max(d.x, 1e-6) : min(d.x, -1e-6),
    d.y >= 0.0 ? max(d.y, 1e-6) : min(d.y, -1e-6),
    d.z >= 0.0 ? max(d.z, 1e-6) : min(d.z, -1e-6));
  vec3 a = (-VOLUME_HALF - o) / safe;
  vec3 b = (VOLUME_HALF - o) / safe;
  vec3 lo = min(a, b), hi = max(a, b);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

// Fades an octave toward its mean once its wavelength drops under a pixel.
float resolveOctave(float footprint, float frequency) {
  return 1.0 - smoothstep(0.25, 0.9, footprint * frequency);
}

// Henyey–Greenstein relative to isotropic, softened. cosTheta is between
// the view ray and the sample→light direction, so g > 0 favours light
// shining through the cloud toward the eye.
float scatterPhase(float cosTheta) {
  const float g = 0.28;
  float hg = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * cosTheta, 0.04), 1.5);
  return mix(1.0, hg, 0.6);
}

// Optical depth from q toward the core light through coarse dust, with
// quadratic tap spacing so taps crowd near the receiver.
float coreShadowDepth(vec3 q) {
  vec3 toLight = CORE_LIGHT - q;
  float span = length(toLight);
  int taps = uHighDetail ? 4 : 2;
  float tau = 0.0;
  for (int j = 0; j < 4; j++) {
    if (j >= taps) break;
    float a = float(j) / float(taps), b = float(j + 1) / float(taps);
    vec3 probe = q + toLight * (0.5 * (a * a + b * b));
    tau += coarseDust(probe) * span * (b * b - a * a);
  }
  return min(tau * DUST_EXTINCTION, 12.0);
}

vec3 clusterLight(vec3 q, vec3 rd, int i) {
  vec4 light = uLights[i];
  vec3 delta = light.xyz - q;
  float d2 = dot(delta, delta);
  float reach2 = light.w * light.w;
  if (d2 >= reach2) return vec3(0.0);
  float d = sqrt(max(d2, 1e-8));
  float edge = 1.0 - d2 / reach2;
  float falloff = 1.8 * edge * edge / (1.0 + d2 / (reach2 * 0.12));
  float tau = uHighDetail ? coarseDust(q + delta * 0.5) * d * DUST_EXTINCTION : 0.0;
  return uLightColors[i] * falloff * exp(-min(tau, 12.0)) * scatterPhase(dot(rd, delta / d));
}

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// The smooth stellar light — nucleus, bulge, bar and halo — is a sum of
// anisotropic Gaussians, so it's integrated along the ray in closed form
// (via erf) instead of point-sampled. The brightest part of the image then
// has no grain or banding however coarse the ray steps get.
float erfApprox(float x) {
  float x2 = x * x;
  float v = sqrt(1.0 - exp(-x2 * (1.2732395 + 0.147 * x2) / (1.0 + 0.147 * x2)));
  return x >= 0.0 ? v : -v;
}

// A Gaussian exp(-Σ k·p²) along o + d·t, as (√A, t at peak, scale) where
// the running integral is scale · erf(√A · (t − peak)).
vec3 gaussianAlongRay(vec3 o, vec3 d, vec3 k, float amplitude) {
  float a = max(dot(k, d * d), 1e-8);
  float b = 2.0 * dot(k, o * d);
  float c = dot(k, o * o);
  float rootA = sqrt(a);
  float closest = c - b * b / (4.0 * a);
  return vec3(rootA, -b / (2.0 * a), amplitude * exp(-min(closest, 60.0)) * 0.88622693 / rootA);
}

vec3 nucleusTerm, bulgeTerm, barTerm, haloTerm;
const vec3 STELLAR_WARM = vec3(1.0, 0.83, 0.6);
const vec3 HALO_COLOR = vec3(0.25, 0.33, 0.5);

float termIntegral(vec3 term, float t) {
  return term.z * erfApprox(term.x * (t - term.y));
}

vec3 stellarIntegral(float t) {
  return STELLAR_WARM * (termIntegral(nucleusTerm, t) + termIntegral(bulgeTerm, t) + termIntegral(barTerm, t))
    + HALO_COLOR * termIntegral(haloTerm, t);
}

void main() {
  vec4 farPoint = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 rayWorld = normalize(farPoint.xyz / farPoint.w - uCameraWorld);
  vec3 ro = worldToGalaxy(uCameraWorld);
  vec3 rd = worldDirToGalaxy(rayWorld);
  float angularPixel = max(length(dFdx(rd)), length(dFdy(rd)));

  nucleusTerm = gaussianAlongRay(ro, rd, vec3(260.0, 300.0, 260.0), 6.0);
  bulgeTerm = gaussianAlongRay(ro, rd, vec3(45.0, 48.0, 45.0), 0.8);
  barTerm = gaussianAlongRay(ro, rd, vec3(2.4 / (BAR_HALF * BAR_HALF), 150.0, 2.4 / (BAR_HALF * BAR_HALF * 0.1156)), 1.2);
  haloTerm = gaussianAlongRay(ro, rd, vec3(3.5, 24.0, 3.5), 0.022);
  const float RAY_END = 1000.0;

  vec2 hit = boxHit(ro, rd);
  float t0 = max(hit.x, 0.0), t1 = hit.y;
  if (t1 <= t0) {
    // Misses the gas entirely; only the halo reaches this far.
    vec3 light = stellarIntegral(RAY_END) - stellarIntegral(0.0);
    fragColor = vec4(pow(acesFilm(light * uExposure), vec3(2.2)), 0.0);
    return;
  }

  // A fixed step length (stretched only for rays too long for uSteps) keeps
  // sample positions continuous from pixel to pixel — no step-count bands.
  float dt = max(0.006, (t1 - t0) / float(uSteps));
  int steps = int(ceil((t1 - t0) / dt));
  // Per-pixel ray offset against slice banding; it advances by the golden
  // ratio every frame so accumulated frames fill in between the steps.
  uvec2 pixel = uvec2(gl_FragCoord.xy);
  float jitter = fract(hashUint(pixel.x * 1973u + pixel.y * 9277u + 26699u) + uFrameJitter);

  // Core-light shadow depth is evaluated at fixed nodes every few steps and
  // interpolated between them, lazily, only where lit gas exists.
  float shadowStride = float(uHighDetail ? 4 : 6) * dt;
  float shadowBase = t0 + jitter * dt;
  int shadowNode = -2;
  float tauA = 0.0, tauB = 0.0;

  // Stellar light in front of the gas box arrives unattenuated.
  vec3 stellarBefore = stellarIntegral(t0);
  vec3 radiance = stellarBefore - stellarIntegral(0.0);
  float transmittance = 1.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= steps || transmittance < 0.012) break;
    // Stellar light over this step's segment, attenuated by the dust so far.
    vec3 stellarAfter = stellarIntegral(min(t0 + float(i + 1) * dt, t1));
    radiance += transmittance * (stellarAfter - stellarBefore);
    stellarBefore = stellarAfter;

    float t = t0 + (float(i) + jitter) * dt;
    vec3 g = ro + rd * t;
    float r0 = length(g.xz);
    if (r0 > 1.28) continue;

    float theta0 = atan(g.z, g.x);
    float y = g.y - discWarp(r0, theta0);

    // Low-frequency planar warp makes the arms ragged instead of geometric.
    vec2 p = g.xz;
    float warpAmount = 0.075 * smoothstep(0.05, 0.35, r0);
    vec2 warpNoise = vec2(vnoise(vec3(g.xz * 3.4, 8.2)), vnoise(vec3(g.xz * 3.4, 41.3)));
    p += (warpNoise - 0.5) * warpAmount;
    float r = length(p);
    float theta = atan(p.y, p.x);

    float phi;
    // The same low-frequency noise makes arms brighten and fade along their length.
    float arms = spiralArms(r, theta, phi) * (0.88 + 0.14 * cos(theta - 0.9)) * (0.65 + 0.7 * warpNoise.y);
    float disc = discEnvelope(r);
    float h = discHeight(r, arms);
    float column = disc * (0.075 + 1.7 * arms) * gaussianLayer(y, h);
    float dustLayer = disc * gaussianLayer(y + 0.004, dustHeight(r, arms));
    if (column < 1e-4 && dustLayer < 1e-3) continue;

    // Cloud noise lives in a sheared frame so features stretch along arms.
    vec2 ps = cloudSwirl(p, r);
    vec3 field = vec3(ps.x, y * 1.5, ps.y);
    float footprint = max(angularPixel * t, dt * 0.2);
    float broad = broadCloudNoise(field);
    float medium = vnoise(OCTAVE_ROT * (field * 29.0) + vec3(17.3, uTime * 0.019, 3.1));
    vec3 warped = field + vec3(broad - 0.5, 0.0, medium - 0.5) * 0.03;
    float fine = mix(0.5, vnoise(OCTAVE_ROT * (OCTAVE_ROT * (warped * 71.0)) + 41.1), resolveOctave(footprint, 71.0));
    float lace = 0.5;
    if (uHighDetail) lace = mix(0.5, vnoise(warped * 167.0 + 8.7), resolveOctave(footprint, 167.0));

    // Ridged fine octave: filamentary edges rather than round puffs.
    float ridge = 1.0 - abs(fine * 2.0 - 1.0);
    float cloud = 0.28 * broad + 0.32 * medium + 0.2 * fine + 0.2 * ridge;
    float structure = smoothstep(0.24, 0.76, cloud);
    float gas = column * (0.2 + pow(structure, 1.7) * 2.7) * (0.4 + 1.2 * lace);

    // Fibres are sampled around the arm phase circle so they streak along
    // the spiral rather than across it.
    float fibers = medium;
    if (uHighDetail) {
      float lp = phi + (broad - 0.5) * 0.22;
      fibers = vnoise(vec3(cos(lp) * 26.0, sin(lp) * 26.0, log(r + 0.05) * 4.0 + y * 16.0));
    }
    float lanes = dustLanes(phi, r, broad, fibers);
    // Feathers: short dust strands leaving the main lanes and crossing the
    // arm at a steeper pitch, irregularly spaced along it.
    float armOffset = phi - PI * floor(phi / PI + 0.5);
    float featherWindow = smoothstep(-0.45, -0.2, armOffset) * (1.0 - smoothstep(0.16, 0.3, armOffset));
    if (featherWindow > 0.0) {
      float featherPhase = log(r + ARM_R0) * 8.5 + armOffset * 2.6 + (broad - 0.5) * 0.9;
      float strands = armProfile(6.2831853 * featherPhase, 14.0);
      lanes += 1.1 * strands * featherWindow * smoothstep(0.42, 0.68, medium) * smoothstep(0.2, 0.35, r);
    }
    float erosion = 0.45 + 0.8 * smoothstep(0.22, 0.78, 0.6 * medium + 0.4 * fine);
    float dust = ((0.05 + lanes) * smoothstep(0.07, 0.24, r) + 0.9 * barLanes(p)) * dustLayer * erosion;
    // Lanes are cold molecular gas: where they're thick the gas stops glowing.
    gas *= 1.0 - 0.8 * clamp(lanes * erosion * 0.5, 0.0, 1.0);

    // Zoomed in: ridged filaments, then a micro octave for very close views.
    float detail = uZoomDetail * (1.0 - smoothstep(0.45, 1.4, t)) * (1.0 - smoothstep(0.2, 0.85, footprint * 110.0));
    if (detail > 0.001) {
      float weave = fine;
      if (uHighDetail) {
        vec3 filamentField = vec3(ps.x * 1.25 + ps.y * 0.45, y * 0.5, ps.y * 0.65 - ps.x * 0.2) * 110.0;
        weave = vnoise(filamentField + vec3(medium * 2.5, 7.3, broad * 2.5));
      }
      float filaments = smoothstep(0.56, 0.9, 1.0 - abs(weave * 2.0 - 1.0));
      gas *= mix(1.0, 0.55 + filaments * 1.25, detail);
      dust *= mix(1.0, 0.8 + filaments * 0.45, detail);
      float micro = resolveOctave(footprint, 420.0) * detail;
      if (micro > 0.001) {
        float grain = vnoise(warped * 420.0 + 3.1);
        gas *= mix(1.0, 0.6 + 0.8 * grain, micro);
        dust *= mix(1.0, 0.7 + 0.6 * grain, micro);
      }
    }

    float extinction = gas * GAS_EXTINCTION + dust * DUST_EXTINCTION;
    float armMix = clamp(arms * 1.3, 0.0, 1.0);
    vec3 gasColor = mix(vec3(0.92, 0.78, 0.6), vec3(0.45, 0.62, 0.95), armMix);
    vec3 emitted = gasColor * gas * 0.4;
    // Unresolved starlight: the smooth body of the disc between the clouds.
    vec3 starlightColor = mix(vec3(1.0, 0.86, 0.68), vec3(0.75, 0.82, 1.0), armMix);
    emitted += starlightColor * disc * (0.25 + arms) * gaussianLayer(y, h * 1.2) * 0.14;

    if (gas > 1e-4) {
      vec3 q = g;
      int node = int(floor((t - shadowBase) / shadowStride));
      if (node != shadowNode) {
        tauA = node == shadowNode + 1 ? tauB : coreShadowDepth(ro + rd * (shadowBase + float(node) * shadowStride));
        tauB = coreShadowDepth(ro + rd * (shadowBase + float(node + 1) * shadowStride));
        shadowNode = node;
      }
      float shadowMix = clamp((t - shadowBase) / shadowStride - float(node), 0.0, 1.0);
      vec3 toCore = CORE_LIGHT - q;
      float coreDistance = max(length(toCore), 1e-4);
      float coreFalloff = 0.12 * exp(-coreDistance * coreDistance * 1.6) / (0.08 + coreDistance * coreDistance);
      vec3 illumination = vec3(1.0, 0.76, 0.43) * coreFalloff * exp(-mix(tauA, tauB, shadowMix)) * scatterPhase(dot(rd, toCore / coreDistance));
      int lightCount = uHighDetail ? CLUSTER_LIGHTS : CLUSTER_LIGHTS / 2;
      for (int k = 0; k < CLUSTER_LIGHTS; k++) {
        if (k >= lightCount) break;
        illumination += clusterLight(q, rd, k);
      }
      emitted += gas * illumination * 0.42;

      // Ionised hydrogen: pink-to-magenta knots where the gas is clumpiest.
      float nebula = pow(smoothstep(0.6, 0.84, 0.45 * broad + 0.3 * medium + 0.25 * fine), 2.0) * column * armMix;
      emitted += mix(vec3(0.95, 0.17, 0.36), vec3(0.72, 0.24, 0.86), lace) * nebula * 1.8;
    }

    float attenuation = exp(-extinction * dt);
    float integrated = extinction > 1e-4 ? (1.0 - attenuation) / extinction : dt;
    radiance += transmittance * emitted * integrated;
    transmittance *= attenuation;
  }
  // Stellar light beyond the last step, behind all the dust we crossed.
  radiance += transmittance * (stellarIntegral(RAY_END) - stellarBefore);

  // Inside the disc everything is close and bright; ease the exposure off.
  radiance *= mix(0.6, 1.0, smoothstep(0.05, 0.4, abs(ro.y))) * uExposure;
  // Filmic curve in display space, then back to linear for the (sRGB-
  // encoding) post chain. Output is premultiplied.
  vec3 display = acesFilm(radiance);
  fragColor = vec4(pow(display, vec3(2.2)), 1.0 - transmittance);
}
`;

const COMPOSITE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Catmull–Rom upsampling in 9 bilinear taps: noticeably crisper dust lanes
// than plain bilinear from the reduced-resolution buffer.
const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uVolume;
uniform vec2 uTexelSize;
varying vec2 vUv;
void main() {
  vec2 samplePos = vUv / uTexelSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / w12;
  vec2 texPos0 = (texPos1 - 1.0) * uTexelSize;
  vec2 texPos3 = (texPos1 + 2.0) * uTexelSize;
  vec2 texPos12 = (texPos1 + offset12) * uTexelSize;
  vec4 result = vec4(0.0);
  result += texture2D(uVolume, vec2(texPos0.x, texPos0.y)) * w0.x * w0.y;
  result += texture2D(uVolume, vec2(texPos12.x, texPos0.y)) * w12.x * w0.y;
  result += texture2D(uVolume, vec2(texPos3.x, texPos0.y)) * w3.x * w0.y;
  result += texture2D(uVolume, vec2(texPos0.x, texPos12.y)) * w0.x * w12.y;
  result += texture2D(uVolume, vec2(texPos12.x, texPos12.y)) * w12.x * w12.y;
  result += texture2D(uVolume, vec2(texPos3.x, texPos12.y)) * w3.x * w12.y;
  result += texture2D(uVolume, vec2(texPos0.x, texPos3.y)) * w0.x * w3.y;
  result += texture2D(uVolume, vec2(texPos12.x, texPos3.y)) * w12.x * w3.y;
  result += texture2D(uVolume, vec2(texPos3.x, texPos3.y)) * w3.x * w3.y;
  // Catmull–Rom overshoots slightly at hard edges.
  result = max(result, vec4(0.0));
  result.a = min(result.a, 1.0);
  gl_FragColor = result;
}
`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function volumeTarget() {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
}

/** Halton low-discrepancy value in [0, 1). */
function halton(index: number, base: number) {
  let result = 0;
  let fraction = 1 / base;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    result += (i % base) * fraction;
    fraction /= base;
  }
  return result;
}

function matricesClose(a: THREE.Matrix4, b: THREE.Matrix4) {
  for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > 1e-6) return false;
  return true;
}

function fullscreenTriangle() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return geometry;
}

export function GalaxyVolume() {
  const gl = useThree((s) => s.gl);
  const perf = useRef({ level: START_LEVEL, ceiling: 0, averageMs: 16.7, slowFor: 0, fastFor: 0, raisedAt: -Infinity });

  const resources = useMemo(() => {
    const current = volumeTarget();
    const history = [volumeTarget(), volumeTarget()];
    const triangle = fullscreenTriangle();

    const lights = Array.from({ length: CLUSTER_LIGHT_COUNT }, (_, i) => {
      const light = GALAXY_CLUSTER_LIGHTS[i];
      // Unused slots get zero reach, so the shader skips them.
      return light ? new THREE.Vector4(...light.position, light.radius) : new THREE.Vector4(0, 0, 0, 0);
    });
    const lightColors = Array.from({ length: CLUSTER_LIGHT_COUNT }, (_, i) => new THREE.Color(...(GALAXY_CLUSTER_LIGHTS[i]?.color ?? [0, 0, 0])));

    const volumeMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VOLUME_VERTEX,
      fragmentShader: VOLUME_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uInvViewProj: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Vector3() },
        uSteps: { value: QUALITY_LEVELS[START_LEVEL].steps },
        uHighDetail: { value: QUALITY_LEVELS[START_LEVEL].highDetail },
        uZoomDetail: { value: 0 },
        uExposure: { value: 1 },
        uFrameJitter: { value: 0 },
        uPixelJitter: { value: new THREE.Vector2() },
        uLights: { value: lights },
        uLightColors: { value: lightColors },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    const volumeScene = new THREE.Scene();
    const volumeQuad = new THREE.Mesh(triangle, volumeMaterial);
    volumeQuad.frustumCulled = false;
    volumeScene.add(volumeQuad);
    const volumeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const accumulateMaterial = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: ACCUMULATE_FRAGMENT,
      uniforms: { uCurrent: { value: current.texture }, uHistory: { value: null }, uBlend: { value: 1 } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });

    const compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: { uVolume: { value: null }, uTexelSize: { value: new THREE.Vector2(1, 1) } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });

    return { current, history, triangle, volumeMaterial, accumulateMaterial, volumeQuad, volumeScene, volumeCamera, compositeMaterial };
  }, []);

  useEffect(
    () => () => {
      resources.current.dispose();
      resources.history.forEach((t) => t.dispose());
      resources.triangle.dispose();
      resources.volumeMaterial.dispose();
      resources.accumulateMaterial.dispose();
      resources.compositeMaterial.dispose();
    },
    [resources]
  );

  const accumulation = useRef({ frames: 0, frameIndex: 0, write: 0, quality: -1, view: new THREE.Matrix4(), projection: new THREE.Matrix4() });

  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const drawingSize = useMemo(() => new THREE.Vector2(), []);

  // Priority 0.5: after OrbitControls (-1) and CameraRig's fly-to (0) have
  // moved the camera this frame, before EffectComposer (1) renders the
  // scene — so the volume never lags the stars by a frame.
  useFrame((state, delta) => {
    const { current, history, volumeMaterial, accumulateMaterial, volumeQuad, volumeScene, volumeCamera, compositeMaterial } = resources;
    const camera = state.camera;
    const uniforms = volumeMaterial.uniforms;
    const acc = accumulation.current;
    const p = perf.current;
    if (!reducedMotion) galaxyClock.time += Math.min(delta, 0.1);

    camera.updateMatrixWorld();
    // Any camera change (orbit, zoom, damping, fly-to) restarts accumulation.
    if (!matricesClose(acc.view, camera.matrixWorld) || !matricesClose(acc.projection, camera.projectionMatrix)) {
      acc.frames = 0;
      acc.view.copy(camera.matrixWorld);
      acc.projection.copy(camera.projectionMatrix);
    }
    acc.frameIndex++;
    // A converged view at rest only needs an occasional refresh to follow
    // the slow cloud drift, which leaves the GPU nearly idle.
    const settled = acc.frames >= MAX_ACCUMULATED_FRAMES;
    if (settled && acc.frameIndex % SETTLED_REFRESH_INTERVAL !== 0) return;

    // Adaptive quality, judged only on frames doing full work: step down
    // after sustained slow frames; step back up after a fast stretch, but not
    // above a level that just proved too slow until a much longer one.
    if (!settled) {
      const ms = Math.min(delta, 0.1) * 1000;
      p.averageMs += (ms - p.averageMs) * 0.05;
      p.slowFor = p.averageMs > SLOW_FRAME_MS ? p.slowFor + delta : 0;
      p.fastFor = p.averageMs < FAST_FRAME_MS ? p.fastFor + delta : 0;
      if (p.slowFor > 1 && p.level < QUALITY_LEVELS.length - 1) {
        if (state.clock.elapsedTime - p.raisedAt < 8) p.ceiling = p.level + 1;
        p.level++;
        p.slowFor = 0;
        p.averageMs = 16.7;
      } else if (p.fastFor > 6 && p.level > p.ceiling) {
        p.level--;
        p.fastFor = 0;
        p.raisedAt = state.clock.elapsedTime;
      } else if (p.fastFor > 30 && p.ceiling > 0) {
        p.ceiling--;
      }
    }
    const quality = QUALITY_LEVELS[p.level];

    gl.getDrawingBufferSize(drawingSize);
    const width = Math.max(1, Math.round(drawingSize.x * quality.scale));
    const height = Math.max(1, Math.round(drawingSize.y * quality.scale));
    if (current.width !== width || current.height !== height) {
      current.setSize(width, height);
      history.forEach((t) => t.setSize(width, height));
      compositeMaterial.uniforms.uTexelSize.value.set(1 / width, 1 / height);
      acc.frames = 0;
    }
    if (acc.quality !== p.level) {
      acc.frames = 0;
      acc.quality = p.level;
    }

    uniforms.uFrameJitter.value = (acc.frameIndex * 0.6180339887) % 1;
    uniforms.uPixelJitter.value.set(
      ((halton((acc.frameIndex % 64) + 1, 2) - 0.5) * 2) / width,
      ((halton((acc.frameIndex % 64) + 1, 3) - 0.5) * 2) / height
    );
    uniforms.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    uniforms.uCameraWorld.value.copy(camera.position);
    uniforms.uTime.value = galaxyClock.time;
    uniforms.uSteps.value = quality.steps;
    uniforms.uHighDetail.value = quality.highDetail;

    const controls = state.controls as OrbitControlsImpl | null;
    const focusDistance = controls ? camera.position.distanceTo(controls.target) : camera.position.length();
    // Filament detail fades in from overview distance; the shader also fades
    // it per-sample by ray distance and pixel footprint.
    uniforms.uZoomDetail.value = 1 - smoothstep(0.9 * GALAXY_SCALE, 2.2 * GALAXY_SCALE, focusDistance);

    const previousTarget = gl.getRenderTarget();
    gl.setRenderTarget(current);
    gl.render(volumeScene, volumeCamera);

    // Blend this frame into the history (a plain copy right after a reset).
    const read = history[acc.write];
    const write = history[1 - acc.write];
    accumulateMaterial.uniforms.uHistory.value = read.texture;
    accumulateMaterial.uniforms.uBlend.value = 1 / (Math.min(acc.frames, MAX_ACCUMULATED_FRAMES - 1) + 1);
    volumeQuad.material = accumulateMaterial;
    gl.setRenderTarget(write);
    gl.render(volumeScene, volumeCamera);
    volumeQuad.material = volumeMaterial;
    gl.setRenderTarget(previousTarget);

    compositeMaterial.uniforms.uVolume.value = write.texture;
    acc.write = 1 - acc.write;
    acc.frames++;
  }, 0.5);

  // Drawn first among transparent objects, behind every star and line.
  return <mesh geometry={resources.triangle} material={resources.compositeMaterial} frustumCulled={false} renderOrder={-1000} />;
}
