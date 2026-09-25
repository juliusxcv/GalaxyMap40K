import type { ColorValue, Shadow } from "../../theme/catalog";
import { ColorField } from "./ColorField";
import { Icon, IconButton, NumberSlider } from "./controls";

interface ShadowListProps {
  layers: Shadow[];
  onChange: (layers: Shadow[]) => void;
  /** Box shadows have spread and inset; text shadows and SVG drop-shadows don't. */
  box: boolean;
  textColor: ColorValue;
  extraTokens?: string[];
  /** Which color picker is open, shared across the whole detail pane. */
  openColor: string | null;
  setOpenColor: (key: string | null) => void;
  colorKeyPrefix: string;
}

const GLOW: Shadow = { x: 0, y: 0, blur: 8, color: "currentColor 60%" };
const DROP: Shadow = { x: 0, y: 2, blur: 4, color: "#000000cc" };

/** Shadow / glow layers. The first layer paints on top. */
export function ShadowList({ layers, onChange, box, textColor, extraTokens, openColor, setOpenColor, colorKeyPrefix }: ShadowListProps) {
  const update = (i: number, patch: Partial<Shadow>) => onChange(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...layers];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div className="se-layers">
      {layers.length === 0 && <p className="se-empty">None — add a glow or a drop shadow.</p>}
      {layers.map((layer, i) => {
        const key = `${colorKeyPrefix}.${i}`;
        return (
          <div className="se-layer" key={i}>
            <div className="se-layer__head">
              <span className="se-layer__name">Layer {i + 1}</span>
              {box && (
                <label className="se-check">
                  <input type="checkbox" checked={!!layer.inset} onChange={(e) => update(i, { inset: e.target.checked || undefined })} />
                  Inset
                </label>
              )}
              <span className="se-spacer" />
              <IconButton icon="up" label="Move up (paints on top)" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon="down" label="Move down" disabled={i === layers.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon="copy" label="Duplicate layer" onClick={() => onChange([...layers.slice(0, i + 1), { ...layer }, ...layers.slice(i + 1)])} />
              <IconButton icon="trash" label="Remove layer" onClick={() => onChange(layers.filter((_, j) => j !== i))} />
            </div>
            <div className="se-grid2">
              <NumberSlider label="X" value={layer.x} min={-20} max={20} step={0.5} onChange={(x) => update(i, { x })} />
              <NumberSlider label="Y" value={layer.y} min={-20} max={20} step={0.5} onChange={(y) => update(i, { y })} />
              <NumberSlider label="Blur" value={layer.blur} min={0} max={40} step={0.5} onChange={(blur) => update(i, { blur: Math.max(0, blur) })} />
              {box && (
                <NumberSlider label="Spread" value={layer.spread ?? 0} min={-10} max={20} step={0.5} onChange={(spread) => update(i, { spread: spread || undefined })} />
              )}
            </div>
            <ColorField
              value={layer.color}
              onChange={(color) => update(i, { color })}
              textColor={textColor}
              allowCurrentColor
              extraTokens={extraTokens}
              open={openColor === key}
              onToggle={() => setOpenColor(openColor === key ? null : key)}
            />
          </div>
        );
      })}
      <div className="se-layers__add">
        <button type="button" className="se-btn" onClick={() => onChange([...layers, { ...GLOW }])}>
          <Icon name="plus" size={12} /> Glow
        </button>
        <button type="button" className="se-btn" onClick={() => onChange([...layers, { ...DROP }])}>
          <Icon name="plus" size={12} /> Drop shadow
        </button>
      </div>
    </div>
  );
}
