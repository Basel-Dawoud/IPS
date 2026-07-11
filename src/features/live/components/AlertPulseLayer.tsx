import type { CrowdAlert } from "../types";
import type { HeatRoom } from "./HeatmapLayer";

interface AlertPulseLayerProps {
  /** Active crowd alerts keyed by room (POI) id. */
  alerts: Record<string, CrowdAlert>;
  /** POI zone rects for the active floor. */
  rooms: HeatRoom[];
  floor: number;
  s: number;
}

/** Red pulsing rect over each crowd-alerted room (ported from IPS drawAlertPulses). */
export function AlertPulseLayer({ alerts, rooms, floor, s }: AlertPulseLayerProps) {
  const rects = Object.values(alerts)
    .filter((alert) => alert.floor === floor)
    .map((alert) => ({ alert, room: rooms.find((r) => r.id === alert.room_id) }))
    .filter((entry): entry is { alert: CrowdAlert; room: HeatRoom } => !!entry.room);

  if (rects.length === 0) return null;

  return (
    <g pointerEvents="none">
      {rects.map(({ alert, room }) => (
        <g key={`alert-${alert.room_id}`}>
          <rect
            x={room.x}
            y={room.y}
            width={room.w}
            height={room.h}
            rx={s * 0.004}
            fill="#ef4444"
            stroke="#ef4444"
            strokeWidth={s * 0.004}
          >
            <animate
              attributeName="fill-opacity"
              values="0.45;0.12;0.45"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-opacity"
              values="1;0.35;1"
              dur="1.2s"
              repeatCount="indefinite"
            />
          </rect>
          <text
            x={room.x + room.w / 2}
            y={room.y + room.h / 2}
            textAnchor="middle"
            fill="#fff"
            fontSize={s * 0.02}
            fontWeight={700}
          >
            ⚠ {alert.count}
          </text>
        </g>
      ))}
    </g>
  );
}
