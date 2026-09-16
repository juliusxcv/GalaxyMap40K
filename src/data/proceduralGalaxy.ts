// Radius of the galactic disc used to size the segmentum wheel's reach and
// the camera's max zoom-out distance.
export const GALAXY_RADIUS = 75;
// Matches the scraper's segmentum radius bands (scripts/scrape-wiki.ts) so
// scraped positions line up with the boundaries drawn from galaxyRegions.ts.
// 9.6 ≈ the 95th percentile radius of stars actually labeled "Segmentum
// Solar" in the scraped data (see galaxyRegions.ts) — a data-fit value, not
// the original round-number guess.
export const SOLAR_RADIUS = 9.6;
