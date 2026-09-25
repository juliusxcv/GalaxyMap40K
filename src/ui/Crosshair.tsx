/** Double-line registration crosshair, drawn in the amber signal color
 * (position it with a modifier class, see .viewport-frame / .dossier). */
export function Crosshair({ className = "" }: { className?: string }) {
  return (
    <svg className={`crosshair ${className}`} viewBox="0 0 34 34" aria-hidden="true">
      <path d="M15 0V34M19 0V34M0 15H34M0 19H34" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function FrameCrosshairs() {
  return (
    <>
      <Crosshair className="crosshair--tl" />
      <Crosshair className="crosshair--tr" />
      <Crosshair className="crosshair--bl" />
      <Crosshair className="crosshair--br" />
    </>
  );
}
