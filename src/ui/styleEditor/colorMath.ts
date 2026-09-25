import { SEGMENTA } from "../../data/galaxyRegions";
import type { ColorValue } from "../../theme/catalog";
import { PAGE_TEXT_COLOR, parseRef } from "../../theme/compile";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 0–255 channels, alpha 0–1. */
export interface RGBA extends RGB {
  a: number;
}

/** h 0–360, s and v 0–1. */
export interface HSV {
  h: number;
  s: number;
  v: number;
}

/** What "$segmentum" stands for outside a segmentum label (swatches, previews). */
export const SEGMENTUM_SAMPLE = SEGMENTA[0].color;
export const SEGMENTUM_GRADIENT = `linear-gradient(135deg, ${SEGMENTA.map((s) => s.color).join(", ")})`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return { r: f(5), g: f(3), b: f(1) };
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const d = max - Math.min(rn, gn, bn);
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");

/** #rrggbb, or #rrggbbaa when not opaque. */
export function toHex({ r, g, b }: RGB, alpha = 1): string {
  const a = clamp(alpha, 0, 1);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 0.999 ? hex2(a * 255) : ""}`;
}

export function parseHex(value: string): RGBA | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

let probe: HTMLSpanElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

/** Any CSS color — theme variables and color-mix() included — as sRGB. The
 * probe element resolves variables; canvas converts oklch & co. to bytes. */
export function cssToRgba(css: string): RGBA {
  if (!probe) {
    probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
  }
  if (!ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  probe.style.color = "";
  probe.style.color = css;
  const computed = getComputedStyle(probe).color;
  if (!ctx) return { r: 0, g: 0, b: 0, a: 1 };
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

/** Palette colors by their current CSS value (the palette can be edited). */
const tokenCache = new Map<string, RGBA>();

function tokenRgba(ref: string): RGBA {
  if (ref === "$segmentum") return parseHex(SEGMENTUM_SAMPLE)!;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${ref.slice(1)}`).trim();
  let hit = tokenCache.get(value);
  if (!hit) {
    hit = parseHex(value) ?? cssToRgba(value || "transparent");
    tokenCache.set(value, hit);
  }
  return hit;
}

/** The palette as src/index.css defines it, before any style sheet
 * override: read from the page's own :root rules. */
export function readBasePalette(tokens: string[]): Record<string, string> {
  const base: Record<string, string> = {};
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode instanceof Element && sheet.ownerNode.id === "ui-style-sheet") continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // A cross-origin sheet (the web font).
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule) || rule.selectorText !== ":root") continue;
      for (const t of tokens) {
        const v = rule.style.getPropertyValue(`--color-${t}`).trim();
        if (v) base[t] = v;
      }
    }
  }
  return base;
}

/** A style sheet color as sRGB; `textColor` is what currentColor means here. */
export function resolveColor(value: ColorValue, textColor: ColorValue = PAGE_TEXT_COLOR, depth = 0): RGBA {
  const ref = parseRef(value);
  if (ref) {
    const base =
      ref.ref === "currentColor"
        ? depth > 2
          ? tokenRgba(PAGE_TEXT_COLOR)
          : resolveColor(textColor, PAGE_TEXT_COLOR, depth + 1)
        : tokenRgba(ref.ref);
    return { ...base, a: base.a * (ref.percent / 100) };
  }
  return parseHex(value) ?? cssToRgba(value);
}
