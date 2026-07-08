import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { useForegroundLocation } from "../location/use-foreground-location";
import { useNearbyBuildings } from "../buildings/use-nearby-buildings";
import type { NearbyBuilding } from "../buildings/types";

/** A building counts as "nearby" (indoor-nav cards) within this radius. */
const NEARBY_RADIUS_M = 500;

/**
 * Hysteresis: once inside a building's zone, keep reporting it for this long
 * after the raw GPS-derived state loses it. GPS jitter at the zone edge (±5–15 m
 * on a Balanced fix) otherwise flips `nearestInsideZone` to null for one update,
 * which unmounts the navigate map mid-navigation.
 */
const INSIDE_ZONE_GRACE_MS = 25_000;

interface ProximityContextValue {
  /** Closest building inside its zone, or null if none. */
  nearestInsideZone: NearbyBuilding | null;
  /** All candidates (inside-zone first, then by distance). */
  candidates: NearbyBuilding[];
  /** Convenience: any candidate present means we can prompt the user. */
  hasMatch: boolean;
  locationStatus: "idle" | "requesting" | "granted" | "denied" | "error";
  /** Last known device coordinate (for wide-radius queries + distance labels). */
  coords: { lat: number; lng: number } | null;
}

const Ctx = createContext<ProximityContextValue>({
  nearestInsideZone: null,
  candidates: [],
  hasMatch: false,
  locationStatus: "idle",
  coords: null,
});

export function ProximityProvider({ children }: { children: ReactNode }) {
  const location = useForegroundLocation({ enabled: true });
  const coords = location.coords
    ? { lat: location.coords.lat, lng: location.coords.lng }
    : null;
  const nearby = useNearbyBuildings(coords, NEARBY_RADIUS_M);

  // Last confirmed inside-zone building + when we last saw it (for hysteresis).
  const lastInsideRef = useRef<{ building: NearbyBuilding; at: number } | null>(null);

  const value = useMemo<ProximityContextValue>(() => {
    const candidates = nearby.data ?? [];
    const rawInside = candidates.find((b) => b.insideZone) ?? null;

    let inside = rawInside;
    if (rawInside) {
      lastInsideRef.current = { building: rawInside, at: Date.now() };
    } else if (location.status === "granted" && lastInsideRef.current) {
      // Grace period: hold the previous inside-zone building through brief GPS
      // jitter / refetch gaps instead of flipping to null immediately.
      if (Date.now() - lastInsideRef.current.at <= INSIDE_ZONE_GRACE_MS) {
        inside = lastInsideRef.current.building;
      } else {
        lastInsideRef.current = null;
      }
    } else if (location.status !== "granted") {
      lastInsideRef.current = null;
    }

    return {
      candidates,
      nearestInsideZone: inside,
      hasMatch: candidates.length > 0,
      locationStatus: location.status,
      coords: location.coords
        ? { lat: location.coords.lat, lng: location.coords.lng }
        : null,
    };
  }, [nearby.data, location.status, location.coords]);

  // NOTE: building visits are NO LONGER recorded here by proximity. "Visit
  // Again?" is now driven by the user CHOOSING to navigate — see
  // navigation-screen `selectDestination` → recordBuildingVisit.

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProximity(): ProximityContextValue {
  return useContext(Ctx);
}
