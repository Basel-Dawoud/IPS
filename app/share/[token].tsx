import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { resolveShare } from "@/features/location-sharing/api";
import { openMapsDirections } from "@/features/location/directions";
import { resolveAssetSource } from "@/lib/api-client";

/**
 * Landing screen for a live-location share link (navimind://share/<token>,
 * usually via the backend's /s/<token> redirect page). Shows who is sharing
 * and where, then hands off to the Navigate tab in follow-a-friend mode.
 */
export default function ShareLandingScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const shareToken = typeof token === "string" ? token : "";

  const { data: share, isLoading, error } = useQuery({
    queryKey: ["location-share", shareToken],
    queryFn: () => resolveShare(shareToken),
    enabled: !!shareToken,
    retry: false,
  });

  const sharerName = share?.owner.name ?? "Someone";

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-6 py-3 border-b border-white/5">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={22} color="#d4e4fa" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-white">Shared location</Text>
      </View>

      <View className="flex-1 items-center justify-center p-6 gap-5">
        {isLoading ? (
          <ActivityIndicator size="large" color="#66b0ff" />
        ) : error || !share ? (
          <>
            <View className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 items-center justify-center">
              <Ionicons name="unlink" size={34} color="#f87171" />
            </View>
            <Text className="text-white font-bold text-xl text-center">
              This link doesn't work anymore
            </Text>
            <Text className="text-neutral-400 text-center">
              {(error as Error)?.message ?? "The share may have ended or expired."}
            </Text>
          </>
        ) : !share.active ? (
          <>
            <View className="w-20 h-20 rounded-full bg-neutral-800 border border-white/10 items-center justify-center">
              <Ionicons name="time-outline" size={34} color="#94a3b8" />
            </View>
            <Text className="text-white font-bold text-xl text-center">
              {sharerName} stopped sharing
            </Text>
            <Text className="text-neutral-400 text-center">
              This live-location link has ended.
            </Text>
          </>
        ) : (
          <>
            {/* Sharer identity */}
            <View className="w-24 h-24 rounded-full overflow-hidden border-2 border-emerald-500/50 bg-neutral-900 items-center justify-center">
              {share.owner.avatarUrl ? (
                <Image
                  source={resolveAssetSource(share.owner.avatarUrl) as any}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={40} color="#34d399" />
              )}
            </View>
            <View className="items-center gap-1">
              <Text className="text-white font-bold text-2xl text-center">
                {sharerName} is sharing their live location
              </Text>
              {share.building ? (
                <Text className="text-emerald-300 font-semibold text-center">
                  {share.building.name}
                  {share.last ? ` • Floor ${share.last.floorLevel}` : ""}
                </Text>
              ) : null}
            </View>

            <View className="w-full gap-3 mt-2">
              {share.building ? (
                <TouchableOpacity
                  className="h-14 bg-emerald-600 rounded-2xl items-center justify-center flex-row gap-2"
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push(
                      `/navigation?buildingId=${share.building!.id}&shareToken=${encodeURIComponent(
                        // Canonical token (the live socket keys rooms by token);
                        // the URL param may be a typed code.
                        share.token ?? shareToken,
                      )}&friendName=${encodeURIComponent(sharerName)}` as any,
                    )
                  }
                >
                  <Ionicons name="map" size={20} color="white" />
                  <Text className="text-white font-bold text-base">View live on the map</Text>
                </TouchableOpacity>
              ) : null}

              {/* Not in that building yet? Walk there with outdoor maps first. */}
              {share.building?.pinLat != null && share.building?.pinLng != null ? (
                <TouchableOpacity
                  className="h-14 bg-neutral-800 border border-white/10 rounded-2xl items-center justify-center flex-row gap-2"
                  activeOpacity={0.85}
                  onPress={() =>
                    openMapsDirections(
                      share.building!.pinLat!,
                      share.building!.pinLng!,
                      share.building!.name,
                    )
                  }
                >
                  <Ionicons name="walk" size={20} color="#66b0ff" />
                  <Text className="text-neutral-200 font-semibold text-base">
                    Directions to {share.building.name}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
