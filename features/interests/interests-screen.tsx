import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/features/auth/auth-provider";
import {
  fetchOnboardingCategories,
  postSaveInterests,
  postSkipOnboarding,
  OnboardingCategory,
} from "@/features/onboarding/onboarding-api";
import { GenderSelector, AgeField, StepFreeToggle } from "@/features/profile/profile-fields";

export type InterestsMode = "onboarding" | "edit";

function getCategoryIcon(name: string): any {
  const n = name.toLowerCase();
  if (n.includes("tech") || n.includes("electron")) return "laptop-outline";
  if (n.includes("gaming") || n.includes("game")) return "game-controller-outline";
  if (n.includes("home") || n.includes("living")) return "home-outline";
  if (n.includes("personal") || n.includes("health") || n.includes("beauty"))
    return "heart-outline";
  if (n.includes("kitchen") || n.includes("dining")) return "restaurant-outline";
  if (n.includes("decor") || n.includes("furnish")) return "color-palette-outline";
  if (n.includes("tool") || n.includes("utility")) return "hammer-outline";
  if (n.includes("pet") || n.includes("garden")) return "leaf-outline";
  return "bookmark-outline";
}

export function InterestsScreen({ mode = "onboarding" }: { mode?: InterestsMode }) {
  const { user, refreshMe } = useAuth();
  const router = useRouter();
  const isEdit = mode === "edit";

  const [categories, setCategories] = useState<OnboardingCategory[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [needsStepFree, setNeedsStepFree] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await fetchOnboardingCategories();
        if (active) {
          setCategories(data);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setError("Failed to load interest categories.");
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  // Pre-select the user's current interests/age/gender once categories arrive (edit mode).
  useEffect(() => {
    if (prefilled || categories.length === 0 || !user) return;
    // /auth/me returns interests as category names; PoiCategory.name is unique.
    const currentNames = new Set((user.interests ?? []).map((n) => n.toLowerCase()));
    const ids = categories
      .filter((c) => currentNames.has(c.name.toLowerCase()))
      .map((c) => c.id);
    if (ids.length > 0) setSelectedIds(ids);
    if (typeof user.age === "number") setAge(String(user.age));
    if (user.gender) setGender(user.gender);
    if (typeof user.needsStepFree === "boolean") setNeedsStepFree(user.needsStepFree);
    setPrefilled(true);
  }, [categories, user, prefilled]);

  const toggleCategory = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleContinue = async () => {
    if (selectedIds.length === 0) {
      setError("Please select at least one interest category.");
      return;
    }

    // Age & gender are only collected during onboarding — the edit path (opened
    // from Settings) manages them in Edit Profile instead. Send undefined in edit
    // mode so the backend leaves the stored values untouched.
    let numAge: number | undefined;
    let genderToSave: string | undefined;
    if (!isEdit) {
      if (!gender) {
        setError("Please select your gender.");
        return;
      }
      if (!age) {
        setError("Please enter your age.");
        return;
      }
      numAge = parseInt(age, 10);
      if (isNaN(numAge) || numAge <= 0 || numAge > 120) {
        setError("Please enter a valid age.");
        return;
      }
      genderToSave = gender;
    }

    setError(null);
    setIsSaving(true);
    try {
      await postSaveInterests(
        selectedIds,
        numAge,
        genderToSave,
        isEdit ? undefined : needsStepFree,
      );
      await refreshMe();
      // Edit mode returns to Settings; onboarding mode advances to the app.
      if (isEdit) router.back();
      else router.replace("/(tabs)");
    } catch (err: any) {
      setError("Failed to save interests. Please try again.");
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const numAge = age ? parseInt(age, 10) : null;
      await postSkipOnboarding(
        numAge && !isNaN(numAge) ? numAge : null,
        gender,
        needsStepFree,
      );
      await refreshMe();
      // Skip is only available in onboarding mode → go straight to the app.
      router.replace("/(tabs)");
    } catch (err: any) {
      setError("Failed to skip. Please try again.");
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color="#00e5ff" />
        <Text className="text-slate-400 text-sm mt-3 font-semibold">
          Curating your experience...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      {/* Header: back (edit) & skip (onboarding) */}
      <View className="px-6 pt-6 pb-2 flex-row justify-between items-center">
        {isEdit ? (
          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center gap-1"
          >
            <Ionicons name="chevron-back" size={20} color="#64748b" />
            <Text className="text-sm font-semibold text-slate-400">Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {!isEdit && (
          <TouchableOpacity onPress={handleSkip} disabled={isSaving}>
            <Text className="text-sm font-bold text-cyan">Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="px-6 mt-4">
        <Text className="text-2xl font-bold text-white tracking-tight">
          {isEdit ? "Edit Interests" : "Customize Experience"}
        </Text>
        <Text className="text-xs text-slate-400 font-medium mt-1">
          {isEdit
            ? "Update the categories you care about"
            : "Choose the categories you are shopping for today"}
        </Text>
      </View>

      {error && (
        <View className="mx-6 my-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex-row items-center gap-2">
          <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
          <Text className="text-red-400 text-xs font-semibold flex-1">{error}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Age & gender are collected only during onboarding. In edit mode they
            live in Edit Profile, so the interests editor stays categories-only. */}
        {!isEdit && (
          <>
            <GenderSelector value={gender} onChange={setGender} />
            <AgeField value={age} onChange={setAge} />
            <StepFreeToggle value={needsStepFree} onChange={setNeedsStepFree} />

            {/* Categories Separator */}
            <View className="h-px bg-white/5 my-1" />
          </>
        )}

        <View className="gap-2">
          <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
            Categories Interests
          </Text>
          <View className="flex-row flex-wrap justify-between gap-y-3.5">
            {categories.map((cat) => {
              const isSelected = selectedIds.includes(cat.id);
              const iconName = getCategoryIcon(cat.name);
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => toggleCategory(cat.id)}
                  activeOpacity={0.7}
                  style={{ width: "48%" }}
                  className={`p-4 rounded-2xl border ${
                    isSelected
                      ? "bg-brand/20 border-brand"
                      : "bg-surface-variant/30 border-white/5"
                  } items-center justify-center`}
                >
                  <View
                    className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${
                      isSelected ? "bg-brand/30" : "bg-white/5"
                    }`}
                  >
                    <Ionicons
                      name={iconName as any}
                      size={22}
                      color={isSelected ? "#00e5ff" : "#cbd5e1"}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    className={`font-semibold text-sm text-center ${
                      isSelected ? "text-white" : "text-slate-300"
                    }`}
                  >
                    {cat.name}
                  </Text>
                  {cat.description && (
                    <Text
                      numberOfLines={2}
                      className="text-[10px] text-center text-slate-500 mt-1 leading-4"
                    >
                      {cat.description}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View className="p-6 pt-2">
        <TouchableOpacity
          onPress={handleContinue}
          disabled={isSaving}
          className="w-full bg-brand py-4 rounded-2xl items-center justify-center shadow-lg shadow-brand/20"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-bold text-base">
              {isEdit ? "Save" : "Get Started"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
