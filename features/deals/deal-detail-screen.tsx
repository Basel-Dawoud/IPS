/**
 * Deal details page. Opened from the Home "Hot Deals" cards (View Deal).
 * Shows the deal art, discount, description, the shop + building it's in (no
 * floor clutter up top), validity, and a CTA to navigate straight to the shop.
 */
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useDeal } from "./use-deals";
import { resolveAssetSource } from "@/lib/api-client";

function formatValidUntil(dateString: string | null): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function DealDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const dealId = typeof id === "string" ? id : null;
  const { data: deal, isLoading, error } = useDeal(dealId);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#00e5ff" />
      </SafeAreaView>
    );
  }

  if (error || !deal) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="px-5 py-4 flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-variant/60 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="pricetag-outline" size={40} color="#334155" />
          <Text className="text-neutral-400 text-sm mt-3 text-center">
            This deal is no longer available.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const validUntil = formatValidUntil(deal.validUntil);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="pb-32">
        {/* Hero image with back button */}
        <View style={{ height: 240 }}>
          {deal.imageUrl ? (
            <ExpoImage
              source={resolveAssetSource(deal.imageUrl)}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <LinearGradient
              colors={["#5C24FF", "#007AFF", "#00E5FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: "100%", height: "100%" }}
            />
          )}
          <LinearGradient
            colors={["rgba(4,11,20,0.6)", "transparent", "rgba(4,11,20,0.95)"]}
            locations={[0, 0.4, 1]}
            style={{ position: "absolute", width: "100%", height: "100%" }}
          />
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
          {deal.discountPct ? (
            <View className="absolute top-4 right-4 bg-error/90 rounded-full px-3 py-1.5">
              <Text className="text-white font-extrabold text-sm">-{deal.discountPct}%</Text>
            </View>
          ) : null}
        </View>

        <View className="px-6 -mt-8">
          <Text className="text-2xl font-bold text-white">{deal.title}</Text>

          {/* Shop • Building (no floor here — that's the top-level ask) */}
          <View className="flex-row items-center gap-2 mt-2">
            <Ionicons name="storefront-outline" size={15} color="#00e5ff" />
            <Text className="text-sm text-cyan font-semibold">{deal.poiName}</Text>
            <Text className="text-neutral-500">•</Text>
            <Text className="text-sm text-neutral-300">{deal.buildingName}</Text>
          </View>

          {validUntil ? (
            <View className="flex-row items-center gap-1.5 mt-3">
              <Ionicons name="time-outline" size={14} color="#94a3b8" />
              <Text className="text-xs text-neutral-400">Valid until {validUntil}</Text>
            </View>
          ) : null}

          {deal.description ? (
            <Text className="text-sm text-neutral-300 leading-6 mt-5">{deal.description}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View className="absolute bottom-0 left-0 right-0 px-6 pb-8 pt-4 bg-background/95 border-t border-white/5">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() =>
            router.push(
              `/navigation?buildingId=${deal.buildingId}&poiId=${deal.poiId}` as any,
            )
          }
          className="bg-brand rounded-2xl py-4 flex-row items-center justify-center gap-2"
        >
          <Ionicons name="navigate" size={18} color="white" />
          <Text className="text-white font-bold text-sm">Navigate to Shop</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
