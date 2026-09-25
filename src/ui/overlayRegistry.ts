/** DOM nodes of the map overlay (MapOverlay, outside the Canvas) that
 * OverlayProjector (inside it) positions every frame. Written straight to
 * the DOM rather than through React state, so tracking the camera costs no
 * re-renders. */
export const LABEL_POOL_SIZE = 32;

export const overlayRegistry = {
  labels: [] as (HTMLDivElement | null)[],
  callout: null as HTMLDivElement | null,
  /** HUD panels star labels must keep clear of. */
  blockers: [] as (HTMLElement | null)[],
  /** Current on-screen radius of the selection ring (SelectionRing writes
   * it), so the callout's leader line starts at the ring's rim. */
  ringRadiusPx: 14,
};
