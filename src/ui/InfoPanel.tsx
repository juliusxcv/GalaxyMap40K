import { useGalaxyStore } from "../store/useGalaxyStore";
import { accuracyToCss, accuracyLabel } from "../data/accuracyColor";

export function InfoPanel() {
  const selectedSystem = useGalaxyStore((s) => s.selectedSystem);
  const clearSelection = useGalaxyStore((s) => s.clearSelection);
  const color = selectedSystem ? accuracyToCss(selectedSystem.accuracy) : undefined;

  return (
    <aside className={`info-panel ${selectedSystem ? "info-panel--open" : ""}`}>
      {selectedSystem && (
        <>
          <button className="info-panel__close" onClick={clearSelection} aria-label="Close">
            ×
          </button>
          <h2 style={{ color }}>{selectedSystem.name}</h2>
          {selectedSystem.faction && <p className="info-panel__faction">{selectedSystem.faction}</p>}
          <p className="info-panel__summary">{selectedSystem.summary}</p>

          <div className="info-panel__location">
            {selectedSystem.segmentum && (
              <div className="info-panel__location-row">
                <span>Segmentum</span>
                <span>{selectedSystem.segmentum}</span>
              </div>
            )}
            {selectedSystem.sector && (
              <div className="info-panel__location-row">
                <span>Sector</span>
                <span>{selectedSystem.sector}</span>
              </div>
            )}
            {selectedSystem.imperium && (
              <div className="info-panel__location-row">
                <span>Imperium</span>
                <span>{selectedSystem.imperium}</span>
              </div>
            )}
            <div className="info-panel__location-row">
              <span>Location confidence</span>
              <span style={{ color }}>● {accuracyLabel(selectedSystem.accuracy)}</span>
            </div>
          </div>

          {selectedSystem.tags && selectedSystem.tags.length > 0 && (
            <ul className="info-panel__tags">
              {selectedSystem.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}
          {selectedSystem.sourceUrl && (
            <a
              className="info-panel__source"
              href={selectedSystem.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Source ↗
            </a>
          )}

          {selectedSystem.members && selectedSystem.members.length > 0 && (
            <div className="info-panel__members">
              <h3>{selectedSystem.members.length} known bodies</h3>
              <ul>
                {selectedSystem.members.map((member) => (
                  <li key={member.id}>
                    <span
                      className="info-panel__member-dot"
                      style={{ color: accuracyToCss(member.accuracy) }}
                    >
                      ●
                    </span>
                    {member.sourceUrl ? (
                      <a href={member.sourceUrl} target="_blank" rel="noreferrer">
                        {member.name}
                      </a>
                    ) : (
                      <span>{member.name}</span>
                    )}
                    {member.type && <span className="info-panel__member-type">{member.type}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
