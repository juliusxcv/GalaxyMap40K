import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  CATALOG,
  CATALOG_BY_ID,
  THEME_TOKENS,
  propLabel,
  type ColorValue,
  type ElementDef,
  type ElementStyle,
  type PropKey,
  type Shadow,
  type StyleSheetData,
} from "../../theme/catalog";
import {
  FORCE_STATE_CLASS,
  compileSheet,
  effectiveTextColor,
  formatSheet,
  mergeSheet,
  propEqual,
  resolveProp,
  stylesEqual,
  tokenUsers,
  tokensEqual,
} from "../../theme/compile";
import { useStyleSheet } from "../../theme/styleSheetStore";
import factoryData from "../../theme/uiStyleSheet.defaults.json";
import { ColorField, Swatch } from "./ColorField";
import { Icon, IconButton, NumberSlider } from "./controls";
import { EditorNav, paletteColorKey } from "./editorNav";
import { Highlighter } from "./Highlighter";
import { PaletteDetail } from "./PaletteDetail";
import { STAGE_LABEL, stage, visibleInstances, type Candidate } from "./mapDom";
import { SAVES_TO_FILE, downloadText, pickJsonFile, saveSheet } from "./persistence";
import { ShadowList } from "./ShadowList";
import { MiniSpecimen, Specimen } from "./Specimen";
import { usePickMode } from "./usePickMode";
import "./StyleEditor.css";

/** The style sheet as first extracted from the CSS — "Reset to default". */
const FACTORY = mergeSheet(null, factoryData);

/** The palette's place in the list and the selection, beside the elements. */
const PALETTE_ID = "@palette";

// ---------- Per-viewer preferences ----------

interface Prefs {
  selectedId: string;
  dock: "left" | "right";
  listOpen: boolean;
  width: number;
}

const PREFS_KEY = "galaxymap.styleEditor.prefs";
const MIN_WIDTH = 360;
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(900, window.innerWidth - 24));
const clampWidth = (w: number) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)));

function loadPrefs(): Prefs {
  const fallback: Prefs = { selectedId: "starLabel", dock: "left", listOpen: true, width: 440 };
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    const prefs = { ...fallback, ...stored };
    const known = prefs.selectedId === PALETTE_ID || CATALOG_BY_ID[prefs.selectedId];
    return {
      ...prefs,
      selectedId: known ? prefs.selectedId : fallback.selectedId,
      width: clampWidth(Number(prefs.width) || fallback.width),
    };
  } catch {
    return fallback;
  }
}

function storePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // A convenience only; the editor works without it.
  }
}

// ---------- Edits and undo ----------

/** Lives outside the component, so undo survives closing the editor. */
const history = { undo: [] as StyleSheetData[], redo: [] as StyleSheetData[], lastKey: "", lastAt: 0 };

/** Applies an edit. A run of edits to the same property (a slider drag,
 * typing a number) folds into one undo step. */
function edit(next: StyleSheetData, key: string) {
  const { sheet, setSheet } = useStyleSheet.getState();
  const now = performance.now();
  if (key !== history.lastKey || now - history.lastAt > 500) {
    history.undo.push(sheet);
    if (history.undo.length > 200) history.undo.shift();
  }
  history.redo = [];
  history.lastKey = key;
  history.lastAt = now;
  setSheet(next);
}

const oneStep = (label: string) => `${label}:${performance.now()}`;

function undo() {
  const prev = history.undo.pop();
  if (!prev) return;
  const { sheet, setSheet } = useStyleSheet.getState();
  history.redo.push(sheet);
  history.lastKey = "";
  setSheet(prev);
}

function redo() {
  const next = history.redo.pop();
  if (!next) return;
  const { sheet, setSheet } = useStyleSheet.getState();
  history.undo.push(sheet);
  history.lastKey = "";
  setSheet(next);
}

function setElement(id: string, style: ElementStyle, key: string) {
  const { sheet } = useStyleSheet.getState();
  edit({ ...sheet, elements: { ...sheet.elements, [id]: style } }, key);
}

function setProp<K extends PropKey>(id: string, prop: K, value: ElementStyle[K] | undefined) {
  const style: ElementStyle = { ...useStyleSheet.getState().sheet.elements[id] };
  if (value === undefined) delete style[prop];
  else style[prop] = value;
  setElement(id, style, `${id}.${prop}`);
}

/** A palette color; undefined falls back to the src/index.css value. */
function setToken(token: string, value: ColorValue | undefined) {
  const { sheet } = useStyleSheet.getState();
  const tokens = { ...sheet.tokens };
  if (value === undefined) delete tokens[token];
  else tokens[token] = value;
  edit({ ...sheet, tokens }, `${PALETTE_ID}.${token}`);
}

function setPalette(tokens: Record<string, ColorValue>) {
  edit({ ...useStyleSheet.getState().sheet, tokens }, oneStep(PALETTE_ID));
}

const clone = <T,>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

// ---------- Editor ----------

type Status = { text: string; kind: "ok" | "error" };

interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
}

export default function StyleEditor({ onClose }: { onClose: () => void }) {
  const sheet = useStyleSheet((s) => s.sheet);
  const saved = useStyleSheet((s) => s.saved);
  const browserSave = useStyleSheet((s) => s.browserSave);

  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      storePrefs(next);
      return next;
    });
  const [collapsed, setCollapsed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState<Candidate | null>(null);
  const [flash, setFlash] = useState<{ id: string; key: number } | null>(null);
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteFocus, setPaletteFocus] = useState<{ token: string; key: number } | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  const isPalette = prefs.selectedId === PALETTE_ID;
  const def: ElementDef | undefined = CATALOG_BY_ID[prefs.selectedId];

  const select = (id: string, flashIt = true) => {
    setPrefs({ selectedId: id });
    setOpenColor(null);
    if (flashIt && id !== PALETTE_ID) setFlash({ id, key: performance.now() });
  };

  // From any color picker: open the palette on that color, remembering
  // the element to come back to.
  const nav = {
    editPalette: (token?: string) => {
      if (!isPalette) setReturnTo(prefs.selectedId);
      select(PALETTE_ID, false);
      if (token) {
        setOpenColor(paletteColorKey(token));
        setPaletteFocus({ token, key: performance.now() });
      }
    },
  };

  const showTokenUsers = (token: string) => {
    setFilter(`$${token}`);
    setPrefs({ listOpen: true });
  };

  // Drag the inner edge to resize; the width is remembered.
  const [resizing, setResizing] = useState(false);
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
  };
  const moveResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const width = clampWidth(prefs.dock === "left" ? e.clientX - rect.left : rect.right - e.clientX);
    setPrefsState((p) => ({ ...p, width }));
  };
  const endResize = () => {
    setResizing(false);
    setPrefsState((p) => {
      storePrefs(p);
      return p;
    });
  };

  usePickMode(picking, {
    onHover: setHover,
    onPick: (hit) => {
      setPicking(false);
      select(hit.def.id);
    },
    onCancel: () => setPicking(false),
  });

  const dirty = useMemo(() => {
    const ids = new Set(CATALOG.filter((d) => !stylesEqual(sheet.elements[d.id], saved.elements[d.id])).map((d) => d.id));
    if (!tokensEqual(sheet.tokens, saved.tokens)) ids.add(PALETTE_ID);
    return ids;
  }, [sheet, saved]);

  const save = async () => {
    if (saving) return;
    const current = useStyleSheet.getState().sheet;
    setSaving(true);
    try {
      const where = await saveSheet(current);
      useStyleSheet.getState().markSaved(current, where);
      setStatus({ kind: "ok", text: where === "file" ? "Saved to src/theme/uiStyleSheet.json" : "Saved in this browser" });
    } catch (err) {
      setStatus({ kind: "error", text: `Save failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+S / Ctrl+Z / Ctrl+Y. Text fields keep their own undo.
  const shortcut = (e: ShortcutEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "s") {
      e.preventDefault();
      void save();
      return;
    }
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type !== "range" && t.type !== "checkbox") return;
    if (key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (key === "y") {
      e.preventDefault();
      redo();
    }
  };
  const shortcutRef = useRef(shortcut);
  useEffect(() => {
    shortcutRef.current = shortcut;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Show :hover / :focus states on the map while one is selected.
  const forceState = def?.forceState;
  useEffect(() => {
    if (!forceState) return;
    const apply = () => document.querySelectorAll(forceState).forEach((el) => el.classList.add(FORCE_STATE_CLASS));
    apply();
    const timer = window.setInterval(apply, 400);
    return () => {
      window.clearInterval(timer);
      document.querySelectorAll(`.${FORCE_STATE_CLASS}`).forEach((el) => el.classList.remove(FORCE_STATE_CLASS));
    };
  }, [forceState]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), status.kind === "error" ? 9000 : 3500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const menu: [string, () => void][] = [
    ["Download uiStyleSheet.json", () => downloadText("uiStyleSheet.json", formatSheet(sheet), "application/json")],
    ["Download compiled CSS", () => downloadText("ui-style-sheet.css", compileSheet(sheet), "text/css")],
    [
      "Copy compiled CSS",
      () =>
        navigator.clipboard.writeText(compileSheet(sheet)).then(
          () => setStatus({ kind: "ok", text: "CSS copied" }),
          () => setStatus({ kind: "error", text: "Clipboard unavailable" }),
        ),
    ],
    [
      "Import style sheet…",
      async () => {
        const text = await pickJsonFile();
        if (!text) return;
        try {
          edit(mergeSheet(useStyleSheet.getState().sheet, JSON.parse(text)), oneStep("import"));
          setStatus({ kind: "ok", text: "Imported — Save to keep it" });
        } catch {
          setStatus({ kind: "error", text: "That file isn't a style sheet" });
        }
      },
    ],
    ["Reset everything to defaults", () => edit(FACTORY, oneStep("reset-all"))],
  ];
  if (browserSave) {
    menu.push(["Discard browser save", () => useStyleSheet.getState().discardBrowserSave()]);
  }

  const changedElements = dirty.size - (dirty.has(PALETTE_ID) ? 1 : 0);
  const changes = [
    dirty.has(PALETTE_ID) ? "Palette" : "",
    changedElements ? `${changedElements} element${changedElements === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const statusText =
    status?.text ??
    (changes.length ? `${changes.join(" + ")} changed` : browserSave ? "Using this browser's saved style sheet" : "All changes saved");

  return (
    <>
      <Highlighter hover={hover} flash={flash} />
      <section
        className={`se-root se-root--${prefs.dock}${collapsed ? " se-root--collapsed" : ""}${resizing ? " is-resizing" : ""}`}
        style={{ "--se-width": `${prefs.width}px` } as CSSProperties}
        aria-label="Style editor"
        onKeyDown={(e) => {
          shortcut(e);
          if (e.key === "Escape" && openColor) setOpenColor(null);
          // Keep the map's own keys (Escape, B…) out of the editor's fields.
          e.stopPropagation();
        }}
      >
        <div
          className="se-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the editor"
          aria-valuenow={prefs.width}
          tabIndex={0}
          title="Drag to resize"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={() => setPrefs({ width: 440 })}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const grow = (e.key === "ArrowRight") === (prefs.dock === "left");
            setPrefs({ width: clampWidth(prefs.width + (grow ? 20 : -20)) });
          }}
        />
        <header className="se-header">
          <span className="se-title">Style editor</span>
          {dirty.size > 0 && (
            <span className="se-badge" title="Unsaved changes">
              {dirty.size}
            </span>
          )}
          <span className="se-spacer" />
          <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={undo} disabled={history.undo.length === 0} />
          <IconButton icon="redo" label="Redo (Ctrl+Y)" onClick={redo} disabled={history.redo.length === 0} />
          <IconButton
            icon={prefs.dock === "left" ? "dockRight" : "dockLeft"}
            label={`Dock to the ${prefs.dock === "left" ? "right" : "left"}`}
            onClick={() => setPrefs({ dock: prefs.dock === "left" ? "right" : "left" })}
          />
          <IconButton icon={collapsed ? "expand" : "collapse"} label={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed(!collapsed)} />
          <IconButton icon="close" label="Close (F2)" onClick={onClose} />
        </header>

        {!collapsed && (
          <>
            <div className="se-toolbar">
              <button
                type="button"
                className={`se-btn${picking ? " is-active" : ""}`}
                aria-pressed={picking}
                onClick={() => setPicking(!picking)}
                title="Click any UI element on the map to edit it (Esc cancels)"
              >
                <Icon name="pick" /> {picking ? "Click an element…" : "Pick on map"}
              </button>
              <input
                className="se-input"
                placeholder="Filter elements, or $color"
                value={filter}
                spellCheck={false}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter elements"
              />
              <IconButton
                icon="list"
                label={prefs.listOpen ? "Hide element list" : "Show element list"}
                active={prefs.listOpen}
                onClick={() => setPrefs({ listOpen: !prefs.listOpen })}
              />
            </div>

            {(prefs.listOpen || filter.trim() !== "") && (
              <ElementList sheet={sheet} selectedId={prefs.selectedId} dirty={dirty} filter={filter} onSelect={select} />
            )}

            <EditorNav.Provider value={nav}>
              {isPalette || !def ? (
                <PaletteDetail
                  sheet={sheet}
                  saved={saved}
                  factory={FACTORY}
                  focus={paletteFocus}
                  returnTo={returnTo}
                  openColor={openColor}
                  setOpenColor={setOpenColor}
                  onSetToken={setToken}
                  onSetPalette={setPalette}
                  onShowUsers={showTokenUsers}
                  onSelect={select}
                />
              ) : (
                <ElementDetail
                  key={def.id}
                  def={def}
                  sheet={sheet}
                  saved={saved}
                  dirty={dirty}
                  openColor={openColor}
                  setOpenColor={setOpenColor}
                  onSelect={select}
                  onLocate={() => setFlash({ id: def.id, key: performance.now() })}
                />
              )}
            </EditorNav.Provider>

            <footer className="se-footer">
              <span
                className={`se-status${status ? ` is-${status.kind}` : dirty.size ? " is-dirty" : ""}`}
                role="status"
                title={statusText}
              >
                {statusText}
              </span>
              <button type="button" className="se-btn se-btn--ghost" disabled={dirty.size === 0} onClick={() => edit(saved, oneStep("revert-all"))}>
                Revert
              </button>
              <button
                type="button"
                className="se-btn se-btn--primary"
                disabled={saving || dirty.size === 0}
                onClick={() => void save()}
                title={SAVES_TO_FILE ? "Write src/theme/uiStyleSheet.json (Ctrl+S)" : "Keep it in this browser (Ctrl+S)"}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <IconButton icon="more" label="More" active={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
              {menuOpen && <Menu items={menu} onClose={() => setMenuOpen(false)} />}
            </footer>
          </>
        )}
      </section>
    </>
  );
}

function Menu({ items, onClose }: { items: [string, () => void][]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!ref.current?.contains(target) && !target.closest?.(".se-footer .se-icon-btn")) onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [onClose]);
  return (
    <div className="se-menu" role="menu" ref={ref}>
      {items.map(([label, run]) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            run();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------- Element list ----------

const GROUPS = [...new Set(CATALOG.map((d) => d.group))];

function ElementList({
  sheet,
  selectedId,
  dirty,
  filter,
  onSelect,
}: {
  sheet: StyleSheetData;
  selectedId: string;
  dirty: Set<string>;
  filter: string;
  onSelect: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector(".se-row.is-selected")?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const q = filter.trim().toLowerCase();
  // "$phosphor" lists the elements linked to that palette color ("$phos"
  // any whose name starts so).
  const linked = useMemo(() => {
    if (!q.startsWith("$")) return null;
    const name = q.slice(1);
    const tokens = THEME_TOKENS.includes(name) ? [name] : THEME_TOKENS.filter((t) => t.startsWith(name));
    return new Set(tokens.flatMap((t) => tokenUsers(sheet, t)));
  }, [q, sheet]);
  const hit = (d: ElementDef) =>
    linked ? linked.has(d.id) : !q || [d.name, d.selector, d.group, d.id, d.variantLabel ?? ""].some((s) => s.toLowerCase().includes(q));
  const paletteHit = !q || q.startsWith("$") || ["palette", "colors", "theme", ...THEME_TOKENS].some((s) => s.includes(q));

  const row = (d: ElementDef, variant: boolean) => (
    <button
      key={d.id}
      type="button"
      className={`se-row${variant ? " se-row--variant" : ""}${d.id === selectedId ? " is-selected" : ""}`}
      onClick={() => onSelect(d.id)}
      title={d.selector}
    >
      <MiniSpecimen sheet={sheet} def={d} />
      <span className="se-row__name">{variant ? d.variantLabel : d.name}</span>
      {dirty.has(d.id) && <span className="se-dot" title="Unsaved changes" />}
    </button>
  );

  const groups = GROUPS.map((group) => {
    const rows: ReactNode[] = [];
    for (const base of CATALOG.filter((d) => d.group === group && !d.variantOf)) {
      const variants = CATALOG.filter((d) => d.variantOf === base.id);
      const baseHit = hit(base);
      // A name match brings the element's states along; a color filter
      // lists exactly what links to that color.
      const variantHits = variants.filter((v) => (baseHit && !linked) || hit(v));
      if (!baseHit && variantHits.length === 0) continue;
      rows.push(row(base, false), ...variantHits.map((v) => row(v, true)));
    }
    return rows.length ? (
      <div key={group} role="group" aria-label={group}>
        <div className="se-group">{group}</div>
        {rows}
      </div>
    ) : null;
  });

  return (
    <div className="se-list" ref={listRef}>
      {paletteHit && (
        <div role="group" aria-label="Palette">
          <div className="se-group">Palette</div>
          <button
            type="button"
            className={`se-row${selectedId === PALETTE_ID ? " is-selected" : ""}`}
            onClick={() => onSelect(PALETTE_ID)}
            title="The preset colors every element links to"
          >
            <span className="se-mini se-mini--palette" aria-hidden="true">
              {["phosphor", "signal", "brass", "sanguine"].map((t) => (
                <span key={t} style={{ background: `var(--color-${t})` }} />
              ))}
            </span>
            <span className="se-row__name">Palette colors</span>
            {dirty.has(PALETTE_ID) && <span className="se-dot" title="Unsaved changes" />}
          </button>
        </div>
      )}
      {linked && <p className="se-empty se-empty--note">Linked to {filter.trim()}:</p>}
      {groups.some(Boolean) ? groups : <p className="se-empty">No element matches “{filter}”.</p>}
    </div>
  );
}

// ---------- Element detail ----------

interface DetailProps {
  def: ElementDef;
  sheet: StyleSheetData;
  saved: StyleSheetData;
  dirty: Set<string>;
  openColor: string | null;
  setOpenColor: (key: string | null) => void;
  onSelect: (id: string, flash?: boolean) => void;
  onLocate: () => void;
}

function ElementDetail({ def, sheet, saved, dirty, openColor, setOpenColor, onSelect, onLocate }: DetailProps) {
  const baseId = def.variantOf ?? def.id;
  const family = [CATALOG_BY_ID[baseId], ...CATALOG.filter((d) => d.variantOf === baseId)];
  const stageOf = def.stage ?? CATALOG_BY_ID[baseId].stage;

  const [shown, setShown] = useState(true);
  useEffect(() => {
    const check = () => setShown(visibleInstances(def).length > 0);
    check();
    const timer = window.setInterval(check, 600);
    return () => window.clearInterval(timer);
  }, [def]);

  const own = sheet.elements[def.id] ?? {};
  const textColor = effectiveTextColor(sheet, def.id);

  return (
    <div className="se-detail">
      <div className="se-detail__head">
        <div className="se-detail__title-row">
          <h2 className="se-detail__name">{def.name}</h2>
          <IconButton icon="locate" label="Highlight on the map" onClick={onLocate} disabled={!shown} />
        </div>
        <code className="se-code">{def.selector}</code>
        {def.description && <p className="se-desc">{def.description}</p>}
        {!shown &&
          (stageOf ? (
            <button type="button" className="se-btn se-btn--small se-stage" onClick={() => stage(stageOf)}>
              {STAGE_LABEL[stageOf]}
            </button>
          ) : (
            <p className="se-note">Not on screen right now.</p>
          ))}
      </div>

      {family.length > 1 && (
        <div className="se-tabs" role="tablist" aria-label="States and parts">
          {family.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === def.id}
              className={`se-tab${f.id === def.id ? " is-active" : ""}`}
              onClick={() => onSelect(f.id, false)}
            >
              {f.variantOf ? f.variantLabel : "Default"}
              {dirty.has(f.id) && <span className="se-dot" />}
            </button>
          ))}
        </div>
      )}

      <Specimen sheet={sheet} def={def} />

      {def.props.map((prop) => (
        <PropSection
          key={prop}
          def={def}
          prop={prop}
          sheet={sheet}
          saved={saved}
          textColor={textColor}
          openColor={openColor}
          setOpenColor={setOpenColor}
          onSelect={onSelect}
        />
      ))}

      <div className="se-detail__actions">
        <button
          type="button"
          className="se-btn"
          disabled={!dirty.has(def.id)}
          onClick={() => setElement(def.id, clone(saved.elements[def.id] ?? {}), oneStep("revert"))}
        >
          <Icon name="revert" size={12} /> Revert element
        </button>
        <button
          type="button"
          className="se-btn"
          disabled={stylesEqual(own, FACTORY.elements[def.id])}
          onClick={() => setElement(def.id, clone(FACTORY.elements[def.id] ?? {}), oneStep("reset"))}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

function defaultValue(prop: PropKey, textColor: ColorValue): ElementStyle[PropKey] {
  switch (prop) {
    case "color":
      return textColor;
    case "outline":
      return { width: 1, color: "#000000" };
    case "fill":
      return "$ink 80%";
    case "border":
      return "currentColor";
    default:
      return [];
  }
}

function PropSection({
  def,
  prop,
  sheet,
  saved,
  textColor,
  openColor,
  setOpenColor,
  onSelect,
}: Omit<DetailProps, "dirty" | "onLocate"> & { prop: PropKey; textColor: ColorValue }) {
  const own = sheet.elements[def.id]?.[prop];
  const changed = !propEqual(sheet.elements[def.id], saved.elements[def.id], prop);
  const inherited = own === undefined ? resolveProp(sheet, def.id, prop) : null;
  const key = `${def.id}.${prop}`;
  const picker = (k: string) => ({ open: openColor === k, onToggle: () => setOpenColor(openColor === k ? null : k) });

  let body: ReactNode;
  if (own === undefined) {
    body = (
      <div className="se-inherit">
        {inherited ? (
          <>
            <span className="se-inherit__text">
              From{" "}
              <button type="button" className="se-link-btn" onClick={() => onSelect(inherited.from)}>
                {CATALOG_BY_ID[inherited.from].name}
              </button>
            </span>
            <ValuePreview prop={prop} value={inherited.value} textColor={textColor} />
          </>
        ) : (
          <span className="se-inherit__text">{prop === "color" ? "Page text color" : "Not set"}</span>
        )}
        <button
          type="button"
          className="se-btn se-btn--small"
          onClick={() => setProp(def.id, prop, clone(inherited?.value ?? defaultValue(prop, textColor)))}
        >
          {inherited ? "Override" : "Set"}
        </button>
      </div>
    );
  } else if (prop === "outline") {
    const outline = own as NonNullable<ElementStyle["outline"]>;
    body = (
      <div className="se-stack">
        <NumberSlider
          label="Width"
          value={outline.width}
          min={0}
          max={4}
          step={0.25}
          onChange={(width) => setProp(def.id, "outline", { ...outline, width: Math.max(0, width) })}
        />
        <ColorField
          value={outline.color}
          onChange={(color) => setProp(def.id, "outline", { ...outline, color })}
          textColor={textColor}
          allowCurrentColor
          extraTokens={def.tokens}
          {...picker(key)}
        />
      </div>
    );
  } else if (prop === "textShadow" || prop === "boxShadow") {
    body = (
      <ShadowList
        layers={own as Shadow[]}
        onChange={(layers) => setProp(def.id, prop, layers)}
        box={prop === "boxShadow" && !def.shadowAsFilter}
        textColor={textColor}
        extraTokens={def.tokens}
        openColor={openColor}
        setOpenColor={setOpenColor}
        colorKeyPrefix={key}
      />
    );
  } else {
    body = (
      <ColorField
        value={own as ColorValue}
        onChange={(v) => setProp(def.id, prop, v)}
        textColor={textColor}
        allowCurrentColor={prop !== "color"}
        extraTokens={def.tokens}
        {...picker(key)}
      />
    );
  }

  return (
    <section className="se-section">
      <div className="se-section__head">
        <h3 className="se-section__title">{propLabel(def, prop)}</h3>
        {changed && <span className="se-dot" title="Changed since the last save" />}
        <span className="se-spacer" />
        {changed && (
          <IconButton icon="revert" label="Revert to saved" onClick={() => setProp(def.id, prop, clone(saved.elements[def.id]?.[prop]))} />
        )}
        {own !== undefined && <IconButton icon="close" label="Unset — inherit instead" onClick={() => setProp(def.id, prop, undefined)} />}
      </div>
      {body}
    </section>
  );
}

function ValuePreview({ prop, value, textColor }: { prop: PropKey; value: NonNullable<ElementStyle[PropKey]>; textColor: ColorValue }) {
  if (Array.isArray(value)) {
    return (
      <span className="se-preview">
        {value.slice(0, 4).map((l, i) => (
          <Swatch key={i} value={l.color} textColor={textColor} small />
        ))}
        {value.length ? `${value.length} layer${value.length === 1 ? "" : "s"}` : "none"}
      </span>
    );
  }
  if (typeof value === "object") {
    return (
      <span className="se-preview">
        <Swatch value={value.color} textColor={textColor} small />
        {value.width}px
      </span>
    );
  }
  return (
    <span className="se-preview">
      <Swatch value={value} textColor={prop === "color" ? "$phosphor" : textColor} small />
      {value}
    </span>
  );
}
