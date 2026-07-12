import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { env } from "@/lib/env";

const DEBUG_MODE_KEY = "navimind.settings.debugMode";
const BYPASS_ENABLED_KEY = "navimind.settings.bypassEnabled";
const SHOW_BYPASS_GUI_KEY = "navimind.settings.showBypassGui";
const BYPASS_POS_KEY = "navimind.settings.bypassPos";
const BYPASS_MODE_KEY = "navimind.settings.bypassMode";
const BYPASS_VIDEO_SESSION_ID_KEY = "navimind.settings.bypassVideoSessionId";
const BYPASS_VIDEO_WALK_INDEX_KEY = "navimind.settings.bypassVideoWalkIndex";
const BYPASS_VIDEO_MODEL_KEY = "navimind.settings.bypassVideoModel";
const BYPASS_VIDEO_POSITION_SOURCE_KEY = "navimind.settings.bypassVideoPositionSource";
const BYPASS_VIDEO_MODEL_SMOOTHER_KEY = "navimind.settings.bypassVideoModelSmoother";
const HAS_SEEN_WELCOME_KEY = "navimind.settings.hasSeenWelcome";
const NOTIFICATIONS_ENABLED_KEY = "navimind.settings.notificationsEnabled";

// Starting fake position used when bypass is on (meter coords + floor).
export const DEFAULT_BYPASS_X = 7;
export const DEFAULT_BYPASS_Y = 7;
export const DEFAULT_BYPASS_FLOOR = 3;

interface SettingsContextType {
  debugMode: boolean;
  setDebugMode: (value: boolean) => void;
  bypassEnabled: boolean;
  setBypassEnabled: (value: boolean) => void;
  showBypassGui: boolean;
  setShowBypassGui: (value: boolean) => void;
  bypassMode: "manual" | "video";
  setBypassMode: (mode: "manual" | "video") => void;
  bypassVideoSessionId: string | null;
  setBypassVideoSessionId: (id: string | null) => void;
  bypassVideoWalkIndex: number;
  setBypassVideoWalkIndex: (index: number) => void;
  bypassVideoModel: string;
  setBypassVideoModel: (model: string) => void;
  bypassVideoPositionSource: "truth" | "model";
  setBypassVideoPositionSource: (source: "truth" | "model") => void;
  bypassVideoModelSmoother: "pdr" | "kalman" | "rts";
  setBypassVideoModelSmoother: (smoother: "pdr" | "kalman" | "rts") => void;
  /** Manual fake position (meter coords) used while bypass is on. */
  bypassX: number;
  bypassY: number;
  bypassFloor: number;
  setBypassPosition: (
    pos: { x?: number; y?: number; floor?: number },
    opts?: { persist?: boolean },
  ) => void;
  hasSeenWelcome: boolean;
  setHasSeenWelcome: (value: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => void;
  isLoaded: boolean;
  simWalk: any | null;
  setSimWalk: (walk: any | null) => void;
  simPlaying: boolean;
  setSimPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  simLoading: boolean;
  setSimLoading: (loading: boolean) => void;
  simError: string | null;
  setSimError: (error: string | null) => void;
  isUsingMock: boolean;
  setIsUsingMock: (isMock: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [debugMode, setDebugModeState] = useState(false);
  const [bypassEnabled, setBypassEnabledState] = useState(env.remoteBypass);
  const [showBypassGui, setShowBypassGuiState] = useState(true);
  const [bypassMode, setBypassModeState] = useState<"manual" | "video">("manual");
  const [bypassVideoSessionId, setBypassVideoSessionIdState] = useState<string | null>(null);
  const [bypassVideoWalkIndex, setBypassVideoWalkIndexState] = useState<number>(0);
  const [bypassVideoModel, setBypassVideoModelState] = useState<string>("trajectory");
  const [bypassVideoPositionSource, setBypassVideoPositionSourceState] = useState<"truth" | "model">("truth");
  const [bypassVideoModelSmoother, setBypassVideoModelSmootherState] = useState<"pdr" | "kalman" | "rts">("kalman");
  const [bypassX, setBypassX] = useState(DEFAULT_BYPASS_X);
  const [bypassY, setBypassY] = useState(DEFAULT_BYPASS_Y);
  const [bypassFloor, setBypassFloor] = useState(DEFAULT_BYPASS_FLOOR);
  const [hasSeenWelcome, setHasSeenWelcomeState] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [simWalk, setSimWalk] = useState<any | null>(null);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [isUsingMock, setIsUsingMock] = useState(false);

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

        const storedShowBypassGui = await SecureStore.getItemAsync(SHOW_BYPASS_GUI_KEY);
        if (storedShowBypassGui !== null) {
          setShowBypassGuiState(storedShowBypassGui === "true");
        }

        const storedBypassMode = await SecureStore.getItemAsync(BYPASS_MODE_KEY);
        if (storedBypassMode === "manual" || storedBypassMode === "video") {
          setBypassModeState(storedBypassMode);
        }

        const storedBypassVideoSessionId = await SecureStore.getItemAsync(BYPASS_VIDEO_SESSION_ID_KEY);
        if (storedBypassVideoSessionId !== null) {
          setBypassVideoSessionIdState(storedBypassVideoSessionId);
        }

        const storedWalkIndex = await SecureStore.getItemAsync(BYPASS_VIDEO_WALK_INDEX_KEY);
        if (storedWalkIndex !== null) {
          setBypassVideoWalkIndexState(parseInt(storedWalkIndex, 10));
        }

        const storedVideoModel = await SecureStore.getItemAsync(BYPASS_VIDEO_MODEL_KEY);
        if (storedVideoModel !== null) {
          setBypassVideoModelState(storedVideoModel);
        }

        const storedSource = await SecureStore.getItemAsync(BYPASS_VIDEO_POSITION_SOURCE_KEY);
        if (storedSource === "truth" || storedSource === "model") {
          setBypassVideoPositionSourceState(storedSource);
        }

        const storedSmoother = await SecureStore.getItemAsync(BYPASS_VIDEO_MODEL_SMOOTHER_KEY);
        if (storedSmoother === "kalman" || storedSmoother === "pdr" || storedSmoother === "rts") {
          setBypassVideoModelSmootherState(storedSmoother);
        }

        const storedWelcome = await SecureStore.getItemAsync(HAS_SEEN_WELCOME_KEY);
        if (storedWelcome !== null) {
          setHasSeenWelcomeState(storedWelcome === "true");
        }

        const storedNotifications = await SecureStore.getItemAsync(NOTIFICATIONS_ENABLED_KEY);
        if (storedNotifications !== null) {
          setNotificationsEnabledState(storedNotifications === "true");
        }

        const storedBypassPos = await SecureStore.getItemAsync(BYPASS_POS_KEY);
        if (storedBypassPos !== null) {
          const parsed = JSON.parse(storedBypassPos);
          if (typeof parsed?.x === "number") setBypassX(parsed.x);
          if (typeof parsed?.y === "number") setBypassY(parsed.y);
          if (typeof parsed?.floor === "number") setBypassFloor(parsed.floor);
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

  const setShowBypassGui = async (value: boolean) => {
    setShowBypassGuiState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(SHOW_BYPASS_GUI_KEY, value ? "true" : "false");
    } catch (err) {
      console.warn("[settings-provider] Failed to save showBypassGui", err);
    }
  };

  const setBypassMode = async (value: "manual" | "video") => {
    setBypassModeState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(BYPASS_MODE_KEY, value);
    } catch (err) {
      console.warn("[settings-provider] Failed to save bypassMode", err);
    }
  };

  const setBypassVideoSessionId = async (value: string | null) => {
    setBypassVideoSessionIdState(value);
    if (Platform.OS === "web") return;
    try {
      if (value === null) {
        await SecureStore.deleteItemAsync(BYPASS_VIDEO_SESSION_ID_KEY);
      } else {
        await SecureStore.setItemAsync(BYPASS_VIDEO_SESSION_ID_KEY, value);
      }
    } catch (err) {
      console.warn("[settings-provider] Failed to save bypassVideoSessionId", err);
    }
  };

  const setBypassVideoWalkIndex = async (value: number) => {
    setBypassVideoWalkIndexState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(BYPASS_VIDEO_WALK_INDEX_KEY, String(value));
    } catch (err) {
      console.warn("[settings-provider] Failed to save bypassVideoWalkIndex", err);
    }
  };

  const setBypassVideoModel = async (value: string) => {
    setBypassVideoModelState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(BYPASS_VIDEO_MODEL_KEY, value);
    } catch (err) {
      console.warn("[settings-provider] Failed to save bypassVideoModel", err);
    }
  };

  const setBypassVideoPositionSource = async (value: "truth" | "model") => {
    setBypassVideoPositionSourceState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(BYPASS_VIDEO_POSITION_SOURCE_KEY, value);
    } catch (err) {
      console.warn("[settings-provider] Failed to save bypassVideoPositionSource", err);
    }
  };

  const setBypassVideoModelSmoother = async (value: "pdr" | "kalman" | "rts") => {
    setBypassVideoModelSmootherState(value);
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(BYPASS_VIDEO_MODEL_SMOOTHER_KEY, value);
    } catch (err) {
      console.warn("[settings-provider] Failed to save bypassVideoModelSmoother", err);
    }
  };

  const setBypassPosition = (
    pos: { x?: number; y?: number; floor?: number },
    opts?: { persist?: boolean },
  ) => {
    // Round to 1 decimal so the fake position stays tidy.
    const nextX = pos.x != null ? Math.round(pos.x * 10) / 10 : bypassX;
    const nextY = pos.y != null ? Math.round(pos.y * 10) / 10 : bypassY;
    const nextFloor = pos.floor != null ? pos.floor : bypassFloor;
    setBypassX(nextX);
    setBypassY(nextY);
    setBypassFloor(nextFloor);
    // Skip disk persistence for high-frequency updates (e.g. simulator playback,
    // which would otherwise write to SecureStore on every frame).
    if (opts?.persist === false) return;
    if (Platform.OS === "web") return;
    SecureStore.setItemAsync(
      BYPASS_POS_KEY,
      JSON.stringify({ x: nextX, y: nextY, floor: nextFloor }),
    ).catch((err) => console.warn("[settings-provider] Failed to save bypass position", err));
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
        showBypassGui,
        setShowBypassGui,
        bypassMode,
        setBypassMode,
        bypassVideoSessionId,
        setBypassVideoSessionId,
        bypassVideoWalkIndex,
        setBypassVideoWalkIndex,
        bypassVideoModel,
        setBypassVideoModel,
        bypassVideoPositionSource,
        setBypassVideoPositionSource,
        bypassVideoModelSmoother,
        setBypassVideoModelSmoother,
        bypassX,
        bypassY,
        bypassFloor,
        setBypassPosition,
        hasSeenWelcome,
        setHasSeenWelcome,
        notificationsEnabled,
        setNotificationsEnabled,
        isLoaded,
        simWalk,
        setSimWalk,
        simPlaying,
        setSimPlaying,
        simLoading,
        setSimLoading,
        simError,
        setSimError,
        isUsingMock,
        setIsUsingMock,
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
