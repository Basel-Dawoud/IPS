import { apiClient } from "@/lib/api-client";
import type { AuthSession, AuthUser } from "./types";

export interface ApplePayload {
  identityToken: string;
  fullName?: { givenName?: string | null; familyName?: string | null };
  email?: string;
}

export async function postGoogleSignIn(idToken: string): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthSession>("/auth/google", { idToken });
  return data;
}

export async function postAppleSignIn(payload: ApplePayload): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthSession>("/auth/apple", payload);
  return data;
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>("/auth/me");
  return data;
}

export async function postRegister(email: string, password: string, name?: string): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthSession>("/auth/register", { email, password, name });
  return data;
}

export async function postLogin(email: string, password: string): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthSession>("/auth/login", { email, password });
  return data;
}
