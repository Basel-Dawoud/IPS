import crypto from "crypto";
import prisma from "../../../lib/prisma";
import type {
  FriendInviteResult,
  FriendListEntry,
  ShareCreateResult,
  SharePublicView,
} from "./location-sharing.types";

// A presence older than this counts as offline (publisher emits every ~1.5 s,
// DB writes are throttled to ~5 s).
const PRESENCE_ONLINE_MS = 60_000;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export class LocationSharingError extends Error {
  constructor(
    public code: "not-found" | "gone" | "forbidden" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

// ── Tokens ──────────────────────────────────────────────────────────────

/** URL-safe unguessable token (~22 chars), the whole permission for a share. */
function urlToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/** 6-char human-typeable code; skips ambiguous 0/O/1/I/L. */
function friendCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

export function publicUrl(): string {
  return (
    process.env.PUBLIC_URL?.replace(/\/$/, "") ??
    `http://localhost:${process.env.PORT || 3000}`
  );
}

// ── One-off shares ──────────────────────────────────────────────────────

export async function createShare(
  ownerId: string,
  buildingId: string | undefined,
  durationMin: 15 | 60 | null,
): Promise<ShareCreateResult> {
  const expiresAt =
    durationMin === null ? null : new Date(Date.now() + durationMin * 60_000);

  // Retry on the (unlikely) 6-char code collision, same as friend invites.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const token = urlToken();
      const code = friendCode();
      const share = await prisma.locationShare.create({
        data: { token, code, ownerId, buildingId, expiresAt },
      });
      return {
        token: share.token,
        code,
        url: `${publicUrl()}/s/${share.token}`,
        expiresAt: share.expiresAt?.toISOString() ?? null,
      };
    } catch (err: any) {
      if (err?.code !== "P2002") throw err; // unique violation → retry
    }
  }
  throw new Error("Could not generate a unique share code");
}

export function isShareActive(share: {
  endedAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (share.endedAt) return false;
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return false;
  return true;
}

export async function getShareView(tokenOrCode: string): Promise<SharePublicView> {
  const input = tokenOrCode.trim();
  // Resolve by the URL token or the manually-typed 6-char code.
  const share = await prisma.locationShare.findFirst({
    where: { OR: [{ token: input }, { code: input.toUpperCase() }] },
    include: { owner: { select: { name: true, avatarUrl: true } } },
  });
  if (!share) throw new LocationSharingError("not-found", "Share not found");

  const building = share.buildingId
    ? await prisma.building.findUnique({
        where: { id: share.buildingId },
        select: { id: true, name: true, pinLat: true, pinLng: true },
      })
    : null;

  return {
    token: share.token,
    owner: { name: share.owner.name, avatarUrl: share.owner.avatarUrl },
    building,
    last:
      share.lastX != null && share.lastY != null && share.lastUpdateAt != null
        ? {
            x: share.lastX,
            y: share.lastY,
            floorLevel: share.lastFloorLevel ?? 0,
            updatedAt: share.lastUpdateAt.toISOString(),
          }
        : null,
    active: isShareActive(share),
  };
}

export async function stopShare(ownerId: string, token: string): Promise<void> {
  const share = await prisma.locationShare.findUnique({ where: { token } });
  if (!share) throw new LocationSharingError("not-found", "Share not found");
  if (share.ownerId !== ownerId)
    throw new LocationSharingError("forbidden", "Not your share");
  if (!share.endedAt) {
    await prisma.locationShare.update({
      where: { token },
      data: { endedAt: new Date() },
    });
  }
}

/** Active (not ended, not expired) shares for a publisher. */
export async function activeSharesFor(ownerId: string) {
  const shares = await prisma.locationShare.findMany({
    where: { ownerId, endedAt: null },
  });
  return shares.filter(isShareActive);
}

// ── Friend invites / friendships ────────────────────────────────────────

export async function createFriendInvite(ownerId: string): Promise<FriendInviteResult> {
  // Retry on the (unlikely) 6-char code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const invite = await prisma.friendInvite.create({
        data: {
          token: urlToken(),
          code: friendCode(),
          ownerId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });
      return {
        token: invite.token,
        code: invite.code,
        url: `${publicUrl()}/f/${invite.token}`,
        expiresAt: invite.expiresAt.toISOString(),
      };
    } catch (err: any) {
      if (err?.code !== "P2002") throw err; // unique violation → retry
    }
  }
  throw new Error("Could not generate a unique invite code");
}

/** Resolve an invite for display (who is inviting me?). */
export async function getInviteView(token: string) {
  const invite = await prisma.friendInvite.findUnique({ where: { token } });
  if (!invite) throw new LocationSharingError("not-found", "Invite not found");
  if (invite.usedById || invite.expiresAt.getTime() < Date.now())
    throw new LocationSharingError("gone", "Invite expired or already used");
  const owner = await prisma.user.findUnique({
    where: { id: invite.ownerId },
    select: { id: true, name: true, avatarUrl: true },
  });
  return { owner };
}

export async function acceptFriendInvite(userId: string, tokenOrCode: string) {
  const input = tokenOrCode.trim();
  const invite = await prisma.friendInvite.findFirst({
    where: { OR: [{ token: input }, { code: input.toUpperCase() }] },
  });
  if (!invite) throw new LocationSharingError("not-found", "Invite not found");
  if (invite.usedById || invite.expiresAt.getTime() < Date.now())
    throw new LocationSharingError("gone", "Invite expired or already used");
  if (invite.ownerId === userId)
    throw new LocationSharingError("conflict", "You can't accept your own invite");

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: invite.ownerId, addresseeId: userId },
        { requesterId: userId, addresseeId: invite.ownerId },
      ],
    },
  });
  if (existing)
    throw new LocationSharingError("conflict", "You are already friends");

  await prisma.$transaction([
    prisma.friendship.create({
      data: { requesterId: invite.ownerId, addresseeId: userId },
    }),
    prisma.friendInvite.update({
      where: { id: invite.id },
      data: { usedById: userId },
    }),
  ]);

  const friend = await prisma.user.findUnique({
    where: { id: invite.ownerId },
    select: { id: true, name: true, avatarUrl: true },
  });
  return { friend };
}

export async function listFriends(userId: string): Promise<FriendListEntry[]> {
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: {
      requester: {
        select: { id: true, name: true, avatarUrl: true, shareWithFriends: true },
      },
      addressee: {
        select: { id: true, name: true, avatarUrl: true, shareWithFriends: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const friends = friendships.map((f) => ({
    friendsSince: f.createdAt,
    user: f.requesterId === userId ? f.addressee : f.requester,
  }));

  const presences = await prisma.userPresence.findMany({
    where: { userId: { in: friends.map((f) => f.user.id) } },
  });
  const presenceByUser = new Map(presences.map((p) => [p.userId, p]));

  const buildingIds = [
    ...new Set(presences.map((p) => p.buildingId).filter((b): b is string => !!b)),
  ];
  const buildings = buildingIds.length
    ? await prisma.building.findMany({
        where: { id: { in: buildingIds } },
        select: { id: true, name: true },
      })
    : [];
  const buildingNames = new Map(buildings.map((b) => [b.id, b.name]));

  return friends.map(({ user, friendsSince }) => {
    const p = user.shareWithFriends ? presenceByUser.get(user.id) : undefined;
    return {
      user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      friendsSince: friendsSince.toISOString(),
      presence:
        p && p.buildingId
          ? {
              buildingId: p.buildingId,
              buildingName: buildingNames.get(p.buildingId) ?? null,
              floorLevel: p.floorLevel,
              x: p.x,
              y: p.y,
              updatedAt: p.updatedAt.toISOString(),
              online: Date.now() - p.updatedAt.getTime() < PRESENCE_ONLINE_MS,
            }
          : null,
    };
  });
}

export async function removeFriend(userId: string, friendUserId: string) {
  const { count } = await prisma.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: friendUserId },
        { requesterId: friendUserId, addresseeId: userId },
      ],
    },
  });
  if (count === 0)
    throw new LocationSharingError("not-found", "Friendship not found");
}

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const f = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
  });
  return !!f;
}

// ── Presence (used by the /location socket) ─────────────────────────────

export async function upsertPresence(
  userId: string,
  pos: { x: number; y: number; floorLevel: number; buildingId: string },
) {
  await prisma.userPresence.upsert({
    where: { userId },
    create: { userId, ...pos },
    update: pos,
  });
}

export async function updateShareLastPosition(
  shareId: string,
  pos: { x: number; y: number; floorLevel: number },
) {
  await prisma.locationShare.update({
    where: { id: shareId },
    data: {
      lastX: pos.x,
      lastY: pos.y,
      lastFloorLevel: pos.floorLevel,
      lastUpdateAt: new Date(),
    },
  });
}

export async function getUserShareSettings(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { shareWithFriends: true, name: true, avatarUrl: true },
  });
}
