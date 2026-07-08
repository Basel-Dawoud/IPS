import { ScrollView, Text, View, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { NearYouSection } from "@/features/proximity/near-you-section";
import { HomeSearch } from "./home-search";
import { RecommendationsSection } from "./recommendations-section";
import { HotDealsSection } from "./hot-deals-section";
import { VisitAgainSection } from "./visit-again-section";

export function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Top App Bar */}
      <View className="px-6 py-4 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <Image 
            source={require("@/assets/images/logo.png")} 
            className="w-8 h-8" 
            resizeMode="contain"
          />
          <Text className="text-xl font-bold text-white tracking-tight">Navimind</Text>
        </View>
        <TouchableOpacity>
          <Ionicons name="notifications-outline" size={24} color="#d4e4fa" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerClassName="p-6 pt-2 gap-8 pb-32"
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Bar (buildings + shops, with voice) */}
        <HomeSearch />

        {/* 1. Proximity Hero Card / Nearby Buildings */}
        <NearYouSection />

        {/* 2. Dynamic Recommendations */}
        <RecommendationsSection />

        {/* 3. Today's Hot Deals 🔥 */}
        <HotDealsSection />

        {/* 4. Visit Again? */}
        <VisitAgainSection />
      </ScrollView>

      {/* Floating Action Button (FAB) */}
      <View className="absolute bottom-6 right-6">
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={() => router.push("/navigation")}
          className="w-16 h-16 rounded-full bg-brand-light items-center justify-center shadow-lg border-2 border-brand shadow-brand/50"
        >
          <Ionicons name="paper-plane-outline" size={26} color="#051424" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
