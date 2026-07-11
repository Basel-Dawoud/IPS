import { useMemo } from "react";
import type { FloorOccupancyPoint } from "../types";

interface HourlyChartProps {
  items: FloorOccupancyPoint[];
  className?: string;
}

/**
 * Occupancy bar chart over time (ported from analytics.html's hand-built
 * SVG bars): one bar per 5-min bucket, height scaled to the window peak.
 */
export function HourlyChart({ items, className }: HourlyChartProps) {
  const peak = useMemo(
    () => Math.max(1, ...items.map((p) => p.device_count)),
    [items],
  );

  if (items.length === 0) {
    return (
      <div className={`text-xs text-muted-foreground py-8 text-center ${className ?? ""}`}>
        No occupancy data in this window yet.
      </div>
    );
  }

  const W = 600;
  const H = 120;
  const gap = 2;
  // Cap bar width so sparse windows (few buckets) don't render as huge slabs.
  const barW = Math.max(2, Math.min(16, W / items.length - gap));

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className={className} width="100%">
      {items.map((p, i) => {
        const h = Math.max(2, (p.device_count / peak) * H);
        const x = i * (barW + gap);
        return (
          <g key={p.bucket}>
            <rect
              x={x}
              y={H - h}
              width={barW}
              height={h}
              rx={1.5}
              fill="var(--primary)"
              fillOpacity={0.35 + 0.65 * (p.device_count / peak)}
            >
              <title>
                {new Date(p.bucket).toLocaleTimeString()} — {p.device_count} device(s)
              </title>
            </rect>
          </g>
        );
      })}
      <text x={0} y={H + 14} fontSize={10} fill="var(--muted-foreground)">
        {new Date(items[0].bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </text>
      <text x={W} y={H + 14} fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
        {new Date(items[items.length - 1].bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </text>
    </svg>
  );
}
