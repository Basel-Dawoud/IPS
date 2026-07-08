import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useRecentVisits } from "./use-visits";
import { visitHref, VisitStripCard } from "./visit-again-card";

export function VisitAgainFullScreen() {
  const router = useRouter();
  const { data: visits, isLoading } = useRecentVisits(50);

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
        <Text className="text-2xl font-bold text-white tracking-tight">Visit Again</Text>
        <Text className="text-xs text-slate-400 font-medium mt-1">
          Buildings you recently visited — tap to navigate back
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-6 py-4 gap-2.5">
        {isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color="#00e5ff" />
          </View>
        ) : !visits || visits.length === 0 ? (
          <Text className="text-sm text-neutral-400 py-6">No buildings visited yet.</Text>
        ) : (
          visits.map((visit) => (
            <VisitStripCard
              key={visit.id}
              visit={visit}
              onPress={(v) => router.push(visitHref(v) as any)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
