import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useGalaxyStore } from "../store/useGalaxyStore";
import { GALAXY_RADIUS } from "../data/proceduralGalaxy";
import { TERRA_OFFSET } from "../data/galaxyRegions";

const FLY_DURATION = 1.1; // seconds

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface FlyAnimation {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
}

// three.js's Points raycasting threshold is a constant world-space radius
// tested against the *entire ray* (near plane to far plane), not just near
// the orbit target's depth — so it can't be made too generous: a star that
// happens to sit almost exactly along the same ray direction as the one
// you're aiming at, even if it's sixty units away at a completely different
// depth, has a small perpendicular distance to that ray and gets caught as
// a false candidate too. (Confirmed by testing: widening this to several
// world units did exactly that — centered dead-on on an isolated star,
// clicks resolved to an unrelated star elsewhere in the galaxy that
// happened to line up along the same ray.) So this pass stays a modest,
// bounded net — generous enough to tolerate the target-distance proxy
// being a little off, not so generous it starts matching stars at the
// wrong depth entirely. The precise, actually-centered decision happens
// downstream in Picking.tsx, which re-ranks whatever this net catches by
// real screen-pixel distance to the cursor and picks whichever is
// genuinely nearest there, rejecting anything outside a tight pixel radius
// — so an occasional wrong-depth false candidate this net lets through
// only matters if it's also, coincidentally, closer on screen.
const CLICK_TARGET_PX = 22;
const CLICK_THRESHOLD_MIN = 0.02;
const CLICK_THRESHOLD_MAX = 1.8;

/** OrbitControls for free rotate/pan/zoom, plus an eased fly-to animation
 * that runs whenever a new star is selected in the store. */
export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, raycaster, size } = useThree();
  const selectedSystem = useGalaxyStore((s) => s.selectedSystem);
  const focusNonce = useGalaxyStore((s) => s.focusNonce);
  const animRef = useRef<FlyAnimation | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!selectedSystem || !controls) return;

    const targetPos = new THREE.Vector3(...selectedSystem.position);
    const offsetDir = camera.position.clone().sub(controls.target);
    // Keep the current zoom distance instead of snapping to a fixed focus
    // distance — flying to a star should pan the view, not also zoom out.
    const currentDistance = offsetDir.length() || 1;
    if (offsetDir.lengthSq() < 1e-6) offsetDir.set(0, 0.3, 1);
    offsetDir.normalize();
    const desiredCamPos = targetPos.clone().add(offsetDir.multiplyScalar(currentDistance));

    if (prefersReducedMotion()) {
      camera.position.copy(desiredCamPos);
      controls.target.copy(targetPos);
      controls.update();
      animRef.current = null;
      return;
    }

    animRef.current = {
      fromPos: camera.position.clone(),
      toPos: desiredCamPos,
      fromTarget: controls.target.clone(),
      toTarget: targetPos,
      t: 0,
    };
    // Only a new selection (focusNonce) should start a fly-to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (controls && raycaster.params.Points && camera instanceof THREE.PerspectiveCamera) {
      const distance = camera.position.distanceTo(controls.target);
      const verticalFovRad = THREE.MathUtils.degToRad(camera.fov);
      const worldUnitsPerPixel = (2 * Math.tan(verticalFovRad / 2) * distance) / size.height;
      raycaster.params.Points.threshold = THREE.MathUtils.clamp(
        worldUnitsPerPixel * CLICK_TARGET_PX,
        CLICK_THRESHOLD_MIN,
        CLICK_THRESHOLD_MAX
      );
    }

    const anim = animRef.current;
    if (!anim || !controls) return;

    anim.t = Math.min(1, anim.t + delta / FLY_DURATION);
    const eased = 1 - Math.pow(1 - anim.t, 3);

    camera.position.lerpVectors(anim.fromPos, anim.toPos, eased);
    controls.target.lerpVectors(anim.fromTarget, anim.toTarget, eased);
    controls.update();

    if (anim.t >= 1) animRef.current = null;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={TERRA_OFFSET}
      enableDamping
      dampingFactor={0.08}
      minDistance={2}
      maxDistance={GALAXY_RADIUS * 1.8}
      makeDefault
    />
  );
}
