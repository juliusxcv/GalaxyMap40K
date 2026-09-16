export interface SystemMember {
  id: string;
  name: string;
  type?: string;
  faction?: string;
  tags?: string[];
  summary: string;
  accuracy: number;
  sourceUrl?: string;
}

export interface StarSystem {
  id: string;
  name: string;
  position: [number, number, number];
  size: number;
  faction?: string;
  type?: string;
  sector?: string;
  segmentum?: string;
  /** Which side of the Great Rift (Cicatrix Maledictum): "Sanctus",
   * "Nihilus", or "Nihilus / Sanctus" for a straddling/contested system. */
  imperium?: string;
  tags?: string[];
  summary: string;
  /** Confidence in `position`, 0 (unknown, scattered) to 1 (an explicit
   * distance/direction from Terra was found in the source). Drives marker
   * color: bright blue-white = accurate, red = unknown. */
  accuracy: number;
  sourceUrl?: string;
  /** Other bodies in the same star system (planets, moons, stations...),
   * grouped here instead of each being its own top-level, clickable point. */
  members?: SystemMember[];
}

export interface Sector {
  id: string;
  name: string;
  segmentumId: string | null;
  position: [number, number, number];
  radius: number;
  accuracy: number;
  sourceUrl: string;
}
