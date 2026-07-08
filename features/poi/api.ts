import { apiClient } from "@/lib/api-client";
import type { Poi } from "./types";

export async function fetchBuildingPois(
  buildingId: string,
  floorLevel?: number,
): Promise<Poi[]> {
  const { data } = await apiClient.get<Poi[]>("/client/pois", {
    params: floorLevel === undefined ? { buildingId } : { buildingId, floorLevel },
  });
  return data;
}
