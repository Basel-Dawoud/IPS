import { useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  acceptFriendInvite,
  resolveFriendInvite,
} from "@/features/location-sharing/api";
import { resolveAssetSource } from "@/lib/api-client";

/**
 * Landing screen for a friend-invite deep link
 * (navimind://friend-invite/<token>, via the backend's /f/<token> page).
 */
export default function FriendInviteLandingScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const inviteToken = typeof token === "string" ? token : "";
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["friend-invite", inviteToken],
    queryFn: () => resolveFriendInvite(inviteToken),
    enabled: !!inviteToken,
    retry: false,
  });

  const inviterName = data?.owner?.name ?? "Someone";

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptFriendInvite(inviteToken);
      router.replace("/friends" as any);
    } catch (err: any) {
      setAcceptError(err?.message ?? "Couldn't accept the invite.");
      setAccepting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center px-6 py-3 border-b border-white/5">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={22} color="#d4e4fa" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-white">Friend request</Text>
      </View>

      <View className="flex-1 items-center justify-center p-6 gap-5">
        {isLoading ? (
          <ActivityIndicator size="large" color="#66b0ff" />
        ) : error || !data?.owner ? (
          <>
            <View className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 items-center justify-center">
              <Ionicons name="unlink" size={34} color="#f87171" />
            </View>
            <Text className="text-white font-bold text-xl text-center">
              This invite isn't valid
            </Text>
            <Text className="text-neutral-400 text-center">
              {(error as Error)?.message ?? "It may have expired or already been used."}
            </Text>
          </>
        ) : (
          <>
            <View className="w-24 h-24 rounded-full overflow-hidden border-2 border-brand/60 bg-neutral-900 items-center justify-center">
              {data.owner.avatarUrl ? (
                <Image
                  source={resolveAssetSource(data.owner.avatarUrl) as any}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={40} color="#66b0ff" />
              )}
            </View>
            <Text className="text-white font-bold text-2xl text-center">
              {inviterName} wants to be friends
            </Text>
            <Text className="text-neutral-400 text-center text-sm px-4">
              Friends can see which building and floor each other are in, and navigate to
              each other indoors. You can turn this off anytime in your profile.
            </Text>
            {acceptError ? (
              <Text className="text-red-400 text-sm text-center">{acceptError}</Text>
            ) : null}
            <TouchableOpacity
              className="w-full h-14 bg-brand rounded-2xl items-center justify-center flex-row gap-2 mt-2"
              activeOpacity={0.85}
              disabled={accepting}
              onPress={handleAccept}
            >
              {accepting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color="white" />
                  <Text className="text-white font-bold text-base">Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
