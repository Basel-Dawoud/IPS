import { axiosClient } from "@/lib/axiosClient";
import type { AuthResult, InternalUser } from "./types";

// Admin login IS the client login — there's no separate staff auth. Whether
// this account has dashboard access is decided by `user.internalRole`
// (null = ordinary app user), checked by AuthContext after this resolves.
export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await axiosClient.post("/auth/login", { email, password });
  return res.data.data;
}

export async function getMe(): Promise<InternalUser> {
  const res = await axiosClient.get("/auth/me");
  return res.data.data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await axiosClient.post("/auth/change-password", { currentPassword, newPassword });
}
