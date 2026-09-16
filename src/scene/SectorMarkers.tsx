import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { Sector } from "../data/types";
import { accuracyToCss } from "../data/accuracyColor";

const FADE_START = 18;
const FADE_END = 42;

function ringPoints(radius: number, segments = 48): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    points.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
  }
  return points;
}

function SectorMarker({ sector }: { sector: Sector }) {
  const labelRef = useRef<HTMLDivElement>(null);
  const { camera } = useThree();
  const position = useMemo(() => new THREE.Vector3(...sector.position), [sector]);
  const points = useMemo(() => ringPoints(sector.radius), [sector.radius]);
  const color = useMemo(() => accuracyToCss(sector.accuracy), [sector.accuracy]);

  useFrame(() => {
    const el = labelRef.current;
    if (!el) return;
    const dist = camera.position.distanceTo(position);
    const opacity = 1 - Math.min(1, Math.max(0, (dist - FADE_START) / (FADE_END - FADE_START)));
    el.style.opacity = String(opacity * 0.85);
  });

  return (
    <group position={sector.position}>
      <Line points={points} color={color} transparent opacity={0.4} dashed dashSize={1.2} gapSize={0.8} />
      <Html center distanceFactor={20}>
        <div ref={labelRef} className="sector-label" style={{ borderColor: color }}>
          {sector.name}
        </div>
      </Html>
    </group>
  );
}

export function SectorMarkers({ sectors }: { sectors: Sector[] }) {
  return (
    <>
      {sectors.map((s) => (
        <SectorMarker key={s.id} sector={s} />
      ))}
    </>
  );
}
