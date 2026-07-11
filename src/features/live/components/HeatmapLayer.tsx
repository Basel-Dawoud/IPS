import { useMemo } from "react";
import { heatAlpha, heatColor } from "../heat";
import type { GridHeatItem, RoomHeatItem } from "../types";

export interface HeatRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HeatmapLayerProps {
  /** POI zone rects for the active floor (meters). */
  rooms: HeatRoom[];
  /** Per-room intensity from /analytics/heatmap. */
  roomHeat?: RoomHeatItem[];
  /** Optional meter-grid density cells from /analytics/heatmap/grid. */
  gridHeat?: GridHeatItem[];
  gridCellMeters?: number;
  /** max(extentW, extentH) — the same size scalar FloorMapView uses. */
  s: number;
}

/**
 * Tints each room's zone rect with the IPS 4-stop heat ramp; optionally
 * overlays the raw meter-grid density (corridor traffic shows up here).
 * Rendered inside FloorMapView's meter-coordinate SVG.
 */
export function HeatmapLayer({ rooms, roomHeat, gridHeat, gridCellMeters, s }: HeatmapLayerProps) {
  const intensityByRoom = useMemo(
    () => new Map((roomHeat ?? []).map((item) => [item.room_id, item.intensity])),
    [roomHeat],
  );

  return (
    <g pointerEvents="none">
      {gridHeat && gridCellMeters
        ? gridHeat
            .filter((cell) => cell.intensity > 0)
            .map((cell) => (
              <rect
                key={`gh-${cell.col}-${cell.row}`}
                x={cell.x}
                y={cell.y}
                width={gridCellMeters}
                height={gridCellMeters}
                fill={heatColor(cell.intensity)}
                fillOpacity={heatAlpha(cell.intensity) * 0.6}
              />
            ))
        : null}

      {rooms.map((room) => {
        const intensity = intensityByRoom.get(room.id) ?? 0;
        if (intensity <= 0) return null;
        return (
          <rect
            key={`rh-${room.id}`}
            x={room.x}
            y={room.y}
            width={room.w}
            height={room.h}
            rx={s * 0.004}
            fill={heatColor(intensity)}
            fillOpacity={heatAlpha(intensity)}
            stroke={heatColor(intensity)}
            strokeOpacity={0.6}
            strokeWidth={s * 0.002}
          />
        );
      })}
    </g>
  );
}
