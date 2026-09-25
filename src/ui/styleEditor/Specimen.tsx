import type { CSSProperties } from "react";
import type { ElementDef, StyleSheetData } from "../../theme/catalog";
import { colorCss, declarations, effectiveStyle, effectiveTextColor } from "../../theme/compile";
import { SEGMENTUM_SAMPLE } from "./colorMath";
import { locateSelector } from "./mapDom";

/** Compiled declarations as a React style object. */
function toStyle(decls: [string, string][]): CSSProperties {
  const style: Record<string, string> = {};
  for (const [prop, value] of decls) {
    const key = prop.replace(/^-webkit-/, "Webkit-").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[key] = value;
  }
  return style as CSSProperties;
}

const fontCache = new Map<string, CSSProperties>();

/** The live element's type settings, so the preview's glow reads at the
 * right scale; a generic fallback while it isn't on screen. */
function sampleFont(def: ElementDef): CSSProperties {
  const cached = fontCache.get(def.id);
  if (cached) return cached;
  const selector = locateSelector(def);
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return { fontSize: 13, fontWeight: 700, letterSpacing: "0.1em" };
  const cs = getComputedStyle(el);
  const font: CSSProperties = {
    fontSize: Math.min(22, parseFloat(cs.fontSize)),
    fontWeight: cs.fontWeight as CSSProperties["fontWeight"],
    letterSpacing: cs.letterSpacing,
  };
  fontCache.set(def.id, font);
  return font;
}

function paint(sheet: StyleSheetData, def: ElementDef) {
  const eff = effectiveStyle(sheet, def.id);
  const style = toStyle(declarations(def, eff));
  // Text inherits these on the map; the preview has no parent to take them from.
  if (!("color" in style)) style.color = colorCss(effectiveTextColor(sheet, def.id));
  return { eff, style };
}

/** A preview of one element's paint on a backdrop that runs from dark
 * space into bright gas, to judge outlines and shadows against both. */
export function Specimen({ sheet, def }: { sheet: StyleSheetData; def: ElementDef }) {
  const { eff, style } = paint(sheet, def);
  const vars = { "--color-segmentum": SEGMENTUM_SAMPLE } as CSSProperties;

  let body;
  switch (def.specimen) {
    case "box":
      body = <div className="se-spec-box" style={{ ...style, borderWidth: eff.border ? 2 : 0 }} />;
      break;
    case "rail":
      body = (
        <div
          className="se-spec-rail"
          style={{ background: eff.border ? colorCss(eff.border) : "transparent", boxShadow: style.boxShadow }}
        />
      );
      break;
    case "bar":
      body = <div className="se-spec-bar" style={style} />;
      break;
    case "line":
      body = (
        <svg className="se-spec-line" viewBox="0 0 120 34" style={style} aria-hidden="true">
          <path d="M15 0V34M19 0V34M0 15H34M0 19H34" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <polyline points="50,6 72,26 108,26" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="110" cy="26" r="2.5" fill="currentColor" />
        </svg>
      );
      break;
    default:
      body = (
        <span
          className="se-spec-text"
          style={{ ...sampleFont(def), ...style, borderWidth: eff.border ? 2 : 0, padding: eff.border || eff.fill ? "2px 10px" : 0 }}
        >
          {def.sample ?? def.name}
        </span>
      );
  }
  return (
    <div className="se-specimen" style={vars}>
      {body}
    </div>
  );
}

/** Tiny version for the element list. */
export function MiniSpecimen({ sheet, def }: { sheet: StyleSheetData; def: ElementDef }) {
  const { eff, style } = paint(sheet, def);
  const vars = { "--color-segmentum": SEGMENTUM_SAMPLE } as CSSProperties;
  if (def.specimen === "text") {
    return (
      <span className="se-mini" style={vars}>
        <span style={{ ...style, borderStyle: "solid", borderWidth: eff.border ? 1 : 0, boxShadow: "none", padding: eff.border ? "0 3px" : 0 }}>
          Aa
        </span>
      </span>
    );
  }
  if (def.specimen === "line") {
    return (
      <span className="se-mini" style={vars}>
        <svg viewBox="0 0 34 34" width="14" height="14" style={{ color: style.color }} aria-hidden="true">
          <path d="M15 0V34M19 0V34M0 15H34M0 19H34" fill="none" stroke="currentColor" strokeWidth="3" />
        </svg>
      </span>
    );
  }
  const line = eff.border ? colorCss(eff.border) : undefined;
  const fill = eff.fill ? colorCss(eff.fill) : "transparent";
  return (
    <span className="se-mini" style={vars}>
      {def.specimen === "rail" ? (
        <span className="se-mini__rail" style={{ background: line }} />
      ) : def.specimen === "bar" ? (
        <span className="se-mini__bar" style={{ background: fill }} />
      ) : (
        <span className="se-mini__box" style={{ borderColor: line ?? "transparent", background: fill }} />
      )}
    </span>
  );
}
