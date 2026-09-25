import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GALAXY_SCALE, smoothstep } from "../../data/galaxyStructure";
import { GALAXY_SHADER_COMMON, galaxyClock } from "./galaxyShaderCommon";
import { GALAXY_STAR_FIELD } from "./galaxyStarField";

// Decorative stars woven through the cloud volume. Not data and not
// pickable (no pointer handlers, so R3F never raycasts them). Each star is
// dimmed by the coarse dust lying between it and the camera, so stars on
// the far side of a lane disappear into it. Zoomed in, two extra instances
// scatter faint companions around each star so close views stay dense.

const COMPANION_INSTANCES = 2;

const VERTEX = /* glsl */ `
${GALAXY_SHADER_COMMON}

uniform float uPixelRatio;
uniform float uZoomDetail;
attribute vec3 aColor;
attribute float aSize;
attribute float aInstance;
varying vec3 vColor;
varying float vHalo;

// Optical depth of coarse dust along star→eye, clipped to the dust slab.
float dustTransmission(vec3 star, vec3 eye) {
  vec3 d = eye - star;
  float len = length(d);
  vec3 dir = d / max(len, 1e-6);
  float tMin = 0.0, tMax = len;
  const float SLAB = 0.12;
  if (abs(dir.y) > 1e-5) {
    float ta = (-SLAB - star.y) / dir.y, tb = (SLAB - star.y) / dir.y;
    tMin = max(tMin, min(ta, tb));
    tMax = min(tMax, max(ta, tb));
  }
  if (tMax <= tMin) return 1.0;
  float span = tMax - tMin;
  float tau = 0.0;
  for (int k = 0; k < 4; k++) tau += coarseDust(star + dir * (tMin + span * (float(k) + 0.5) * 0.25));
  return exp(-min(tau * span * 0.25 * DUST_EXTINCTION, 10.0));
}

void main() {
  vec3 pos = position;
  float size = aSize;
  vec3 color = aColor;
  float reveal = 1.0;
  if (aInstance > 0.5) {
    uint key = uint(gl_VertexID) * 747796405u + uint(aInstance) * 2891336453u;
    vec3 rnd = vec3(hashUint(key), hashUint(key + 1013u), hashUint(key + 7919u));
    pos += (rnd * 2.0 - 1.0) * (0.25 + hashUint(key + 53u) * 0.7);
    size = 0.45 + rnd.x * 0.35;
    color = aColor / max(1.0, max(color.r, max(color.g, color.b))) * (0.35 + rnd.z * 0.35);
    reveal = uZoomDetail * (1.0 - smoothstep(10.0, 32.0, distance(pos, cameraPosition)));
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  if (reveal < 0.001) {
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vHalo = 0.0;
    return;
  }

  // Unresolved points: size grows only mildly when close. Below the minimum
  // drawn size, shrink brightness instead so faint stars don't alias.
  float px = size * uPixelRatio * clamp(80.0 / max(-mvPosition.z, 0.01), 0.4, 1.6) * 2.0;
  float minPx = 1.5 * uPixelRatio;
  float drawnPx = max(px, minPx);
  float energy = (px * px) / (drawnPx * drawnPx);
  gl_PointSize = drawnPx;

  float transmission = dustTransmission(worldToGalaxy(pos), worldToGalaxy(cameraPosition));
  vColor = color * energy * transmission * reveal;
  vHalo = smoothstep(0.9, 2.2, max(aColor.r, max(aColor.g, aColor.b)));
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vHalo;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Tight core; only rare bright stars get a soft halo.
  float profile = exp(-r2 * 10.0) + vHalo * exp(-r2 * 3.0) * 0.08;
  fragColor = vec4(vColor * profile, 1.0);
}
`;

export function GalaxyStars() {
  const gl = useThree((s) => s.gl);

  const { geometry, material } = useMemo(() => {
    const field = GALAXY_STAR_FIELD;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(field.positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(field.colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(field.sizes, 1));
    // Instance 0 is the star itself; the rest are zoom-only companions.
    const instances = Array.from({ length: COMPANION_INSTANCES + 1 }, (_, i) => i);
    geo.setAttribute("aInstance", new THREE.InstancedBufferAttribute(new Float32Array(instances), 1));
    geo.instanceCount = 1;

    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uZoomDetail: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geo, material: mat };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame((state) => {
    const camera = state.camera;
    const controls = state.controls as OrbitControlsImpl | null;
    const focusDistance = controls ? camera.position.distanceTo(controls.target) : camera.position.length();
    const zoomDetail = 1 - smoothstep(0.35 * GALAXY_SCALE, 1.1 * GALAXY_SCALE, focusDistance);
    material.uniforms.uZoomDetail.value = zoomDetail;
    material.uniforms.uTime.value = galaxyClock.time;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    geometry.instanceCount = zoomDetail > 0 ? COMPANION_INSTANCES + 1 : 1;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
