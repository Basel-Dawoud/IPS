import { useMutation } from "@tanstack/react-query";
import { fetchRoute } from "./api";
import type { RouteRequest } from "./types";

export function useRoute() {
  return useMutation({
    mutationFn: (req: RouteRequest) => fetchRoute(req),
  });
}
