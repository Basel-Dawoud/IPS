/**
 * AuthProvider — single source of truth for the authenticated user.
 *
 * Hydrates the persisted JWT on mount, then revalidates against /auth/me.
 * Exposes Google/Apple sign-in actions and a sign-out that wipes both
 * provider sessions and the local token.
 *
 * Sign-in libs are loaded lazily inside the action so the JS bundle still
 * works on platforms where they aren't available (e.g. Android won't load
 * Apple, web won't load either).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import {
  clearAuthToken,
  getAuthToken,
  hydrateAuthToken,
  setAuthToken,
} from "./auth-storage";
import { fetchMe, postAppleSignIn, postGoogleSignIn, postLogin, postRegister } from "./auth-api";
import type { AuthSession, AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  hasToken: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

const SCOPES = ["openid", "email", "profile"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);

  // 1) hydrate persisted token, 2) try /auth/me with it, 3) finish loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await hydrateAuthToken();
      if (cancelled) return;
      setHasToken(!!token);
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me);
      } catch (err) {
        // Stale/invalid token → wipe it; user will re-sign-in.
        await clearAuthToken();
        if (!cancelled) {
          setHasToken(false);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finalize = useCallback(async (session: AuthSession) => {
    await setAuthToken(session.token);
    setHasToken(true);
    setUser(session.user);
    setError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const { GoogleSignin, statusCodes } = require("@react-native-google-signin/google-signin");
      // configure() is idempotent — safe to call repeatedly.
      GoogleSignin.configure({
        scopes: SCOPES,
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        offlineAccess: false,
      });
      await GoogleSignin.hasPlayServices?.({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      // v13+ returns { type: 'success', data: { idToken, ... } }; older returns { idToken } at top-level.
      const idToken: string | null =
        result?.data?.idToken ?? result?.idToken ?? null;
      if (!idToken) throw new Error("Google did not return an idToken");
      const session = await postGoogleSignIn(idToken);
      await finalize(session);
    } catch (err: any) {
      if (err?.code === "SIGN_IN_CANCELLED") return; // user dismissed; not an error
      console.warn("[auth] google sign-in failed:", err);
      setError(err?.message ?? "Google sign-in failed");
    }
  }, [finalize]);

  const signInWithApple = useCallback(async () => {
    setError(null);
    if (Platform.OS !== "ios") {
      setError("Sign in with Apple is iOS only.");
      return;
    }
    try {
      const Apple = require("expo-apple-authentication");
      const credential = await Apple.signInAsync({
        requestedScopes: [
          Apple.AppleAuthenticationScope.FULL_NAME,
          Apple.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("Apple did not return an identityToken");
      const session = await postAppleSignIn({
        identityToken: credential.identityToken,
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName ?? null,
              familyName: credential.fullName.familyName ?? null,
            }
          : undefined,
        email: credential.email ?? undefined,
      });
      await finalize(session);
    } catch (err: any) {
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      console.warn("[auth] apple sign-in failed:", err);
      setError(err?.message ?? "Apple sign-in failed");
    }
  }, [finalize]);
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const session = await postLogin(email, password);
      await finalize(session);
    } catch (err: any) {
      console.warn("[auth] email sign-in failed:", err);
      const errMsg = err?.response?.data?.error ?? err?.message ?? "Email sign-in failed";
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [finalize]);

  const signUpWithEmail = useCallback(async (email: string, password: string, name?: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const session = await postRegister(email, password, name);
      await finalize(session);
    } catch (err: any) {
      console.warn("[auth] email sign-up failed:", err);
      const errMsg = err?.response?.data?.error ?? err?.message ?? "Email sign-up failed";
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [finalize]);
  const signOut = useCallback(async () => {
    try {
      const { GoogleSignin } = require("@react-native-google-signin/google-signin");
      await GoogleSignin.signOut?.();
    } catch {
      // Google not configured / not signed in — ignore.
    }
    await clearAuthToken();
    setHasToken(false);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const me = await fetchMe();
      setUser(me);
    } catch (err) {
      console.warn("[auth] refresh failed", err);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      hasToken,
      error,
      signInWithGoogle,
      signInWithApple,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      refreshMe,
    }),
    [
      user,
      isLoading,
      hasToken,
      error,
      signInWithGoogle,
      signInWithApple,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      refreshMe,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
