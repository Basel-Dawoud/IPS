/**
 * Home search bar: searches building names + specific shops (POIs) and deep-
 * links to navigation. Mic uses the same voice recognition as the chatbot.
 *
 *   building tap → /navigation?buildingId=X
 *   shop tap     → /navigation?buildingId=X&poiId=Y  (auto-selects the shop)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@/features/search/use-search";
import { useVoiceRecognition } from "@/features/voice/use-voice-recognition";
import { resolveAssetSource } from "@/lib/api-client";
import { useProximity } from "@/features/proximity/proximity-provider";
import { fetchBuildings } from "@/features/buildings/api";
import type { Building } from "@/features/buildings/types";
import { haversineMeters, openMapsDirections } from "@/features/location/directions";
import { AwayDestinationDialog } from "./away-destination-dialog";

interface PendingDestination {
  kind: "shop" | "building";
  name: string;
  buildingId: string;
  buildingName: string;
  poiId?: string;
  location: { lat: number; lng: number } | null;
  distanceMeters: number | null;
}

export function HomeSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const { data, isFetching } = useSearch(query);
  const { coords, nearestInsideZone } = useProximity();
  const [pending, setPending] = useState<PendingDestination | null>(null);

  const { data: allBuildings } = useQuery<Building[]>({
    queryKey: ["buildings", "all"],
    queryFn: fetchBuildings,
  });

  // Map buildingId → outdoor map location (admin pin, else zone centroid).
  const locationMap = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const b of allBuildings ?? []) {
      if (b.location) m.set(b.id, b.location);
    }
    return m;
  }, [allBuildings]);

  const {
    isListening,
    recognizedText,
    startListening,
    stopListening,
  } = useVoiceRecognition();

  // Feed recognized speech into the query as it comes in.
  useEffect(() => {
    if (recognizedText) setQuery(recognizedText);
  }, [recognizedText]);

  // Pulse the mic while listening.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isListening) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.25, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 800, useNativeDriver: true }),
        ]),
      );
      anim.start();
    } else {
      pulse.setValue(1);
    }
    return () => anim?.stop();
  }, [isListening]);

  const toggleMic = () => {
    if (isListening) stopListening();
    else startListening("en-US");
  };

  const dismissSearch = () => {
    setQuery("");
    setFocused(false);
  };

  // Deep-link straight into indoor navigation for the chosen destination.
  const enterNavigation = (dest: { buildingId: string; poiId?: string }) => {
    const href = dest.poiId
      ? `/navigation?buildingId=${dest.buildingId}&poiId=${dest.poiId}`
      : `/navigation?buildingId=${dest.buildingId}`;
    dismissSearch();
    router.push(href as any);
  };

  // Central handler: if the user is already inside the target building, go
  // straight in; otherwise surface the "away" dialog (maps vs. enter anyway).
  const handleSelect = (dest: {
    kind: "shop" | "building";
    name: string;
    buildingId: string;
    buildingName: string;
    poiId?: string;
  }) => {
    const isInside = nearestInsideZone?.id === dest.buildingId;
    if (isInside) {
      enterNavigation(dest);
      return;
    }
    const location = locationMap.get(dest.buildingId) ?? null;
    const distanceMeters =
      coords && location ? haversineMeters(coords, location) : null;
    dismissSearch();
    setPending({ ...dest, location, distanceMeters });
  };

  const goBuilding = (b: { id: string; name: string }) =>
    handleSelect({ kind: "building", name: b.name, buildingId: b.id, buildingName: b.name });

  const goShop = (p: { id: string; name: string; buildingId: string; buildingName: string }) =>
    handleSelect({
      kind: "shop",
      name: p.name,
      buildingId: p.buildingId,
      buildingName: p.buildingName,
      poiId: p.id,
    });

  const buildings = data?.buildings ?? [];
  const pois = data?.pois ?? [];
  const showResults = focused && query.trim().length >= 2;
  const noResults = showResults && !isFetching && buildings.length === 0 && pois.length === 0;

  return (
    <View style={{ position: "relative", zIndex: 30 }}>
      {/* Search input */}
      <View
        className="flex-row items-center border border-white/5 rounded-2xl px-4 h-14"
        style={{ backgroundColor: "rgba(17, 32, 51, 0.40)" }}
      >
        <Ionicons name="search" size={20} color="#007AFF" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder="Search buildings or shops..."
          placeholderTextColor="#64748b"
          returnKeyType="search"
          className="flex-1 text-white text-sm ml-3 py-0 m-0"
          style={{ paddingVertical: 0, includeFontPadding: false }}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery("")} className="mr-1">
            <Ionicons name="close-circle" size={18} color="#64748b" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={toggleMic} className="overflow-hidden rounded-full">
          {isListening ? (
            <Animated.View
              style={{
                transform: [{ scale: pulse }],
                backgroundColor: "rgba(239,68,68,0.18)",
                borderRadius: 999,
                padding: 4,
              }}
            >
              <Ionicons name="mic" size={20} color="#ef4444" />
            </Animated.View>
          ) : (
            <Ionicons name="mic-outline" size={20} color="#007AFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* Results dropdown */}
      {showResults ? (
        <View
          className="absolute left-0 right-0 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
          style={{ top: 60, backgroundColor: "rgba(17, 32, 51, 0.98)" }}
        >
          {buildings.length > 0 ? (
            <>
              <Text className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-4 pt-3 pb-1">
                Buildings
              </Text>
              {buildings.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => goBuilding(b)}
                  className="flex-row items-center gap-3 px-4 py-2.5 border-b border-white/5"
                >
                  {b.imageUrl ? (
                    <ExpoImage
                      source={resolveAssetSource(b.imageUrl)}
                      style={{ width: 32, height: 32, borderRadius: 8 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="w-8 h-8 rounded-lg bg-surface-variant items-center justify-center">
                      <Ionicons name="business-outline" size={16} color="#66b0ff" />
                    </View>
                  )}
                  <Text className="flex-1 text-white font-medium" numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#475569" />
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          {pois.length > 0 ? (
            <>
              <Text className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-4 pt-3 pb-1">
                Shops
              </Text>
              {pois.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => goShop(p)}
                  className="flex-row items-center gap-3 px-4 py-2.5 border-b border-white/5"
                >
                  <Ionicons name="storefront-outline" size={18} color="#38bdf8" />
                  <View className="flex-1">
                    <Text className="text-white font-medium" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-[11px] text-neutral-400" numberOfLines={1}>
                      {p.buildingName}
                      {p.category ? ` • ${p.category}` : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#475569" />
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          {noResults ? (
            <View className="px-4 py-5 items-center">
              <Text className="text-neutral-400 text-sm">No matches for “{query.trim()}”</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {pending ? (
        <AwayDestinationDialog
          visible
          kind={pending.kind}
          name={pending.name}
          buildingName={pending.buildingName}
          distanceMeters={pending.distanceMeters}
          hasMapsLocation={!!pending.location}
          onOpenMaps={() => {
            if (pending.location) {
              openMapsDirections(pending.location.lat, pending.location.lng, pending.buildingName);
            }
            setPending(null);
          }}
          onEnter={() => {
            enterNavigation({ buildingId: pending.buildingId, poiId: pending.poiId });
            setPending(null);
          }}
          onClose={() => setPending(null)}
        />
      ) : null}
    </View>
  );
}
