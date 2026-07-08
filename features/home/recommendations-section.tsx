import React, { useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useProximity } from "@/features/proximity/proximity-provider";
import { usePositioning } from "@/features/positioning/use-positioning";
import { apiClient } from "@/lib/api-client";
import { PoiReviewModal } from "../poi/poi-reviews";

export interface RecommendedPoi {
  id: string;
  name: string;
  code: string | null;
  floorLevel: number;
  x: number;
  y: number;
  description: string | null;
  avgRating: number;
  reviewCount: number;
  visitCount: number;
  categoryName: string | null;
  buildingId: string;
  buildingName: string;
  score: number;
}

export function RecommendationsSection() {
  const router = useRouter();
  const { nearestInsideZone, candidates } = useProximity();
  const positioning = usePositioning({ autoStart: true });

  const [reviewPoi, setReviewPoi] = useState<RecommendedPoi | null>(null);

  // Location context, if any. When near/inside a building we pass it for
  // location-aware scoring; otherwise recommendations are global.
  const buildingId = nearestInsideZone?.id || candidates[0]?.id || null;
  const x = positioning.y ?? undefined;
  const floor = positioning.floor ?? undefined;

  const {
    data: recommendations,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["recommendations", buildingId ?? "global", x, floor],
    queryFn: async () => {
      const params: Record<string, any> = {};
      if (buildingId) {
        params.buildingId = buildingId;
        if (x !== undefined) params.x = x;
        if (floor !== undefined) {
          params.floor = floor;
          // The default centerline cross coordinate in corridor positioning
          params.y = 1.8;
        }
      }
      const { data } = await apiClient.get<RecommendedPoi[]>("/client/recommendations", {
        params,
      });
      return data;
    },
  });

  // Deep-link straight to the recommended shop (auto-selects + records visit).
  const handleNavigate = (poi: RecommendedPoi) => {
    router.push(`/navigation?buildingId=${poi.buildingId}&poiId=${poi.id}` as any);
  };

  if (isLoading) {
    return (
      <View className="py-8 justify-center items-center">
        <ActivityIndicator size="small" color="#00e5ff" />
        <Text className="text-slate-500 text-xs mt-2 font-medium">
          Loading recommendations...
        </Text>
      </View>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <View className="gap-4">
      <View className="flex-row justify-between items-end mb-1">
        <View>
          <Text className="text-xl font-bold text-white">Recommended for You</Text>
          <Text className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">
            Based on your interests & history
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()}>
          <Ionicons name="refresh" size={16} color="#00e5ff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-4 pr-6"
      >
        {recommendations.slice(0, 5).map((poi) => (
          <View
            key={poi.id}
            style={{ width: 220 }}
            className="p-5 rounded-3xl bg-surface-variant/40 border border-white/5 justify-between"
          >
            <View>
              {/* Category Badge & Rating */}
              <View className="flex-row justify-between items-center mb-3">
                <View className="px-2.5 py-0.5 rounded-full bg-cyan/10 border border-cyan/20">
                  <Text className="text-[9px] font-bold text-cyan uppercase tracking-wider">
                    {poi.categoryName || "POI"}
                  </Text>
                </View>
                {poi.avgRating > 0 && (
                  <View className="flex-row items-center gap-0.5">
                    <Ionicons name="star" size={12} color="#ffd700" />
                    <Text className="text-xs text-white font-bold">
                      {poi.avgRating.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Title & building */}
              <Text numberOfLines={1} className="text-base font-bold text-white mb-0.5">
                {poi.name}
              </Text>
              <View className="flex-row items-center gap-1 mb-1.5">
                <Ionicons name="business-outline" size={10} color="#64748b" />
                <Text numberOfLines={1} className="text-[10px] text-slate-400 flex-1">
                  {poi.buildingName}
                </Text>
              </View>
              <Text numberOfLines={2} className="text-xs text-slate-400 leading-4 min-h-[32px]">
                {poi.description || "No store description available."}
              </Text>

              {/* Stats: Reviews & Visits */}
              <View className="flex-row items-center gap-3 mt-3">
                <View className="flex-row items-center gap-1">
                  <Ionicons name="eye-outline" size={11} color="#64748b" />
                  <Text className="text-[10px] text-slate-400 font-medium">
                    {poi.visitCount} visits
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setReviewPoi(poi)}
                  className="flex-row items-center gap-1"
                >
                  <Ionicons name="chatbubble-outline" size={10} color="#64748b" />
                  <Text className="text-[10px] text-cyan font-bold">
                    {poi.reviewCount > 0 ? `${poi.reviewCount} reviews` : "Rate store"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Navigate Action Button */}
            <TouchableOpacity
              onPress={() => handleNavigate(poi)}
              className="mt-4 bg-brand/10 border border-brand/30 py-2.5 rounded-xl flex-row items-center justify-center gap-2"
            >
              <Ionicons name="navigate" size={14} color="#00e5ff" />
              <Text className="text-white font-semibold text-xs">Navigate</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {reviewPoi && (
        <PoiReviewModal
          visible={!!reviewPoi}
          poiId={reviewPoi.id}
          poiName={reviewPoi.name}
          onClose={() => {
            setReviewPoi(null);
            refetch();
          }}
        />
      )}
    </View>
  );
}
