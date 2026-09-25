import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { THEME_TOKENS, type ColorValue } from "../../theme/catalog";
import { colorCss, formatRef, isPaletteColor, isValidColor, parseRef } from "../../theme/compile";
import { SEGMENTUM_GRADIENT, SEGMENTUM_SAMPLE, hsvToRgb, parseHex, resolveColor, rgbToHsv, toHex, type HSV } from "./colorMath";
import { Icon } from "./controls";
import { useEditorNav } from "./editorNav";

interface ColorFieldProps {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
  /** What currentColor means for this element. */
  textColor: ColorValue;
  /** Offer currentColor ("text color") as a swatch. */
  allowCurrentColor?: boolean;
  extraTokens?: string[];
  /** Plain colors only, no palette links: for editing the palette itself. */
  literal?: boolean;
  open: boolean;
  onToggle: () => void;
}

/** Swatch + typed value, expanding into a full picker. */
export function ColorField({ value, onChange, textColor, allowCurrentColor, extraTokens, literal, open, onToggle }: ColorFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const accepts = literal ? isPaletteColor : isValidColor;
  const invalid = draft !== null && !accepts(draft);

  const commit = () => {
    if (draft !== null && accepts(draft) && draft.trim() !== value) onChange(draft.trim());
    setDraft(null);
  };

  return (
    <div className="se-color">
      <div className="se-field">
        <Swatch value={value} textColor={textColor} onClick={onToggle} active={open} />
        <input
          className={`se-input${invalid ? " is-invalid" : ""}`}
          value={draft ?? value}
          spellCheck={false}
          aria-label="Color value"
          title={literal ? '"#rrggbb[aa]" or any CSS color' : '"$token", "$token 70%", "currentColor 50%" or "#rrggbbaa"'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
        />
      </div>
      {open && (
        <ColorPicker
          value={value}
          onChange={onChange}
          textColor={textColor}
          allowCurrentColor={allowCurrentColor}
          extraTokens={extraTokens}
          literal={literal}
        />
      )}
    </div>
  );
}

/** A color chip over a checkerboard, so transparency shows. */
export function Swatch({
  value,
  textColor,
  onClick,
  active,
  small,
}: {
  value: ColorValue;
  textColor: ColorValue;
  onClick?: () => void;
  active?: boolean;
  small?: boolean;
}) {
  const style = {
    color: colorCss(textColor),
    "--color-segmentum": SEGMENTUM_SAMPLE,
  } as CSSProperties;
  const inner = <span style={{ background: colorCss(value) }} />;
  const className = `se-swatch${small ? " se-swatch--small" : ""}${active ? " is-active" : ""}`;
  return onClick ? (
    <button type="button" className={className} style={style} onClick={onClick} aria-label="Edit color" aria-expanded={active}>
      {inner}
    </button>
  ) : (
    <span className={className} style={style}>
      {inner}
    </span>
  );
}

function ColorPicker({
  value,
  onChange,
  textColor,
  allowCurrentColor,
  extraTokens = [],
  literal,
}: Omit<ColorFieldProps, "open" | "onToggle">) {
  const nav = useEditorNav();
  // Resolved on every render: a palette color can change under a link.
  const rgba = resolveColor(value, textColor);
  const ref = parseRef(value);
  const paletteToken = ref && THEME_TOKENS.includes(ref.ref.slice(1)) ? ref.ref.slice(1) : null;
  const alpha = ref ? ref.percent / 100 : rgba.a;

  // Hue and saturation are kept from the last drag while they're lost in
  // the color itself (grays, black), so the handles don't jump.
  const [local, setLocal] = useState<{ for: ColorValue; hsv: HSV } | null>(null);
  const hsv = local && local.for === value ? local.hsv : rgbToHsv(rgba);

  const emit = (next: ColorValue, nextHsv: HSV) => {
    setLocal({ for: next, hsv: nextHsv });
    onChange(next);
  };
  const emitHsv = (nextHsv: HSV) => emit(toHex(hsvToRgb(nextHsv), alpha), nextHsv);
  const emitAlpha = (a: number) => {
    emit(ref ? formatRef(ref.ref, a * 100) : value === "transparent" ? toHex({ r: 0, g: 0, b: 0 }, a) : toHex(rgba, a), hsv);
  };
  // A token brings its own hue: let the handles follow the new color.
  const pickRef = (name: string) => {
    setLocal(null);
    onChange(formatRef(name, Math.max(alpha, 0.01) * 100));
  };

  const svDrag = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    emitHsv({ ...hsv, s, v });
  };
  const svKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    emitHsv({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + d[0])), v: Math.min(1, Math.max(0, hsv.v + d[1])) });
  };

  const opaque = toHex(rgba);
  const tokens = literal ? [] : [...THEME_TOKENS, ...extraTokens];

  return (
    <div className="se-picker">
      <div
        className="se-sv"
        style={{ "--hue": hsv.h } as CSSProperties}
        tabIndex={0}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          svDrag(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) svDrag(e);
        }}
        onKeyDown={svKey}
      >
        <span className="se-sv__handle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: opaque }} />
      </div>

      <input
        type="range"
        className="se-range se-range--hue"
        min={0}
        max={360}
        step={1}
        value={Math.round(hsv.h)}
        aria-label="Hue"
        onChange={(e) => emitHsv({ ...hsv, h: Number(e.target.value), s: hsv.s || 1, v: hsv.v || 1 })}
      />
      <input
        type="range"
        className="se-range se-range--alpha"
        min={0}
        max={100}
        step={1}
        value={Math.round(alpha * 100)}
        aria-label="Opacity"
        style={{ "--solid": opaque } as CSSProperties}
        onChange={(e) => emitAlpha(Number(e.target.value) / 100)}
      />

      <div className="se-picker__row">
        <HexInput hex={opaque} onCommit={(rgb) => emit(toHex(rgb, alpha), rgbToHsv(rgb))} />
        <label className="se-picker__alpha">
          <input
            className="se-input"
            inputMode="numeric"
            value={Math.round(alpha * 100)}
            aria-label="Opacity percent"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(n)) emitAlpha(Math.min(100, Math.max(0, n)) / 100);
            }}
          />
          %
        </label>
        {paletteToken && nav ? (
          <button
            type="button"
            className="se-link is-linked se-link--edit"
            title={`Edit ${ref!.ref} in the palette — recolors every element linked to it`}
            onClick={() => nav.editPalette(paletteToken)}
          >
            {ref!.ref} <Icon name="edit" size={11} />
          </button>
        ) : (
          !literal && (
            <span className={`se-link${ref ? " is-linked" : ""}`} title={ref ? "Follows a shared color" : "A fixed color"}>
              {ref ? ref.ref : "custom"}
            </span>
          )
        )}
      </div>

      <div className="se-swatches" role="list" aria-label="Palette colors">
        {tokens.map((token) => {
          const name = `$${token}`;
          return (
            <button
              key={token}
              type="button"
              role="listitem"
              className={`se-token${ref?.ref === name ? " is-active" : ""}`}
              title={name}
              aria-label={name}
              style={{ background: token === "segmentum" ? SEGMENTUM_GRADIENT : `var(--color-${token})` }}
              onClick={() => pickRef(name)}
            />
          );
        })}
        {allowCurrentColor && !literal && (
          <button
            type="button"
            role="listitem"
            className={`se-token se-token--current${ref?.ref === "currentColor" ? " is-active" : ""}`}
            title="currentColor — follows the text color"
            aria-label="Text color"
            style={{ color: colorCss(textColor), "--color-segmentum": SEGMENTUM_SAMPLE } as CSSProperties}
            onClick={() => pickRef("currentColor")}
          >
            T
          </button>
        )}
        <button type="button" role="listitem" className="se-token" title="#000000" aria-label="Black" style={{ background: "#000" }} onClick={() => emit(toHex({ r: 0, g: 0, b: 0 }, alpha), { h: hsv.h, s: 0, v: 0 })} />
        <button type="button" role="listitem" className="se-token" title="#ffffff" aria-label="White" style={{ background: "#fff" }} onClick={() => emit(toHex({ r: 255, g: 255, b: 255 }, alpha), { h: hsv.h, s: 0, v: 1 })} />
        <button
          type="button"
          role="listitem"
          className={`se-token se-token--none${value === "transparent" ? " is-active" : ""}`}
          title="transparent"
          aria-label="Transparent"
          onClick={() => emit("transparent", hsv)}
        />
        {!literal && nav && (
          <button
            type="button"
            className="se-token se-token--edit"
            title="Edit the palette colors — every element linked to one follows"
            aria-label="Edit palette colors"
            onClick={() => nav.editPalette(paletteToken ?? undefined)}
          >
            <Icon name="edit" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function HexInput({ hex, onCommit }: { hex: string; onCommit: (rgb: { r: number; g: number; b: number }) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const parsed = parseHex(draft.startsWith("#") ? draft : `#${draft}`);
      if (parsed) onCommit(parsed);
    }
    setDraft(null);
  };
  const invalid = draft !== null && !parseHex(draft.startsWith("#") ? draft : `#${draft}`);
  return (
    <input
      className={`se-input se-picker__hex${invalid ? " is-invalid" : ""}`}
      value={draft ?? hex}
      spellCheck={false}
      aria-label="Hex color"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
