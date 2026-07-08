import { View, ViewProps, Text, TextProps } from "react-native";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn(
        "rounded-2xl bg-surface-variant/80 border border-white/10 p-4",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: ViewProps & { className?: string }) {
  return <View className={cn("mb-2", className)} {...rest} />;
}

export function CardTitle({ className, children, ...rest }: TextProps & { className?: string }) {
  return (
    <Text
      className={cn("text-lg font-semibold text-white", className)}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function CardDescription({ className, children, ...rest }: TextProps & { className?: string }) {
  return (
    <Text className={cn("text-sm text-neutral-300", className)} {...rest}>
      {children}
    </Text>
  );
}

export function CardContent({ className, ...rest }: ViewProps & { className?: string }) {
  return <View className={cn("", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ViewProps & { className?: string }) {
  return <View className={cn("mt-3 flex-row items-center gap-2", className)} {...rest} />;
}
