import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { StarSystems } from "./scene/StarSystem";
import { CameraRig } from "./scene/CameraRig";
import { OverlayProjector } from "./scene/OverlayProjector";
import { SelectionRing } from "./scene/SelectionRing";
import { SegmentumBoundaries } from "./scene/SegmentumBoundaries";
import { SectorMarkers } from "./scene/SectorMarkers";
import { GalaxyVolume } from "./scene/galaxy/GalaxyVolume";
import { GalaxyStars } from "./scene/galaxy/GalaxyStars";
import { InfoPanel } from "./ui/InfoPanel";
import { Hud } from "./ui/Hud";
import { MapOverlay } from "./ui/MapOverlay";
import starSystemsData from "./data/starSystems.json";
import sectorsData from "./data/sectors.json";
import type { StarSystem, Sector } from "./data/types";
import { TERRA_OFFSET } from "./data/galaxyRegions";
import "./App.css";

const starSystems = starSystemsData as StarSystem[];
const sectors = sectorsData as Sector[];

function App() {
  return (
    <div className="app">
      <Canvas
        camera={{
          position: [TERRA_OFFSET[0], 22, TERRA_OFFSET[2] + 55],
          fov: 55,
          near: 0.1,
          far: 800,
        }}
        gl={{ antialias: true }}
        raycaster={{ params: { Mesh: {}, Line: { threshold: 1 }, LOD: {}, Points: { threshold: 0.175 }, Sprite: {} } }}
      >
        <color attach="background" args={["#020207"]} />
        <ambientLight intensity={0.4} />
        <GalaxyVolume />
        <GalaxyStars />
        <Suspense fallback={null}>
          <SegmentumBoundaries />
          <SectorMarkers sectors={sectors} />
          <StarSystems systems={starSystems} />
          <SelectionRing />
        </Suspense>
        <CameraRig />
        <OverlayProjector systems={starSystems} />
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.35} luminanceThreshold={0.35} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.7} />
        </EffectComposer>
      </Canvas>
      <MapOverlay />
      <Hud systems={starSystems} />
      <InfoPanel />
    </div>
  );
}

export default App;
