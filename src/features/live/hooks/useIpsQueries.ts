import { useQuery } from "@tanstack/react-query";
import {
  getFloorOccupancy,
  getGridHeatmap,
  getIpsHealth,
  getLivePositions,
  getRoomHeatmap,
  getTopRooms,
} from "../api";

export function useIpsHealth() {
  return useQuery({
    queryKey: ["ips", "health"],
    queryFn: getIpsHealth,
    refetchInterval: 5000,
    retry: false,
  });
}

export function useLivePositionsSnapshot(buildingId: string, enabled = true) {
  return useQuery({
    queryKey: ["ips", "live-positions", buildingId],
    queryFn: () => getLivePositions(buildingId),
    refetchInterval: 10000,
    enabled: !!buildingId && enabled,
  });
}

export function useFloorOccupancy(buildingId: string, floor: number | null, minutes: number) {
  return useQuery({
    queryKey: ["ips", "occupancy", buildingId, floor, minutes],
    queryFn: () => getFloorOccupancy(buildingId, floor!, minutes),
    refetchInterval: 20000,
    enabled: !!buildingId && floor != null,
  });
}

export function useTopRooms(buildingId: string, minutes: number, limit = 8, floor?: number) {
  return useQuery({
    queryKey: ["ips", "top-rooms", buildingId, minutes, limit, floor ?? "all"],
    queryFn: () => getTopRooms(buildingId, minutes, limit, floor),
    refetchInterval: 20000,
    enabled: !!buildingId,
  });
}

export function useRoomHeatmap(
  buildingId: string,
  floor: number | null,
  minutes: number,
  enabled = true,
  refetchMs = 15000,
) {
  return useQuery({
    queryKey: ["ips", "heatmap", buildingId, floor, minutes],
    queryFn: () => getRoomHeatmap(buildingId, floor!, minutes),
    refetchInterval: refetchMs,
    enabled: !!buildingId && floor != null && enabled,
  });
}

export function useGridHeatmap(
  buildingId: string,
  floor: number | null,
  minutes: number,
  enabled = true,
  refetchMs = 15000,
) {
  return useQuery({
    queryKey: ["ips", "heatmap-grid", buildingId, floor, minutes],
    queryFn: () => getGridHeatmap(buildingId, floor!, minutes),
    refetchInterval: refetchMs,
    enabled: !!buildingId && floor != null && enabled,
  });
}
