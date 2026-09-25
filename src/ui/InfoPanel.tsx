import { useGalaxyStore } from "../store/useGalaxyStore";
import { accuracyToCss, accuracyLabel } from "../data/accuracyColor";
import { FrameCrosshairs } from "./Crosshair";

/** System dossier: a terminal module window. Opened only from the target
 * callout's button; closing it keeps the target acquired. */
export function InfoPanel() {
  const selectedSystem = useGalaxyStore((s) => s.selectedSystem);
  const dossierOpen = useGalaxyStore((s) => s.dossierOpen);
  const closeDossier = useGalaxyStore((s) => s.closeDossier);
  const open = dossierOpen && selectedSystem !== null;
  const color = selectedSystem ? accuracyToCss(selectedSystem.accuracy) : undefined;

  return (
    <aside className={`dossier term-box ${open ? "dossier--open" : ""}`} aria-hidden={!open}>
      <FrameCrosshairs />
      {selectedSystem && (
        <div className="dossier__scroll">
          <div className="dossier__header">
            <div className="module-tag">
              <span className="kicker">Module</span>
              <span className="module-tag__box term-box">System dossier</span>
            </div>
            <button type="button" className="btn-term dossier__close" onClick={closeDossier} aria-label="Close dossier">
              ✕
            </button>
          </div>

          <div>
            <h2 className="dossier__title">{selectedSystem.name}</h2>
            {selectedSystem.faction && <p className="dossier__faction">{selectedSystem.faction}</p>}
          </div>

          <p className="dossier__summary">{selectedSystem.summary}</p>

          <ul className="tree">
            <li className="is-signal">++ Location ++</li>
            {selectedSystem.segmentum && (
              <li>
                <span className="dossier__key">Segmentum</span> {selectedSystem.segmentum}
              </li>
            )}
            {selectedSystem.sector && (
              <li>
                <span className="dossier__key">Sector</span> {selectedSystem.sector}
              </li>
            )}
            {selectedSystem.imperium && (
              <li>
                <span className="dossier__key">Imperium</span> {selectedSystem.imperium}
              </li>
            )}
            <li>
              <span className="dossier__key">Loc. conf.</span>{" "}
              <span style={{ color, textShadow: "none" }}>●</span> {accuracyLabel(selectedSystem.accuracy)}
            </li>
          </ul>

          {selectedSystem.tags && selectedSystem.tags.length > 0 && (
            <div>
              <span className="kicker">Classification</span>
              <ul className="dossier__chips">
                {selectedSystem.tags.map((tag) => (
                  <li key={tag} className="chip">
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedSystem.members && selectedSystem.members.length > 0 && (
            <ul className="tree dossier__members">
              <li className="is-signal">++ {selectedSystem.members.length} known bodies ++</li>
              {selectedSystem.members.map((member) => (
                <li key={member.id}>
                  <span className="dossier__member">
                    {member.sourceUrl ? (
                      <a href={member.sourceUrl} target="_blank" rel="noreferrer">
                        {member.name}
                      </a>
                    ) : (
                      member.name
                    )}
                    {member.type && <span className="dossier__member-type">{member.type}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {selectedSystem.sourceUrl && (
            <a className="btn-term dossier__source" href={selectedSystem.sourceUrl} target="_blank" rel="noreferrer">
              Open source record ↗
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
