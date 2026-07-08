import { ActivityIndicator, Share, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { createFriendInvite } from "@/features/location-sharing/api";

/**
 * "Add friend" page: shows a QR code (encodes the https invite URL so any
 * camera app opens it), the 6-char code for manual entry, and a share button.
 */
export default function FriendInviteScreen() {
  const router = useRouter();

  const { data: invite, isLoading, error, refetch } = useQuery({
    queryKey: ["friend-invite"],
    queryFn: createFriendInvite,
    staleTime: Infinity, // one invite per screen visit
    gcTime: 0,
    retry: false,
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-6 py-3 border-b border-white/5">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={22} color="#d4e4fa" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-white">Add a friend</Text>
      </View>

      <View className="flex-1 items-center justify-center p-6 gap-6">
        {isLoading ? (
          <ActivityIndicator size="large" color="#66b0ff" />
        ) : error || !invite ? (
          <View className="items-center gap-4">
            <Text className="text-neutral-400 text-center">
              Couldn't create an invite. {(error as Error)?.message ?? ""}
            </Text>
            <TouchableOpacity
              className="bg-brand rounded-2xl px-6 py-3"
              onPress={() => refetch()}
            >
              <Text className="text-white font-bold">Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text className="text-neutral-400 text-center text-sm px-4">
              Ask your friend to scan this QR code with their camera, open your link, or
              type the code below in their Friends screen.
            </Text>

            {/* QR of the https URL — the phone camera opens it, the backend
                page redirects into the app. */}
            <View className="bg-white p-5 rounded-3xl">
              <QRCode value={invite.url} size={220} backgroundColor="white" color="#0b1220" />
            </View>

            {/* Manual code */}
            <View className="items-center gap-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                Or enter this code
              </Text>
              <Text className="text-white font-black text-4xl tracking-[8px]">
                {invite.code}
              </Text>
              <Text className="text-[11px] text-neutral-500">Valid for 24 hours</Text>
            </View>

            <TouchableOpacity
              className="w-full h-14 bg-brand rounded-2xl items-center justify-center flex-row gap-2"
              activeOpacity={0.85}
              onPress={() =>
                Share.share({
                  message: `Add me as a friend on Navimind so we can find each other indoors: ${invite.url} (or enter code ${invite.code})`,
                })
              }
            >
              <Ionicons name="share-social" size={20} color="white" />
              <Text className="text-white font-bold text-base">Share invite link</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
