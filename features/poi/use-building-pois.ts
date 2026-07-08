import { useQuery } from "@tanstack/react-query";
import { fetchBuildingPois } from "./api";

export function useBuildingPois(buildingId: string | null | undefined) {
  return useQuery({
    queryKey: ["pois", buildingId],
    queryFn: () => fetchBuildingPois(buildingId!),
    enabled: !!buildingId,
  });
}
