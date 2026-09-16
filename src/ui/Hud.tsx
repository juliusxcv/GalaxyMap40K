import type { StarSystem } from "../data/types";
import { SearchBox } from "./SearchBox";
import { ACCURACY_GRADIENT_CSS } from "../data/accuracyColor";

export function Hud({ systems }: { systems: StarSystem[] }) {
  return (
    <>
      <div className="hud">
        <div className="hud__title">
          <h1>Galaxy Map</h1>
          <p>Drag to rotate · Scroll to zoom · Click a star to inspect</p>
          <div className="hud__legend">
            <span className="hud__legend-swatch" style={{ background: ACCURACY_GRADIENT_CSS }} />
            <span>Location confidence: unknown → confirmed</span>
          </div>
        </div>
        <SearchBox systems={systems} />
      </div>
      <div className="hud__credits">
        Location and world data adapted from the{" "}
        <a href="https://warhammer40k.fandom.com" target="_blank" rel="noreferrer">
          Warhammer 40k Fandom wiki
        </a>{" "}
        (CC BY-SA)
      </div>
    </>
  );
}
