/**
 * Shared helpers + compact card for building "Visit Again?" lists, used by the
 * Home section and the full Visit Again page.
 */
import { Image as ExpoImage } from "expo-image";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { resolveAssetSource } from "@/lib/api-client";
import type { RecentBuildingVisit } from "./types";

export function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const then = new Date(dateString);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return "1 week ago";
  return `${diffWeeks} weeks ago`;
}

/** Re-navigate straight to the last shop when we have one, else the building. */
export function visitHref(v: RecentBuildingVisit): string {
  return v.lastPoiId
    ? `/navigation?buildingId=${v.buildingId}&poiId=${v.lastPoiId}`
    : `/navigation?buildingId=${v.buildingId}`;
}

export function VisitStripCard({
  visit,
  onPress,
}: {
  visit: RecentBuildingVisit;
  onPress: (visit: RecentBuildingVisit) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(visit)}
      className="flex-row items-center gap-3 bg-surface-variant/40 border border-white/5 rounded-2xl p-3"
    >
      {visit.buildingImageUrl ? (
        <ExpoImage
          source={resolveAssetSource(visit.buildingImageUrl)}
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
          {visit.buildingName}
        </Text>
        <Text className="text-[10px] text-neutral-400 mt-0.5" numberOfLines={1}>
          {visit.lastPoiName
            ? `${visit.lastPoiName} • ${formatTimeAgo(visit.enteredAt)}`
            : formatTimeAgo(visit.enteredAt)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color="#475569" />
    </TouchableOpacity>
  );
}
