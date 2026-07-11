import { useQuery } from "@tanstack/react-query";
import { getReviewsByPoi } from "./api";

export function useReviewsByPoi(poiId: string | null) {
  return useQuery({
    queryKey: ["reviews", "poi", poiId],
    queryFn: () => getReviewsByPoi(poiId!),
    enabled: !!poiId,
  });
}
