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

/** OrbitControls for free rotate/pan/zoom, plus an eased fly-to animation
 * that runs whenever a new star is selected in the store. */
export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
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
    const anim = animRef.current;
    const controls = controlsRef.current;
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
