/**
 * Shared outdoor-maps helpers: open Google/Apple Maps directions to a
 * coordinate, format distances ("712 m" / "10.4 km"), and haversine distance.
 */
import { Linking, Platform } from "react-native";

export function openMapsDirections(lat: number, lng: number, name: string) {
  const label = encodeURIComponent(name);
  if (Platform.OS === "ios") {
    // Try Google Maps, fall back to Apple Maps.
    const googleUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=walking`;
    const appleUrl = `maps:0,0?q=${label}&ll=${lat},${lng}&dirflg=w`;
    Linking.canOpenURL(googleUrl).then((supported) => {
      Linking.openURL(supported ? googleUrl : appleUrl);
    });
  } else {
    Linking.openURL(`google.navigation:q=${lat},${lng}&mode=w`);
  }
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Great-circle distance in meters. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
