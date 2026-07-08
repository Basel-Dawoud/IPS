/**
 * "Near you" section for the Home screen. Rendering modes:
 *
 *   A. user is INSIDE/nearest a building's zone → "You're here" hero card, with
 *      the "around you" building strip beneath it.
 *   B. candidates within 500 m but none inside  → horizontal building strip.
 *   C. nothing within 500 m                      → mini map zoomed to the user
 *      (~40 km) with building pins + a distance-sorted list beneath.
 *   D. nothing within 40 km                      → compact "Explore Map" CTA.
 *
 * Uses building imageUrl for visual-rich cards. Tapping "Directions" opens Google Maps.
 */
import { useMemo } from "react";
import { Image as ExpoImage } from "expo-image";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useProximity } from "./proximity-provider";
import { useNearbyBuildings } from "../buildings/use-nearby-buildings";
import type { NearbyBuilding } from "../buildings/types";
import { LeafletMap, type MapMarker } from "@/features/map-explore/leaflet-map";
import { openMapsDirections, formatDistance } from "@/features/location/directions";
import { resolveAssetSource, resolveAssetUrl } from "@/lib/api-client";

/** Buildings farther than the 500 m "nearby" zone but worth listing (~40 km). */
const WIDE_RADIUS_M = 40_000;
const WIDE_LIMIT = 15;

const directionsTo = (b: NearbyBuilding) =>
  b.centroid && openMapsDirections(b.centroid.lat, b.centroid.lng, b.name);

/**
 * Horizontal strip of nearby building cards (image, distance, Directions).
 * Reused under the "You're here" hero (State A) and as the primary strip
 * when candidates exist but none is inside (State B).
 */
function NearbyStrip({ items, title }: { items: NearbyBuilding[]; title: string }) {
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name="locate-outline" size={16} color="#00e5ff" />
          <Text className="text-sm font-semibold text-cyan tracking-wide uppercase">
            {title}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/map-explore" as any)}
          className="flex-row items-center gap-1"
        >
          <Text className="text-xs font-semibold text-cyan">Open Map</Text>
          <Ionicons name="arrow-forward" size={12} color="#00e5ff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-4 pr-6"
      >
        {items.slice(0, 5).map((b) => (
          <TouchableOpacity
            key={b.id}
            activeOpacity={0.85}
            onPress={() => router.push(`/navigation?buildingId=${b.id}` as any)}
            className="overflow-hidden rounded-2xl border border-white/10"
            style={{ width: 200 }}
          >
            {b.imageUrl ? (
              <View style={{ height: 120 }}>
                <ExpoImage
                  source={resolveAssetSource(b.imageUrl)}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={200}
                />
                <LinearGradient
                  colors={["transparent", "rgba(17,32,51,0.9)"]}
                  style={{ position: "absolute", bottom: 0, width: "100%", height: 50 }}
                />
              </View>
            ) : (
              <View className="h-20 bg-surface-variant/80" />
            )}

            <View className="p-3.5 bg-surface-variant/80">
              <Text className="text-base font-semibold text-white" numberOfLines={1}>
                {b.name}
              </Text>
              <Text className="text-xs text-neutral-400 mt-0.5">
                {formatDistance(b.distanceMeters)} away
              </Text>
              <View className="mt-2.5 flex-row items-center justify-between">
                <TouchableOpacity
                  onPress={() => directionsTo(b)}
                  className="flex-row items-center gap-1"
                >
                  <Ionicons name="navigate-outline" size={13} color="#66b0ff" />
                  <Text className="text-xs text-brand-light font-medium">Directions</Text>
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={14} color="#475569" />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function NearYouSection() {
  const router = useRouter();
  const { nearestInsideZone, candidates, locationStatus, coords } = useProximity();

  // Wide-radius list, fetched only when nothing is within the nearby radius.
  const wide = useNearbyBuildings(
    candidates.length === 0 ? coords : null,
    WIDE_RADIUS_M,
    WIDE_LIMIT,
  );

  // Markers for the State-C mini map: the user + each located wide building.
  const mapMarkers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = (wide.data ?? [])
      .filter((b) => b.centroid)
      .map((b) => ({
        id: b.id,
        name: b.name,
        lat: b.centroid!.lat,
        lng: b.centroid!.lng,
        kind: "building" as const,
        imageUrl: resolveAssetUrl(b.imageUrl) ?? null,
      }));
    if (coords) out.push({ id: "__user", name: "You", ...coords, kind: "user" });
    return out;
  }, [wide.data, coords]);

  if (locationStatus === "denied") {
    return (
      <View className="flex-row items-center gap-3 bg-surface-variant/40 border border-white/5 rounded-2xl p-4">
        <Ionicons name="location-outline" size={20} color="#ff4b4b" />
        <Text className="flex-1 text-sm text-neutral-300">
          Allow location to see buildings near you.
        </Text>
      </View>
    );
  }

  // ─── State A: Inside a building zone → Hero card + "around you" strip ───
  if (nearestInsideZone) {
    const b = nearestInsideZone;
    const others = candidates.filter((c) => c.id !== b.id);
    return (
      <View className="gap-6">
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => router.push(`/navigation?buildingId=${b.id}` as any)}
        className="rounded-3xl overflow-hidden border border-brand/40"
        style={{ height: 220 }}
      >
        {/* Background image */}
        {b.imageUrl ? (
          <ExpoImage
            source={resolveAssetSource(b.imageUrl)}
            style={{ position: "absolute", width: "100%", height: "100%" }}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View className="absolute inset-0 bg-brand/15" />
        )}

        {/* Gradient overlay */}
        <LinearGradient
          colors={["transparent", "rgba(4,11,20,0.85)", "rgba(4,11,20,0.98)"]}
          locations={[0, 0.5, 1]}
          style={{ position: "absolute", width: "100%", height: "100%" }}
        />

        {/* Content */}
        <View className="flex-1 p-5 justify-between" style={{ zIndex: 1 }}>
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-cyan" />
            <Text className="text-xs font-bold text-cyan tracking-widest uppercase">
              You're here
            </Text>
          </View>

          <View>
            <Text className="text-2xl font-bold text-white mb-1">{b.name}</Text>
            {b.description ? (
              <Text className="text-sm text-neutral-300 mb-4" numberOfLines={1}>
                {b.description}
              </Text>
            ) : null}

            <View className="flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push(`/navigation?buildingId=${b.id}` as any)}
                className="flex-1 bg-brand rounded-2xl py-3.5 flex-row items-center justify-center gap-2"
              >
                <Ionicons name="navigate" size={16} color="white" />
                <Text className="text-white font-bold text-sm">Enter & Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push(`/navigation?buildingId=${b.id}` as any)}
                className="bg-white/10 border border-white/20 rounded-2xl py-3.5 px-5 flex-row items-center justify-center gap-2"
              >
                <Ionicons name="map-outline" size={16} color="white" />
                <Text className="text-white font-semibold text-sm">View Map</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* Small banner to open explore map showing all buildings */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push("/map-explore" as any)}
        className="flex-row items-center justify-between bg-surface-variant/20 border border-white/5 rounded-2xl px-4 py-3.5 mt-[-8px]"
      >
        <View className="flex-row items-center gap-2.5">
          <Ionicons name="map" size={16} color="#00e5ff" />
          <Text className="text-xs font-semibold text-neutral-300">
            Explore map to view all buildings
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color="#00e5ff" />
      </TouchableOpacity>

      {/* Around-you buildings under the hero */}
      <NearbyStrip items={others} title="Around you" />
      </View>
    );
  }

  // ─── State B: Nearby buildings → Scroll strip ───
  if (candidates.length > 0) {
    return <NearbyStrip items={candidates} title="Near you" />;
  }

  // ─── State C: Nothing within 500 m → map (zoomed to you) + wide list ───
  const farBuildings = wide.data ?? [];

  if (farBuildings.length > 0) {
    return (
      <View className="gap-4">
        <View className="flex-row items-center gap-2">
          <Ionicons name="compass-outline" size={16} color="#00e5ff" />
          <Text className="text-sm font-semibold text-cyan tracking-wide uppercase">
            Buildings around you
          </Text>
        </View>

        {/* Mini map centered on the user (~40 km view) with building pins */}
        {coords ? (
          <View
            className="rounded-2xl overflow-hidden border border-white/10"
            style={{ height: 200 }}
          >
            <LeafletMap
              center={coords}
              zoom={9}
              interactive={false}
              markers={mapMarkers}
              style={{ flex: 1 }}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/map-explore" as any)}
              className="absolute top-3 right-3 flex-row items-center gap-1 bg-brand rounded-full px-3 py-1.5"
            >
              <Ionicons name="expand-outline" size={13} color="white" />
              <Text className="text-white font-bold text-[11px]">Open Map</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/map-explore" as any)}
            className="flex-row items-center justify-center gap-2 bg-brand rounded-2xl py-3.5"
          >
            <Ionicons name="map" size={16} color="white" />
            <Text className="text-white font-bold text-sm">View on Map</Text>
          </TouchableOpacity>
        )}

        {/* Distance-sorted list; tapping opens Google Maps directions */}
        <View className="gap-2.5">
          {farBuildings.slice(0, 6).map((b) => (
            <TouchableOpacity
              key={b.id}
              activeOpacity={0.85}
              onPress={() => directionsTo(b)}
              className="flex-row items-center gap-3 bg-surface-variant/40 border border-white/5 rounded-2xl p-3"
            >
              {b.imageUrl ? (
                <ExpoImage
                  source={resolveAssetSource(b.imageUrl)}
                  style={{ width: 48, height: 48, borderRadius: 12 }}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View className="w-12 h-12 rounded-xl bg-surface-variant items-center justify-center">
                  <Ionicons name="business-outline" size={20} color="#475569" />
                </View>
              )}

              <View className="flex-1">
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {b.name}
                </Text>
                <Text className="text-[11px] text-neutral-400 mt-0.5">
                  {formatDistance(b.distanceMeters)} away
                </Text>
              </View>

              <View className="flex-row items-center gap-1">
                <Ionicons name="navigate-outline" size={14} color="#66b0ff" />
                <Text className="text-xs text-brand-light font-medium">Directions</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ─── State D: Nothing within 40 km either → Explore Map CTA ───
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push("/map-explore" as any)}
      className="rounded-2xl border border-white/10 bg-surface-variant/40 p-5 flex-row items-center gap-4"
    >
      <View className="w-12 h-12 rounded-full bg-brand/15 items-center justify-center">
        <Ionicons name="map-outline" size={22} color="#007AFF" />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-white">
          Explore Buildings Near You
        </Text>
        <Text className="text-xs text-neutral-400 mt-0.5">
          Open the map to discover venues
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#475569" />
    </TouchableOpacity>
  );
}
