import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";

/** three.js's default intersection order (and so `event.index`/`event.object`)
 * sorts by distance from the *camera*, not from the *cursor* — fine for solid
 * meshes, but for a dense field of points it means a click can resolve to
 * some other star that merely happens to sit closer to the camera along the
 * same ray, instead of the one actually nearest the click. Points
 * intersections additionally carry `distanceToRay` (how far the star itself
 * is from the ray, i.e. how close it is to the cursor on screen); re-sorting
 * on that picks the one you actually clicked. */
function closestToCursor(event: ThreeEvent<PointerEvent | MouseEvent>) {
  const candidates = event.intersections.filter(
    (i) => i.eventObject === event.eventObject && i.index !== undefined
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, i) =>
    (i.distanceToRay ?? Infinity) < (best.distanceToRay ?? Infinity) ? i : best
  ).index;
}

/** Wires pointer events on the star-systems Points object to the galaxy
 * store, mapping the raycast-reported point index back to a StarSystem. */
export function usePicking(systems: StarSystem[]) {
  const setHovered = useGalaxyStore((s) => s.setHovered);
  const selectStar = useGalaxyStore((s) => s.selectStar);
  const hoveredIndexRef = useRef<number | null>(null);

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const id = closestToCursor(event);
      if (id === undefined || id === hoveredIndexRef.current) return;
      hoveredIndexRef.current = id;
      setHovered(systems[id]?.id ?? null);
      document.body.style.cursor = "pointer";
    },
    [systems, setHovered]
  );

  const onPointerOut = useCallback(() => {
    hoveredIndexRef.current = null;
    setHovered(null);
    document.body.style.cursor = "auto";
  }, [setHovered]);

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const id = closestToCursor(event);
      if (id === undefined) return;
      const system = systems[id];
      if (system) selectStar(system);
    },
    [systems, selectStar]
  );

  return { onPointerMove, onPointerOut, onClick };
}
