import {
  CATALOG,
  CATALOG_BY_ID,
  INHERITED_PROPS,
  PROP_KEYS,
  THEME_TOKENS,
  type ColorValue,
  type ElementDef,
  type ElementStyle,
  type PropKey,
  type Shadow,
  type StyleSheetData,
} from "./catalog";

/** What an unset text color falls back to: the page's own (body) color. */
export const PAGE_TEXT_COLOR: ColorValue = "$phosphor";

/** Marks :hover/:focus-state instances the editor wants shown (see ElementDef.forceState). */
export const FORCE_STATE_CLASS = "se-force-state";

// ---------- Colors ----------

const REF_RE = /^(\$[a-z][a-z0-9-]*|currentColor)(?:\s+(\d{1,3}(?:\.\d+)?)%)?$/i;
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^;{}()<>]*\)$/i;

export interface ColorRef {
  /** "$phosphor" or "currentColor". */
  ref: string;
  /** 0–100. */
  percent: number;
}

/** "$phosphor 70%" → { ref: "$phosphor", percent: 70 }; null for literal colors. */
export function parseRef(value: ColorValue): ColorRef | null {
  const m = REF_RE.exec(value.trim());
  if (!m) return null;
  const ref = m[1].toLowerCase() === "currentcolor" ? "currentColor" : m[1].toLowerCase();
  return { ref, percent: m[2] === undefined ? 100 : Math.min(100, Number(m[2])) };
}

export function formatRef(ref: string, percent: number): ColorValue {
  const p = Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
  return p >= 100 ? ref : `${ref} ${p}%`;
}

/** Only colors the compiler can pass into CSS safely (nothing that could
 * close the declaration). */
export function isValidColor(value: unknown): value is ColorValue {
  if (typeof value !== "string" || value.length > 80) return false;
  const v = value.trim();
  return REF_RE.test(v) || HEX_RE.test(v) || FUNC_RE.test(v) || /^(?:transparent|black|white)$/i.test(v);
}

export function colorCss(value: ColorValue): string {
  const ref = parseRef(value);
  if (!ref) return value.trim();
  const base = ref.ref === "currentColor" ? "currentColor" : `var(--color-${ref.ref.slice(1)})`;
  return ref.percent >= 100 ? base : `color-mix(in oklab, ${base} ${ref.percent}%, transparent)`;
}

// ---------- Declarations ----------

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

export type ShadowKind = "text" | "box" | "filter";

export function shadowsCss(layers: Shadow[], kind: ShadowKind): string {
  if (layers.length === 0) return "none";
  if (kind === "filter") {
    return layers.map((s) => `drop-shadow(${px(s.x)} ${px(s.y)} ${px(s.blur)} ${colorCss(s.color)})`).join(" ");
  }
  return layers
    .map((s) => {
      const parts = [px(s.x), px(s.y), px(s.blur)];
      if (kind === "box") {
        parts.push(px(s.spread ?? 0));
        if (s.inset) parts.unshift("inset");
      }
      parts.push(colorCss(s.color));
      return parts.join(" ");
    })
    .join(", ");
}

/** CSS declarations for one element's paint, as [property, value] pairs. */
export function declarations(def: ElementDef, style: ElementStyle): [string, string][] {
  const out: [string, string][] = [];
  for (const prop of def.props) {
    switch (prop) {
      case "color":
        if (style.color !== undefined) out.push(["color", colorCss(style.color)]);
        break;
      case "outline":
        if (style.outline !== undefined) {
          // The stroke is centered on the glyph edge; painted under the fill,
          // only its outer half shows, so draw it twice the visible width.
          const { width, color } = style.outline;
          out.push(["-webkit-text-stroke", width > 0 ? `${px(width * 2)} ${colorCss(color)}` : "0"]);
          out.push(["paint-order", "stroke fill"]);
        }
        break;
      case "fill":
        if (style.fill !== undefined) {
          const color = colorCss(style.fill);
          out.push(def.fillBackground ? ["background", def.fillBackground(color)] : ["background-color", color]);
        }
        break;
      case "border":
        if (style.border !== undefined) out.push([def.borderProperty ?? "border-color", colorCss(style.border)]);
        break;
      case "textShadow":
        if (style.textShadow !== undefined) out.push(["text-shadow", shadowsCss(style.textShadow, "text")]);
        break;
      case "boxShadow":
        if (style.boxShadow !== undefined) {
          out.push(
            def.shadowAsFilter
              ? ["filter", style.boxShadow.length ? shadowsCss(style.boxShadow, "filter") : "none"]
              : ["box-shadow", shadowsCss(style.boxShadow, "box")],
          );
        }
        break;
    }
  }
  return out;
}

export function ruleSelector(def: ElementDef): string {
  return def.forceState ? `${def.selector}, ${def.forceState}.${FORCE_STATE_CLASS}` : def.selector;
}

export function compileRule(def: ElementDef, style: ElementStyle | undefined): string {
  const decls = style ? declarations(def, style) : [];
  if (decls.length === 0) return "";
  return `/* ${def.name} */\n${ruleSelector(def)} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n}`;
}

/** Palette overrides, redefining the index.css tokens themselves — so
 * everything linked to a token follows at once. */
export function compilePalette(tokens: Record<string, ColorValue>): string {
  const decls = THEME_TOKENS.filter((t) => tokens[t] !== undefined).map((t) => `  --color-${t}: ${tokens[t]};`);
  return decls.length ? `/* Theme palette (overrides src/index.css) */\n:root {\n${decls.join("\n")}\n}` : "";
}

/** The whole style sheet as CSS: the palette, then the elements in catalog
 * order (later rules win ties). */
export function compileSheet(sheet: StyleSheetData): string {
  const rules = [compilePalette(sheet.tokens), ...CATALOG.map((def) => compileRule(def, sheet.elements[def.id]))].filter(Boolean);
  return `/* UI style sheet — compiled from src/theme/uiStyleSheet.json */\n\n${rules.join("\n\n")}\n`;
}

/** Every color an element's own style mentions. */
export function colorsOf(style: ElementStyle | undefined): ColorValue[] {
  if (!style) return [];
  const out: ColorValue[] = [];
  if (style.color) out.push(style.color);
  if (style.outline) out.push(style.outline.color);
  if (style.fill) out.push(style.fill);
  if (style.border) out.push(style.border);
  for (const s of [...(style.textShadow ?? []), ...(style.boxShadow ?? [])]) out.push(s.color);
  return out;
}

/** Elements whose own style links to a palette token. */
export function tokenUsers(sheet: StyleSheetData, token: string): string[] {
  const ref = `$${token}`;
  return CATALOG.filter((def) => colorsOf(sheet.elements[def.id]).some((c) => parseRef(c)?.ref === ref)).map((def) => def.id);
}

// ---------- Resolution (what an unset property shows) ----------

export interface Resolved<K extends PropKey = PropKey> {
  value: NonNullable<ElementStyle[K]>;
  /** Element id the value comes from. */
  from: string;
}

/** The value a property takes on this element: its own, else from rules on
 * the same element (cascade), else — for inherited properties — from its
 * ancestors' rules. Null when nothing in the sheet sets it. */
export function resolveProp<K extends PropKey>(
  sheet: StyleSheetData,
  id: string,
  prop: K,
  seen: Set<string> = new Set(),
): Resolved<K> | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const def = CATALOG_BY_ID[id];
  if (!def) return null;
  const own = sheet.elements[id]?.[prop];
  if (own !== undefined && def.props.includes(prop)) return { value: own as NonNullable<ElementStyle[K]>, from: id };
  for (const other of def.cascade ?? []) {
    const hit = resolveProp(sheet, other, prop, seen);
    if (hit) return hit;
  }
  if (INHERITED_PROPS.has(prop)) {
    for (const other of def.parent ?? []) {
      const hit = resolveProp(sheet, other, prop, seen);
      if (hit) return hit;
    }
  }
  return null;
}

/** Everything the element paints with, own and inherited, for previews. */
export function effectiveStyle(sheet: StyleSheetData, id: string): ElementStyle {
  const def = CATALOG_BY_ID[id];
  const style: ElementStyle = {};
  for (const prop of def.props) {
    const hit = resolveProp(sheet, id, prop);
    if (hit) (style as Record<PropKey, unknown>)[prop] = hit.value;
  }
  return style;
}

/** The text color the element ends up with (what currentColor means for it). */
export function effectiveTextColor(sheet: StyleSheetData, id: string): ColorValue {
  const def = CATALOG_BY_ID[id];
  const withColor = def.props.includes("color") ? id : (def.parent?.[0] ?? def.cascade?.[0]);
  const hit = withColor ? resolveProp(sheet, withColor, "color") : null;
  return hit?.value ?? PAGE_TEXT_COLOR;
}

// ---------- Loading / saving ----------

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-500, Math.min(500, v)) : fallback);

function sanitizeShadows(v: unknown): Shadow[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const layers: Shadow[] = [];
  for (const s of v.slice(0, 12)) {
    if (!s || typeof s !== "object" || !isValidColor((s as Shadow).color)) continue;
    const layer: Shadow = { x: num(s.x), y: num(s.y), blur: Math.max(0, num(s.blur)), color: (s as Shadow).color.trim() };
    if (s.spread !== undefined && num(s.spread) !== 0) layer.spread = num(s.spread);
    if (s.inset === true) layer.inset = true;
    layers.push(layer);
  }
  return layers;
}

/** Keeps only well-formed properties the element actually exposes. */
export function sanitizeStyle(def: ElementDef, raw: unknown): ElementStyle {
  const style: ElementStyle = {};
  if (!raw || typeof raw !== "object") return style;
  const r = raw as Record<string, unknown>;
  for (const prop of def.props) {
    const v = r[prop];
    if (v === undefined) continue;
    if (prop === "textShadow" || prop === "boxShadow") {
      const layers = sanitizeShadows(v);
      if (layers) style[prop] = layers;
    } else if (prop === "outline") {
      const o = v as Record<string, unknown>;
      if (o && typeof o === "object" && isValidColor(o.color)) {
        style.outline = { width: Math.max(0, Math.min(20, num(o.width))), color: (o.color as string).trim() };
      }
    } else if (isValidColor(v)) {
      style[prop] = v.trim();
    }
  }
  return style;
}

/** Palette values must be literal colors: a token pointing at another could
 * loop. */
export const isPaletteColor = (value: unknown): value is ColorValue => isValidColor(value) && !parseRef(value);

function sanitizeTokens(raw: unknown): Record<string, ColorValue> {
  const tokens: Record<string, ColorValue> = {};
  if (!raw || typeof raw !== "object") return tokens;
  for (const t of THEME_TOKENS) {
    const v = (raw as Record<string, unknown>)[t];
    if (isPaletteColor(v)) tokens[t] = v.trim();
  }
  return tokens;
}

/** Reads a style sheet from JSON-ish data; whatever it doesn't mention (an
 * element, or the palette as a whole) keeps its value from `base`. */
export function mergeSheet(base: StyleSheetData | null, incoming: unknown): StyleSheetData {
  const elements: Record<string, ElementStyle> = {};
  const inc = incoming && typeof incoming === "object" ? (incoming as { elements?: unknown; tokens?: unknown }) : {};
  const incEls = inc.elements && typeof inc.elements === "object" ? (inc.elements as Record<string, unknown>) : {};
  for (const def of CATALOG) {
    if (def.id in incEls) elements[def.id] = sanitizeStyle(def, incEls[def.id]);
    else elements[def.id] = base?.elements[def.id] ?? {};
  }
  const tokens = inc.tokens !== undefined ? sanitizeTokens(inc.tokens) : { ...(base?.tokens ?? {}) };
  return { version: 1, tokens, elements };
}

export function tokensEqual(a: Record<string, ColorValue>, b: Record<string, ColorValue>): boolean {
  return THEME_TOKENS.every((t) => (a[t] ?? null) === (b[t] ?? null));
}

const styleKey = (style: ElementStyle | undefined) =>
  JSON.stringify(PROP_KEYS.map((k) => (style?.[k] === undefined ? null : style[k])));

export function stylesEqual(a: ElementStyle | undefined, b: ElementStyle | undefined): boolean {
  return styleKey(a) === styleKey(b);
}

export function propEqual(a: ElementStyle | undefined, b: ElementStyle | undefined, prop: PropKey): boolean {
  return JSON.stringify(a?.[prop] ?? null) === JSON.stringify(b?.[prop] ?? null);
}

export function sheetsEqual(a: StyleSheetData, b: StyleSheetData): boolean {
  return tokensEqual(a.tokens, b.tokens) && CATALOG.every((def) => stylesEqual(a.elements[def.id], b.elements[def.id]));
}

const inline = (obj: object) =>
  `{ ${Object.entries(obj)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(", ")} }`;

const SHADOW_KEYS: (keyof Shadow)[] = ["x", "y", "blur", "spread", "color", "inset"];
const orderedShadow = (s: Shadow) =>
  Object.fromEntries(SHADOW_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));

/** The style sheet as the JSON file stores it: the palette one token per
 * line, then one element per block with one shadow layer per line, in
 * catalog order. */
export function formatSheet(sheet: StyleSheetData): string {
  const lines = [
    "{",
    `  "about": "Paint for the star map UI. Edit in-app with the style editor (F2) or by hand. Colors: \\"$token\\" or \\"$token 70%\\" (palette color at 70% opacity), \\"currentColor [N%]\\", \\"#rrggbb[aa]\\". tokens: palette overrides; a token left out keeps its src/index.css value. Shadow layers: x, y, blur, spread (box only) in px.",`,
    `  "version": 1,`,
  ];
  const tokens = THEME_TOKENS.filter((t) => sheet.tokens[t] !== undefined);
  if (tokens.length === 0) lines.push(`  "tokens": {},`);
  else {
    lines.push(`  "tokens": {`);
    tokens.forEach((t, i) => lines.push(`    ${JSON.stringify(t)}: ${JSON.stringify(sheet.tokens[t])}${i < tokens.length - 1 ? "," : ""}`));
    lines.push(`  },`);
  }
  lines.push(`  "elements": {`);
  CATALOG.forEach((def, i) => {
    const style = sheet.elements[def.id] ?? {};
    const comma = i < CATALOG.length - 1 ? "," : "";
    const keys = PROP_KEYS.filter((k) => style[k] !== undefined);
    if (keys.length === 0) {
      lines.push(`    ${JSON.stringify(def.id)}: {}${comma}`);
      return;
    }
    lines.push(`    ${JSON.stringify(def.id)}: {`);
    keys.forEach((k, j) => {
      const c = j < keys.length - 1 ? "," : "";
      const v = style[k];
      if (Array.isArray(v)) {
        if (v.length === 0) lines.push(`      "${k}": []${c}`);
        else {
          lines.push(`      "${k}": [`);
          v.forEach((layer, n) => lines.push(`        ${inline(orderedShadow(layer))}${n < v.length - 1 ? "," : ""}`));
          lines.push(`      ]${c}`);
        }
      } else if (v && typeof v === "object") {
        lines.push(`      "${k}": ${inline(v)}${c}`);
      } else {
        lines.push(`      "${k}": ${JSON.stringify(v)}${c}`);
      }
    });
    lines.push(`    }${comma}`);
  });
  lines.push("  }", "}", "");
  return lines.join("\n");
}
