import { create } from "zustand";

/** Camera telemetry for the HUD readouts, pre-formatted. Written by
 * OverlayProjector (throttled, and only when a value actually changes) so
 * the readouts re-render a few times a second at most. */
interface Telemetry {
  cord: string;
  range: string;
  set: (cord: string, range: string) => void;
}

export const useTelemetry = create<Telemetry>((set) => ({
  cord: "000.000.000",
  range: "000.0 KLY",
  set: (cord, range) => set({ cord, range }),
}));
