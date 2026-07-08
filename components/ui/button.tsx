import { ActivityIndicator, Pressable, PressableProps, Text } from "react-native";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
  labelClasses?: string;
}

const VARIANT_BG: Record<Variant, string> = {
  primary: "bg-brand border border-brand-light/30 active:bg-brand-dark shadow-lg",
  secondary: "bg-surface-variant/80 border border-white/10 active:bg-surface-variant",
  ghost: "bg-transparent active:bg-white/5",
  destructive: "bg-error border border-error/50 active:bg-error/80",
  outline: "bg-transparent border border-white/20 active:bg-white/5",
};

const VARIANT_TEXT: Record<Variant, string> = {
  primary: "text-white font-bold tracking-wide",
  secondary: "text-white font-semibold",
  ghost: "text-white font-medium",
  destructive: "text-white font-bold",
  outline: "text-white font-semibold",
};

const SIZE_BOX: Record<Size, string> = {
  sm: "px-3 py-2 rounded-lg",
  md: "px-4 py-3 rounded-xl",
  lg: "px-5 py-4 rounded-2xl",
};

const SIZE_TEXT: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className,
  labelClasses,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        "flex-row items-center justify-center gap-2",
        SIZE_BOX[size],
        VARIANT_BG[variant],
        isDisabled && "opacity-50",
        className,
      )}
      {...rest}
    >
      {loading && <ActivityIndicator color={variant === "primary" || variant === "destructive" ? "white" : undefined} />}
      <Text className={cn(SIZE_TEXT[size], VARIANT_TEXT[variant], labelClasses)}>{label}</Text>
    </Pressable>
  );
}
