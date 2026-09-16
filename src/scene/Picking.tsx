import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";

/** Wires pointer events on the star-systems Points object to the galaxy
 * store, mapping the raycast-reported point `index` back to a StarSystem. */
export function usePicking(systems: StarSystem[]) {
  const setHovered = useGalaxyStore((s) => s.setHovered);
  const selectStar = useGalaxyStore((s) => s.selectStar);
  const hoveredIndexRef = useRef<number | null>(null);

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const id = event.index;
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
      const id = event.index;
      if (id === undefined) return;
      const system = systems[id];
      if (system) selectStar(system);
    },
    [systems, selectStar]
  );

  return { onPointerMove, onPointerOut, onClick };
}
