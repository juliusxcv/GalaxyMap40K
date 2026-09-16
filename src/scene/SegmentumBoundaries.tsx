import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { SEGMENTA, TERRA_OFFSET } from "../data/galaxyRegions";
import { labelDistanceStyle, type LabelBand } from "./labelDistanceStyle";
import { polar, wedgeOutline, circleOutline } from "./polarGeometry";

// Invisible zoomed all the way out (so the galaxy itself reads clearly, not
// a wall of text), invisible up close (out of the way once inspecting
// individual stars), fully shown only in between. The boundary wireframes
// themselves are unaffected — those stay visible at every zoom level.
const LABEL_BAND: LabelBand = { vanish: 10, fullNear: 22, fullFar: 65, appear: 100 };

const tmpVec = new THREE.Vector3();

/** Thin wireframe boundaries for the five segmentae (Solar as a central
 * disc, the other four as quadrant wedges), per in-universe geography. */
export function SegmentumBoundaries() {
  const { camera } = useThree();
  const refs = useRef<Map<string, HTMLDivElement>>(new Map());

  const shapes = useMemo(
    () =>
      SEGMENTA.map((seg) => ({
        seg,
        points:
          seg.angleStart === null || seg.angleEnd === null
            ? circleOutline(seg.radiusOuter)
            : wedgeOutline(seg.radiusInner, seg.radiusOuter, seg.angleStart, seg.angleEnd),
        labelPos:
          seg.angleStart === null || seg.angleEnd === null
            ? new THREE.Vector3(0, 0.5, seg.radiusOuter * 0.55)
            : new THREE.Vector3(...polar(seg.radiusOuter * 0.92, (seg.angleStart + seg.angleEnd) / 2)),
      })),
    []
  );

  useFrame(() => {
    for (const { seg, labelPos } of shapes) {
      const el = refs.current.get(seg.id);
      if (!el) continue;
      tmpVec.set(TERRA_OFFSET[0] + labelPos.x, TERRA_OFFSET[1] + labelPos.y, TERRA_OFFSET[2] + labelPos.z);
      const distance = camera.position.distanceTo(tmpVec);
      const { scale, opacity } = labelDistanceStyle(distance, LABEL_BAND);
      el.style.opacity = String(opacity);
      el.style.transform = `scale(${scale})`;
    }
  });

  return (
    <group position={TERRA_OFFSET}>
      {shapes.map(({ seg, points, labelPos }) => (
        <group key={seg.id}>
          <Line points={points} color={seg.color} transparent opacity={0.35} lineWidth={1} />
          <Html position={labelPos} center zIndexRange={[1, 0]} pointerEvents="none">
            <div
              ref={(el) => {
                if (el) refs.current.set(seg.id, el);
                else refs.current.delete(seg.id);
              }}
              className="segmentum-label"
              style={{ color: seg.color }}
            >
              {seg.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
