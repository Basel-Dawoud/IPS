import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import "react-native-reanimated";
import "../globals.css";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { createQueryClient } from "@/lib/query-client";
import { ProximityProvider } from "@/features/proximity/proximity-provider";
import { AuthProvider, useAuth } from "@/features/auth/auth-provider";
import { NavigationTargetProvider } from "@/features/navigation/navigation-target-provider";
import { SettingsProvider, useSettings } from "@/features/settings/settings-provider";
import { SavedPlacesProvider } from "@/features/buildings/saved-places-context";

export const unstable_settings = {
  anchor: "(tabs)",
};

/**
 * Redirects between the sign-in screen and the tabs based on auth state.
 * Lives inside <AuthProvider> so it can read the context.
 */
function AuthGate() {
  const { user, hasToken, isLoading: authLoading } = useAuth();
  const { hasSeenWelcome, isLoaded: settingsLoaded } = useSettings();
  const router = useRouter();
  const segments = useSegments();

  const isLoading = authLoading || !settingsLoaded;

  useEffect(() => {
    if (isLoading) return;
    const onOnboardingScreen = segments[0] === "onboarding";
    const onSignInScreen = segments[0] === "sign-in";
    const onInterestsScreen = segments[0] === "interests";
    const authed = !!user || hasToken;

    if (!hasSeenWelcome) {
      // First-time welcome slides MUST be shown before anything else.
      if (!onOnboardingScreen) {
        router.replace("/onboarding");
      }
    } else if (!authed) {
      // Welcome done but not authenticated -> go to sign-in.
      if (!onSignInScreen) {
        router.replace("/sign-in");
      }
    } else if (user && !user.onboardingComplete) {
      // Authenticated first-timer -> choose interests.
      if (!onInterestsScreen) {
        router.replace("/interests");
      }
    } else {
      // Fully onboarded. Bounce the auth/first-run screens back to the app,
      // but leave the interests screen alone when opened in edit mode from Settings.
      if (onSignInScreen || onOnboardingScreen) {
        router.replace("/(tabs)");
      }
    }
  }, [isLoading, user, hasToken, hasSeenWelcome, segments, router]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProximityProvider>
            <NavigationTargetProvider>
              <SettingsProvider>
                <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
                  <SavedPlacesProvider>
                    <AuthGate />
                    <Stack>
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen name="sign-in" options={{ headerShown: false, animation: "fade" }} />
                      <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="interests" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="edit-profile" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="change-password" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="recent-visits" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="visit-again" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
                      <Stack.Screen name="map-explore" options={{ headerShown: false, animation: "slide_from_bottom" }} />
                      <Stack.Screen name="deal/[id]" options={{ headerShown: false, animation: "slide_from_bottom" }} />
                      <Stack.Screen name="friends" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="friend-invite/index" options={{ headerShown: false, animation: "slide_from_right" }} />
                      <Stack.Screen name="friend-invite/[token]" options={{ headerShown: false, animation: "slide_from_bottom" }} />
                      <Stack.Screen name="share/[token]" options={{ headerShown: false, animation: "slide_from_bottom" }} />
                    </Stack>
                    <StatusBar style="light" />
                  </SavedPlacesProvider>
                </ThemeProvider>
              </SettingsProvider>
            </NavigationTargetProvider>
          </ProximityProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
