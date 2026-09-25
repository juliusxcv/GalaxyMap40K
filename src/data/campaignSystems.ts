import type { StarSystem } from "./types";

// Systems from the Doomtroopers RPG campaign's own lore (DT-Lore-Vault),
// kept apart from the scraped starSystems.json so a re-scrape can't drop
// them. The vault marks these entries GM-only and this map is public, so
// the text here sticks to what the players already know.
export const CAMPAIGN_SYSTEMS: StarSystem[] = [
  {
    id: "system-bellum-eternum-system",
    name: "Bellum Eternum System",
    // Segmentum Ultima, 17.7 units (≈35 kly) out from Terra at 351.5° — a
    // few jumps past the Segmentum Solar border, whose Helios Sub-Cluster
    // offices oversee the system. Picked as the one clearing in this part
    // of Ultima with no charted system within 2 units, ringed by Badab,
    // Lastrati, Praesidia and New Catachan, on the edge of a spiral arm and
    // just outside the glare of the galactic bulge.
    position: [37.5, 0.3, -2.6],
    size: 1,
    type: "system",
    faction: "Imperium of Man",
    segmentum: "Segmentum Ultima",
    tags: ["doomtroopers campaign", "imperium of man", "industrial world", "war world", "forest moon"],
    summary:
      "Home system of the Doomtroopers campaign, with 3 known bodies: the industrial capital Bellum Eternum Prime, the war-scarred third planet Bellum Eternum Tertius, and its twilight forest moon, Luna Tenebris.",
    accuracy: 1,
    members: [
      {
        id: "bellum-eternum-prime",
        name: "Bellum Eternum Prime",
        type: "Industrial World",
        faction: "Imperium of Man",
        tags: ["industrial world", "hive", "imperium of man"],
        summary:
          "Primary world and administrative center of the system: a Category I Industrial World of some 14 billion souls, governed by the Prime High Council.",
        accuracy: 1,
      },
      {
        id: "bellum-eternum-tertius",
        name: "Bellum Eternum Tertius",
        type: "War World",
        faction: "Imperium of Man",
        tags: ["war world", "imperium of man"],
        summary:
          "Third planet of the system: a vast trench-scarred war world, theater of the Ork Pacification Campaigns of M39–M40.",
        accuracy: 1,
      },
      {
        id: "luna-tenebris",
        name: "Luna Tenebris",
        type: "Moon of Tertius",
        faction: "Imperium of Man",
        tags: ["moon", "forest world"],
        summary:
          "Moon orbiting Bellum Eternum Tertius, held in near-perpetual twilight: temperate, breathable, and covered in dense pine forest, with a six-hour day.",
        accuracy: 1,
      },
    ],
  },
];
