/* ============================================================
   UI STYLE SHEET — ELEMENT CATALOG
   Every map UI element whose paint (text color, text outline, fill,
   frame-line color, shadows and glows) comes from the style sheet in
   uiStyleSheet.json instead of App.css / index.css — those two keep
   layout and structure only. The in-app style editor (F2) edits and
   saves that JSON; compile.ts turns it into the CSS the page runs.

   Adding an element: give it an entry here (later entries win ties, so
   states and more specific rules go after their base), then add its
   values to both uiStyleSheet.json and uiStyleSheet.defaults.json.
   ============================================================ */

export type PropKey = "color" | "outline" | "fill" | "border" | "textShadow" | "boxShadow";

export const PROP_KEYS: PropKey[] = ["color", "outline", "fill", "border", "textShadow", "boxShadow"];

/** Properties CSS passes down from an ancestor when an element leaves them unset. */
export const INHERITED_PROPS: ReadonlySet<PropKey> = new Set(["color", "outline", "textShadow"]);

/** A color as the style sheet writes it:
 *  "$phosphor" / "$phosphor 70%"         theme token from index.css, optionally at N% opacity
 *  "currentColor" / "currentColor 70%"   the element's own text color
 *  "#rrggbb" / "#rrggbbaa" / "transparent" */
export type ColorValue = string;

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  /** Box shadows only. */
  spread?: number;
  color: ColorValue;
  /** Box shadows only. */
  inset?: boolean;
}

export interface Outline {
  /** Visible outline thickness in px, outside the glyphs. */
  width: number;
  color: ColorValue;
}

/** One element's paint. A property left out is unset: the element then
 * takes it from its cascade/parent rules (see ElementDef) or CSS itself. */
export interface ElementStyle {
  color?: ColorValue;
  outline?: Outline;
  fill?: ColorValue;
  border?: ColorValue;
  textShadow?: Shadow[];
  boxShadow?: Shadow[];
}

export interface StyleSheetData {
  version: 1;
  /** Theme palette overrides: token name ("phosphor") → literal color.
   * Tokens left out keep their value from src/index.css. Every element
   * linked to a token ("$phosphor 70%") follows it. */
  tokens: Record<string, ColorValue>;
  elements: Record<string, ElementStyle>;
}

/** Map UI that only exists in some states; the editor can bring it up. */
export type Stage = "search" | "callout" | "dossier";

/** How the editor draws the element's preview. */
export type Specimen = "text" | "box" | "line" | "bar" | "rail";

export interface ElementDef {
  id: string;
  name: string;
  group: string;
  /** Selector list the compiled rule targets. */
  selector: string;
  /** Which paint properties this element exposes, in editor order. */
  props: PropKey[];
  /** Selector for its live instances (click-to-pick, highlighting). Left
   * out for states and pseudo-element parts, reached via variantOf. */
  pick?: string;
  /** Only picked near its edges — the viewport frame spans the whole map. */
  pickEdge?: boolean;
  /** Shown as a tab of this element: a hover state, a ::before part… */
  variantOf?: string;
  variantLabel?: string;
  /** :hover / :focus states: instances matching this get .se-force-state
   * while the state is selected in the editor, so it can be seen. */
  forceState?: string;
  /** Other rules on the same element; they supply what this one leaves unset. */
  cascade?: string[];
  /** Rules on ancestors; color, outline and text shadow inherit from them. */
  parent?: string[];
  stage?: Stage;
  /** Per-element property names ("Line color" for SVG art, …). */
  labels?: Partial<Record<PropKey, string>>;
  /** border → this property instead of border-color. */
  borderProperty?: string;
  /** boxShadow → filter: drop-shadow(), for SVG line art. */
  shadowAsFilter?: boolean;
  /** fill → a full background built around the color. */
  fillBackground?: (color: string) => string;
  /** Extra color tokens offered in this element's color picker. */
  tokens?: string[];
  specimen: Specimen;
  sample?: string;
  description?: string;
}

/** The theme palette (src/index.css --color-*): the preset colors in every
 * color picker, each editable through the style sheet's "tokens". */
export const THEME_TOKENS = [
  "phosphor",
  "phosphor-dim",
  "phosphor-faint",
  "signal",
  "brass",
  "sanguine",
  "bone",
  "bone-dim",
  "ink",
  "panel",
  "panel-raised",
];

const TEXT: PropKey[] = ["color", "outline", "textShadow"];
const TEXT_FILL: PropKey[] = ["color", "outline", "fill", "textShadow"];
const BOXED_TEXT: PropKey[] = ["color", "outline", "fill", "border", "textShadow", "boxShadow"];
const BOX: PropKey[] = ["fill", "border", "boxShadow"];

export const CATALOG: ElementDef[] = [
  // ---------- Frame ----------
  {
    id: "viewportFrame",
    name: "Viewport frame",
    group: "Frame",
    selector: ".viewport-frame",
    pick: ".viewport-frame",
    pickEdge: true,
    props: BOX,
    labels: { border: "Frame line", boxShadow: "Glow / shadow" },
    specimen: "box",
    description: "The phosphor border around the whole map.",
  },
  {
    id: "frameRail",
    name: "Frame rail",
    group: "Frame",
    selector: ".viewport-frame::before",
    variantOf: "viewportFrame",
    variantLabel: "Amber rail",
    props: ["border", "boxShadow"],
    borderProperty: "border-left-color",
    labels: { border: "Rail color", boxShadow: "Glow / shadow" },
    specimen: "rail",
    description: "The amber rail just outside the frame's left edge.",
  },
  {
    id: "crosshair",
    name: "Crosshairs",
    group: "Frame",
    selector: ".crosshair",
    pick: ".crosshair",
    props: ["color", "boxShadow"],
    shadowAsFilter: true,
    labels: { color: "Line color", boxShadow: "Glow / drop shadow" },
    specimen: "line",
    description: "Registration crosshairs on the frame and dossier corners.",
  },
  {
    id: "termBox",
    name: "Terminal box (shared)",
    group: "Frame",
    selector: ".term-box",
    props: ["border", "boxShadow"],
    labels: { border: "Frame line", boxShadow: "Glow / shadow" },
    specimen: "box",
    description:
      "Shared frame line and glow of every boxed module: module tags, time code, readouts, search results, dossier. Each takes these unless it sets its own.",
  },

  // ---------- HUD ----------
  {
    id: "moduleTag",
    name: "Module tag",
    group: "HUD",
    selector: ".module-tag__box",
    pick: ".module-tag__box",
    props: BOXED_TEXT,
    cascade: ["termBox"],
    specimen: "text",
    sample: "Star map",
  },
  {
    id: "kicker",
    name: "Caption",
    group: "HUD",
    selector: ".kicker",
    pick: ".kicker",
    props: TEXT_FILL,
    specimen: "text",
    sample: "Module",
    description: "Small tracked captions above boxes: MODULE, QUERY SYSTEM, CORD., SCAN RANGE…",
  },
  {
    id: "treeLine",
    name: "Feed line",
    group: "HUD",
    selector: ".tree > li",
    pick: ".tree > li",
    props: TEXT,
    specimen: "text",
    sample: "By authority of the Adeptus",
    description: "Tree-connector lines in the HUD feed and the dossier. The elbow and dot follow the text color.",
  },
  {
    id: "treeSignal",
    name: "Feed line · priority",
    group: "HUD",
    selector: ".tree > li.is-signal",
    pick: ".tree > li.is-signal",
    props: TEXT,
    cascade: ["treeLine"],
    specimen: "text",
    sample: "++ Astra Cartographica ++",
  },
  {
    id: "treeDim",
    name: "Feed line · dim",
    group: "HUD",
    selector: ".tree > li.is-dim",
    pick: ".tree > li.is-dim",
    props: TEXT,
    cascade: ["treeLine"],
    specimen: "text",
    sample: "Drag: rotate · Scroll: zoom",
  },
  {
    id: "legend",
    name: "Legend label",
    group: "HUD",
    selector: ".hud__legend-scale",
    pick: ".hud__legend-scale",
    props: TEXT,
    specimen: "text",
    sample: "Unk. — Conf.",
  },
  {
    id: "timeCord",
    name: "Time code",
    group: "HUD",
    selector: ".time-cord",
    pick: ".time-cord",
    props: BOXED_TEXT,
    cascade: ["termBox"],
    specimen: "text",
    sample: "Time cord. T 21:4507",
  },
  {
    id: "timeCordBar",
    name: "Time code bar",
    group: "HUD",
    selector: ".time-cord::before",
    variantOf: "timeCord",
    variantLabel: "Top bar",
    props: ["fill", "boxShadow"],
    labels: { fill: "Bar color", boxShadow: "Glow / shadow" },
    specimen: "bar",
  },
  {
    id: "readoutValue",
    name: "Readout value",
    group: "HUD",
    selector: ".readout__value",
    pick: ".readout__value",
    props: BOXED_TEXT,
    cascade: ["termBox"],
    specimen: "text",
    sample: "000.000.000",
  },
  {
    id: "credits",
    name: "Credits",
    group: "HUD",
    selector: ".hud__credits, .hud__credits a",
    pick: ".hud__credits",
    props: TEXT,
    specimen: "text",
    sample: "Data: Warhammer 40k Fandom wiki",
  },

  // ---------- Search ----------
  {
    id: "searchInput",
    name: "Search field",
    group: "Search",
    selector: ".term-input",
    pick: ".term-input",
    props: BOXED_TEXT,
    specimen: "text",
    sample: "Cadia",
  },
  {
    id: "searchInputFocus",
    name: "Search field · focused",
    group: "Search",
    selector: ".term-input:focus",
    variantOf: "searchInput",
    variantLabel: "Focused",
    forceState: ".term-input",
    props: BOXED_TEXT,
    cascade: ["searchInput"],
    specimen: "text",
    sample: "Cadia",
  },
  {
    id: "searchPlaceholder",
    name: "Search placeholder",
    group: "Search",
    selector: ".term-input::placeholder",
    variantOf: "searchInput",
    variantLabel: "Placeholder",
    props: ["color", "textShadow"],
    parent: ["searchInput"],
    specimen: "text",
    sample: "Enter designation…",
  },
  {
    id: "searchResults",
    name: "Search results panel",
    group: "Search",
    selector: ".search-box__results",
    pick: ".search-box__results",
    stage: "search",
    props: BOX,
    cascade: ["termBox"],
    specimen: "box",
  },
  {
    id: "searchResult",
    name: "Search result",
    group: "Search",
    selector: ".search-box__result",
    pick: ".search-box__result",
    stage: "search",
    props: TEXT_FILL,
    specimen: "text",
    sample: "Cadia",
  },
  {
    id: "searchResultHover",
    name: "Search result · hover",
    group: "Search",
    selector: ".search-box__result:hover, .search-box__result:focus-visible",
    variantOf: "searchResult",
    variantLabel: "Hover",
    forceState: ".search-box__result",
    stage: "search",
    props: TEXT_FILL,
    cascade: ["searchResult"],
    specimen: "text",
    sample: "Cadia",
  },
  {
    id: "searchFaction",
    name: "Search result faction",
    group: "Search",
    selector: ".search-box__faction",
    pick: ".search-box__faction",
    stage: "search",
    props: ["color", "textShadow"],
    parent: ["searchResult"],
    specimen: "text",
    sample: "Imperium",
  },

  // ---------- Map labels ----------
  {
    id: "starLabel",
    name: "Star label",
    group: "Map labels",
    selector: ".map-label",
    pick: ".map-label",
    props: TEXT_FILL,
    specimen: "text",
    sample: "Cadia",
    description: "System names that appear when zoomed in close.",
  },
  {
    id: "solLabel",
    name: "Sol label",
    group: "Map labels",
    selector: ".map-label.is-sol",
    pick: ".map-label.is-sol",
    props: TEXT_FILL,
    cascade: ["starLabel"],
    specimen: "text",
    sample: "Sol system",
  },
  {
    id: "segmentumLabel",
    name: "Segmentum label",
    group: "Map labels",
    selector: ".segmentum-label",
    pick: ".segmentum-label",
    props: TEXT,
    tokens: ["segmentum"],
    specimen: "text",
    sample: "Segmentum Solar",
    description: "$segmentum is each segmentum's own map color.",
  },
  {
    id: "sectorLabel",
    name: "Sector label",
    group: "Map labels",
    selector: ".sector-label",
    pick: ".sector-label",
    props: TEXT,
    specimen: "text",
    sample: "Calixis sector",
  },

  // ---------- Target callout ----------
  {
    id: "callout",
    name: "Target callout",
    group: "Target callout",
    selector: ".target-callout",
    stage: "callout",
    props: ["color"],
    labels: { color: "Base color" },
    specimen: "text",
    sample: "++ Target acquired ++",
    description: "Base color of the whole callout. Its leader line and text follow it unless they set their own.",
  },
  {
    id: "calloutLeader",
    name: "Callout leader line",
    group: "Target callout",
    selector: ".target-callout__leader",
    pick: ".target-callout__leader",
    stage: "callout",
    props: ["color", "boxShadow"],
    parent: ["callout"],
    shadowAsFilter: true,
    labels: { color: "Line color", boxShadow: "Glow / drop shadow" },
    specimen: "line",
  },
  {
    id: "calloutBody",
    name: "Callout panel",
    group: "Target callout",
    selector: ".target-callout__body",
    pick: ".target-callout__body",
    stage: "callout",
    props: TEXT_FILL,
    parent: ["callout"],
    labels: { fill: "Soft backing" },
    fillBackground: (color) => `radial-gradient(ellipse at 30% 50%, ${color}, transparent 75%)`,
    specimen: "text",
    sample: "++ Target acquired ++",
    description: "The callout's text block. Its fill is a soft radial backing that keeps text legible over bright gas.",
  },
  {
    id: "calloutHead",
    name: "Callout header",
    group: "Target callout",
    selector: ".target-callout__head",
    pick: ".target-callout__head",
    stage: "callout",
    props: TEXT,
    parent: ["calloutBody"],
    specimen: "text",
    sample: "++ Target acquired ++",
  },
  {
    id: "calloutName",
    name: "Callout name",
    group: "Target callout",
    selector: ".target-callout__name",
    pick: ".target-callout__name",
    stage: "callout",
    props: TEXT,
    parent: ["calloutBody"],
    specimen: "text",
    sample: "Cadia",
  },
  {
    id: "calloutTree",
    name: "Callout details",
    group: "Target callout",
    // Two classes deep so it outranks the shared .tree > li.is-signal.
    selector: ".target-callout .target-callout__tree > li",
    pick: ".target-callout__tree > li",
    stage: "callout",
    props: TEXT,
    cascade: ["treeSignal"],
    specimen: "text",
    sample: "Segmentum Obscurus",
  },
  {
    id: "btnSignal",
    name: "Callout button",
    group: "Target callout",
    selector: ".btn-signal",
    pick: ".btn-signal",
    stage: "callout",
    props: BOXED_TEXT,
    specimen: "text",
    sample: "Open dossier ▸",
  },
  {
    id: "btnSignalHover",
    name: "Callout button · hover",
    group: "Target callout",
    selector: ".btn-signal:hover",
    variantOf: "btnSignal",
    variantLabel: "Hover",
    forceState: ".btn-signal",
    stage: "callout",
    props: BOXED_TEXT,
    cascade: ["btnSignal"],
    specimen: "text",
    sample: "Open dossier ▸",
  },

  // ---------- Dossier ----------
  {
    id: "dossier",
    name: "Dossier panel",
    group: "Dossier",
    selector: ".dossier",
    pick: ".dossier",
    stage: "dossier",
    props: BOX,
    cascade: ["termBox"],
    specimen: "box",
  },
  {
    id: "dossierTitle",
    name: "Dossier title",
    group: "Dossier",
    selector: ".dossier__title",
    pick: ".dossier__title",
    stage: "dossier",
    props: TEXT,
    specimen: "text",
    sample: "Cadia",
  },
  {
    id: "dossierFaction",
    name: "Dossier faction",
    group: "Dossier",
    selector: ".dossier__faction",
    pick: ".dossier__faction",
    stage: "dossier",
    props: TEXT,
    specimen: "text",
    sample: "Imperium of Man",
  },
  {
    id: "dossierSummary",
    name: "Dossier summary",
    group: "Dossier",
    selector: ".dossier__summary",
    pick: ".dossier__summary",
    stage: "dossier",
    props: TEXT,
    specimen: "text",
    sample: "Fortress world",
  },
  {
    id: "dossierKey",
    name: "Dossier field name",
    group: "Dossier",
    selector: ".dossier__key",
    pick: ".dossier__key",
    stage: "dossier",
    props: TEXT,
    specimen: "text",
    sample: "Segmentum",
  },
  {
    id: "dossierMemberType",
    name: "Dossier body type",
    group: "Dossier",
    selector: ".dossier__member-type",
    pick: ".dossier__member-type",
    stage: "dossier",
    props: TEXT,
    specimen: "text",
    sample: "Planet",
  },
  {
    id: "dossierLinkHover",
    name: "Dossier link · hover",
    group: "Dossier",
    selector: ".dossier__member a:hover",
    pick: ".dossier__member a",
    forceState: ".dossier__member a",
    stage: "dossier",
    props: TEXT,
    specimen: "text",
    sample: "Cadia Prime",
    description: "Links to known bodies, while hovered. At rest they take the feed line's paint.",
  },
  {
    id: "chip",
    name: "Classification chip",
    group: "Dossier",
    selector: ".chip",
    pick: ".chip",
    stage: "dossier",
    props: BOXED_TEXT,
    specimen: "text",
    sample: "Fortress world",
  },
  {
    id: "btnTerm",
    name: "Dossier button",
    group: "Dossier",
    selector: ".btn-term",
    pick: ".btn-term",
    stage: "dossier",
    props: BOXED_TEXT,
    specimen: "text",
    sample: "Open source record ↗",
  },
  {
    id: "btnTermHover",
    name: "Dossier button · hover",
    group: "Dossier",
    selector: ".btn-term:hover",
    variantOf: "btnTerm",
    variantLabel: "Hover",
    forceState: ".btn-term",
    stage: "dossier",
    props: BOXED_TEXT,
    cascade: ["btnTerm"],
    specimen: "text",
    sample: "Open source record ↗",
  },
];

export const CATALOG_BY_ID: Record<string, ElementDef> = Object.fromEntries(CATALOG.map((def) => [def.id, def]));

export const PROP_LABELS: Record<PropKey, string> = {
  color: "Text color",
  outline: "Text outline",
  fill: "Fill color",
  border: "Frame line",
  textShadow: "Text shadow / glow",
  boxShadow: "Box shadow / glow",
};

export const propLabel = (def: ElementDef, prop: PropKey) => def.labels?.[prop] ?? PROP_LABELS[prop];
