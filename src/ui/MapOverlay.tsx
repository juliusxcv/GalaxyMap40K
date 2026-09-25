import { useEffect } from "react";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { accuracyLabel } from "../data/accuracyColor";
import { LABEL_POOL_SIZE, overlayRegistry } from "./overlayRegistry";

/** Screen-space layer over the canvas: a fixed pool of star labels and the
 * target callout. Positions, visibility and label text are driven per frame
 * by OverlayProjector; this component only renders the elements. */
export function MapOverlay() {
  const selected = useGalaxyStore((s) => s.selectedSystem);
  const dossierOpen = useGalaxyStore((s) => s.dossierOpen);

  // Escape backs out one step: dossier first, then the target itself.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const state = useGalaxyStore.getState();
      if (state.dossierOpen) state.closeDossier();
      else if (state.selectedSystem) state.clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="map-overlay">
      {Array.from({ length: LABEL_POOL_SIZE }, (_, i) => (
        <div
          key={i}
          className="map-label"
          ref={(el) => {
            overlayRegistry.labels[i] = el;
          }}
        />
      ))}
      <div
        className="target-callout"
        hidden={!selected || dossierOpen}
        ref={(el) => {
          overlayRegistry.callout = el;
        }}
      >
        {selected && <TargetSummary key={selected.id} />}
      </div>
    </div>
  );
}

/** The "tiny summary" shown on acquiring a star, in amber signal text. Its
 * button is the only way to open the full dossier. */
function TargetSummary() {
  const selected = useGalaxyStore((s) => s.selectedSystem);
  const openDossier = useGalaxyStore((s) => s.openDossier);
  const clearSelection = useGalaxyStore((s) => s.clearSelection);
  if (!selected) return null;

  return (
    <>
      <svg className="target-callout__leader" width="64" height="40" aria-hidden="true">
        <polyline points="11,11 33,31 56,31" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="58" cy="31" r="2.5" fill="currentColor" />
      </svg>
      <div
        className="target-callout__body"
        role="dialog"
        aria-label={`Target: ${selected.name}`}
        ref={(el) => {
          // Star labels keep clear of the callout too.
          overlayRegistry.blockers[3] = el;
        }}
      >
        <p className="target-callout__head">++ Target acquired ++</p>
        <p className="target-callout__name">{selected.name}</p>
        <ul className="tree target-callout__tree">
          {selected.segmentum && <li className="is-signal">{selected.segmentum}</li>}
          {selected.sector && <li className="is-signal">{selected.sector}</li>}
          {selected.faction && <li className="is-signal">{selected.faction}</li>}
          <li className="is-signal">Loc. conf. — {accuracyLabel(selected.accuracy)}</li>
        </ul>
        <div className="target-callout__actions">
          <button type="button" className="btn-signal" onClick={openDossier}>
            Open dossier ▸
          </button>
          <button type="button" className="btn-signal" onClick={clearSelection} aria-label="Release target">
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
