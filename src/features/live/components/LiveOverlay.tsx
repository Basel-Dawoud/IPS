import { useEffect, useReducer, useRef } from "react";
import { STATIONARY_COLOR, WALKING_COLOR } from "../heat";
import {
  LERP_DURATION_MS,
  STALE_TIMEOUT_MS,
  type DeviceEntry,
} from "../hooks/useLiveDevices";

interface LiveOverlayProps {
  /** Shared live device store — mutated by useLiveDevices, read here per frame. */
  devicesRef: React.RefObject<Map<string, DeviceEntry>>;
  floor: number;
  s: number;
  /** Called ~4×/s with counts so the page's status bar can show devices online. */
  onCounts?: (onFloor: number, total: number) => void;
}

const COUNT_REPORT_MS = 250;

/**
 * The moving device dots, ported from IPS drawDevices():
 * lerped prev→target motion (1s), fading trail (≤16 pts), accuracy halo,
 * breathing pulse while walking, green walking / amber stationary, id label,
 * 5s stale pruning. Runs a rAF loop that re-renders this subtree only — the
 * device store itself lives in a ref, so socket traffic never re-renders
 * the page. SVG elements in meter coords (accuracy halo radius IS meters).
 */
export function LiveOverlay({ devicesRef, floor, s, onCounts }: LiveOverlayProps) {
  const [, frame] = useReducer((n: number) => n + 1, 0);
  const lastCountReport = useRef(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const devices = devicesRef.current;
      if (devices) {
        for (const [id, d] of devices) {
          if (now - d.lastSeen > STALE_TIMEOUT_MS) devices.delete(id);
        }
        if (onCounts && now - lastCountReport.current > COUNT_REPORT_MS) {
          lastCountReport.current = now;
          let onFloor = 0;
          for (const d of devices.values()) if (d.floor === floor) onFloor += 1;
          onCounts(onFloor, devices.size);
        }
      }
      frame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [devicesRef, floor, onCounts]);

  const now = performance.now();
  const devices = devicesRef.current ? [...devicesRef.current.values()] : [];

  return (
    <g pointerEvents="none">
      {devices
        .filter((d) => d.floor === floor)
        .map((d) => {
          const t = Math.min(1, (now - d.animStart) / LERP_DURATION_MS);
          const x = d.prev.x + (d.target.x - d.prev.x) * t;
          const y = d.prev.y + (d.target.y - d.prev.y) * t;
          const color = d.motion === "stationary" ? STATIONARY_COLOR : WALKING_COLOR;
          // Breathing pulse while walking (ported): radius oscillates with time.
          const pulse =
            d.motion === "walking" ? 1 + 0.25 * Math.sin(now / 300) : 1;
          const r = s * 0.008;

          return (
            <g key={d.deviceId}>
              {/* Fading trail */}
              {d.trail.length > 1 ? (
                <polyline
                  points={d.trail.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.3}
                  strokeWidth={s * 0.0025}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {/* Accuracy halo — accuracy is meters and so is the viewBox. */}
              {d.accuracy > 0 ? (
                <circle cx={x} cy={y} r={d.accuracy} fill={color} fillOpacity={0.08} />
              ) : null}
              {/* Pulse ring */}
              <circle
                cx={x}
                cy={y}
                r={r * 1.8 * pulse}
                fill="none"
                stroke={color}
                strokeOpacity={0.45}
                strokeWidth={s * 0.0018}
              />
              {/* Core dot */}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={color}
                stroke="var(--background)"
                strokeWidth={s * 0.002}
              />
              {/* Short device id label */}
              <text
                x={x}
                y={y - r * 2.4}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={s * 0.014}
                opacity={0.85}
              >
                {d.deviceId.replace(/^user-/, "").slice(0, 8)}
              </text>
            </g>
          );
        })}
    </g>
  );
}
