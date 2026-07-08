import { useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/features/auth/auth-provider";
import { resolveAssetSource } from "@/lib/api-client";
import {
  GenderSelector,
  AgeField,
  StepFreeToggle,
  ShareWithFriendsToggle,
} from "./profile-fields";
import { updateProfile, uploadAvatar } from "./api";

export function EditProfileScreen() {
  const { user, refreshMe } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? "");
  const [age, setAge] = useState(typeof user?.age === "number" ? String(user.age) : "");
  const [gender, setGender] = useState<string | null>(user?.gender ?? null);
  const [needsStepFree, setNeedsStepFree] = useState<boolean>(user?.needsStepFree ?? false);
  const [shareWithFriends, setShareWithFriends] = useState<boolean>(
    user?.shareWithFriends ?? true,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarSource = resolveAssetSource(user?.avatarUrl);

  const handlePickAvatar = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission is required to change your avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setIsUploading(true);
    try {
      await uploadAvatar(result.assets[0].uri);
      await refreshMe();
    } catch (err: any) {
      setError(err?.message ?? "Failed to upload avatar.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }
    let numAge: number | undefined;
    if (age) {
      numAge = parseInt(age, 10);
      if (isNaN(numAge) || numAge <= 0 || numAge > 120) {
        setError("Please enter a valid age.");
        return;
      }
    }

    setIsSaving(true);
    try {
      await updateProfile({
        name: trimmedName,
        age: numAge,
        gender: gender ?? undefined,
        needsStepFree,
        shareWithFriends,
      });
      await refreshMe();
      router.back();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save profile. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="px-6 pt-6 pb-2 flex-row justify-between items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="chevron-back" size={20} color="#64748b" />
          <Text className="text-sm font-semibold text-slate-400">Back</Text>
        </TouchableOpacity>
      </View>

      <View className="px-6 mt-4">
        <Text className="text-2xl font-bold text-white tracking-tight">Edit Profile</Text>
        <Text className="text-xs text-slate-400 font-medium mt-1">
          Update your name, photo and personal details
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
        {/* Avatar */}
        <View className="items-center gap-3">
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.85} disabled={isUploading}>
            <View className="w-28 h-28 rounded-full bg-brand/20 border-2 border-brand items-center justify-center overflow-hidden">
              {isUploading ? (
                <ActivityIndicator size="small" color="#00e5ff" />
              ) : avatarSource ? (
                <ExpoImage
                  source={avatarSource}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <Ionicons name="person" size={44} color="#66b0ff" />
              )}
            </View>
            <View className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-brand items-center justify-center border-2 border-background">
              <Ionicons name="camera" size={16} color="white" />
            </View>
          </TouchableOpacity>
          <Text className="text-xs text-slate-400">Tap to change photo</Text>
        </View>

        {/* Name */}
        <View className="gap-2">
          <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#475569"
            className="w-full bg-surface-variant/20 border border-white/5 text-white font-semibold text-sm px-4 py-3.5 rounded-2xl"
          />
        </View>

        <GenderSelector value={gender} onChange={setGender} />
        <AgeField value={age} onChange={setAge} />
        <StepFreeToggle value={needsStepFree} onChange={setNeedsStepFree} />
        <ShareWithFriendsToggle value={shareWithFriends} onChange={setShareWithFriends} />
      </ScrollView>

      <View className="p-6 pt-2">
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          className="w-full bg-brand py-4 rounded-2xl items-center justify-center shadow-lg shadow-brand/20"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-bold text-base">Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
