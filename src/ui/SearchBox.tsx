import { useMemo, useState } from "react";
import type { StarSystem } from "../data/types";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { accuracyToCss } from "../data/accuracyColor";

const MAX_RESULTS = 8;

interface SearchBoxProps {
  systems: StarSystem[];
}

/** A searchable name: a system itself, or one of its bodies (planet, moon,
 * station…), which resolves to its parent system. */
interface SearchEntry {
  key: string;
  name: string;
  lowerName: string;
  system: StarSystem;
  /** Set for bodies: the dot shows the body's own confidence. */
  bodyAccuracy?: number;
}

export function SearchBox({ systems }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  // Results close once one is picked, until the query is edited again.
  const [resultsOpen, setResultsOpen] = useState(true);
  const selectStar = useGalaxyStore((s) => s.selectStar);

  const index = useMemo(() => {
    const systemEntries: SearchEntry[] = [];
    const bodyEntries: SearchEntry[] = [];
    for (const system of systems) {
      systemEntries.push({ key: system.id, name: system.name, lowerName: system.name.toLowerCase(), system });
      for (const member of system.members ?? []) {
        // A body named like its system (Macragge in the Macragge System)
        // would only duplicate the system's own row.
        if (system.name.toLowerCase().startsWith(member.name.toLowerCase())) continue;
        bodyEntries.push({
          key: `${system.id}/${member.id}`,
          name: member.name,
          lowerName: member.name.toLowerCase(),
          system,
          bodyAccuracy: member.accuracy,
        });
      }
    }
    // Systems rank ahead of bodies with the same match.
    return [...systemEntries, ...bodyEntries];
  }, [systems]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter((entry) => entry.lowerName.includes(q)).slice(0, MAX_RESULTS);
  }, [query, index]);

  // Acquires the system as the target (ring + callout); the dossier itself
  // only opens from the callout's button.
  const handleSelect = (entry: SearchEntry) => {
    selectStar(entry.system);
    setQuery(entry.name);
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
          {matches.map((entry) => (
            <li key={entry.key}>
              <button type="button" className="search-box__result" onClick={() => handleSelect(entry)}>
                <span
                  className="search-box__dot"
                  style={{ color: accuracyToCss(entry.bodyAccuracy ?? entry.system.accuracy) }}
                >
                  ●
                </span>
                <span className="search-box__name">{entry.name}</span>
                {entry.bodyAccuracy !== undefined ? (
                  <span className="search-box__faction">in {entry.system.name}</span>
                ) : (
                  entry.system.faction && <span className="search-box__faction">{entry.system.faction}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
