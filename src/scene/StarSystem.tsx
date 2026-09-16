import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { usePicking } from "./Picking";
import { accuracyToColor } from "../data/accuracyColor";

interface StarSystemsProps {
  systems: StarSystem[];
}

const HOVER_SCALE = 2.4;
const SELECT_SCALE = 1.8;
const LERP_SPEED = 10;
const BASE_SIZE = 0.6;

// Same soft circular sprite technique as the old ambient dust field — small,
// size-attenuated, additively blended points instead of solid geometry.
const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (180.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, alpha);
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
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
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
