// Standalone offline data-collection script. Run with `npm run scrape`.
// Pulls sector/world data from the Warhammer 40k Fandom wiki's MediaWiki API
// and writes src/data/sectors.json + src/data/starSystems.json.
//
// Not called at runtime by the app — re-run manually when the source data
// should be refreshed. Responses are cached under scripts/.cache/ so reruns
// are cheap and don't re-hit the API for pages already fetched.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_DIR = path.join(__dirname, "..", "src", "data");
const API_BASE = "https://warhammer40k.fandom.com/api.php";
const WIKI_BASE = "https://warhammer40k.fandom.com/wiki/";
const REQUEST_DELAY_MS = 180;

let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + REQUEST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function cacheKey(params: Record<string, string>) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    hash = (Math.imul(31, hash) + sorted.charCodeAt(i)) | 0;
  }
  return `${(hash >>> 0).toString(36)}.json`;
}

async function apiGet(params: Record<string, string>): Promise<any> {
  const key = cacheKey(params);
  const cachePath = path.join(CACHE_DIR, key);
  try {
    const cached = await readFile(cachePath, "utf-8");
    return JSON.parse(cached);
  } catch {
    // not cached
  }

  const url = new URL(API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "json");

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await throttle();
      const res = await fetch(url, {
        headers: { "User-Agent": "GalaxyMapBot/1.0 (offline data collection script)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const json = await res.json();
      await writeFile(cachePath, JSON.stringify(json));
      return json;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function fetchAllCategoryMembers(
  categoryTitle: string,
  cmtype: "page" | "subcat" | "page|subcat" = "page"
): Promise<{ pageid: number; ns: number; title: string }[]> {
  const members: { pageid: number; ns: number; title: string }[] = [];
  let cmcontinue: string | undefined;
  for (;;) {
    const params: Record<string, string> = {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${categoryTitle}`,
      cmlimit: "500",
      cmtype,
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const json = await apiGet(params);
    members.push(...(json.query?.categorymembers ?? []));
    cmcontinue = json.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  return members;
}

async function fetchPageContent(
  title: string
): Promise<{ wikitext: string; categories: string[] } | null> {
  const json = await apiGet({
    action: "query",
    titles: title,
    prop: "revisions|categories",
    rvprop: "content",
    rvslots: "main",
    cllimit: "50",
  });
  const pages = json.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0] as any;
  const wikitext: string | undefined = page?.revisions?.[0]?.slots?.main?.["*"];
  if (wikitext === undefined) return null;
  const categories: string[] = (page.categories ?? []).map((c: any) =>
    String(c.title).replace(/^Category:/, "")
  );
  return { wikitext, categories };
}

// ---- wikitext parsing helpers ----

const INFOBOX_TEMPLATE_NAMES = ["Planet", "System", "Sector", "World", "Subsector", "Sub-sector"];

function stripWikiMarkup(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
}

/** Finds the first infobox-like template ({{Planet ...}}, {{Sector ...}}, etc.)
 * and returns its key/value fields with wiki markup stripped from values. */
function parseInfobox(wikitext: string): Record<string, string> {
  const namePattern = INFOBOX_TEMPLATE_NAMES.join("|");
  const match = wikitext.match(new RegExp(`\\{\\{\\s*(${namePattern})\\b`, "i"));
  if (!match || match.index === undefined) return {};

  let depth = 0;
  let start = match.index;
  let end = -1;
  for (let i = start; i < wikitext.length - 1; i++) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
      depth++;
      i++;
    } else if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
      depth--;
      i++;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return {};

  const inner = wikitext.slice(start + 2, end - 2);
  const firstNewline = inner.indexOf("\n");
  const body = firstNewline === -1 ? "" : inner.slice(firstNewline + 1);

  const fields: Record<string, string> = {};
  for (const line of body.split(/\n(?=\|)/)) {
    const l = line.trim();
    if (!l.startsWith("|")) continue;
    const eq = l.indexOf("=");
    if (eq === -1) continue;
    const key = l.slice(1, eq).trim().toLowerCase();
    const value = stripWikiMarkup(l.slice(eq + 1));
    if (key && value) fields[key] = value;
  }
  return fields;
}

const DIRECTION_ANGLES: Record<string, number> = {
  east: 0,
  northeast: 45,
  north: 90,
  northwest: 135,
  west: 180,
  southwest: 225,
  south: 270,
  southeast: 315,
};

interface DistanceDirection {
  lightYears: number;
  angleDeg: number;
}

/** Looks for prose like "10,000 light years to the galactic northeast of
 * Terra" — the wiki's usual way of giving a system's approximate location. */
function extractDistanceDirection(wikitext: string): DistanceDirection | null {
  const re =
    /([\d,]+)\s*light[- ]years?\s+(?:to\s+the\s+)?(?:galactic\s+)?(northeast|northwest|southeast|southwest|north|south|east|west)\s+of\s+(?:Holy\s+)?Terra/i;
  const m = wikitext.match(re);
  if (!m) return null;
  const lightYears = Number(m[1].replace(/,/g, ""));
  const angleDeg = DIRECTION_ANGLES[m[2].toLowerCase()];
  if (!Number.isFinite(lightYears) || angleDeg === undefined) return null;
  return { lightYears, angleDeg };
}

// ---- deterministic scatter (mirrors src/data/proceduralGalaxy.ts mulberry32) ----

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const LY_PER_UNIT = 2000;
// Matches src/data/proceduralGalaxy.ts — keep these in sync.
const GALAXY_RADIUS = 75;
const SOLAR_RADIUS = 9;
// Matches src/data/galaxyRegions.ts SEGMENTUM_WEDGE_DEG, which drives the
// boundary lines drawn in the app — keep these in sync.
const SEGMENTUM_WEDGE_DEG = 90;
// Also matches src/data/galaxyRegions.ts TERRA_OFFSET — where Terra sits
// within the ambient dust field, off the true galactic center.
const TERRA_OFFSET: [number, number, number] = [20, 0, 0];

interface Segmentum {
  id: string;
  name: string;
  centerAngleDeg: number | null; // null = Solar (no angular restriction)
  radiusInner: number;
  radiusOuter: number;
}

// Radius bands are asymmetric — see galaxyRegions.ts for why (derived from
// real distance-from-Terra distributions on a curated reference map).
const SEGMENTA: Segmentum[] = [
  { id: "solar", name: "Segmentum Solar", centerAngleDeg: null, radiusInner: 0, radiusOuter: SOLAR_RADIUS },
  { id: "ultima", name: "Segmentum Ultima", centerAngleDeg: 0, radiusInner: SOLAR_RADIUS, radiusOuter: 58 },
  { id: "obscurus", name: "Segmentum Obscurus", centerAngleDeg: 90, radiusInner: SOLAR_RADIUS, radiusOuter: 32 },
  { id: "pacificus", name: "Segmentum Pacificus", centerAngleDeg: 180, radiusInner: SOLAR_RADIUS, radiusOuter: 20 },
  { id: "tempestus", name: "Segmentum Tempestus", centerAngleDeg: 270, radiusInner: SOLAR_RADIUS, radiusOuter: 42 },
];

function findSegmentum(text: string | undefined): Segmentum | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const seg of SEGMENTA) {
    const adjective = seg.name.replace(/^Segmentum /, "").toLowerCase();
    // Source text is inconsistent about word order ("Segmentum Obscurus"
    // vs. "Ultima Segmentum") — check both.
    if (lower.includes(seg.name.toLowerCase()) || lower.includes(`${adjective} segmentum`)) return seg;
  }
  return null;
}

function toXZ(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * radius, Math.sin(rad) * radius];
}

interface PlacementResult {
  position: [number, number, number];
  accuracy: number;
}

function placeWithDistanceDirection(dd: DistanceDirection, seed: number, segClamp: Segmentum | null): PlacementResult {
  const rng = mulberry32(seed);
  let radius = dd.lightYears / LY_PER_UNIT;
  if (segClamp) radius = Math.min(Math.max(radius, segClamp.radiusInner + 1), segClamp.radiusOuter - 1);
  radius = Math.min(Math.max(radius, 1), GALAXY_RADIUS - 1);
  const angle = dd.angleDeg + (rng() - 0.5) * 12;
  const [x, z] = toXZ(angle, radius);
  const y = (rng() - 0.5) * 3 * (1 - radius / GALAXY_RADIUS);
  return { position: [x, y, z], accuracy: 1.0 };
}

function placeNearAnchor(anchor: [number, number, number], seed: number, spread: number): PlacementResult {
  const rng = mulberry32(seed);
  const angle = rng() * 360;
  const r = rng() * spread;
  const [dx, dz] = toXZ(angle, r);
  const y = (rng() - 0.5) * 1.5;
  return { position: [anchor[0] + dx, anchor[1] + y, anchor[2] + dz], accuracy: 0.6 };
}

function placeWithinSegmentum(seg: Segmentum, seed: number): PlacementResult {
  const rng = mulberry32(seed);
  const radius = seg.radiusInner + rng() * (seg.radiusOuter - seg.radiusInner);
  const angle = seg.centerAngleDeg === null ? rng() * 360 : seg.centerAngleDeg + (rng() - 0.5) * SEGMENTUM_WEDGE_DEG;
  const [x, z] = toXZ(angle, radius);
  const y = (rng() - 0.5) * 4;
  return { position: [x, y, z], accuracy: 0.35 };
}

function placeUnknown(seed: number): PlacementResult {
  const rng = mulberry32(seed);
  const radius = SOLAR_RADIUS + rng() * (GALAXY_RADIUS - SOLAR_RADIUS - 2);
  const angle = rng() * 360;
  const [x, z] = toXZ(angle, radius);
  const y = (rng() - 0.5) * 5;
  return { position: [x, y, z], accuracy: 0.12 };
}

function addOffset(pos: [number, number, number]): [number, number, number] {
  return [pos[0] + TERRA_OFFSET[0], pos[1] + TERRA_OFFSET[1], pos[2] + TERRA_OFFSET[2]];
}

// ---- Jambonium reference map ----
// jambonium.co.uk/40kmap is a hand-curated Leaflet map with ~9k POIs placed
// at real (if stylized) relative positions and distances from Terra — a far
// better source for "does this position make sense" than guessing from a
// segmentum name alone. We use its coordinates directly (converted to
// distance+angle from its own Terra marker) wherever a name matches, and
// import POIs we don't already have.
const JAMBONIUM_URL = "https://jambonium-warhammer.s3.us-east-2.amazonaws.com/data/markers.json";
const JAMBONIUM_CACHE = path.join(CACHE_DIR, "jambonium-markers.json");
const PLACE_MARKER_TYPES = new Set([
  "planet",
  "moon",
  "station",
  "star",
  "hulk",
  "webway",
  "asteroid",
  "anomaly",
  "warp",
  "comet",
]);

interface JamboniumFeature {
  century?: string;
  geometry: { coordinates: [number, number] };
  properties: {
    id: string;
    marker: string;
    name: string;
    info: string;
    affiliation: string;
    importance: string;
    faction: string;
    danger: string;
    development: string;
    purpose: string;
    climate: string;
    location: string;
  };
  notes?: { confidence?: string; source?: string; lexicanum?: string; wikia?: string };
  fortyk?: { properties?: { imperium?: string } };
}

async function fetchJamboniumFeatures(): Promise<JamboniumFeature[]> {
  try {
    const cached = await readFile(JAMBONIUM_CACHE, "utf-8");
    return JSON.parse(cached).features;
  } catch {
    // not cached
  }
  console.log("Fetching Jambonium reference map data (~6MB, one-time)...");
  const res = await fetch(JAMBONIUM_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Jambonium markers`);
  const json = await res.json();
  await writeFile(JAMBONIUM_CACHE, JSON.stringify(json));
  return json.features;
}

function jamboSectorName(location: string | undefined): string | undefined {
  if (!location) return undefined;
  const parts = location.split("»").map((s) => s.trim());
  return parts.find((p) => /\bSector\b/i.test(p) && !/^Segmentum /.test(p));
}

/** The system a body belongs to, e.g. "Sol System" — always the first
 * breadcrumb segment of `location`, when there is one. */
function jamboSystemName(location: string | undefined): string | undefined {
  if (!location) return undefined;
  const first = location.split("»")[0]?.trim();
  return first && /system$/i.test(first) ? first : undefined;
}

/** Tags and the Imperium-side fact drawn from fields we weren't using
 * before: danger/development/purpose (flavor), century (era, e.g. "41k" ->
 * "m41"), and fortyk.properties.imperium (Sanctus/Nihilus/contested —
 * which side of the Great Rift, present on every Jambonium feature). */
function jamboExtraFacts(f: JamboniumFeature): { tags: string[]; imperium?: string } {
  const tags = [f.properties.danger, f.properties.development, f.properties.purpose]
    .flatMap((t) => (t ?? "").split(","))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (f.century?.trim()) tags.push(`m${f.century.trim().replace(/k$/i, "")}`);
  const imperium = f.fortyk?.properties?.imperium?.trim() || undefined;
  return { tags, imperium };
}

function confidenceToAccuracy(confidence: string | undefined): number {
  switch ((confidence ?? "").toLowerCase()) {
    case "high":
      return 1.0;
    case "medium":
      return 0.82;
    case "low":
      return 0.65;
    default:
      return 0.75;
  }
}

/** Builds the Terra-relative placement engine: a Terra pixel anchor (average
 * of the map's own "Terra"/"Sol" markers), a px→world-unit scale calibrated
 * off the overall 90th-percentile distance from Terra, and a lookup from
 * lowercased name to feature. */
function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

async function buildJamboniumIndex() {
  const features = (await fetchJamboniumFeatures()).filter((f) => PLACE_MARKER_TYPES.has(f.properties.marker));

  const terraCandidates = features.filter((f) => ["terra", "sol"].includes(f.properties.name.trim().toLowerCase()));
  const terraPx: [number, number] =
    terraCandidates.length > 0
      ? [
          terraCandidates.reduce((sum, f) => sum + f.geometry.coordinates[0], 0) / terraCandidates.length,
          terraCandidates.reduce((sum, f) => sum + f.geometry.coordinates[1], 0) / terraCandidates.length,
        ]
      : [0, 0];

  // The source map is a flat, non-circular illustration (its own bounding
  // box is ~3.5x wider than tall) rather than a face-on view of the galaxy
  // — more like a tilted/stretched projection. Squash-correct it before
  // converting to polar: equalize the spread along each raw axis (relative
  // to Terra) so the point cloud fills a disc instead of an ellipse, while
  // preserving each point's relative neighborhood and direction.
  const dxs = features.map((f) => f.geometry.coordinates[0] - terraPx[0]);
  const dys = features.map((f) => f.geometry.coordinates[1] - terraPx[1]);
  const stdX = standardDeviation(dxs) || 1;
  const stdY = standardDeviation(dys) || 1;
  const stretchX = stdY / stdX;
  const stretchY = 1;

  const correctedOffset = (px: number, py: number): [number, number] => [
    (px - terraPx[0]) * stretchX,
    (py - terraPx[1]) * stretchY,
  ];

  const pxDistance = (px: number, py: number) => {
    const [cx, cy] = correctedOffset(px, py);
    return Math.hypot(cx, cy);
  };
  const distances = features
    .map((f) => pxDistance(f.geometry.coordinates[0], f.geometry.coordinates[1]))
    .sort((a, b) => a - b);
  const p90 = distances[Math.floor(distances.length * 0.9)] || 1;
  const pxToUnit = 50 / p90;

  const byName = new Map<string, JamboniumFeature>();
  for (const f of features) {
    const key = f.properties.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, f);
  }

  function worldPosition(f: JamboniumFeature, seed: number): [number, number, number] {
    const [px, py] = f.geometry.coordinates;
    const [cx, cy] = correctedOffset(px, py);
    const distPx = Math.hypot(cx, cy);
    // Screen/map Y increases downward; flip so angle follows the same
    // math convention (CCW from +X) used everywhere else in this file.
    const angleDeg = (Math.atan2(-cy, cx) * 180) / Math.PI;
    const distUnits = Math.min(distPx * pxToUnit, GALAXY_RADIUS - 2);
    const rng = mulberry32(seed);
    const jitter = (rng() - 0.5) * 0.5; // avoid exact-duplicate coordinates z-fighting
    const [x, z] = toXZ(angleDeg, Math.max(0.2, distUnits + jitter));
    const y = (rng() - 0.5) * 2;
    return [x, y, z];
  }

  return { features, byName, worldPosition };
}

// ---- main ----

interface ScrapedSector {
  id: string;
  name: string;
  segmentumId: string | null;
  position: [number, number, number];
  radius: number;
  accuracy: number;
  sourceUrl: string;
}

interface ScrapedMember {
  id: string;
  name: string;
  type?: string;
  faction?: string;
  tags?: string[];
  summary: string;
  accuracy: number;
  sourceUrl?: string;
}

interface ScrapedSystem {
  id: string;
  name: string;
  position: [number, number, number];
  size: number;
  type?: string;
  faction?: string;
  sector?: string;
  segmentum?: string;
  imperium?: string;
  tags?: string[];
  summary: string;
  accuracy: number;
  sourceUrl?: string;
  members?: ScrapedMember[];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function modeOf(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function toMember(s: ScrapedSystem): ScrapedMember {
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    faction: s.faction,
    tags: s.tags,
    summary: s.summary,
    accuracy: s.accuracy,
    sourceUrl: s.sourceUrl,
  };
}

/** Bodies that share a system (from a "Sol System"-style location
 * breadcrumb, or a wiki infobox's `system` field) fold into one clickable
 * star point instead of each being independently plotted — Terra, Luna and
 * Mars show up as one "Sol System" marker with the three listed as members,
 * not three overlapping dots. */
function groupIntoSystems(systems: ScrapedSystem[], systemKeyById: Map<string, string>): ScrapedSystem[] {
  const groups = new Map<string, ScrapedSystem[]>();
  const displayNameByKey = new Map<string, string>();
  const result: ScrapedSystem[] = [];

  for (const entry of systems) {
    const key = systemKeyById.get(entry.id);
    if (!key) {
      result.push(entry);
      continue;
    }
    const lower = key.toLowerCase();
    if (!displayNameByKey.has(lower)) displayNameByKey.set(lower, key);
    if (!groups.has(lower)) groups.set(lower, []);
    groups.get(lower)!.push(entry);
  }

  for (const [lower, rawMembers] of groups) {
    // The same real body can show up twice — once matched from the wiki
    // scrape, once as a separate Jambonium feature that didn't happen to be
    // the one matched to that wiki page. Dedupe by name, keeping whichever
    // copy has the higher position accuracy.
    const byName = new Map<string, ScrapedSystem>();
    for (const m of rawMembers) {
      const key = m.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing || m.accuracy > existing.accuracy) byName.set(key, m);
    }
    const members = [...byName.values()];

    if (members.length < 2) {
      result.push(...members);
      continue;
    }

    const displayName = displayNameByKey.get(lower)!;
    const primaryName = slugify(displayName.replace(/\s*system$/i, ""));
    const starMember = members.find((m) => m.type === "star") ?? members.find((m) => slugify(m.name) === primaryName);

    const centroid: [number, number, number] = [0, 0, 0];
    for (const m of members) {
      centroid[0] += m.position[0] / members.length;
      centroid[1] += m.position[1] / members.length;
      centroid[2] += m.position[2] / members.length;
    }

    const accuracy = Math.max(...members.map((m) => m.accuracy));
    const sourceUrl = starMember?.sourceUrl ?? members.find((m) => m.sourceUrl)?.sourceUrl;

    const tagSet = new Set<string>();
    for (const m of members) for (const t of m.tags ?? []) tagSet.add(t);

    const memberNames = members.map((m) => m.name).sort((a, b) => a.localeCompare(b));
    const shown = memberNames.slice(0, 6).join(", ");
    const rest = memberNames.length > 6 ? `, +${memberNames.length - 6} more` : "";

    result.push({
      id: `system-${slugify(displayName)}`,
      name: displayName,
      position: starMember?.position ?? centroid,
      size: 0.6 + Math.min(0.9, accuracy) * 0.35 + Math.min(members.length, 10) * 0.02,
      type: "system",
      faction: starMember?.faction,
      sector: modeOf(members.map((m) => m.sector)),
      segmentum: modeOf(members.map((m) => m.segmentum)),
      imperium: modeOf(members.map((m) => m.imperium)),
      tags: tagSet.size > 0 ? [...tagSet].slice(0, 14) : undefined,
      summary: `Star system with ${members.length} known bodies: ${shown}${rest}.`,
      accuracy,
      sourceUrl,
      members: members
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toMember),
    });
  }

  return result;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const limit = process.env.SCRAPE_LIMIT ? Number(process.env.SCRAPE_LIMIT) : undefined;

  const jambo = await buildJamboniumIndex();
  console.log(`Jambonium index ready: ${jambo.features.length} placeable features.`);
  const matchedJamboIds = new Set<string>();

  console.log("Fetching sector list...");
  let sectorPages = await fetchAllCategoryMembers("Sector", "page");
  console.log(`  ${sectorPages.length} candidate sector/region pages`);
  if (limit) sectorPages = sectorPages.slice(0, limit);

  const sectors: ScrapedSector[] = [];

  for (const page of sectorPages) {
    if (/^Category:/.test(page.title)) continue;
    if (/^(Sector lord|Sub-sector)$/i.test(page.title)) continue; // meta/glossary pages, not places

    const content = await fetchPageContent(page.title);
    if (!content) continue;
    const infobox = parseInfobox(content.wikitext);

    const seg =
      findSegmentum(infobox.segmentum) ??
      findSegmentum(content.categories.join(" ")) ??
      findSegmentum(content.wikitext.slice(0, 2000));

    const dd = extractDistanceDirection(content.wikitext);
    const seed = seedFromString(page.title);

    let placement: PlacementResult;
    if (dd) placement = placeWithDistanceDirection(dd, seed, seg);
    else if (seg) placement = placeWithinSegmentum(seg, seed);
    else placement = placeUnknown(seed);

    const id = slugify(page.title);
    sectors.push({
      id,
      name: page.title,
      segmentumId: seg?.id ?? null,
      position: placement.position, // local, Terra-relative — offset applied once at write time
      radius: 6,
      accuracy: placement.accuracy,
      sourceUrl: WIKI_BASE + encodeURIComponent(page.title.replace(/ /g, "_")),
    });
    console.log(`  sector: ${page.title} -> ${seg?.id ?? "unknown"} (acc ${placement.accuracy.toFixed(2)})`);
  }

  console.log("\nFetching planet/world list...");
  const rootMembers = await fetchAllCategoryMembers("Planets", "page");
  const subcats = await fetchAllCategoryMembers("Planets", "subcat");
  const byId = new Map<number, { pageid: number; ns: number; title: string }>();
  for (const p of rootMembers) byId.set(p.pageid, p);
  for (const sub of subcats) {
    const subName = sub.title.replace(/^Category:/, "");
    const members = await fetchAllCategoryMembers(subName, "page");
    for (const p of members) byId.set(p.pageid, p);
    console.log(`  +${members.length} from ${subName}`);
  }
  let candidatePages = [...byId.values()].filter((p) => p.ns === 0);
  console.log(`  ${candidatePages.length} unique candidate world pages`);
  if (limit) candidatePages = candidatePages.slice(0, limit);

  const sectorNameById = new Map(sectors.map((s) => [s.name.toLowerCase(), s]));

  const systems: ScrapedSystem[] = [];
  const systemKeyById = new Map<string, string>();
  let i = 0;
  for (const page of candidatePages) {
    i++;
    if (i % 25 === 0) console.log(`  ...${i}/${candidatePages.length}`);

    const content = await fetchPageContent(page.title);
    if (!content) continue;
    const infobox = parseInfobox(content.wikitext);

    const jamboMatch = jambo.byName.get(page.title.trim().toLowerCase());

    const segFromInfobox = findSegmentum(infobox.segmentum);
    const segFromCategories = findSegmentum(content.categories.join(" "));
    const segFromJambo = jamboMatch ? findSegmentum(jamboMatch.properties.location) : null;
    const seg = segFromInfobox ?? segFromCategories ?? segFromJambo;

    const sectorField = infobox.sector;
    const matchedSector = sectorField ? sectorNameById.get(sectorField.toLowerCase()) : undefined;
    const sectorByCategory = sectors.find((s) => content.categories.some((c) => c === s.name));
    const sector = matchedSector ?? sectorByCategory;

    const dd = extractDistanceDirection(content.wikitext);
    const seed = seedFromString(page.title);

    let placement: PlacementResult;
    if (jamboMatch) {
      // A real, curated reference position beats any guess below — Terra,
      // Luna and Mars all resolve to (near enough) the same point this way,
      // instead of being scattered independently.
      placement = {
        position: jambo.worldPosition(jamboMatch, seed),
        accuracy: confidenceToAccuracy(jamboMatch.notes?.confidence),
      };
      matchedJamboIds.add(jamboMatch.properties.id);
    } else if (dd) {
      placement = placeWithDistanceDirection(dd, seed, seg ?? null);
    } else if (sector) {
      placement = placeNearAnchor(sector.position, seed, 4);
    } else if (seg) {
      placement = placeWithinSegmentum(seg, seed);
    } else {
      placement = placeUnknown(seed);
    }

    const type = infobox.type;
    const faction = infobox.affiliation;
    const jamboExtra = jamboMatch ? jamboExtraFacts(jamboMatch) : { tags: [], imperium: undefined };
    const tags = [...(type?.split(",") ?? []), ...(faction?.split(",") ?? []), ...jamboExtra.tags]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const summaryParts: string[] = [];
    if (type) summaryParts.push(type);
    if (sector) summaryParts.push(`in ${sector.name}`);
    else if (seg) summaryParts.push(`in ${seg.name}`);
    if (faction) summaryParts.push(`affiliated with ${faction}`);
    const summary = summaryParts.length > 0 ? `${summaryParts.join(", ")}.` : "Location and details unconfirmed.";

    const entryId = slugify(page.title);
    systems.push({
      id: entryId,
      name: page.title,
      position: placement.position,
      size: 0.45 + Math.min(0.9, placement.accuracy) * 0.35,
      type,
      faction,
      sector: sector?.name,
      segmentum: seg?.name,
      imperium: jamboExtra.imperium,
      tags: tags.length > 0 ? tags : undefined,
      summary,
      accuracy: placement.accuracy,
      sourceUrl: WIKI_BASE + encodeURIComponent(page.title.replace(/ /g, "_")),
    });

    const systemKey = (jamboMatch && jamboSystemName(jamboMatch.properties.location)) || infobox.system;
    if (systemKey) systemKeyById.set(entryId, systemKey);
  }

  console.log(`\nCollected ${sectors.length} sectors, ${systems.length} wiki-sourced systems.`);

  console.log("Importing additional Jambonium POIs not already covered...");
  const usedIds = new Set(systems.map((s) => s.id));
  let jamboAdded = 0;
  for (const f of jambo.features) {
    if (matchedJamboIds.has(f.properties.id)) continue;

    const name = f.properties.name.trim();
    if (!name) continue;
    const isQuality =
      f.properties.importance === "Major" ||
      Boolean(f.properties.info?.trim()) ||
      Boolean(f.notes?.lexicanum?.trim()) ||
      Boolean(f.notes?.wikia?.trim());
    if (!isQuality) continue;

    const seed = seedFromString(`jambo-${f.properties.id}`);
    const accuracy = confidenceToAccuracy(f.notes?.confidence);
    const seg = findSegmentum(f.properties.location);
    const sectorName = jamboSectorName(f.properties.location);
    const jamboExtra = jamboExtraFacts(f);

    const tags = [f.properties.marker, f.properties.affiliation, f.properties.faction, f.properties.climate, ...jamboExtra.tags]
      .flatMap((t) => (t ?? "").split(","))
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const summaryParts: string[] = [f.properties.marker.charAt(0).toUpperCase() + f.properties.marker.slice(1)];
    if (sectorName) summaryParts.push(`in ${sectorName}`);
    else if (seg) summaryParts.push(`in ${seg.name}`);
    if (f.properties.affiliation) summaryParts.push(`affiliated with ${f.properties.affiliation}`);
    const summary = `${summaryParts.join(", ")}.`;

    const sourceUrl = f.notes?.lexicanum?.trim()
      ? `https://wh40k.lexicanum.com/wiki/${encodeURIComponent(f.notes.lexicanum.trim())}`
      : f.notes?.wikia?.trim()
        ? WIKI_BASE + encodeURIComponent(f.notes.wikia.trim())
        : undefined;

    let id = `jambo-${f.properties.id}-${slugify(name)}`;
    if (usedIds.has(id)) id = `${id}-${f.properties.id}`;
    usedIds.add(id);

    systems.push({
      id,
      name,
      position: jambo.worldPosition(f, seed),
      size: 0.45 + Math.min(0.9, accuracy) * 0.35,
      type: f.properties.marker,
      faction: f.properties.affiliation || f.properties.faction || undefined,
      sector: sectorName,
      segmentum: seg?.name,
      imperium: jamboExtra.imperium,
      tags: tags.length > 0 ? tags : undefined,
      summary,
      accuracy,
      sourceUrl,
    });

    const systemKey = jamboSystemName(f.properties.location);
    if (systemKey) systemKeyById.set(id, systemKey);
    jamboAdded++;
  }
  console.log(`  +${jamboAdded} new systems imported from Jambonium -> ${systems.length} total.`);

  const grouped = groupIntoSystems(systems, systemKeyById);
  console.log(
    `Grouped into stars: ${systems.length} bodies -> ${grouped.length} top-level points ` +
      `(${systems.length - grouped.length} folded into multi-body systems).`
  );

  const outSectors = sectors.map((s) => ({ ...s, position: addOffset(s.position) }));
  const outSystems = grouped.map((s) => ({ ...s, position: addOffset(s.position) }));

  await writeFile(path.join(OUT_DIR, "sectors.json"), JSON.stringify(outSectors, null, 2));
  await writeFile(path.join(OUT_DIR, "starSystems.json"), JSON.stringify(outSystems, null, 2));
  console.log("Wrote src/data/sectors.json and src/data/starSystems.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
