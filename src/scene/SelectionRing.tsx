import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { overlayRegistry } from "../ui/overlayRegistry";
import { markerSpriteDiameterPx, SELECT_SCALE } from "./markerSize";

// Amber targeting ring around the acquired star. It lies flat in the
// galactic plane, so a tilted view turns it into the ellipse of the
// terminal chart, and it's rescaled every frame to a constant on-screen
// size. Drawn additively in HDR so the bloom pass gives it its glow.

/** Minimum on-screen ring radius, px; up close it widens to clear the
 * marker's own glow. The callout's leader line starts at its rim. */
const MIN_RING_RADIUS_PX = 14;
/** Fraction of the marker sprite's radius the visible glow reaches. */
const MARKER_GLOW_EXTENT = 0.62;
/** The quad is larger than the ring to leave room for glow and tick marks. */
const QUAD_OVER_RING = 1.9;
const ACQUIRE_SECONDS = 0.35;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAcquire;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ringR = 1.0 / ${QUAD_OVER_RING.toFixed(2)};
  float width = 0.045;
  float core = exp(-pow((r - ringR) / width, 2.0));
  float glow = exp(-pow((r - ringR) / (width * 4.0), 2.0)) * 0.35;
  // Four short ticks just outside the rim, slowly turning.
  float angle = atan(p.y, p.x) + uTime * 0.6;
  float tickAngle = abs(fract(angle / 1.5707963 + 0.5) - 0.5) * 1.5707963;
  float tick = (1.0 - smoothstep(0.035, 0.06, tickAngle)) * step(ringR + 0.1, r) * step(r, ringR + 0.24);
  float pulse = 0.82 + 0.18 * sin(uTime * 3.2);
  float intensity = (core + glow + tick * 0.8) * pulse * uAcquire;
  gl_FragColor = vec4(uColor * intensity * 2.4, 1.0);
}
`;

export function SelectionRing() {
  const selected = useGalaxyStore((s) => s.selectedSystem);
  const meshRef = useRef<THREE.Mesh>(null);
  const acquiredAt = useRef(0);
  const clock = useRef(0);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uAcquire: { value: 0 },
          uColor: { value: new THREE.Color(1.0, 0.36, 0.06) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    acquiredAt.current = clock.current;
  }, [selected]);

  useFrame((state, delta) => {
    clock.current += delta;
    const mesh = meshRef.current;
    if (!mesh || !selected) return;
    const camera = state.camera as THREE.PerspectiveCamera;
    mesh.position.set(...selected.position);

    // Snap-in on acquisition: shrink from twice the size while fading up.
    const t = Math.min(1, (clock.current - acquiredAt.current) / ACQUIRE_SECONDS);
    const eased = 1 - Math.pow(1 - t, 3);
    const distance = camera.position.distanceTo(mesh.position);
    const worldPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance) / state.size.height;
    const markerRadius = (markerSpriteDiameterPx(selected, distance, SELECT_SCALE) / 2) * MARKER_GLOW_EXTENT;
    const ringRadiusPx = Math.max(MIN_RING_RADIUS_PX, markerRadius + 4);
    overlayRegistry.ringRadiusPx = ringRadiusPx;
    mesh.scale.setScalar(ringRadiusPx * 2 * QUAD_OVER_RING * worldPerPx * (2 - eased));

    material.uniforms.uTime.value = clock.current;
    material.uniforms.uAcquire.value = eased;
  });

  if (!selected) return null;
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={20} frustumCulled={false} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
