/** Types for the IPS analytics plane (FastAPI) — live map + analytics pages. */

export interface LivePosition {
  device_id: string;
  building_id: string;
  /** Navimind Floor.level */
  floor: number;
  /** Meters, floor-plan frame (origin top-left, +x right, +y down). */
  x: number;
  y: number;
  accuracy?: number;
  motion?: "walking" | "stationary";
  /** POI id whose zone rect contains x/y — resolved server-side. */
  room_id?: string | null;
  ts?: number;
}

export interface DeviceStatus {
  device_id: string;
  building_id?: string;
  floor?: number;
  state?: string;
  battery?: number;
  connected?: boolean;
  ts?: number;
}

export interface CrowdAlert {
  room_id: string;
  room_name: string;
  floor: number;
  building_id: string;
  count: number;
  threshold: number;
  ts: number;
}

export type WsMessage =
  | { type: "snapshot"; items: LivePosition[]; active_alerts: CrowdAlert[] }
  | ({ type: "position" } & LivePosition)
  | ({ type: "status" } & DeviceStatus)
  | ({ type: "alert"; level: "warning" | "clear" } & CrowdAlert);

export interface IpsHealth {
  status: string;
  mqtt_connected: boolean;
  redis_connected: boolean;
  postgres_connected: boolean;
  geometry_synced: boolean;
  geometry_updated_at: string | null;
}

export interface LivePositionsResponse {
  count: number;
  items: LivePosition[];
}

export interface ActiveAlertsResponse {
  count: number;
  items: CrowdAlert[];
}

export interface FloorOccupancyPoint {
  bucket: string;
  device_count: number;
}

export interface FloorOccupancyResponse {
  building_id: string;
  floor: number;
  minutes: number;
  items: FloorOccupancyPoint[];
}

export interface TopRoomItem {
  room_id: string;
  name: string;
  floor: number;
  total_visits: number;
}

export interface TopRoomsResponse {
  building_id: string;
  minutes: number;
  items: TopRoomItem[];
}

export interface RoomHeatItem {
  room_id: string;
  total_visits: number;
  /** 0-1, normalized against the busiest room in the window. */
  intensity: number;
}

export interface RoomHeatmapResponse {
  building_id: string;
  floor: number;
  minutes: number;
  peak_visits: number;
  items: RoomHeatItem[];
}

export interface GridHeatItem {
  col: number;
  row: number;
  /** Top-left corner of the cell, meters. */
  x: number;
  y: number;
  /** Position samples in this cell over the window (dwell — drives intensity). */
  samples: number;
  /** Distinct devices that passed through this cell. */
  devices: number;
  intensity: number;
}

export interface GridHeatmapResponse {
  building_id: string;
  floor: number;
  minutes: number;
  cell_meters: number;
  peak_samples: number;
  items: GridHeatItem[];
}
