/**
 * Shared "recently visited POI" row + navigation helper, used by the Profile
 * settings card and the full Recently Visited page.
 */
import { Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useNavigationTarget } from "@/features/navigation/navigation-target-provider";
import type { RecentVisit } from "./recent-visits-api";

/** Returns a callback that sets the nav target from a visit and opens navigation. */
export function useNavigateToVisit() {
  const router = useRouter();
  const { setTarget } = useNavigationTarget();

  return (visit: RecentVisit) => {
    const mappedPoi = {
      id: visit.poiId,
      buildingId: visit.buildingId,
      name: visit.name,
      code: visit.code,
      floorLevel: visit.floorLevel,
      type: "ROOM" as any,
      x: visit.x,
      y: visit.y,
      description: null,
      category: visit.categoryName,
      aliases: [],
      productKeywords: [],
      active: true,
    };
    setTarget(mappedPoi as any);
    router.push("/navigation");
  };
}

export function RecentVisitRow({
  visit,
  onPress,
}: {
  visit: RecentVisit;
  onPress: (visit: RecentVisit) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(visit)}
      className="flex-row items-center justify-between py-3 border-b border-white/5"
    >
      <View className="flex-1 mr-3">
        <Text numberOfLines={1} className="text-base text-neutral-200 font-medium">
          {visit.name}
        </Text>
        <Text numberOfLines={1} className="text-xs text-neutral-400 mt-0.5">
          {[visit.buildingName, `Floor ${visit.floorLevel}`, visit.categoryName]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <Ionicons name="navigate-outline" size={18} color="#00e5ff" />
    </TouchableOpacity>
  );
}
