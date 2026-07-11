import { ipsClient } from "@/lib/ipsClient";
import type {
  ActiveAlertsResponse,
  FloorOccupancyResponse,
  GridHeatmapResponse,
  IpsHealth,
  LivePositionsResponse,
  RoomHeatmapResponse,
  TopRoomsResponse,
} from "./types";

export async function getIpsHealth(): Promise<IpsHealth> {
  const res = await ipsClient.get<IpsHealth>("/health");
  return res.data;
}

export async function getLivePositions(buildingId: string): Promise<LivePositionsResponse> {
  const res = await ipsClient.get<LivePositionsResponse>("/live/positions", {
    params: { buildingId },
  });
  return res.data;
}

export async function getActiveAlerts(): Promise<ActiveAlertsResponse> {
  const res = await ipsClient.get<ActiveAlertsResponse>("/alerts/active");
  return res.data;
}

export async function getFloorOccupancy(
  buildingId: string,
  floor: number,
  minutes: number,
): Promise<FloorOccupancyResponse> {
  const res = await ipsClient.get<FloorOccupancyResponse>(`/analytics/floor/${floor}`, {
    params: { buildingId, minutes },
  });
  return res.data;
}

export async function getTopRooms(
  buildingId: string,
  minutes: number,
  limit = 8,
  floor?: number,
): Promise<TopRoomsResponse> {
  const res = await ipsClient.get<TopRoomsResponse>("/analytics/rooms", {
    params: { buildingId, minutes, limit, ...(floor != null ? { floor } : {}) },
  });
  return res.data;
}

export async function getRoomHeatmap(
  buildingId: string,
  floor: number,
  minutes: number,
): Promise<RoomHeatmapResponse> {
  const res = await ipsClient.get<RoomHeatmapResponse>("/analytics/heatmap", {
    params: { buildingId, floor, minutes },
  });
  return res.data;
}

export async function getGridHeatmap(
  buildingId: string,
  floor: number,
  minutes: number,
): Promise<GridHeatmapResponse> {
  const res = await ipsClient.get<GridHeatmapResponse>("/analytics/heatmap/grid", {
    params: { buildingId, floor, minutes },
  });
  return res.data;
}
