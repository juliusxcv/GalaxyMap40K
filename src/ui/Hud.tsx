import type { StarSystem } from "../data/types";
import { SearchBox } from "./SearchBox";
import { FrameCrosshairs } from "./Crosshair";
import { Readouts, TimeCord } from "./Readouts";
import { ACCURACY_GRADIENT_CSS } from "../data/accuracyColor";
import { overlayRegistry } from "./overlayRegistry";

// Registers a HUD panel as an area star labels must keep clear of.
const blocker = (slot: number) => (el: HTMLElement | null) => {
  overlayRegistry.blockers[slot] = el;
};

export function Hud({ systems }: { systems: StarSystem[] }) {
  return (
    <>
      <div className="viewport-frame" aria-hidden="true">
        <FrameCrosshairs />
      </div>

      <div className="hud">
        <div className="hud__left" ref={blocker(0)}>
          <div className="module-tag">
            <span className="kicker">Module</span>
            <h1 className="module-tag__box term-box">Star map</h1>
          </div>
          <ul className="tree hud__feed">
            <li className="is-signal">++ Astra Cartographica ++</li>
            <li>
              <span className="cursor">By authority of the Adeptus Administratum</span>
            </li>
            <li className="is-dim">Drag: rotate · Scroll: zoom · Click: acquire target</li>
          </ul>
          <div className="hud__legend">
            <span className="kicker">Loc. confidence</span>
            <span className="hud__legend-scale">
              Unk.
              <span className="hud__legend-swatch" style={{ background: ACCURACY_GRADIENT_CSS }} />
              Conf.
            </span>
          </div>
        </div>

        <div className="hud__right" ref={blocker(1)}>
          <TimeCord />
          <SearchBox systems={systems} />
        </div>
      </div>

      <Readouts />

      <div className="hud__credits">
        Data: <a href="https://warhammer40k.fandom.com" target="_blank" rel="noreferrer">Warhammer 40k Fandom wiki</a>{" "}
        (CC BY-SA)
      </div>
    </>
  );
}
