import { useMemo, useState } from "react";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { accuracyToCss } from "../data/accuracyColor";

interface SearchBoxProps {
  systems: StarSystem[];
}

export function SearchBox({ systems }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const selectStar = useGalaxyStore((s) => s.selectStar);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return systems.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, systems]);

  const handleSelect = (system: StarSystem) => {
    selectStar(system);
    setQuery(system.name);
  };

  return (
    <div className="search-box">
      <input
        type="text"
        placeholder="Search star systems…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <ul className="search-box__results">
          {matches.map((system) => (
            <li key={system.id}>
              <button onClick={() => handleSelect(system)}>
                <span className="search-box__dot" style={{ color: accuracyToCss(system.accuracy) }}>
                  ●
                </span>
                {system.name}
                {system.faction && <span className="search-box__faction"> · {system.faction}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
