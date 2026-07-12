import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  acceptFriendInvite,
  fetchFriends,
  removeFriend,
} from "@/features/location-sharing/api";
import type { FriendListEntry } from "@/features/location-sharing/types";
import { resolveAssetSource } from "@/lib/api-client";

function presenceLine(entry: FriendListEntry): { text: string; live: boolean } {
  const p = entry.presence;
  if (!p) return { text: "Location not shared", live: false };
  if (!p.online) {
    const where = p.buildingName ? `Last seen at ${p.buildingName}` : "Offline";
    return { text: where, live: false };
  }
  return {
    text: `In ${p.buildingName ?? "a building"}${
      p.floorLevel != null ? ` • Floor ${p.floorLevel}` : ""
    }`,
    live: true,
  };
}

export default function FriendsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");

  const {
    data: friends,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["friends"],
    queryFn: fetchFriends,
    refetchInterval: 15_000, // keep presence fresh while the screen is open
  });

  const acceptMutation = useMutation({
    mutationFn: (tokenOrCode: string) => acceptFriendInvite(tokenOrCode),
    onSuccess: (res) => {
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      Alert.alert(
        "Friend added",
        `You and ${res.friend?.name ?? "your friend"} are now friends.`,
      );
    },
    onError: (err: any) => {
      Alert.alert("Couldn't add friend", err?.message ?? "Check the code and try again.");
    },
  });

  const handleOpenFriend = (entry: FriendListEntry) => {
    const p = entry.presence;
    if (!p?.buildingId) {
      Alert.alert(
        entry.user.name ?? "Friend",
        "No live location right now. They appear here as soon as they open the app inside a building.",
      );
      return;
    }
    router.push(
      `/navigation?buildingId=${p.buildingId}&friendUserId=${entry.user.id}&friendName=${encodeURIComponent(
        entry.user.name ?? "Friend",
      )}` as any,
    );
  };

  const handleRemove = (entry: FriendListEntry) => {
    Alert.alert(
      "Remove friend",
      `Remove ${entry.user.name ?? "this friend"}? You'll stop seeing each other's locations.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeFriend(entry.user.id);
              queryClient.invalidateQueries({ queryKey: ["friends"] });
            } catch (err: any) {
              Alert.alert("Failed", err?.message ?? "Please try again.");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-3 border-b border-white/5">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={22} color="#d4e4fa" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-white">Friends</Text>
        </View>
        <TouchableOpacity
          className="flex-row items-center gap-1.5 bg-brand/20 border border-brand/40 rounded-full px-3.5 py-2"
          onPress={() => router.push("/friend-invite" as any)}
        >
          <Ionicons name="person-add" size={15} color="#66b0ff" />
          <Text className="text-brand text-xs font-bold">Add friend</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerClassName="p-6 gap-4 pb-16"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Enter an invite code */}
        <View className="gap-2">
          <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
            Have an invite code?
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="K7X2M9"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              maxLength={6}
              className="flex-1 bg-surface-variant/20 border border-white/5 text-white font-bold tracking-[4px] text-base px-4 py-3 rounded-2xl"
            />
            <TouchableOpacity
              disabled={code.trim().length < 4 || acceptMutation.isPending}
              onPress={() => acceptMutation.mutate(code.trim())}
              className={`px-5 rounded-2xl items-center justify-center ${
                code.trim().length >= 4 ? "bg-brand" : "bg-neutral-800"
              }`}
            >
              {acceptMutation.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-bold text-sm">Add</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Friends list */}
        {isLoading ? (
          <ActivityIndicator size="large" color="#66b0ff" className="mt-10" />
        ) : !friends || friends.length === 0 ? (
          <View className="items-center py-12 gap-3">
            <View className="w-20 h-20 rounded-full bg-brand/15 border border-brand/30 items-center justify-center">
              <Ionicons name="people-outline" size={34} color="#66b0ff" />
            </View>
            <Text className="text-white font-bold text-lg">No friends yet</Text>
            <Text className="text-neutral-400 text-center text-sm px-6">
              Add a friend with a QR code or invite link — then you'll see each other on
              the map whenever you're in a building.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {friends.map((entry) => {
              const line = presenceLine(entry);
              return (
                <TouchableOpacity
                  key={entry.user.id}
                  activeOpacity={0.85}
                  onPress={() => handleOpenFriend(entry)}
                  onLongPress={() => handleRemove(entry)}
                  className="flex-row items-center gap-3 bg-surface-variant/80 border border-white/10 rounded-2xl p-4"
                >
                  <View className="w-12 h-12 rounded-full overflow-hidden bg-neutral-900 border border-white/15 items-center justify-center">
                    {entry.user.avatarUrl ? (
                      <Image
                        source={resolveAssetSource(entry.user.avatarUrl) as any}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={22} color="#66b0ff" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-white font-semibold text-base"
                      numberOfLines={1}
                    >
                      {entry.user.name ?? "Friend"}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      {line.live ? (
                        <View className="w-2 h-2 rounded-full bg-emerald-400" />
                      ) : null}
                      <Text
                        className={`text-xs ${line.live ? "text-emerald-300 font-semibold" : "text-neutral-400"}`}
                        numberOfLines={1}
                      >
                        {line.text}
                      </Text>
                    </View>
                  </View>
                  {line.live ? (
                    <View className="bg-emerald-500/15 border border-emerald-500/40 rounded-full px-3 py-1.5">
                      <Text className="text-emerald-300 text-[11px] font-bold">
                        Find them
                      </Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#64748b" />
                  )}
                </TouchableOpacity>
              );
            })}
            <Text className="text-[11px] text-neutral-500 text-center mt-1">
              Long-press a friend to remove them.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
