/** Shared polar-coordinate helpers for the segmentum wheel and the sector
 * grid nested inside it — both are wedge-ring shapes on the same Terra-
 * centered polar system, just at different radii. */

export function polar(radius: number, angleDeg: number): [number, number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * radius, 0, Math.sin(rad) * radius];
}

/** Outline of an annulus sector ("wedge ring"): the closed loop of an arc at
 * radiusOuter from angleStart to angleEnd, back along an arc at radiusInner. */
export function wedgeOutline(
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

export function circleOutline(radius: number, segments = 64): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(polar(radius, (360 * i) / segments));
  }
  return points;
}

/** Normalize an angle (degrees) into [0, 360). */
export function normalizeAngle(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}
