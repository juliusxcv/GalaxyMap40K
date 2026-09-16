import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { StarSystem } from "../data/types";

const FADE_START = 10;
const FADE_END = 24;

function Label({ system }: { system: StarSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const { camera } = useThree();
  const position = useMemo(() => new THREE.Vector3(...system.position), [system]);

  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const dist = camera.position.distanceTo(position);
    const opacity = 1 - Math.min(1, Math.max(0, (dist - FADE_START) / (FADE_END - FADE_START)));
    el.style.opacity = String(opacity);
  });

  return (
    <Html position={system.position} center distanceFactor={14}>
      <div ref={ref} className="star-label">
        {system.name}
      </div>
    </Html>
  );
}

/** Named-system labels, faded out at distance so they don't clutter the
 * view when zoomed out over the whole galaxy. */
export function Labels({ systems }: { systems: StarSystem[] }) {
  return (
    <>
      {systems.map((s) => (
        <Label key={s.id} system={s} />
      ))}
    </>
  );
}
