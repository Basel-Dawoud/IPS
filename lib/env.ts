import Constants from "expo-constants";
import { Platform } from "react-native";

function fromExpoConfig(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
    ?.apiUrl;
  return typeof fromExtra === "string" ? fromExtra : undefined;
}

function defaultApiUrl(): string {
  if (Platform.OS === "android") return "https://navimind.remonehab.cloud/api";
  return "https://navimind.remonehab.cloud/api";
}

function getApiUrl(): string {
  let url = process.env.EXPO_PUBLIC_API_URL ?? fromExpoConfig() ?? defaultApiUrl();

  // Strip trailing slash
  url = url.replace(/\/$/, "");

  // Ensure it ends with /api
  if (!url.endsWith("/api")) {
    url = `${url}/api`;
  }

  return url;
}

function getStaticUrl(): string {
  let url = process.env.EXPO_PUBLIC_STATIC_URL;
  if (!url) {
    const apiUrl = getApiUrl();
    url = apiUrl.replace(/\/api\/?$/, "");
  }
  return url.replace(/\/$/, "");
}

function getRemoteBypass(): boolean {
  return process.env.EXPO_PUBLIC_REMOTE_BYPASS === "true";
}

export const env = {
  apiUrl: getApiUrl(),
  staticUrl: getStaticUrl(),
  remoteBypass: getRemoteBypass(),
};
