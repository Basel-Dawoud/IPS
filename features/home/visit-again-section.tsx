/**
 * "Visit Again?" section — shows the user's last visited building prominently,
 * plus a compact list of 2-3 recent visits below.
 */
import { Image as ExpoImage } from "expo-image";
import { Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRecentVisits } from "../visits/use-visits";
import { resolveAssetSource } from "@/lib/api-client";
import { formatTimeAgo, visitHref, VisitStripCard } from "../visits/visit-again-card";

export function VisitAgainSection() {
  const router = useRouter();
  const { data: visits, isLoading } = useRecentVisits(5);

  if (isLoading || !visits || visits.length === 0) return null;

  const [latest, ...rest] = visits;
  const hasMore = visits.length > 4;

  return (
    <View className="gap-4">
      <Text className="text-xl font-bold text-white">Visit Again?</Text>

      {/* Hero: last visited building */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(visitHref(latest) as any)}
        className="rounded-3xl overflow-hidden border border-white/10"
        style={{ height: 160 }}
      >
        {/* Background image */}
        {latest.buildingImageUrl ? (
          <ExpoImage
            source={resolveAssetSource(latest.buildingImageUrl)}
            style={{ position: "absolute", width: "100%", height: "100%" }}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View className="absolute inset-0 bg-surface-variant" />
        )}

        <LinearGradient
          colors={["transparent", "rgba(4,11,20,0.9)"]}
          style={{ position: "absolute", width: "100%", height: "100%" }}
        />

        <View className="flex-1 p-5 justify-end" style={{ zIndex: 1 }}>
          <Text className="text-xs text-neutral-400 mb-1">
            Last visited {formatTimeAgo(latest.enteredAt)}
          </Text>
          <Text className="text-xl font-bold text-white mb-1">{latest.buildingName}</Text>
          {latest.lastPoiName ? (
            <Text className="text-xs text-cyan mb-3" numberOfLines={1}>
              <Ionicons name="storefront-outline" size={11} color="#00e5ff" />{" "}
              {latest.lastPoiName}
            </Text>
          ) : (
            <View className="mb-3" />
          )}
          <View className="self-start bg-brand rounded-xl py-2.5 px-4 flex-row items-center gap-2">
            <Ionicons name="navigate" size={14} color="white" />
            <Text className="text-white font-semibold text-xs">
              {latest.lastPoiName ? "Navigate to Shop" : "Navigate Back"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Recent visits strip */}
      {rest.length > 0 && (
        <View className="gap-2.5">
          {rest.slice(0, 3).map((visit) => (
            <VisitStripCard
              key={visit.id}
              visit={visit}
              onPress={(v) => router.push(visitHref(v) as any)}
            />
          ))}

          {hasMore && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/visit-again")}
              className="flex-row items-center justify-center gap-1 py-2"
            >
              <Text className="text-sm font-semibold text-cyan">View more</Text>
              <Ionicons name="chevron-forward" size={14} color="#00e5ff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
