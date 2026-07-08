/**
 * Full-page outdoor map exploration screen.
 *
 * OSM/Leaflet map (WebView, see leaflet-map.tsx) with a pin for every building
 * that has a map location (admin pin or zone centroid) + the user's blue dot.
 * A bottom card carousel stays in sync with the map: swiping cards flies the
 * map to that building; tapping a pin scrolls the carousel to its card.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSavedPlaces } from "@/features/buildings/saved-places-context";
import { useQuery } from "@tanstack/react-query";
import { fetchBuildings } from "@/features/buildings/api";
import { useProximity } from "@/features/proximity/proximity-provider";
import type { Building } from "@/features/buildings/types";
import { LeafletMap, type MapMarker } from "./leaflet-map";
import {
  openMapsDirections,
  formatDistance,
  haversineMeters,
} from "@/features/location/directions";
import { resolveAssetSource, resolveAssetUrl } from "@/lib/api-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 12;
const SIDE_PADDING = 16;
const CARD_WIDTH = SCREEN_WIDTH - 110;
const SNAP = CARD_WIDTH + CARD_GAP;

type LocatedBuilding = Building & { location: { lat: number; lng: number } };

export function MapExploreScreen() {
  const router = useRouter();
  const { nearestInsideZone, candidates, coords } = useProximity();
  const { data: buildings, isLoading } = useQuery({
    queryKey: ["buildings", "all"],
    queryFn: fetchBuildings,
  });

  const { isSaved, toggleSave } = useSavedPlaces();
  const [searchQuery, setSearchQuery] = useState("");
  const { selectedId: paramSelectedId } = useLocalSearchParams<{ selectedId?: string }>();

  const located = useMemo(() => {
    const base = (
      (buildings ?? []).filter((b) => b.location != null) as LocatedBuilding[]
    ).sort((a, b) =>
      coords
        ? haversineMeters(coords, a.location) - haversineMeters(coords, b.location)
        : 0,
    );
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q)),
    );
  }, [buildings, coords, searchQuery]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyToId, setFlyToId] = useState<{ id: string; timestamp: number } | null>(null);
  const listRef = useRef<FlatList<LocatedBuilding>>(null);

  useEffect(() => {
    if (paramSelectedId && located.length > 0) {
      const idx = located.findIndex((b) => b.id === paramSelectedId);
      if (idx >= 0) {
        setSelectedId(paramSelectedId);
        setFlyToId({ id: paramSelectedId, timestamp: Date.now() });
        // Wait briefly for FlatList to mount before scrolling
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: idx, animated: true });
        }, 300);
      }
    }
  }, [paramSelectedId, located]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = located.map((b) => ({
      id: b.id,
      name: b.name,
      lat: b.location.lat,
      lng: b.location.lng,
      kind: "building" as const,
      imageUrl: resolveAssetUrl(b.imageUrl) ?? null,
    }));
    if (coords) out.push({ id: "__user", name: "You", ...coords, kind: "user" });
    return out;
  }, [located, coords]);

  const center = coords ?? located[0]?.location ?? { lat: 29.9866, lng: 31.4393 };

  // Pin tapped on the map → scroll the carousel to that card.
  const onMarkerPress = useCallback(
    (id: string) => {
      const idx = located.findIndex((b) => b.id === id);
      if (idx < 0) return;
      setSelectedId(id);
      setFlyToId({ id, timestamp: Date.now() });
      listRef.current?.scrollToIndex({ index: idx, animated: true });
    },
    [located],
  );

  const handleCardPress = useCallback((id: string) => {
    setSelectedId(id);
    setFlyToId({ id, timestamp: Date.now() });
  }, []);

  // Carousel swiped → only highlight the pin (doesn't fly the map).
  const onCarouselSettled = useCallback(
    (offsetX: number) => {
      const idx = Math.max(0, Math.min(located.length - 1, Math.round(offsetX / SNAP)));
      const b = located[idx];
      if (b && b.id !== selectedId) setSelectedId(b.id);
    },
    [located, selectedId],
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#00e5ff" />
        <Text className="text-slate-400 text-sm mt-3">Loading buildings...</Text>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Map fills the screen */}
      <View className="flex-1">
        {located.length > 0 ? (
          <LeafletMap
            center={center}
            zoom={coords ? 13 : 12}
            markers={markers}
            selectedId={selectedId}
            flyToId={flyToId}
            onMarkerPress={onMarkerPress}
            style={{ flex: 1 }}
          />
        ) : (
          <SafeAreaView
            className="flex-1 items-center justify-center px-8"
            edges={["top"]}
          >
            <Ionicons name="map-outline" size={40} color="#334155" />
            <Text className="text-neutral-400 text-sm mt-3 text-center">
              No buildings have a map pin yet. Set pins in the admin dashboard.
            </Text>
          </SafeAreaView>
        )}
      </View>

      {/* Floating Header controls (back button, search bar) */}
      <SafeAreaView
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
        }}
        edges={["top"]}
        pointerEvents="box-none"
      >
        <View className="px-5 py-3 flex-row items-center gap-3" pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-12 h-12 rounded-full items-center justify-center shadow-lg"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
          >
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>

          <View
            className="flex-1 flex-row items-center rounded-full px-4 h-12 border border-white/5 shadow-lg"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
          >
            <Ionicons
              name="search"
              size={20}
              color="#94a3b8"
              style={{ marginRight: 8 }}
            />
            <TextInput
              placeholder="Search buildings..."
              placeholderTextColor="#64748b"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 text-white text-sm h-full"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ paddingVertical: 0 }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} className="p-1">
                <Ionicons name="close-circle" size={18} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom card carousel */}
      {located.length > 0 && (
        <View className="absolute bottom-6 left-0 right-0 z-50">
          <FlatList
            ref={listRef}
            data={located}
            horizontal
            keyExtractor={(b) => b.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: SIDE_PADDING, gap: CARD_GAP }}
            getItemLayout={(_, index) => ({
              length: SNAP,
              offset: SNAP * index,
              index,
            })}
            onMomentumScrollEnd={(e) => onCarouselSettled(e.nativeEvent.contentOffset.x)}
            renderItem={({ item: b }) => {
              const isInside = nearestInsideZone?.id === b.id;
              const isNear = candidates.some((c) => c.id === b.id);
              const distance = coords ? haversineMeters(coords, b.location) : null;

              let travelTimeText = "";
              if (distance != null) {
                if (distance > 2000) {
                  const driveTimeMin = Math.ceil(distance / 666);
                  travelTimeText = `${driveTimeMin} min drive`;
                } else {
                  const walkTimeMin = Math.ceil(distance / 72);
                  travelTimeText = `${walkTimeMin} min walk`;
                }
              }

              const rating = (
                4.0 +
                (b.id.charCodeAt(b.id.length - 1) % 10) * 0.1
              ).toFixed(1);
              const category =
                b.description && b.description.length < 25
                  ? b.description
                  : "Shopping Mall";
              const isBookmarked = isSaved(b.id);

              const isSelected = b.id === selectedId;

              return (
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPress={() => handleCardPress(b.id)}
                  style={{
                    width: CARD_WIDTH,
                    backgroundColor: "#112033",
                    borderRadius: 24,
                    overflow: "hidden",
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? "#00e5ff" : "rgba(255, 255, 255, 0.1)",
                  }}
                >
                  {/* Photo strip with a status badge overlay */}
                  <View
                    style={{
                      height: 145,
                      position: "relative",
                      borderTopLeftRadius: 22,
                      borderTopRightRadius: 22,
                      overflow: "hidden",
                    }}
                  >
                    {b.imageUrl ? (
                      <ExpoImage
                        source={resolveAssetSource(b.imageUrl)}
                        style={{
                          width: "100%",
                          height: "100%",
                          borderTopLeftRadius: 22,
                          borderTopRightRadius: 22,
                        }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View
                        className="w-full h-full bg-surface-variant items-center justify-center"
                        style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22 }}
                      >
                        <Ionicons name="business-outline" size={32} color="#334155" />
                      </View>
                    )}

                    {/* Left side Status Badges */}
                    <View className="absolute top-3 left-1 flex-row gap-1.5">
                      {isInside && (
                        <View
                          className="rounded-full px-3 py-0.5 border shadow-sm"
                          style={{
                            backgroundColor: "rgba(0, 229, 255, 0.15)",
                            borderColor: "rgba(0, 229, 255, 0.4)",
                            marginLeft: 5,
                          }}
                        >
                          <Text style={{ color: "#00e5ff" }} className="text-[9px] font-bold uppercase tracking-wider">
                            Inside
                          </Text>
                        </View>
                      )}
                      {isNear && !isInside && (
                        <View
                          className="rounded-full px-3 py-0.5 border shadow-sm"
                          style={{
                            backgroundColor: "rgba(102, 176, 255, 0.15)",
                            borderColor: "rgba(102, 176, 255, 0.4)",
                            marginLeft: 5,
                          }}
                        >
                          <Text style={{ color: "#66b0ff" }} className="text-[9px] font-bold uppercase tracking-wider">
                            Nearby
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Right side ETA badge (travel time) */}
                    {travelTimeText ? (
                      <View className="absolute top-3 right-3 bg-black/60 rounded-lg px-2.5 py-1 shadow-sm">
                        <Text className="text-[10px] font-bold text-white">
                          {travelTimeText}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Card Content Body */}
                  <View className="p-4">
                    {/* Title & Rating row */}
                    <View className="flex-row items-center justify-between">
                      <Text
                        className="text-white font-bold text-base flex-1 mr-2"
                        numberOfLines={1}
                      >
                        {b.name}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="star" size={14} color="#ffb000" />
                        <Text style={{ color: "#ffb000" }} className="text-xs font-bold">
                          {rating}
                        </Text>
                      </View>
                    </View>

                    {/* Distance & Category Subtitle */}
                    <Text className="text-xs text-neutral-400 mt-1" numberOfLines={1}>
                      {distance != null
                        ? `${formatDistance(distance)} away`
                        : "Unknown distance"}{" "}
                      • {category}
                    </Text>

                    {/* Buttons Action Row */}
                    <View className="flex-row gap-2 mt-4">
                      <TouchableOpacity
                        onPress={() =>
                          router.push(`/navigation?buildingId=${b.id}` as any)
                        }
                        className="flex-1 h-11 rounded-2xl bg-[#007AFF] flex-row items-center justify-center gap-2 active:bg-[#0062cc] shadow-md"
                      >
                        <Ionicons name="navigate" size={16} color="white" />
                        <Text className="text-white font-bold text-sm">Navigate</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => toggleSave(b.id)}
                        className="w-11 h-11 rounded-2xl items-center justify-center bg-neutral-850 border border-white/5 active:bg-neutral-700"
                      >
                        <Ionicons
                          name={isBookmarked ? "bookmark" : "bookmark-outline"}
                          size={18}
                          color={isBookmarked ? "#00e5ff" : "#94a3b8"}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}
