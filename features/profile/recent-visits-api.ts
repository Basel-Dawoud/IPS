import { apiClient } from "@/lib/api-client";

export interface RecentVisit {
  poiId: string;
  name: string;
  code: string | null;
  floorLevel: number;
  x: number;
  y: number;
  buildingId: string;
  buildingName: string | null;
  categoryName: string | null;
  visitedAt: string;
}

export async function fetchRecentVisits(): Promise<RecentVisit[]> {
  const { data } = await apiClient.get<RecentVisit[]>("/client/user/recent-visits");
  return data;
}
