import { apiClient } from "@/lib/api-client";
import type { RecentBuildingVisit } from "./types";

/**
 * Record a building visit — called when the user CHOOSES to navigate (from the
 * navigation screen), optionally with the shop (POI) they navigated to. Drives
 * the Home "Visit Again?" list. No-ops for guests (endpoint requires auth).
 */
export async function recordBuildingVisit(
  buildingId: string,
  poiId?: string,
): Promise<{ id: string; alreadyOpen: boolean }> {
  const { data } = await apiClient.post("/client/visits/record", { buildingId, poiId });
  return data;
}

/**
 * Close a building visit (called when user leaves the zone).
 */
export async function closeBuildingVisit(buildingId: string): Promise<void> {
  await apiClient.post("/client/visits/close", { buildingId });
}

/**
 * Fetch the user's recent building visits.
 */
export async function fetchRecentVisits(limit = 5): Promise<RecentBuildingVisit[]> {
  const { data } = await apiClient.get<RecentBuildingVisit[]>("/client/visits/recent", {
    params: { limit },
  });
  return data;
}
