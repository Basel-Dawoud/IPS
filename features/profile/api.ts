import { apiClient } from "@/lib/api-client";
import type { AuthUser } from "@/features/auth/types";

export interface UpdateProfileInput {
  name?: string;
  age?: number | null;
  gender?: string | null;
  needsStepFree?: boolean;
  shareWithFriends?: boolean;
}

/** PATCH /client/user/profile — updates name / age / gender. Returns the fresh user. */
export async function updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.age !== undefined && input.age !== null) body.age = input.age;
  if (input.gender !== undefined && input.gender !== null) body.gender = input.gender;
  if (input.needsStepFree !== undefined) body.needsStepFree = input.needsStepFree;
  if (input.shareWithFriends !== undefined) body.shareWithFriends = input.shareWithFriends;
  const { data } = await apiClient.patch<AuthUser>("/client/user/profile", body);
  return data;
}

/** POST /client/user/avatar — multipart upload of a picked image. Returns the fresh user. */
export async function uploadAvatar(uri: string): Promise<AuthUser> {
  const name = uri.split("/").pop() ?? `avatar-${Date.now()}.jpg`;
  const ext = name.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const form = new FormData();
  // React Native FormData file shape.
  form.append("image", { uri, name, type } as any);

  const { data } = await apiClient.post<AuthUser>("/client/user/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** POST /auth/change-password — email/password accounts only. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiClient.post("/auth/change-password", { currentPassword, newPassword });
}

/** DELETE /client/user/recent-visits — clears visit history (POI + building). */
export async function clearRecentVisits(): Promise<void> {
  await apiClient.delete("/client/user/recent-visits");
}

/** DELETE /client/user — permanently deletes the signed-in account. */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete("/client/user");
}
