import { Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { cn } from '@/lib/cn';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  className?: string;
};

const TYPE_CLASSES = {
  default: 'text-base/6',
  defaultSemiBold: 'text-base/6 font-semibold',
  title: 'text-[32px] font-bold leading-[32px]',
  subtitle: 'text-xl font-bold',
  link: 'text-base leading-[30px] text-link',
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  className,
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[{ color }, style]}
      className={cn(TYPE_CLASSES[type], className)}
      {...rest}
    />
  );
}
