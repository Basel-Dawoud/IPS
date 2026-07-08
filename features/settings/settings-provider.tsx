import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { env } from "@/lib/env";

const DEBUG_MODE_KEY = "navimind.settings.debugMode";
const BYPASS_ENABLED_KEY = "navimind.settings.bypassEnabled";
const HAS_SEEN_WELCOME_KEY = "navimind.settings.hasSeenWelcome";
const NOTIFICATIONS_ENABLED_KEY = "navimind.settings.notificationsEnabled";

interface SettingsContextType {
  debugMode: boolean;
  setDebugMode: (value: boolean) => void;
  bypassEnabled: boolean;
  setBypassEnabled: (value: boolean) => void;
  hasSeenWelcome: boolean;
  setHasSeenWelcome: (value: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => void;
  isLoaded: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [debugMode, setDebugModeState] = useState(false);
  const [bypassEnabled, setBypassEnabledState] = useState(env.remoteBypass);
  const [hasSeenWelcome, setHasSeenWelcomeState] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      if (Platform.OS === "web") {
        setIsLoaded(true);
        return;
      }
      try {
        const storedDebug = await SecureStore.getItemAsync(DEBUG_MODE_KEY);
        if (storedDebug !== null) {
          setDebugModeState(storedDebug === "true");
        }

        const storedBypass = await SecureStore.getItemAsync(BYPASS_ENABLED_KEY);
        if (storedBypass !== null) {
          setBypassEnabledState(storedBypass === "true");
        } else {
          // If not set yet, fallback to the environment default
          setBypassEnabledState(env.remoteBypass);
        }

        const storedWelcome = await SecureStore.getItemAsync(HAS_SEEN_WELCOME_KEY);
        if (storedWelcome !== null) {
          setHasSeenWelcomeState(storedWelcome === "true");
        }

        const storedNotifications = await SecureStore.getItemAsync(NOTIFICATIONS_ENABLED_KEY);
        if (storedNotifications !== null) {
          setNotificationsEnabledState(storedNotifications === "true");
        }
      } catch (err) {
        console.warn("[settings-provider] Failed to load settings", err);
      } finally {
        setIsLoaded(true);
      }
    }
    loadSettings();
  }, []);

  const setDebugMode = async (value: boolean) => {
    setDebugModeState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(DEBUG_MODE_KEY, value ? "true" : "false");
    } catch (err) {
      console.warn("[settings-provider] Failed to save debugMode", err);
    }
  };

  const setBypassEnabled = async (value: boolean) => {
    setBypassEnabledState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(BYPASS_ENABLED_KEY, value ? "true" : "false");
    } catch (err) {
      console.warn("[settings-provider] Failed to save bypassEnabled", err);
    }
  };

  const setHasSeenWelcome = async (value: boolean) => {
    setHasSeenWelcomeState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(HAS_SEEN_WELCOME_KEY, value ? "true" : "false");
    } catch (err) {
      console.warn("[settings-provider] Failed to save hasSeenWelcome", err);
    }
  };

  const setNotificationsEnabled = async (value: boolean) => {
    setNotificationsEnabledState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(NOTIFICATIONS_ENABLED_KEY, value ? "true" : "false");
    } catch (err) {
      console.warn("[settings-provider] Failed to save notificationsEnabled", err);
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        debugMode,
        setDebugMode,
        bypassEnabled,
        setBypassEnabled,
        hasSeenWelcome,
        setHasSeenWelcome,
        notificationsEnabled,
        setNotificationsEnabled,
        isLoaded,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
