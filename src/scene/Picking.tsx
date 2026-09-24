import { useCallback, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";

// Final pick radius, in real screen pixels — deliberately decided here
// rather than by three.js's own Points raycast (wired up in CameraRig,
// which still runs first as a coarse net). That raycast is a *world-space*
// sphere sized off the distance from the camera to the orbit target, which
// is only a proxy for how far the star under the cursor actually is — the
// moment target-distance and star-distance diverge (zoomed in on one star
// while reaching for a neighbor, orbiting off to the side of the target,
// etc.) that proxy silently shrinks or grows the hit area relative to what
// you're aiming at, which reads as the interactive area drifting off the
// star. Re-deciding in true screen space — projecting each candidate's own
// world position back through the same camera and comparing pixels to the
// actual pointer position — uses exactly the same math the star sprite is
// drawn from, so the pick radius is always centered on the rendered dot, at
// any zoom or orbit angle.
const PICK_RADIUS_PX = 16;

const tmpVec = new THREE.Vector3();

/** Filters the raycaster's candidate points (already narrowed down by the
 * coarse world-space threshold in CameraRig) to whatever actually falls
 * within PICK_RADIUS_PX of the cursor on screen, and returns whichever one
 * is closest to the cursor there — the one the visible sprite is drawn
 * closest to, which is what "centered on the star" actually means. */
function closestOnScreen(
  event: ThreeEvent<PointerEvent | MouseEvent>,
  systems: StarSystem[],
  width: number,
  height: number
): number | undefined {
  const candidates = event.intersections.filter(
    (i) => i.eventObject === event.eventObject && i.index !== undefined
  );
  if (candidates.length === 0 || width === 0 || height === 0) return undefined;

  let bestIndex: number | undefined;
  let bestDistSq = Infinity;

  for (const c of candidates) {
    const system = systems[c.index!];
    if (!system) continue;
    tmpVec.set(system.position[0], system.position[1], system.position[2]).project(event.camera);
    const dx = (tmpVec.x - event.pointer.x) * 0.5 * width;
    const dy = (tmpVec.y - event.pointer.y) * 0.5 * height;
    const distSq = dx * dx + dy * dy;
    if (distSq > PICK_RADIUS_PX * PICK_RADIUS_PX) continue;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = c.index;
    }
  }

  return bestIndex;
}

/** Wires pointer events on the star-systems Points object to the galaxy
 * store, mapping the raycast-reported point index back to a StarSystem. */
export function usePicking(systems: StarSystem[]) {
  const setHovered = useGalaxyStore((s) => s.setHovered);
  const selectStar = useGalaxyStore((s) => s.selectStar);
  const hoveredIndexRef = useRef<number | null>(null);
  // Same canvas size R3F itself uses to compute `event.pointer`'s NDC
  // coordinates — reusing it here keeps the pixel conversion exact.
  const size = useThree((s) => s.size);

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const id = closestOnScreen(event, systems, size.width, size.height);
      if (id === hoveredIndexRef.current) return;
      hoveredIndexRef.current = id ?? null;
      setHovered(id !== undefined ? systems[id]?.id ?? null : null);
      // Not "pointer": that cursor's hotspot (where the click actually
      // lands) sits at the hand icon's fingertip, offset up-left of its
      // visual center — against a small round target that reads as the
      // interactive area being off-center from the star. Crosshair's
      // hotspot is dead-center in the icon, so the cursor you're aiming
      // with visually lines up with where the hit test actually is.
      document.body.style.cursor = id !== undefined ? "crosshair" : "auto";
    },
    [systems, setHovered, size]
  );

  const onPointerOut = useCallback(() => {
    hoveredIndexRef.current = null;
    setHovered(null);
    document.body.style.cursor = "auto";
  }, [setHovered]);

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const id = closestOnScreen(event, systems, size.width, size.height);
      if (id === undefined) return;
      const system = systems[id];
      if (system) selectStar(system);
    },
    [systems, selectStar, size]
  );

  return { onPointerMove, onPointerOut, onClick };
}
