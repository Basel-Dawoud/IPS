import { apiClient } from "@/lib/api-client";
import type {
  FriendInviteResult,
  FriendListEntry,
  ShareCreateResult,
  ShareDurationMin,
  SharePublicView,
} from "./types";

export async function createShare(
  buildingId: string | null,
  durationMin: ShareDurationMin,
): Promise<ShareCreateResult> {
  const { data } = await apiClient.post("/client/location-sharing/shares", {
    buildingId: buildingId ?? undefined,
    durationMin,
  });
  return data;
}

export async function resolveShare(token: string): Promise<SharePublicView> {
  const { data } = await apiClient.get(
    `/client/location-sharing/shares/${encodeURIComponent(token)}`,
  );
  return data;
}

export async function stopShare(token: string): Promise<void> {
  await apiClient.delete(`/client/location-sharing/shares/${encodeURIComponent(token)}`);
}

export async function createFriendInvite(): Promise<FriendInviteResult> {
  const { data } = await apiClient.post("/client/friends/invites");
  return data;
}

export async function resolveFriendInvite(token: string) {
  const { data } = await apiClient.get(
    `/client/friends/invites/${encodeURIComponent(token)}`,
  );
  return data as { owner: { id: string; name: string | null; avatarUrl: string | null } | null };
}

export async function acceptFriendInvite(tokenOrCode: string) {
  const { data } = await apiClient.post("/client/friends/invites/accept", {
    tokenOrCode,
  });
  return data as { friend: { id: string; name: string | null; avatarUrl: string | null } | null };
}

export async function fetchFriends(): Promise<FriendListEntry[]> {
  const { data } = await apiClient.get("/client/friends");
  return data;
}

export async function removeFriend(userId: string): Promise<void> {
  await apiClient.delete(`/client/friends/${encodeURIComponent(userId)}`);
}
