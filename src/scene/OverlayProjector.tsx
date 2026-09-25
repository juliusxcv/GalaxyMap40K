import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { StarSystem } from "../data/types";
import { SOL_SYSTEM_ID, TERRA_OFFSET } from "../data/galaxyRegions";
import { smoothstep } from "../data/galaxyStructure";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { useTelemetry } from "../store/useTelemetry";
import { LABEL_POOL_SIZE, overlayRegistry } from "../ui/overlayRegistry";

// Star labels: Sol's is always on. Every other system's name appears only
// at the closest zoom levels (camera within LABEL_ZOOM_NONE of the orbit
// target, fully by LABEL_ZOOM_FULL; OrbitControls' minimum is 2), for
// stars near the camera, decluttered in screen space.
const LABEL_ZOOM_FULL = 4.5;
const LABEL_ZOOM_NONE = 7;
const LABEL_RANGE = 10;
/** Screen-space box two labels may not share (labels run to the right). */
const LABEL_GAP_X = 84;
const LABEL_GAP_Y = 16;
/** Labels sit just right of and below their star, as on the terminal chart. */
const LABEL_OFFSET_X = 9;
const LABEL_OFFSET_Y = 2;
/** Beyond these, the callout flips to the other side of its star. */
const CALLOUT_FLIP_RIGHT_PX = 330;
const CALLOUT_FLIP_BOTTOM_PX = 230;

const LY_PER_UNIT = 2000;
const TELEMETRY_INTERVAL = 0.1;
/** HUD panel rectangles are re-read this often (layout rarely moves). */
const BLOCKER_INTERVAL = 0.25;
/** Rough label box for the HUD-overlap test: 10px mono, tracked. */
const LABEL_CHAR_PX = 6.6;
const LABEL_HEIGHT_PX = 12;
/** The leader line is drawn for a 14px ring; bigger rings push it out. */
const CALLOUT_BASE_RING_PX = 14;

const tmp = new THREE.Vector3();

interface Placed {
  index: number;
  x: number;
  y: number;
  distance: number;
  opacity: number;
}

/** Signed, zero-padded kilo-light-year group for the CORD. readout. */
function cordGroup(units: number): string {
  const kly = Math.min(999, Math.round(Math.abs(units * (LY_PER_UNIT / 1000))));
  return `${units < -0.25 ? "-" : ""}${String(kly).padStart(3, "0")}`;
}

/** Positions the DOM overlay (star labels, target callout) and publishes
 * camera telemetry for the HUD readouts. Runs after the camera has moved
 * this frame (priority 0.6: after OrbitControls and CameraRig). */
export function OverlayProjector({ systems }: { systems: StarSystem[] }) {
  const positions = useMemo(() => systems.map((s) => new THREE.Vector3(...s.position)), [systems]);
  const solIndex = useMemo(() => systems.findIndex((s) => s.id === SOL_SYSTEM_ID), [systems]);
  const assigned = useRef<number[]>([]);
  const telemetryClock = useRef(0);
  const blockerClock = useRef(Infinity);
  const blockerRects = useRef<DOMRect[]>([]);

  useFrame((state, delta) => {
    const { camera, size } = state;
    const controls = state.controls as OrbitControlsImpl | null;
    camera.updateMatrixWorld();
    const focusDistance = controls ? camera.position.distanceTo(controls.target) : camera.position.length();

    // Screen position of a world point, or null when behind the camera.
    const project = (point: THREE.Vector3) => {
      tmp.copy(point).project(camera);
      if (tmp.z > 1) return null;
      return { x: (tmp.x * 0.5 + 0.5) * size.width, y: (1 - (tmp.y * 0.5 + 0.5)) * size.height };
    };

    telemetryClock.current += delta;
    if (telemetryClock.current >= TELEMETRY_INTERVAL) {
      telemetryClock.current = 0;
      const target = controls?.target ?? tmp.set(0, 0, 0);
      const cord = `${cordGroup(target.x - TERRA_OFFSET[0])}.${cordGroup(target.y)}.${cordGroup(target.z - TERRA_OFFSET[2])}`;
      const range = `${(focusDistance * (LY_PER_UNIT / 1000)).toFixed(1).padStart(5, "0")} KLY`;
      const telemetry = useTelemetry.getState();
      if (telemetry.cord !== cord || telemetry.range !== range) telemetry.set(cord, range);
    }

    const { selectedSystem, dossierOpen } = useGalaxyStore.getState();
    // The acquired target while its callout is up (it hides behind the dossier).
    const calloutTarget = dossierOpen ? null : selectedSystem;

    const callout = overlayRegistry.callout;
    if (callout && calloutTarget) {
      const screen = project(tmp.set(...calloutTarget.position));
      if (screen) {
        const left = screen.x > size.width - CALLOUT_FLIP_RIGHT_PX;
        const up = screen.y > size.height - CALLOUT_FLIP_BOTTOM_PX;
        // Slide the whole callout out along the leader's diagonal so the
        // line starts on the ring's rim however large the ring has grown.
        const push = Math.max(0, overlayRegistry.ringRadiusPx - CALLOUT_BASE_RING_PX) * Math.SQRT1_2;
        const x = screen.x + (left ? -push : push);
        const y = screen.y + (up ? -push : push);
        callout.style.visibility = "visible";
        callout.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        callout.dataset.side = left ? "left" : "right";
        callout.dataset.vside = up ? "up" : "down";
      } else {
        callout.style.visibility = "hidden";
      }
    }

    blockerClock.current += delta;
    if (blockerClock.current >= BLOCKER_INTERVAL) {
      blockerClock.current = 0;
      blockerRects.current = overlayRegistry.blockers.flatMap((el) => (el ? [el.getBoundingClientRect()] : []));
    }
    // Labels keep clear of the HUD panels instead of sliding under their text.
    const hitsHud = (x: number, y: number, name: string) => {
      const right = x + name.length * LABEL_CHAR_PX;
      const bottom = y + LABEL_HEIGHT_PX;
      return blockerRects.current.some((r) => x < r.right && right > r.left && y < r.bottom && bottom > r.top);
    };

    const placed: Placed[] = [];
    const consider = (index: number, opacity: number) => {
      if (calloutTarget && systems[index].id === calloutTarget.id) return; // the callout names it
      const distance = camera.position.distanceTo(positions[index]);
      const screen = project(positions[index]);
      if (!screen || screen.x < -20 || screen.y < -20 || screen.x > size.width || screen.y > size.height) return;
      if (hitsHud(screen.x + LABEL_OFFSET_X, screen.y + LABEL_OFFSET_Y, systems[index].name)) return;
      placed.push({ index, x: screen.x, y: screen.y, distance, opacity });
    };

    if (solIndex >= 0) consider(solIndex, 1);
    const zoom = 1 - smoothstep(LABEL_ZOOM_FULL, LABEL_ZOOM_NONE, focusDistance);
    if (zoom > 0.001) {
      for (let i = 0; i < systems.length; i++) {
        if (i === solIndex) continue;
        const distance = camera.position.distanceTo(positions[i]);
        if (distance > LABEL_RANGE) continue;
        consider(i, zoom * (1 - smoothstep(LABEL_RANGE * 0.6, LABEL_RANGE, distance)));
      }
    }

    // Sol first, then nearest first; drop anything that would overlap.
    placed.sort((a, b) => (a.index === solIndex ? -1 : b.index === solIndex ? 1 : a.distance - b.distance));
    const accepted: Placed[] = [];
    for (const p of placed) {
      if (accepted.length === LABEL_POOL_SIZE) break;
      if (accepted.some((a) => Math.abs(a.x - p.x) < LABEL_GAP_X && Math.abs(a.y - p.y) < LABEL_GAP_Y)) continue;
      accepted.push(p);
    }

    for (let k = 0; k < LABEL_POOL_SIZE; k++) {
      const el = overlayRegistry.labels[k];
      if (!el) continue;
      const p = accepted[k];
      if (!p || p.opacity < 0.01) {
        if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
        continue;
      }
      if (assigned.current[k] !== p.index) {
        assigned.current[k] = p.index;
        el.textContent = systems[p.index].name;
        el.classList.toggle("is-sol", p.index === solIndex);
      }
      el.style.visibility = "visible";
      el.style.opacity = String(p.opacity);
      el.style.transform = `translate3d(${p.x + LABEL_OFFSET_X}px, ${p.y + LABEL_OFFSET_Y}px, 0)`;
    }
  }, 0.6);

  return null;
}
