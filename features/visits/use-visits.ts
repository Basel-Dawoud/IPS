import { useQuery } from "@tanstack/react-query";
import { fetchRecentVisits } from "./api";

/**
 * Hook to fetch the user's recent building visits.
 */
export function useRecentVisits(limit = 5) {
  return useQuery({
    queryKey: ["visits", "recent", limit],
    queryFn: () => fetchRecentVisits(limit),
    staleTime: 30_000,
  });
}
