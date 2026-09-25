import { create } from "zustand";
import type { StyleSheetData } from "./catalog";
import { compileSheet, mergeSheet, sheetsEqual } from "./compile";
import fileData from "./uiStyleSheet.json";

/** Where a style sheet saved outside the dev server (e.g. on the deployed
 * site) lives: this browser only. It overrides uiStyleSheet.json until
 * discarded. */
export const BROWSER_SAVE_KEY = "galaxymap.uiStyleSheet";

const STYLE_ELEMENT_ID = "ui-style-sheet";

function readBrowserSave(base: StyleSheetData): StyleSheetData | null {
  try {
    const raw = localStorage.getItem(BROWSER_SAVE_KEY);
    return raw ? mergeSheet(base, JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

interface StyleSheetState {
  /** What the map is painted with right now, unsaved edits included. */
  sheet: StyleSheetData;
  /** The last saved version — edits are measured against it. */
  saved: StyleSheetData;
  /** uiStyleSheet.json as bundled, or as last written by the editor. */
  file: StyleSheetData;
  /** A browser-local save is active and overrides the file. */
  browserSave: boolean;

  setSheet: (sheet: StyleSheetData) => void;
  markSaved: (sheet: StyleSheetData, where: "file" | "browser") => void;
  discardBrowserSave: () => void;
  fileChanged: (file: StyleSheetData) => void;
}

const file = mergeSheet(null, fileData);
const browser = readBrowserSave(file);

export const useStyleSheet = create<StyleSheetState>((set, get) => ({
  sheet: browser ?? file,
  saved: browser ?? file,
  file,
  browserSave: browser !== null,

  setSheet: (sheet) => set({ sheet }),
  markSaved: (sheet, where) =>
    set(where === "file" ? { saved: sheet, file: sheet, browserSave: false } : { saved: sheet, browserSave: true }),
  discardBrowserSave: () => {
    try {
      localStorage.removeItem(BROWSER_SAVE_KEY);
    } catch {
      // Storage blocked: nothing was saved there to discard.
    }
    const { file } = get();
    set({ sheet: file, saved: file, browserSave: false });
  },
  // uiStyleSheet.json changed on disk (the editor saved it, or it was edited
  // by hand): take it up live unless there are unsaved edits to keep.
  fileChanged: (next) => {
    const { sheet, saved, browserSave } = get();
    if (browserSave) return set({ file: next });
    const clean = sheetsEqual(sheet, saved);
    set({ file: next, saved: next, ...(clean && !sheetsEqual(sheet, next) ? { sheet: next } : {}) });
  },
}));

/** Puts the compiled style sheet into the page and keeps it current. Call
 * once from main.tsx, after the app's own CSS is in, so these rules come
 * last and win ties with it. */
export function installStyleSheet() {
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  const style = el;
  style.textContent = compileSheet(useStyleSheet.getState().sheet);
  useStyleSheet.subscribe((state, prev) => {
    if (state.sheet !== prev.sheet) style.textContent = compileSheet(state.sheet);
  });
}

if (import.meta.hot) {
  import.meta.hot.accept("./uiStyleSheet.json", (mod) => {
    if (mod) useStyleSheet.getState().fileChanged(mergeSheet(null, mod.default));
  });
}
