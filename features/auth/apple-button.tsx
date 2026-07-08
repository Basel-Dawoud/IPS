import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cn } from "@/lib/cn";
import { useAuth } from "./auth-provider";

/**
 * Apple sign-in button. Hidden on non-iOS platforms (App Store policy
 * only requires Sign in with Apple on iOS). Uses our own styled button
 * rather than `AppleAuthenticationButton` so the visual matches the app.
 */
export function AppleButton({ className }: { className?: string }) {
  const { signInWithApple } = useAuth();
  if (Platform.OS !== "ios") return null;

  return (
    <Pressable
      onPress={signInWithApple}
      className={cn(
        "flex-row items-center justify-center gap-3 rounded-2xl bg-black px-5 py-4 active:bg-neutral-800 shadow-lg border border-white/10",
        className,
      )}
    >
      <View className="w-6 h-6 items-center justify-center">
        <Ionicons name="logo-apple" size={24} color="#ffffff" />
      </View>
      <Text className="text-base font-semibold text-white">Continue with Apple</Text>
    </Pressable>
  );
}
