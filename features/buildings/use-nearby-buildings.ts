import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchNearbyBuildings, type NearbyParams } from "./api";

const GRID_DEGREES = 0.0001; // ~11m — bucket coords so tiny GPS jitter doesn't refetch

function snap(value: number): number {
  return Math.round(value / GRID_DEGREES) * GRID_DEGREES;
}

export function useNearbyBuildings(
  coords: { lat: number; lng: number } | null,
  radiusMeters = 150,
  limit = 5,
) {
  const lat = coords ? snap(coords.lat) : null;
  const lng = coords ? snap(coords.lng) : null;

  return useQuery({
    queryKey: ["buildings", "nearby", lat, lng, radiusMeters, limit],
    queryFn: () =>
      fetchNearbyBuildings({ lat: lat!, lng: lng!, radiusMeters, limit } as NearbyParams),
    enabled: lat != null && lng != null,
    staleTime: 30_000,
    // Walking mints a new query key every ~11 m grid bucket; without this the
    // data goes `undefined` during each refetch, which momentarily clears
    // `nearestInsideZone` and unmounts the navigate map (visible flicker).
    placeholderData: keepPreviousData,
  });
}
