import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { usePicking } from "./Picking";
import { accuracyToColor } from "../data/accuracyColor";
import { BASE_SIZE, HOVER_SCALE, SELECT_SCALE, markerGlow } from "./markerSize";

interface StarSystemsProps {
  systems: StarSystem[];
}

const LERP_SPEED = 10;

/** Deterministic pseudo-random 0..1 per system id, so each star's twinkle
 * phase/speed is stable across re-renders instead of reshuffling. */
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

// Four-layer "Illustrator" star build:
//  1. Circle      — crisp disc in the star's main color.
//  2. Inner glow  — very short falloff, same hue, pushed way more saturated.
//  3. Outer glow 1 — also a short falloff, same saturation as the inner glow,
//                    hue nudged a little (still the same color family).
//  4. Outer glow 2 — same color as the inner glow but very transparent and far
//                    bigger; this is the only layer that flickers, and it
//                    carries the location-confidence signal (size + opacity).
// The flicker is value noise (not a sine wave) so it reads as irregular,
// atmospheric scintillation rather than a smooth pulse.
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  attribute float aSize;
  attribute float aGlow;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vGlow;
  varying float vFlickerSize;
  varying float vFlickerOpacity;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float noise1(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), u);
  }

  void main() {
    vColor = color;
    vGlow = aGlow;

    // Fast, per-star-desynced value noise — noisier and choppier than a
    // sine, so it reads as scintillation rather than a slow pulse. Size and
    // opacity are driven by independent noise streams so they don't move in
    // lockstep.
    float speed = 1.1 + aSeed * 1.7;
    float seedOffset = aSeed * 173.0;

    float tSize = uTime * speed + seedOffset;
    float sizeNoise = noise1(tSize) * 0.6 + noise1(tSize * 2.7 + 11.3) * 0.4;
    vFlickerSize = 0.65 + sizeNoise * 0.6;

    float tOpacity = uTime * speed * 1.3 + seedOffset * 1.7 + 5.0;
    float opacityNoise = noise1(tOpacity) * 0.55 + noise1(tOpacity * 3.1 + 4.2) * 0.45;
    vFlickerOpacity = 0.5 + opacityNoise * 0.9;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Even unknown-location systems (aGlow near 0) keep a decent baseline
    // size — only the aura on top of that should scale with confidence, not
    // the star vanishing outright. Sol (aGlow pushed past the confirmed
    // ceiling of 1.0) gets an outright size multiplier on top, independent
    // of its own system.size, so it isn't at the mercy of data variance the
    // way the confidence-only scaling above is. Threshold is 1.05, not 1.0:
    // plain confirmed systems clamp their accuracy to exactly 1.0, and
    // step()'s edge is inclusive, so 1.0 would catch every one of them too.
    float solBoost = step(1.05, aGlow);
    float glowSize = aSize * (1.35 + aGlow * 0.55) * mix(1.0, 2.6, solBoost);
    float perspectiveSize = glowSize * (180.0 / -mvPosition.z);

    // Every data system keeps a minimum screen-space size so it never
    // shrinks into the decorative galaxy stars behind it (those stay ≤ ~3px).
    // The floor scales with aSize, so hover/selection growth still shows
    // when zoomed out; it hands over to perspective sizing inside ~20 units.
    float markerFloorPx = glowSize * 9.0;
    // Sol (the only system with aGlow pushed past the confirmed ceiling of
    // 1.0) gets a larger floor still, so it stays a recognizable landmark
    // even zoomed all the way out.
    float solFloorPx = solBoost * 16.0;
    gl_PointSize = max(perspectiveSize, max(markerFloorPx, solFloorPx));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  #define MARKER_GAIN 1.8
  varying vec3 vColor;
  varying float vGlow;
  varying float vFlickerSize;
  varying float vFlickerOpacity;

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;

    vec3 hsv = rgb2hsv(vColor);
    float glowSat = clamp(hsv.y * 1.5 + 0.3, 0.0, 1.0);
    float glowVal = clamp(hsv.z * 1.05, 0.0, 1.0);
    vec3 innerGlowColor = hsv2rgb(vec3(hsv.x, glowSat, glowVal));
    vec3 outer1Color = hsv2rgb(vec3(fract(hsv.x + 0.045), glowSat, glowVal));

    // Sol (aGlow/vGlow pushed past the confirmed ceiling of 1.0) is the only
    // system this is true for. Every other star's core gets capped well
    // below Sol's, regardless of its own confidence tier — otherwise a
    // "confirmed" star and Sol share the exact same white and the exact same
    // fixed core weights, and there is nothing left to tell them apart by.
    // Threshold is 1.05, not 1.0: plain confirmed systems clamp their
    // accuracy to exactly 1.0, and step()'s edge is inclusive, so 1.0 would
    // catch every one of them too, not just Sol.
    float solBoost = step(1.05, vGlow);
    float coreScale = mix(0.75, 1.5, solBoost);

    // 1. Circle — crisp core disc, the star's plain main color.
    float circle = smoothstep(0.24, 0.16, d) * 0.75 * coreScale;

    // 2. Inner glow — very short falloff, same hue, much more saturated.
    float inner = pow(max(0.0, 1.0 - d / 0.34), 4.0) * 0.65 * coreScale;

    // 3. Outer glow 1 — also a short falloff, hue nudged within the family.
    float outer1 = pow(max(0.0, 1.0 - d / 0.44), 3.0) * 0.4 * coreScale;

    // 4. Outer glow 2 — big, faint aura. Confidence sets its baseline size
    // and opacity, capped well below Sol's own ceiling; Sol's boosted aGlow
    // (the only value past the "confirmed" ceiling of 1.0) pushes both size
    // and opacity past every other star's max, so it's the one landmark
    // that reads as strikingly bright — everything else stays comparatively
    // restrained even at full confidence.
    float outer2Reach = 0.78 * vFlickerSize;
    float outer2Base = mix(0.22, 0.34, clamp(vGlow, 0.0, 1.0)) + max(vGlow - 1.0, 0.0) * 0.34;
    float outer2 = pow(max(0.0, 1.0 - d / outer2Reach), 2.0) * min(outer2Base * vFlickerOpacity, 0.62);

    // 5. Diffraction spikes — Sol only. Its own class of star, not just a
    // bigger version of the same four layers everyone else gets: two very
    // narrow ellipses (not drawn strokes) crossing through the core, each
    // shaded by its own radial gradient so it tapers smoothly to a point at
    // both ends and along its width, like a bright star caught by a
    // telescope aperture. A second, smaller cross sits underneath rotated
    // 45° and dimmer, the way a real aperture flare shows a faint secondary
    // set of rays between the main four.
    vec2 spikeUvH = uv / vec2(0.5, 0.016);
    vec2 spikeUvV = uv / vec2(0.016, 0.5);
    float spikeH = pow(max(0.0, 1.0 - length(spikeUvH)), 1.6);
    float spikeV = pow(max(0.0, 1.0 - length(spikeUvV)), 1.6);
    float spike = max(spikeH, spikeV) * solBoost * vFlickerOpacity;

    vec2 uvDiag = vec2(uv.x * 0.70710678 - uv.y * 0.70710678, uv.x * 0.70710678 + uv.y * 0.70710678);
    vec2 spikeUvHDiag = uvDiag / vec2(0.33, 0.013);
    vec2 spikeUvVDiag = uvDiag / vec2(0.013, 0.33);
    float spikeHDiag = pow(max(0.0, 1.0 - length(spikeUvHDiag)), 1.6);
    float spikeVDiag = pow(max(0.0, 1.0 - length(spikeUvVDiag)), 1.6);
    float spikeDiag = max(spikeHDiag, spikeVDiag) * solBoost * vFlickerOpacity * 0.4;

    vec3 spikeColor = mix(vec3(1.0), innerGlowColor, 0.35);

    // Hot core: the star's own hue lifted halfway to full brightness, so dim
    // tiers still read as points of light against the gas — while keeping
    // their hue, and their order (confirmed stays brightest).
    float peak = max(vColor.r, max(vColor.g, vColor.b));
    vec3 coreColor = vColor / max(peak, 1e-3) * mix(peak, 1.0, 0.5);

    vec3 finalColor = coreColor * circle
      + innerGlowColor * inner
      + outer1Color * outer1
      + innerGlowColor * outer2
      + spikeColor * spike
      + spikeColor * spikeDiag;

    // HDR gain: markers sit on a bright volumetric galaxy now, and pushing
    // them past 1.0 lets the bloom pass give every data system its own glow.
    gl_FragColor = vec4(finalColor * MARKER_GAIN, 1.0);
  }
`;

/** Point-sprite field of data-backed, clickable star systems. Hover and
 * selection animate a single point's size attribute without touching the
 * rest — this is the only star layer now; there's no separate decorative
 * backdrop, so it doubles as the galaxy's visual texture. */
export function StarSystems({ systems }: StarSystemsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const scalesRef = useRef<Map<number, { current: number; target: number }>>(new Map());
  const baseSizeRef = useRef<Float32Array>(new Float32Array(0));

  const hoveredId = useGalaxyStore((s) => s.hoveredId);
  const selectedSystem = useGalaxyStore((s) => s.selectedSystem);
  const { onPointerMove, onPointerOut, onClick } = usePicking(systems);

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    systems.forEach((s, i) => map.set(s.id, i));
    return map;
  }, [systems]);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(systems.length * 3);
    const colors = new Float32Array(systems.length * 3);
    const sizes = new Float32Array(systems.length);
    const glows = new Float32Array(systems.length);
    const seeds = new Float32Array(systems.length);
    const tmpColor = new THREE.Color();

    systems.forEach((system, i) => {
      positions[i * 3] = system.position[0];
      positions[i * 3 + 1] = system.position[1];
      positions[i * 3 + 2] = system.position[2];
      accuracyToColor(system.accuracy, tmpColor);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
      sizes[i] = BASE_SIZE * system.size;
      glows[i] = markerGlow(system);
      seeds[i] = hashSeed(system.id);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aGlow", new THREE.BufferAttribute(glows, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: { uTime: { value: 0 } },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [systems]);

  useEffect(() => {
    baseSizeRef.current = (geometry.getAttribute("aSize") as THREE.BufferAttribute).array.slice() as Float32Array;
    scalesRef.current.clear();
  }, [geometry]);

  useEffect(() => {
    const map = scalesRef.current;
    for (const index of map.keys()) {
      const id = systems[index]?.id;
      if (id !== hoveredId && id !== selectedSystem?.id) {
        map.get(index)!.target = 1;
      }
    }
    if (hoveredId) {
      const index = idToIndex.get(hoveredId);
      if (index !== undefined) {
        const entry = map.get(index) ?? { current: 1, target: 1 };
        entry.target = HOVER_SCALE;
        map.set(index, entry);
      }
    }
    if (selectedSystem) {
      const index = idToIndex.get(selectedSystem.id);
      if (index !== undefined && systems[index]?.id !== hoveredId) {
        const entry = map.get(index) ?? { current: 1, target: 1 };
        entry.target = SELECT_SCALE;
        map.set(index, entry);
      }
    }
  }, [hoveredId, selectedSystem, idToIndex, systems]);

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;

    const map = scalesRef.current;
    if (map.size === 0) return;
    const sizeAttr = geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const base = baseSizeRef.current;

    const alpha = Math.min(1, delta * LERP_SPEED);
    for (const [index, entry] of map) {
      entry.current += (entry.target - entry.current) * alpha;
      const settled = Math.abs(entry.current - entry.target) < 0.001;
      if (settled) entry.current = entry.target;

      sizeAttr.setX(index, base[index] * entry.current);

      if (settled && entry.target === 1) map.delete(index);
    }
    sizeAttr.needsUpdate = true;
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onClick={onClick}
    />
  );
}
