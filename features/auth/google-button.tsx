import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cn } from "@/lib/cn";
import { useAuth } from "./auth-provider";

export function GoogleButton({ className }: { className?: string }) {
  const { signInWithGoogle } = useAuth();
  return (
    <Pressable
      onPress={signInWithGoogle}
      className={cn(
        "flex-row items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 active:bg-neutral-200 shadow-lg",
        className,
      )}
    >
      <View className="w-6 h-6 items-center justify-center">
        <Ionicons name="logo-google" size={22} color="#1f1f1f" />
      </View>
      <Text className="text-base font-semibold text-neutral-900">Continue with Google</Text>
    </Pressable>
  );
}
