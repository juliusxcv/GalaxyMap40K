import { useMemo } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";
import { SEGMENTA, SEGMENTUM_WEDGE_DEG, TERRA_OFFSET } from "../data/galaxyRegions";

function polar(radius: number, angleDeg: number): [number, number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * radius, 0, Math.sin(rad) * radius];
}

function wedgeOutline(
  radiusInner: number,
  radiusOuter: number,
  angleStartDeg: number,
  angleEndDeg: number,
  segments = 40
): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = angleStartDeg + ((angleEndDeg - angleStartDeg) * i) / segments;
    points.push(polar(radiusOuter, a));
  }
  for (let i = segments; i >= 0; i--) {
    const a = angleStartDeg + ((angleEndDeg - angleStartDeg) * i) / segments;
    points.push(polar(radiusInner, a));
  }
  points.push(points[0]);
  return points;
}

function circleOutline(radius: number, segments = 64): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(polar(radius, (360 * i) / segments));
  }
  return points;
}

/** Thin wireframe boundaries for the five segmentae (Solar as a central
 * disc, the other four as quadrant wedges), per in-universe geography. */
export function SegmentumBoundaries() {
  const shapes = useMemo(
    () =>
      SEGMENTA.map((seg) => ({
        seg,
        points:
          seg.centerAngleDeg === null
            ? circleOutline(seg.radiusOuter)
            : wedgeOutline(
                seg.radiusInner,
                seg.radiusOuter,
                seg.centerAngleDeg - SEGMENTUM_WEDGE_DEG / 2,
                seg.centerAngleDeg + SEGMENTUM_WEDGE_DEG / 2
              ),
        labelPos:
          seg.centerAngleDeg === null
            ? new THREE.Vector3(0, 0.5, seg.radiusOuter * 0.55)
            : new THREE.Vector3(...polar(seg.radiusOuter * 0.92, seg.centerAngleDeg)),
      })),
    []
  );

  return (
    <group position={TERRA_OFFSET}>
      {shapes.map(({ seg, points, labelPos }) => (
        <group key={seg.id}>
          <Line points={points} color={seg.color} transparent opacity={0.35} lineWidth={1} />
          <Html position={labelPos} center distanceFactor={30}>
            <div className="segmentum-label" style={{ color: seg.color }}>
              {seg.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
