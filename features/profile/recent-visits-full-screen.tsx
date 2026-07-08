import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchRecentVisits } from "./recent-visits-api";
import { RecentVisitRow, useNavigateToVisit } from "./recent-visit-row";

export function RecentVisitsFullScreen() {
  const router = useRouter();
  const navigateToVisit = useNavigateToVisit();

  const { data: recentVisits, isLoading } = useQuery({
    queryKey: ["recent-visits"],
    queryFn: fetchRecentVisits,
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="px-6 pt-6 pb-2 flex-row items-center gap-1">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="chevron-back" size={20} color="#64748b" />
          <Text className="text-sm font-semibold text-slate-400">Back</Text>
        </TouchableOpacity>
      </View>

      <View className="px-6 mt-4">
        <Text className="text-2xl font-bold text-white tracking-tight">Recently Visited</Text>
        <Text className="text-xs text-slate-400 font-medium mt-1">
          Places you navigated to — tap to go again
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-6 py-4">
        {isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color="#00e5ff" />
          </View>
        ) : !recentVisits || recentVisits.length === 0 ? (
          <Text className="text-sm text-neutral-400 py-6">No places visited yet.</Text>
        ) : (
          recentVisits.map((visit) => (
            <RecentVisitRow key={visit.poiId} visit={visit} onPress={navigateToVisit} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
