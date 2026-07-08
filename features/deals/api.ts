import { apiClient } from "@/lib/api-client";
import type { Deal } from "./types";

/**
 * Fetch active deals for a specific building.
 */
export async function fetchDealsForBuilding(buildingId: string): Promise<Deal[]> {
  const { data } = await apiClient.get<Deal[]>("/client/deals", {
    params: { buildingId },
  });
  return data;
}

/**
 * Fetch hot deals across multiple nearby buildings.
 */
export async function fetchHotDealsNearby(buildingIds: string[]): Promise<Deal[]> {
  if (buildingIds.length === 0) return [];
  const { data } = await apiClient.get<Deal[]>("/client/deals", {
    params: { buildingIds: buildingIds.join(",") },
  });
  return data;
}

/**
 * Fetch a single deal by id (for the deal details page).
 */
export async function fetchDeal(id: string): Promise<Deal> {
  const { data } = await apiClient.get<Deal>(`/client/deals/${id}`);
  return data;
}
