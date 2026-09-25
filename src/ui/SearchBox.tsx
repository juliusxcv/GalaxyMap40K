import { useMemo, useState } from "react";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { accuracyToCss } from "../data/accuracyColor";

interface SearchBoxProps {
  systems: StarSystem[];
}

export function SearchBox({ systems }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  // Results close once one is picked, until the query is edited again.
  const [resultsOpen, setResultsOpen] = useState(true);
  const selectStar = useGalaxyStore((s) => s.selectStar);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return systems.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, systems]);

  // Acquires the system as the target (ring + callout); the dossier itself
  // only opens from the callout's button.
  const handleSelect = (system: StarSystem) => {
    selectStar(system);
    setQuery(system.name);
    setResultsOpen(false);
  };

  return (
    <div className="search-box">
      <label className="kicker" htmlFor="system-query">
        Query system
      </label>
      <input
        id="system-query"
        type="text"
        className="term-input"
        placeholder="Enter designation…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setResultsOpen(true);
        }}
      />
      {resultsOpen && matches.length > 0 && (
        <ul className="search-box__results term-box">
          {matches.map((system) => (
            <li key={system.id}>
              <button type="button" className="search-box__result" onClick={() => handleSelect(system)}>
                <span className="search-box__dot" style={{ color: accuracyToCss(system.accuracy) }}>
                  ●
                </span>
                <span className="search-box__name">{system.name}</span>
                {system.faction && <span className="search-box__faction">{system.faction}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
