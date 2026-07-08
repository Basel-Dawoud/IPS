import React, { useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  Image,
  ImageBackground,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useSettings } from "@/features/settings/settings-provider";

export function OnboardingScreen() {
  const { setHasSeenWelcome } = useSettings();
  const [step, setStep] = useState(1);

  // Finishing the welcome slides hands routing back to AuthGate,
  // which then sends the user to the sign-in screen.
  const finishWelcome = async () => {
    await setHasSeenWelcome(true);
  };

  // --- STEP 1: Welcome Screen ---
  if (step === 1) {
    return (
      <ImageBackground
        source={require("@/assets/images/onboarding1.png")}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        {/* Overall light-dark overlay for better text contrast */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
          }}
        />

        <LinearGradient
          colors={["rgba(6, 11, 19, 0.15)", "rgba(6, 11, 19, 0.94)"]}
          style={{ flex: 1 }}
        >
          <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
            {/* Top Header Row with Center Logo & Right Skip */}
            <View className="relative w-full items-center justify-center pt-4">
              <Image
                source={require("@/assets/images/logo.png")}
                className="w-40 h-40"
                resizeMode="contain"
              />
              <TouchableOpacity
                onPress={finishWelcome}
                style={{ position: "absolute", right: 24, top: 16 }}
              >
                <Text className="text-slate-200 font-bold text-sm">Skip</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable content aligned to the bottom */}
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
              className="px-6 pb-6"
              showsVerticalScrollIndicator={false}
            >
              {/* Title / Headline */}
              <View className="mb-6">
                <Text className="text-3xl font-extrabold text-white tracking-tight leading-none">
                  Spatial Intelligence
                </Text>
                <Text className="text-3xl font-extrabold text-[#00e5ff] tracking-tight mt-1 leading-none">
                  In Your Pocket
                </Text>
                <Text className="text-sm text-slate-300 mt-4 leading-6">
                  Navigate complex indoor spaces with meter-level precision and an AI
                  assistant that knows exactly what you need.
                </Text>
              </View>

              {/* Feature list */}
              <View className="gap-3.5 mb-6">
                <View className="flex-row items-center p-4 bg-[#111827]/60 border border-white/5 rounded-2xl gap-4">
                  <View className="w-11 h-11 bg-brand/10 border border-brand/20 rounded-xl items-center justify-center">
                    <Ionicons name="navigate" size={20} color="#00e5ff" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-white">
                      Precision Navigation
                    </Text>
                    <Text className="text-xs text-slate-400 mt-0.5">
                      Step-by-step indoor wayfinding.
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center p-4 bg-[#111827]/60 border border-white/5 rounded-2xl gap-4">
                  <View className="w-11 h-11 bg-brand/10 border border-brand/20 rounded-xl items-center justify-center">
                    <Ionicons name="chatbubble-ellipses" size={20} color="#00e5ff" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-white">
                      AI Chatbot Assistant
                    </Text>
                    <Text className="text-xs text-slate-400 mt-0.5">
                      Conversational help for any space.
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center p-4 bg-[#111827]/60 border border-white/5 rounded-2xl gap-4">
                  <View className="w-11 h-11 bg-brand/10 border border-brand/20 rounded-xl items-center justify-center">
                    <Ionicons name="sparkles" size={20} color="#00e5ff" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-white">
                      Personalized Recs
                    </Text>
                    <Text className="text-xs text-slate-400 mt-0.5">
                      Discovery tailored to your journey.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Bottom Indicators & Button */}
              <View className="gap-5">
                {/* Dots */}
                <View className="flex-row justify-center items-center gap-2">
                  <View className="w-6 h-1.5 rounded-full bg-cyan" />
                  <View className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                </View>

                {/* Button */}
                <TouchableOpacity
                  onPress={() => setStep(2)}
                  className="w-full bg-[#007AFF] py-4 rounded-2xl items-center justify-center shadow-lg shadow-brand/20"
                >
                  <Text className="text-white font-bold text-base">Next</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </LinearGradient>
      </ImageBackground>
    );
  }

  // --- STEP 2: Welcome Screen (Shop & Discover) ---
  return (
    <ImageBackground
      source={require("@/assets/images/onboarding2.png")}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      {/* Overall light-dark overlay for better text contrast */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.45)" }} />

      <LinearGradient
        colors={["rgba(6, 11, 19, 0.15)", "rgba(6, 11, 19, 0.94)"]}
        style={{ flex: 1 }}
      >
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          {/* Top Header Row with Center Logo & Right Skip */}
          <View className="relative w-full items-center justify-center pt-4">
            <Image
              source={require("@/assets/images/logo.png")}
              className="w-40 h-40"
              resizeMode="contain"
            />
            <TouchableOpacity
              onPress={finishWelcome}
              style={{ position: "absolute", right: 24, top: 16 }}
            >
              <Text className="text-slate-200 font-bold text-sm">Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Scrollable content aligned to the bottom */}
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
            className="px-6 pb-6"
            showsVerticalScrollIndicator={false}
          >
            {/* Title / Headline */}
            <View className="mb-6">
              <Text className="text-3xl font-extrabold text-white tracking-tight leading-none">
                Shop & Discover
              </Text>
              <Text className="text-sm text-slate-300 mt-4 leading-6">
                Navigate complex mall layouts with pinpoint accuracy and let AI guide you to the stores you love.
              </Text>
            </View>

            {/* Two columns side-by-side cards */}
            <View className="flex-row justify-between mb-4">
              <View style={{ width: "48%" }} className="p-4 bg-[#111827]/60 border border-white/5 rounded-2xl">
                <View className="w-10 h-10 bg-brand/10 border border-brand/20 rounded-xl items-center justify-center mb-3">
                  <Ionicons name="layers" size={18} color="#00e5ff" />
                </View>
                <Text className="text-sm font-bold text-white leading-tight">Real-time Detection</Text>
                <Text className="text-[11px] text-slate-400 mt-1.5 leading-4">Automatic floor switching as you move.</Text>
              </View>

              <View style={{ width: "48%" }} className="p-4 bg-[#111827]/60 border border-white/5 rounded-2xl">
                <View className="w-10 h-10 bg-brand/10 border border-brand/20 rounded-xl items-center justify-center mb-3">
                  <Ionicons name="search" size={18} color="#00e5ff" />
                </View>
                <Text className="text-sm font-bold text-white leading-tight">Smart Search</Text>
                <Text className="text-[11px] text-slate-400 mt-1.5 leading-4">Find exact brands and products instantly.</Text>
              </View>
            </View>

            {/* Mock search bar */}
            <View className="flex-row items-center bg-[#111827]/80 border border-white/5 rounded-full px-4 py-3 mb-6">
              <Ionicons name="search-outline" size={16} color="#94a3b8" className="mr-2.5" />
              <Text className="text-slate-400 text-xs flex-1">
                Search for "Nike Store" or "Cafe"...
              </Text>
              <View className="w-6 h-6 bg-white/10 rounded-full items-center justify-center">
                <Ionicons name="mic" size={13} color="#94a3b8" />
              </View>
            </View>

            {/* Bottom Indicators & Button */}
            <View className="gap-5">
              {/* Dots */}
              <View className="flex-row justify-center items-center gap-2">
                <View className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                <View className="w-6 h-1.5 rounded-full bg-cyan" />
              </View>

              {/* Button */}
              <TouchableOpacity
                onPress={finishWelcome}
                className="w-full bg-[#007AFF] py-4 rounded-2xl items-center justify-center shadow-lg shadow-brand/20"
              >
                <Text className="text-white font-bold text-base">Get Started</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </ImageBackground>
  );
}
