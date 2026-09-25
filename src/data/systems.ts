import starSystemsData from "./starSystems.json";
import { CAMPAIGN_SYSTEMS } from "./campaignSystems";
import type { StarSystem } from "./types";

/** Every system on the map: the scraped reference data plus the campaign's
 * own systems. */
export const STAR_SYSTEMS: StarSystem[] = [...(starSystemsData as StarSystem[]), ...CAMPAIGN_SYSTEMS];
