import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";

// Only the top confidence tier is even eligible for an ambient label, and
// even then only once the camera is genuinely close — otherwise, with most
// of the dataset now high-confidence, zooming out even a little would paper
// the view in overlapping names.
const FADE_START = 2.2;
const FADE_END = 4.5;

// Minimum on-screen gap (px) between two ambient labels. When confirmed
// systems bunch up, plenty of them can be individually close enough to
// pass the distance fade at once — this is what actually keeps only one
// name per cluster of dots on screen instead of a wall of overlapping text.
const MIN_LABEL_SPACING_PX = 90;

const tmpVec = new THREE.Vector3();

/** Always-on label for whichever star is currently selected/highlighted,
 * regardless of its confidence tier or camera distance — clicking a star is
 * an explicit request to know what it's called. No distanceFactor: a flat,
 * constant-size HUD label rather than one that balloons to fill the screen
 * as the camera nears it. */
function SelectedLabel({ system }: { system: StarSystem }) {
  return (
    <Html position={system.position} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className="star-label star-label--selected">{system.name}</div>
    </Html>
  );
}

/** Named-system labels: the top confidence tier fades in only at very close
 * range, and even among those that pass the distance check, a greedy
 * screen-space declutter pass keeps only one label per roughly 64px of
 * screen — closer stars win priority — so a dense confirmed cluster reads
 * as one clear name near it instead of a dozen stacked on top of each
 * other. The selected star (if any) always shows its name via its own
 * always-on label and is skipped here to avoid a duplicate. */
export function Labels({ systems }: { systems: StarSystem[] }) {
  const selectedId = useGalaxyStore((s) => s.selectedSystem?.id);
  const { camera, size } = useThree();
  const refs = useRef<Map<string, HTMLDivElement>>(new Map());

  const candidateSystems = useMemo(() => systems.filter((s) => s.id !== selectedId), [systems, selectedId]);
  const positions = useMemo(() => candidateSystems.map((s) => new THREE.Vector3(...s.position)), [candidateSystems]);

  useFrame(() => {
    const camPos = camera.position;
    const eligible: { id: string; distance: number; x: number; y: number; opacity: number }[] = [];

    for (let i = 0; i < candidateSystems.length; i++) {
      const el = refs.current.get(candidateSystems[i].id);
      if (!el) continue;

      const pos = positions[i];
      const distance = camPos.distanceTo(pos);
      const opacity = 1 - Math.min(1, Math.max(0, (distance - FADE_START) / (FADE_END - FADE_START)));
      if (opacity <= 0) {
        el.style.opacity = "0";
        continue;
      }

      tmpVec.copy(pos).project(camera);
      if (tmpVec.z > 1) {
        el.style.opacity = "0";
        continue;
      }
      const x = (tmpVec.x * 0.5 + 0.5) * size.width;
      const y = (1 - (tmpVec.y * 0.5 + 0.5)) * size.height;
      eligible.push({ id: candidateSystems[i].id, distance, x, y, opacity });
    }

    // Closer stars claim their screen-space slot first.
    eligible.sort((a, b) => a.distance - b.distance);

    const accepted: { x: number; y: number }[] = [];
    for (const c of eligible) {
      const el = refs.current.get(c.id);
      if (!el) continue;
      const overlaps = accepted.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < MIN_LABEL_SPACING_PX);
      if (overlaps) {
        el.style.opacity = "0";
        continue;
      }
      accepted.push({ x: c.x, y: c.y });
      el.style.opacity = String(c.opacity);
    }
  });

  return (
    <>
      {candidateSystems.map((s) => (
        <Html key={s.id} position={s.position} center zIndexRange={[1, 0]} pointerEvents="none">
          <div
            ref={(el) => {
              if (el) refs.current.set(s.id, el);
              else refs.current.delete(s.id);
            }}
            className="star-label"
          >
            {s.name}
          </div>
        </Html>
      ))}
    </>
  );
}

export function SelectedStarLabel() {
  const selectedSystem = useGalaxyStore((s) => s.selectedSystem);
  if (!selectedSystem) return null;
  return <SelectedLabel system={selectedSystem} />;
}
