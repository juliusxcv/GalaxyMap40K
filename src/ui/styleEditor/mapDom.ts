import { CATALOG, CATALOG_BY_ID, type ElementDef, type Stage } from "../../theme/catalog";
import { useGalaxyStore } from "../../store/useGalaxyStore";
import { STAR_SYSTEMS } from "../../data/systems";
import { SOL_SYSTEM_ID } from "../../data/galaxyRegions";

/** Finding the style sheet's elements on the live map: click-to-pick,
 * highlighting, and bringing up UI that only exists in some states. */

export interface Candidate {
  el: Element;
  def: ElementDef;
}

const PICKABLE = CATALOG.filter((def) => def.pick);

/** Elements with no box of their own to point at, located through another. */
const LOCATE_FALLBACK: Record<string, string> = {
  callout: ".target-callout__body",
  termBox: ".term-box",
};

/** Selector for an element's live instances (a state or ::before part is
 * shown through its host). */
export function locateSelector(def: ElementDef): string | null {
  return def.pick ?? (def.variantOf ? CATALOG_BY_ID[def.variantOf].pick : undefined) ?? LOCATE_FALLBACK[def.id] ?? null;
}

/** On screen and not faded out (labels fade by zoom band, not visibility). */
export function isShown(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  if (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) return false;
  if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  let opacity = 1;
  for (let node: Element | null = el, i = 0; node && i < 5; node = node.parentElement, i++) {
    opacity *= Number(getComputedStyle(node).opacity);
  }
  return opacity > 0.04;
}

export function visibleInstances(def: ElementDef): Element[] {
  const selector = locateSelector(def);
  return selector ? [...document.querySelectorAll(selector)].filter(isShown) : [];
}

const nearEdge = (r: DOMRect, x: number, y: number, m: number) =>
  x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m &&
  (x - r.left < m || r.right - x < m || y - r.top < m || r.bottom - y < m);

/** Whether the point is on what the element visibly paints. A bare text
 * element (no fill, no frame) only counts over its text: a block-level
 * caption's box runs the width of its column, and while picking that empty
 * stretch would otherwise swallow clicks meant for labels behind it. */
function paintsAt(el: Element, x: number, y: number): boolean {
  if (el instanceof SVGElement) return true;
  const cs = getComputedStyle(el);
  const boxed =
    cs.backgroundImage !== "none" ||
    !/^(?:transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor) ||
    parseFloat(cs.borderTopWidth) > 0 ||
    parseFloat(cs.borderLeftWidth) > 0;
  if (boxed) return true;
  const range = document.createRange();
  range.selectNodeContents(el);
  for (const r of range.getClientRects()) {
    if (x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3) return true;
  }
  return false;
}

/** The style sheet element under a screen point. The topmost element hit
 * decides; among the catalog elements it sits in (itself and its
 * ancestors), the smallest box wins, ties going to the more specific
 * (later) catalog entry. Needs the map UI to take pointer events
 * (body.se-picking). */
export function findCandidate(x: number, y: number): Candidate | null {
  const seen = new Set<Element>();
  for (const hit of document.elementsFromPoint(x, y)) {
    if (hit.closest(".se-root")) return null;
    let best: (Candidate & { area: number; order: number }) | null = null;
    for (let el: Element | null = hit; el && el !== document.body; el = el.parentElement) {
      if (seen.has(el)) break;
      seen.add(el);
      PICKABLE.forEach((def, order) => {
        if (!el.matches(def.pick!)) return;
        const rect = el.getBoundingClientRect();
        if (def.pickEdge ? !nearEdge(rect, x, y, 14) : !paintsAt(el, x, y)) return;
        if (!isShown(el)) return;
        const area = rect.width * rect.height;
        if (!best || area < best.area - 1 || (Math.abs(area - best.area) <= 1 && order > best.order)) {
          best = { el, def, area, order };
        }
      });
    }
    if (best) return { el: (best as Candidate).el, def: (best as Candidate).def };
  }
  return null;
}

const sol = STAR_SYSTEMS.find((s) => s.id === SOL_SYSTEM_ID) ?? STAR_SYSTEMS[0];

/** Brings up map UI that only exists in some states, so its style can be
 * seen while editing. Targets Sol when nothing is acquired yet. */
export function stage(which: Stage) {
  const map = useGalaxyStore.getState();
  if (which === "search") {
    const input = document.querySelector<HTMLInputElement>("#system-query");
    if (!input) return;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(input, input.value.trim() ? input.value : "ca");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (!map.selectedSystem && sol) map.selectStar(sol);
  const next = useGalaxyStore.getState();
  if (which === "dossier") next.openDossier();
  else if (next.dossierOpen) next.closeDossier();
}

export const STAGE_LABEL: Record<Stage, string> = {
  search: "Show search results",
  callout: "Show target callout",
  dossier: "Open dossier",
};
