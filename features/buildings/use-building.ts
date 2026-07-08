import { useQuery } from "@tanstack/react-query";
import { fetchBuilding } from "./api";

export function useBuilding(id: string | null | undefined) {
  return useQuery({
    queryKey: ["buildings", "byId", id],
    queryFn: () => fetchBuilding(id!),
    enabled: !!id,
  });
}
