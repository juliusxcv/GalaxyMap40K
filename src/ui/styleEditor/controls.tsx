import { useState, type CSSProperties, type ReactNode } from "react";

const ICONS = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  dockLeft: "M3 5h18v14H3zM9 5v14",
  dockRight: "M3 5h18v14H3zM15 5v14",
  collapse: "m6 15 6-6 6 6",
  expand: "m6 9 6 6 6-6",
  close: "M6 6l12 12M18 6 6 18",
  pick: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  locate: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  revert: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  plus: "M12 5v14M5 12h14",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  back: "M19 12H5M11 18l-6-6 6-6",
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`se-icon-btn${active ? " is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} />
    </button>
  );
}

const round = (n: number, step: number) => {
  const decimals = step < 1 ? String(step).split(".")[1]?.length ?? 2 : 0;
  return Number(n.toFixed(decimals));
};

/** Slider plus a typed number, for px values. The slider covers the useful
 * range; the number field accepts anything. */
export function NumberSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  const nudge = (dir: number, big: boolean) => onChange(round(value + dir * step * (big ? 10 : 1), step));

  return (
    <label className="se-num">
      <span className="se-num__label">{label}</span>
      <input
        type="range"
        className="se-range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        style={{ "--p": `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="text"
        inputMode="decimal"
        className="se-input se-num__value"
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setDraft(null);
            nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          } else if (e.key === "Enter") {
            setDraft(null);
          }
        }}
      />
    </label>
  );
}
