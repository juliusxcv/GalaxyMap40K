import { useEffect, useMemo, useRef } from "react";
import { CATALOG_BY_ID, THEME_TOKENS, type ColorValue, type StyleSheetData } from "../../theme/catalog";
import { tokenUsers, tokensEqual } from "../../theme/compile";
import { ColorField } from "./ColorField";
import { readBasePalette } from "./colorMath";
import { Icon, IconButton } from "./controls";
import { paletteColorKey } from "./editorNav";

interface PaletteDetailProps {
  sheet: StyleSheetData;
  saved: StyleSheetData;
  factory: StyleSheetData;
  /** Token to bring into view (and flash), e.g. after "edit $phosphor". */
  focus: { token: string; key: number } | null;
  /** The element the user came from, for the back link. */
  returnTo: string | null;
  openColor: string | null;
  setOpenColor: (key: string | null) => void;
  onSetToken: (token: string, value: ColorValue | undefined) => void;
  onSetPalette: (tokens: Record<string, ColorValue>) => void;
  onShowUsers: (token: string) => void;
  onSelect: (id: string) => void;
}

/** The theme palette: the preset colors behind every "$token" link. A change
 * here redefines the CSS variable itself, so every element linked to it —
 * and anything else in the CSS using it — follows immediately. */
export function PaletteDetail({
  sheet,
  saved,
  factory,
  focus,
  returnTo,
  openColor,
  setOpenColor,
  onSetToken,
  onSetPalette,
  onShowUsers,
  onSelect,
}: PaletteDetailProps) {
  const base = useMemo(() => readBasePalette(THEME_TOKENS), []);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const row = ref.current?.querySelector<HTMLElement>(`[data-token="${focus.token}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "start" });
    row.classList.remove("is-flash");
    void row.offsetWidth; // restart the flash
    row.classList.add("is-flash");
  }, [focus]);

  return (
    <div className="se-detail" ref={ref}>
      <div className="se-detail__head">
        {returnTo && CATALOG_BY_ID[returnTo] && (
          <button type="button" className="se-back" onClick={() => onSelect(returnTo)}>
            <Icon name="back" size={12} /> {CATALOG_BY_ID[returnTo].name}
          </button>
        )}
        <h2 className="se-detail__name">Palette</h2>
        <code className="se-code">--color-* in src/index.css</code>
        <p className="se-desc">
          The preset colors in every color picker. Elements link to them (“$phosphor 70%”), so changing one here recolors all of them at once.
        </p>
      </div>

      {THEME_TOKENS.map((token) => {
        const override = sheet.tokens[token];
        const users = tokenUsers(sheet, token);
        const changed = (override ?? null) !== (saved.tokens[token] ?? null);
        const key = paletteColorKey(token);
        return (
          <section key={token} className="se-section se-token-row" data-token={token}>
            <div className="se-section__head">
              <h3 className="se-section__title se-section__title--token">${token}</h3>
              <span className={`se-src${override !== undefined ? " is-custom" : ""}`}>
                {override !== undefined ? "edited" : "index.css"}
              </span>
              {changed && <span className="se-dot" title="Changed since the last save" />}
              <span className="se-spacer" />
              <button
                type="button"
                className="se-link-btn se-uses"
                disabled={users.length === 0}
                title={users.length ? `List them: ${users.map((id) => CATALOG_BY_ID[id].name).join(", ")}` : "No element links to it directly"}
                onClick={() => onShowUsers(token)}
              >
                {users.length} element{users.length === 1 ? "" : "s"}
              </button>
              {changed && (
                <IconButton icon="revert" label="Revert to saved" onClick={() => onSetToken(token, saved.tokens[token])} />
              )}
              {override !== undefined && (
                <IconButton icon="close" label="Back to the src/index.css color" onClick={() => onSetToken(token, undefined)} />
              )}
            </div>
            <ColorField
              value={override ?? base[token] ?? "transparent"}
              onChange={(v) => onSetToken(token, v)}
              textColor="$phosphor"
              literal
              open={openColor === key}
              onToggle={() => setOpenColor(openColor === key ? null : key)}
            />
          </section>
        );
      })}

      <div className="se-detail__actions">
        <button
          type="button"
          className="se-btn"
          disabled={tokensEqual(sheet.tokens, saved.tokens)}
          onClick={() => onSetPalette({ ...saved.tokens })}
        >
          <Icon name="revert" size={12} /> Revert palette
        </button>
        <button
          type="button"
          className="se-btn"
          disabled={tokensEqual(sheet.tokens, factory.tokens)}
          onClick={() => onSetPalette({ ...factory.tokens })}
        >
          Reset to index.css colors
        </button>
      </div>
    </div>
  );
}
