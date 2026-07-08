/**
 * Persisted JWT storage. Uses Expo SecureStore on native and an in-memory
 * fallback on web (SecureStore isn't available there).
 *
 * The token is read synchronously into a module-level variable on app
 * start so the axios request interceptor doesn't have to await SecureStore
 * on every call.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "navimind.auth.token";

let cached: string | null = null;
let hydrated = false;

function isAvailable(): boolean {
  return Platform.OS !== "web";
}

export async function hydrateAuthToken(): Promise<string | null> {
  if (hydrated) return cached;
  hydrated = true;
  if (!isAvailable()) return cached;
  try {
    cached = await SecureStore.getItemAsync(KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export function getAuthToken(): string | null {
  return cached;
}

export async function setAuthToken(token: string): Promise<void> {
  cached = token;
  if (!isAvailable()) return;
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch (err) {
    console.warn("[auth-storage] setItem failed", err);
  }
}

export async function clearAuthToken(): Promise<void> {
  cached = null;
  if (!isAvailable()) return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch (err) {
    console.warn("[auth-storage] deleteItem failed", err);
  }
}
