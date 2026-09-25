import { create } from "zustand";
import type { StarSystem } from "../data/types";

interface GalaxyStore {
  hoveredId: string | null;
  /** The acquired target: ringed on the map, with a short summary callout. */
  selectedSystem: StarSystem | null;
  /** The full dossier side panel. Only the callout's button opens it —
   * clicking or searching a star just acquires it. */
  dossierOpen: boolean;
  /** Bumped every time a fly-to should trigger, even if the same star is
   * reselected, so CameraRig can distinguish "new request" from "no change". */
  focusNonce: number;

  setHovered: (id: string | null) => void;
  selectStar: (system: StarSystem) => void;
  clearSelection: () => void;
  openDossier: () => void;
  closeDossier: () => void;
}

export const useGalaxyStore = create<GalaxyStore>((set) => ({
  hoveredId: null,
  selectedSystem: null,
  dossierOpen: false,
  focusNonce: 0,

  setHovered: (id) => set({ hoveredId: id }),
  selectStar: (system) =>
    set((state) => ({
      selectedSystem: system,
      dossierOpen: false,
      focusNonce: state.focusNonce + 1,
    })),
  clearSelection: () => set({ selectedSystem: null, dossierOpen: false }),
  openDossier: () => set((state) => ({ dossierOpen: state.selectedSystem !== null })),
  closeDossier: () => set({ dossierOpen: false }),
}));
