import { Text, View } from "react-native";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONE_BG: Record<Tone, string> = {
  neutral: "bg-neutral-200 dark:bg-neutral-800",
  brand: "bg-brand-100 dark:bg-brand-dark",
  success: "bg-green-100 dark:bg-green-900",
  warning: "bg-yellow-100 dark:bg-yellow-900",
  danger: "bg-red-100 dark:bg-red-900",
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-neutral-700 dark:text-neutral-300",
  brand: "text-brand-dark dark:text-brand-100",
  success: "text-green-800 dark:text-green-200",
  warning: "text-yellow-800 dark:text-yellow-200",
  danger: "text-red-800 dark:text-red-200",
};

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <View className={cn("self-start rounded-full px-2.5 py-1", TONE_BG[tone])}>
      <Text className={cn("text-xs font-medium", TONE_TEXT[tone])}>{label}</Text>
    </View>
  );
}
