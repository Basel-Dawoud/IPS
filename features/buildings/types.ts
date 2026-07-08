import type { EmergencyData } from "../emergency/use-emergency-alert";

export interface VectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VectorRoom {
  rects: VectorRect[];
  cx: number;
  cy: number;
}

/** Vector floor map (meter coords) derived from the grid by the backend. */
export interface VectorMap {
  cellSize: number;
  widthM: number;
  heightM: number;
  walls: VectorRect[];
  corridors: VectorRect[];
  rooms: VectorRoom[];
  stairs: VectorRect[];
  elevators: VectorRect[];
}

export interface Floor {
  id: string;
  level: number;
  name: string;
  mapUrl: string | null;
  widthMeters?: number | null;
  heightMeters?: number | null;
  // Pixel↔meter calibration (returned by the client API).
  imageWidthPx?: number | null;
  imageHeightPx?: number | null;
  metersPerPixel?: number | null;
  /** Display rotation of the whole map, degrees: 0 | 90 | 180 | 270. */
  rotationDeg?: number | null;
  originXm?: number | null;
  originYm?: number | null;
  vectorMap?: VectorMap | null;
}

/** A registered BLE beacon's cross-platform identity (for the iOS service-data map). */
export interface BuildingBeacon {
  beaconUid: string;
  /** 0xFFF0 service-data hex (lowercased) — the cross-platform key, or null. */
  serviceData: string | null;
  floorLevel: number;
}

export interface Building {
  id: string;
  code: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Outdoor map coordinate (admin pin, else zone centroid) — list endpoint only. */
  location?: { lat: number; lng: number } | null;
  floors?: Floor[];
  /** Active beacons registered for this building (drives the iOS resolution map + count). */
  beacons?: BuildingBeacon[];
  /**
   * Compass bearing (deg, 0-360) that the floor map's "up" (-y) direction points
   * toward in the real world. Calibrated on-site; drives the user direction cone.
   * Null/undefined → cone falls back to a 0° offset (map-up = north).
   */
  northOffsetDeg?: number | null;
  emergencyAlert?: EmergencyData | null;
}

export interface NearbyBuilding {
  id: string;
  code: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  centroid: { lat: number; lng: number };
  distanceMeters: number;
  insideZone: boolean;
}
