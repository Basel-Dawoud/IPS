import { useQuery } from "@tanstack/react-query";
import { fetchDealsForBuilding, fetchHotDealsNearby, fetchDeal } from "./api";

/**
 * Hook to fetch active deals for a specific building.
 */
export function useDealsForBuilding(buildingId: string | null) {
  return useQuery({
    queryKey: ["deals", "building", buildingId],
    queryFn: () => fetchDealsForBuilding(buildingId!),
    enabled: !!buildingId,
    staleTime: 60_000,
  });
}

/**
 * Hook to fetch hot deals across nearby buildings.
 */
export function useHotDealsNearby(buildingIds: string[]) {
  return useQuery({
    queryKey: ["deals", "nearby", buildingIds],
    queryFn: () => fetchHotDealsNearby(buildingIds),
    enabled: buildingIds.length > 0,
    staleTime: 60_000,
  });
}

/**
 * Hook to fetch a single deal by id (deal details page).
 */
export function useDeal(id: string | null) {
  return useQuery({
    queryKey: ["deals", "detail", id],
    queryFn: () => fetchDeal(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}
