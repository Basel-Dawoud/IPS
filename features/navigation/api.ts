import { apiClient } from "@/lib/api-client";
import type { Route, RouteRequest } from "./types";

export async function fetchRoute(req: RouteRequest): Promise<Route> {
  const { data } = await apiClient.post<Route>("/client/navigation/route", req);
  return data;
}
