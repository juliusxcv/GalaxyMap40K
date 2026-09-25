import { useEffect, useState } from "react";
import { CATALOG_BY_ID } from "../../theme/catalog";
import { visibleInstances, type Candidate } from "./mapDom";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left - 3, top: r.top - 3, width: r.width + 6, height: r.height + 6 };
};

const FLASH_MS = 1400;

/** Outlines over the map: the element under the cursor while picking, and
 * a brief flash on every instance of the element just selected. */
export function Highlighter({ hover, flash }: { hover: Candidate | null; flash: { id: string; key: number } | null }) {
  const [flashBoxes, setFlashBoxes] = useState<Box[]>([]);

  useEffect(() => {
    if (!flash) return;
    const def = CATALOG_BY_ID[flash.id];
    const start = performance.now();
    let frame = 0;
    // Labels ride the camera, so the boxes are re-measured every frame.
    const tick = () => {
      if (performance.now() - start > FLASH_MS) {
        setFlashBoxes([]);
        return;
      }
      setFlashBoxes(visibleInstances(def).slice(0, 40).map(boxOf));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      setFlashBoxes([]);
    };
  }, [flash]);

  const hoverBox = hover ? boxOf(hover.el) : null;
  return (
    <>
      {flashBoxes.map((b, i) => (
        <div key={`${flash?.key}-${i}`} className="se-hl se-hl--flash" style={b} />
      ))}
      {hoverBox && hover && (
        <div className="se-hl" style={hoverBox}>
          <span className={`se-hl__tag${hoverBox.top < 24 ? " se-hl__tag--below" : ""}`}>{hover.def.name}</span>
        </div>
      )}
    </>
  );
}
