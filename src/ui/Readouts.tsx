import { useEffect, useState } from "react";
import { useTelemetry } from "../store/useTelemetry";
import { overlayRegistry } from "./overlayRegistry";

const pad = (n: number) => String(n).padStart(2, "0");

/** "TIME CORD. T 19:3857" — the local clock as a terminal time code. */
export function TimeCord() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="time-cord term-box">
      Time cord. T {pad(now.getHours())}:{pad(now.getMinutes())}
      {pad(now.getSeconds())}
    </div>
  );
}

/** Camera position (CORD.) and distance (SCAN RANGE) readouts. */
export function Readouts() {
  const cord = useTelemetry((s) => s.cord);
  const range = useTelemetry((s) => s.range);
  return (
    <div
      className="hud__readouts"
      ref={(el) => {
        overlayRegistry.blockers[2] = el;
      }}
    >
      <div className="readout">
        <span className="kicker">Cord.</span>
        <span className="readout__value term-box">{cord}</span>
      </div>
      <div className="readout">
        <span className="kicker">Scan range</span>
        <span className="readout__value term-box">{range}</span>
      </div>
    </div>
  );
}
