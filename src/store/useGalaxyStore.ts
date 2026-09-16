import { create } from "zustand";
import type { StarSystem } from "../data/types";

interface GalaxyStore {
  hoveredId: string | null;
  selectedSystem: StarSystem | null;
  /** Bumped every time a fly-to should trigger, even if the same star is
   * reselected, so CameraRig can distinguish "new request" from "no change". */
  focusNonce: number;

  setHovered: (id: string | null) => void;
  selectStar: (system: StarSystem) => void;
  clearSelection: () => void;
}

export const useGalaxyStore = create<GalaxyStore>((set) => ({
  hoveredId: null,
  selectedSystem: null,
  focusNonce: 0,

  setHovered: (id) => set({ hoveredId: id }),
  selectStar: (system) =>
    set((state) => ({
      selectedSystem: system,
      focusNonce: state.focusNonce + 1,
    })),
  clearSelection: () => set({ selectedSystem: null }),
}));
