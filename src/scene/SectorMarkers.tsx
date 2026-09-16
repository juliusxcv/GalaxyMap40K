import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { Sector, StarSystem } from "../data/types";
import { SEGMENTA, TERRA_OFFSET } from "../data/galaxyRegions";
import { labelDistanceStyle, type LabelBand } from "./labelDistanceStyle";
import { polar, wedgeOutline, circleOutline, normalizeAngle } from "./polarGeometry";
import starSystemsData from "../data/starSystems.json";

const starSystems = starSystemsData as StarSystem[];

// Sectors are a closer-in layer than the segmenta: invisible while zoomed
// out over the galaxy (nothing to show yet), fully shown once you've zoomed
// past the overview, gone again once you're in close on individual stars.
const LABEL_BAND: LabelBand = { vanish: 5, fullNear: 10, fullFar: 35, appear: 55 };
const LINE_BASE_OPACITY = 0.4;

// Sector rings/labels used to inherit the location-confidence color scale
// (red→yellow→white), which put an out-of-place warm hue next to the
// segmentum wheel's own colors. A single fixed phosphor green (matching the
// rest of the Cogitator UI's accent) reads as "this is a sector marker",
// full stop — not another data encoding to parse.
const SECTOR_COLOR_HEX = "#7dec73"; // ≈ var(--color-phosphor), resolved to sRGB for the WebGL line material

interface SectorCell {
  sector: Sector;
  angleStart: number;
  angleEnd: number;
  radiusStart: number;
  radiusEnd: number;
  labelPos: THREE.Vector3;
}

function circularMeanDeg(anglesDeg: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const a of anglesDeg) {
    const rad = (a * Math.PI) / 180;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
  }
  return normalizeAngle((Math.atan2(sy, sx) * 180) / Math.PI);
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Lays each segmentum's sectors out as a grid of radial cells (concentric
 * rings × angular slices) inside that segmentum's own wedge, echoing the
 * canonical Imperial "sub-sectors within a segmentum" chart style — instead
 * of the free-floating circles used before. Each sector's ring/slice comes
 * from its real member stars' position when there are enough to trust (≥3),
 * falling back to the sector's own stored position otherwise, so the grid
 * reflects where a sector's systems actually are rather than an arbitrary
 * layout. */
function buildSectorCells(sectors: Sector[], stars: StarSystem[]): SectorCell[] {
  const cells: SectorCell[] = [];

  const bySegmentum = new Map<string, Sector[]>();
  for (const sector of sectors) {
    if (!sector.segmentumId) continue;
    const list = bySegmentum.get(sector.segmentumId) ?? [];
    list.push(sector);
    bySegmentum.set(sector.segmentumId, list);
  }

  for (const seg of SEGMENTA) {
    const segSectors = bySegmentum.get(seg.id);
    if (!segSectors || segSectors.length === 0) continue;

    const isFullCircle = seg.angleStart === null || seg.angleEnd === null;
    const angleStart = isFullCircle ? 0 : seg.angleStart!;
    const angleEnd = isFullCircle ? 360 : seg.angleEnd!;

    const placed = segSectors.map((sector) => {
      const members = stars.filter((s) => s.sector === sector.name);
      let angle: number;
      let radius: number;
      if (members.length >= 3) {
        const polarPts = members.map((m) => {
          const dx = m.position[0] - TERRA_OFFSET[0];
          const dz = m.position[2] - TERRA_OFFSET[2];
          return { r: Math.hypot(dx, dz), a: normalizeAngle((Math.atan2(dz, dx) * 180) / Math.PI) };
        });
        angle = circularMeanDeg(polarPts.map((p) => p.a));
        radius = median(polarPts.map((p) => p.r));
      } else {
        const dx = sector.position[0] - TERRA_OFFSET[0];
        const dz = sector.position[2] - TERRA_OFFSET[2];
        angle = normalizeAngle((Math.atan2(dz, dx) * 180) / Math.PI);
        radius = Math.hypot(dx, dz);
      }

      // Unwrap the angle onto [angleStart, angleStart + 360) so sorting and
      // midpoint math don't trip over the 0/360 seam.
      let relAngle = angle;
      while (relAngle < angleStart) relAngle += 360;
      while (relAngle >= angleStart + 360) relAngle -= 360;

      const clampedRadius = Math.min(Math.max(radius, seg.radiusInner), seg.radiusOuter);
      return { sector, angle: relAngle, radius: clampedRadius };
    });

    const ringCount = Math.max(1, Math.round(Math.sqrt(placed.length)));
    const sortedByRadius = [...placed].sort((a, b) => a.radius - b.radius);
    const ringGroups: (typeof placed)[] = [];
    for (let i = 0; i < ringCount; i++) {
      const start = Math.floor((i * sortedByRadius.length) / ringCount);
      const end = Math.floor(((i + 1) * sortedByRadius.length) / ringCount);
      ringGroups.push(sortedByRadius.slice(start, end));
    }

    const ringMedianRadius = ringGroups.map((g) => median(g.map((p) => p.radius)));
    const radialBounds: number[] = [seg.radiusInner];
    for (let i = 0; i < ringMedianRadius.length - 1; i++) {
      radialBounds.push((ringMedianRadius[i] + ringMedianRadius[i + 1]) / 2);
    }
    radialBounds.push(seg.radiusOuter);

    ringGroups.forEach((group, ringIdx) => {
      if (group.length === 0) return;
      const radiusStart = radialBounds[ringIdx];
      const radiusEnd = radialBounds[ringIdx + 1];
      const sortedByAngle = [...group].sort((a, b) => a.angle - b.angle);

      const angleBounds: number[] = [angleStart];
      for (let i = 0; i < sortedByAngle.length - 1; i++) {
        angleBounds.push((sortedByAngle[i].angle + sortedByAngle[i + 1].angle) / 2);
      }
      angleBounds.push(angleEnd);

      sortedByAngle.forEach((placedSector, i) => {
        const cellAngleStart = angleBounds[i];
        const cellAngleEnd = angleBounds[i + 1];
        const labelAngle = (cellAngleStart + cellAngleEnd) / 2;
        const labelRadius = (radiusStart + radiusEnd) / 2;
        cells.push({
          sector: placedSector.sector,
          angleStart: cellAngleStart,
          angleEnd: cellAngleEnd,
          radiusStart,
          radiusEnd,
          labelPos: new THREE.Vector3(...polar(labelRadius, labelAngle)),
        });
      });
    });
  }

  return cells;
}

function SectorCellMarker({ cell }: { cell: SectorCell }) {
  const labelRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<THREE.Line>(null);
  const { camera } = useThree();

  const points = useMemo(
    () => wedgeOutline(cell.radiusStart, cell.radiusEnd, cell.angleStart, cell.angleEnd, 24),
    [cell]
  );

  useFrame(() => {
    tmpVec.set(TERRA_OFFSET[0] + cell.labelPos.x, TERRA_OFFSET[1] + cell.labelPos.y, TERRA_OFFSET[2] + cell.labelPos.z);
    const distance = camera.position.distanceTo(tmpVec);
    const { scale, opacity } = labelDistanceStyle(distance, LABEL_BAND);

    const el = labelRef.current;
    if (el) {
      el.style.opacity = String(opacity * 0.85);
      el.style.transform = `scale(${scale})`;
    }
    const material = lineRef.current?.material;
    if (material && !Array.isArray(material)) {
      (material as THREE.Material & { opacity: number }).opacity = LINE_BASE_OPACITY * opacity;
    }
  });

  return (
    <group>
      {/* @ts-expect-error drei's Line ref forwards the underlying three.js Line object */}
      <Line ref={lineRef} points={points} color={SECTOR_COLOR_HEX} transparent opacity={LINE_BASE_OPACITY} dashed dashSize={1.2} gapSize={0.8} />
      <Html position={cell.labelPos} center zIndexRange={[1, 0]} pointerEvents="none">
        <div ref={labelRef} className="sector-label">
          {cell.sector.name}
        </div>
      </Html>
    </group>
  );
}

/** Fallback for the handful of sectors with no known parent segmentum
 * (segmentumId is null in the source data) — rendered the old way, as a
 * simple ring at their own stored position, since they can't be placed in
 * a segmentum's grid. */
function OrphanSectorMarker({ sector }: { sector: Sector }) {
  const labelRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<THREE.Line>(null);
  const { camera } = useThree();
  // sector.position is absolute (Terra-relative like everything else in the
  // data), but this marker renders inside the shared <group
  // position={TERRA_OFFSET}> along with the grid cells — so its own local
  // position needs TERRA_OFFSET subtracted back out.
  const localPosition = useMemo(
    () => new THREE.Vector3(sector.position[0] - TERRA_OFFSET[0], sector.position[1] - TERRA_OFFSET[1], sector.position[2] - TERRA_OFFSET[2]),
    [sector]
  );
  const points = useMemo(() => circleOutline(sector.radius), [sector.radius]);

  useFrame(() => {
    tmpVec.set(TERRA_OFFSET[0] + localPosition.x, TERRA_OFFSET[1] + localPosition.y, TERRA_OFFSET[2] + localPosition.z);
    const distance = camera.position.distanceTo(tmpVec);
    const { scale, opacity } = labelDistanceStyle(distance, LABEL_BAND);
    const el = labelRef.current;
    if (el) {
      el.style.opacity = String(opacity * 0.85);
      el.style.transform = `scale(${scale})`;
    }
    const material = lineRef.current?.material;
    if (material && !Array.isArray(material)) {
      (material as THREE.Material & { opacity: number }).opacity = LINE_BASE_OPACITY * opacity;
    }
  });

  return (
    <group position={localPosition}>
      {/* @ts-expect-error drei's Line ref forwards the underlying three.js Line object */}
      <Line ref={lineRef} points={points} color={SECTOR_COLOR_HEX} transparent opacity={LINE_BASE_OPACITY} dashed dashSize={1.2} gapSize={0.8} />
      <Html center zIndexRange={[1, 0]} pointerEvents="none">
        <div ref={labelRef} className="sector-label">
          {sector.name}
        </div>
      </Html>
    </group>
  );
}

const tmpVec = new THREE.Vector3();

export function SectorMarkers({ sectors }: { sectors: Sector[] }) {
  const cells = useMemo(() => buildSectorCells(sectors, starSystems), [sectors]);
  const orphans = useMemo(() => sectors.filter((s) => !s.segmentumId), [sectors]);

  return (
    <group position={TERRA_OFFSET}>
      {cells.map((cell) => (
        <SectorCellMarker key={cell.sector.id} cell={cell} />
      ))}
      {orphans.map((sector) => (
        <OrphanSectorMarker key={sector.id} sector={sector} />
      ))}
    </group>
  );
}
