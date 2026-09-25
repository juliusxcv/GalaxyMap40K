import { useEffect, useRef } from "react";
import { findCandidate, type Candidate } from "./mapDom";

const BLOCKED = ["pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu", "auxclick"] as const;

const inEditor = (e: Event) => e.target instanceof Element && e.target.closest(".se-root") !== null;

/** Click-to-pick: while active, the map UI takes pointer events
 * (body.se-picking), hovering outlines the element under the cursor, and a
 * click selects it instead of reaching the map. The wheel still zooms.
 * Escape or a right click cancels. */
export function usePickMode(
  active: boolean,
  handlers: { onHover: (c: Candidate | null) => void; onPick: (c: Candidate) => void; onCancel: () => void },
) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!active) return;
    document.body.classList.add("se-picking");

    const block = (e: Event) => {
      if (inEditor(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onMove = (e: PointerEvent) => ref.current.onHover(inEditor(e) ? null : findCandidate(e.clientX, e.clientY));
    const onDown = (e: PointerEvent) => {
      if (inEditor(e)) return;
      block(e);
      if (e.button !== 0) return ref.current.onCancel();
      const hit = findCandidate(e.clientX, e.clientY);
      if (hit) ref.current.onPick(hit);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      ref.current.onCancel();
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    for (const type of BLOCKED) window.addEventListener(type, block, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.classList.remove("se-picking");
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      for (const type of BLOCKED) window.removeEventListener(type, block, true);
      window.removeEventListener("keydown", onKey, true);
      ref.current.onHover(null);
    };
  }, [active]);
}
