import { apiClient } from "@/lib/api-client";
import type { Building, NearbyBuilding } from "./types";

export interface NearbyParams {
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
}

export async function fetchNearbyBuildings(params: NearbyParams): Promise<NearbyBuilding[]> {
  const { data } = await apiClient.get<NearbyBuilding[]>("/client/buildings/nearby", {
    params: {
      lat: params.lat,
      lng: params.lng,
      radiusMeters: params.radiusMeters ?? 150,
      limit: params.limit ?? 5,
    },
  });
  return data;
}

export async function fetchBuilding(id: string): Promise<Building> {
  const { data } = await apiClient.get<Building>(`/client/buildings/${id}`);
  return data;
}

export async function fetchBuildings(): Promise<Building[]> {
  const { data } = await apiClient.get<Building[]>("/client/buildings");
  return data;
}
