/**
 * "Today's Hot Deals 🔥" section — horizontal scroll of marketing-quality deal
 * cards from nearby shops. Shows active deals from the nearest building (if inside)
 * or from all nearby buildings.
 */
import { Image as ExpoImage } from "expo-image";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useProximity } from "../proximity/proximity-provider";
import { useNearbyBuildings } from "../buildings/use-nearby-buildings";
import { useHotDealsNearby, useDealsForBuilding } from "../deals/use-deals";
import type { Deal } from "../deals/types";
import { resolveAssetSource } from "@/lib/api-client";

/** Fallback deal sources when nothing is within the 500 m nearby radius. */
const WIDE_RADIUS_M = 15_000;
const WIDE_LIMIT = 5;

export function HotDealsSection() {
  const router = useRouter();
  const { nearestInsideZone, candidates, coords } = useProximity();

  // If inside a building, show its deals; otherwise deals from nearby buildings;
  // with nothing within 500 m, fall back to the closest buildings within 15 km.
  const insideBuildingId = nearestInsideZone?.id ?? null;
  const nearbyIds = candidates.map((c) => c.id);

  const wide = useNearbyBuildings(
    !insideBuildingId && nearbyIds.length === 0 ? coords : null,
    WIDE_RADIUS_M,
    WIDE_LIMIT,
  );
  const wideIds = (wide.data ?? []).map((b) => b.id);

  const insideDeals = useDealsForBuilding(insideBuildingId);
  const nearbyDeals = useHotDealsNearby(
    insideBuildingId ? [] : nearbyIds.length > 0 ? nearbyIds : wideIds,
  );

  const deals: Deal[] = insideBuildingId
    ? (insideDeals.data ?? [])
    : (nearbyDeals.data ?? []);

  if (deals.length === 0) return null;

  const handleDealPress = (deal: Deal) => {
    // Open the deal details page.
    router.push(`/deal/${deal.id}` as any);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <View className="flex-row items-center gap-2">
            <Text className="text-xl font-bold text-white">Today's Hot Deals</Text>
            <Text className="text-base">🔥</Text>
          </View>
          <Text className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">
            From shops nearby
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-4 pr-6"
      >
        {deals.slice(0, 8).map((deal) => (
          <TouchableOpacity
            key={deal.id}
            activeOpacity={0.9}
            onPress={() => handleDealPress(deal)}
            className="overflow-hidden rounded-3xl border border-white/10"
            style={{ width: 240, height: 170 }}
          >
            {/* Background: deal image or fallback gradient */}
            {deal.imageUrl ? (
              <ExpoImage
                source={resolveAssetSource(deal.imageUrl)}
                style={{ position: "absolute", width: "100%", height: "100%" }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <LinearGradient
                colors={["#5C24FF", "#007AFF", "#00E5FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: "absolute", width: "100%", height: "100%" }}
              />
            )}

            {/* Dark overlay for readability */}
            <LinearGradient
              colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.75)"]}
              style={{ position: "absolute", width: "100%", height: "100%" }}
            />

            {/* Discount badge */}
            {deal.discountPct && (
              <View className="absolute top-3 right-3 bg-error/90 rounded-full px-2.5 py-1">
                <Text className="text-white font-extrabold text-xs">
                  -{deal.discountPct}%
                </Text>
              </View>
            )}

            {/* Deal info */}
            <View
              className="flex-1 p-4 justify-end"
              style={{ zIndex: 1 }}
            >
              <Text className="text-base font-bold text-white" numberOfLines={2}>
                {deal.title}
              </Text>
              <Text className="text-xs text-neutral-300 mt-1" numberOfLines={1}>
                {deal.poiName} • {deal.buildingName}
              </Text>
              <View className="mt-2 flex-row items-center gap-1">
                <Ionicons name="arrow-forward-circle" size={14} color="#00e5ff" />
                <Text className="text-xs font-semibold text-cyan">View Deal</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
