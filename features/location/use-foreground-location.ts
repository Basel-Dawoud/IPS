import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

export interface Coords {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
}

export interface LocationState {
  coords: Coords | null;
  status: "idle" | "requesting" | "granted" | "denied" | "error";
  error: string | null;
}

export interface UseLocationOptions {
  enabled?: boolean;
  /** Min movement (meters) before a new update fires. Default 5. */
  distanceIntervalM?: number;
  /** Min time between updates (ms). Default 5000. */
  timeIntervalMs?: number;
}

export function useForegroundLocation(options: UseLocationOptions = {}): LocationState {
  const { enabled = true, distanceIntervalM = 5, timeIntervalMs = 5_000 } = options;
  const [state, setState] = useState<LocationState>({ coords: null, status: "idle", error: null });
  const subRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;

    (async () => {
      setState((p) => ({ ...p, status: "requesting" }));
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== "granted") {
        setState({ coords: null, status: "denied", error: "Location permission denied" });
        return;
      }

      setState((p) => ({ ...p, status: "granted", error: null }));

      try {
        subRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: distanceIntervalM,
            timeInterval: timeIntervalMs,
          },
          (loc) => {
            if (cancelled) return;
            setState({
              status: "granted",
              error: null,
              coords: {
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
                timestamp: loc.timestamp,
              },
            });
          },
        );
      } catch (err: any) {
        if (cancelled) return;
        setState({ coords: null, status: "error", error: err?.message ?? "Location error" });
      }
    })();

    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [enabled, distanceIntervalM, timeIntervalMs]);

  return state;
}
