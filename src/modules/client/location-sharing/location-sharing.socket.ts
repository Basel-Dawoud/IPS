import { Server, Socket } from "socket.io";
import prisma from "../../../lib/prisma";
import { verifyAppToken } from "../../auth/auth.service";
import { publishPositionSchema } from "./location-sharing.schema";
import {
  activeSharesFor,
  areFriends,
  getUserShareSettings,
  isShareActive,
  updateShareLastPosition,
  upsertPresence,
} from "./location-sharing.service";
import type { LivePosition } from "./location-sharing.types";

// Publishers emit ~every 1.5 s; relaying is instant but DB writes are
// throttled per user so a walking phone doesn't hammer Postgres.
const DB_WRITE_INTERVAL_MS = 5_000;

interface PublisherState {
  lastDbWriteMs: number;
  lastPosition: LivePosition | null;
  // Active share tokens/ids are cached so we don't query per tick; refreshed
  // on connect and whenever a share is created/stopped via refresh_shares.
  shares: { id: string; token: string; expiresAt: Date | null }[];
  shareWithFriends: boolean;
}

// In-memory latest position per user — lets a watcher get an instant first
// fix without waiting for the next publish tick.
const livePositions = new Map<string, LivePosition>();

export function latestPositionFor(userId: string): LivePosition | undefined {
  return livePositions.get(userId);
}

export function initLocationSocket(io: Server) {
  const nsp = io.of("/location");

  // Same optional-JWT pattern as the /chat namespace: anonymous connections
  // are allowed (viewers of a share link), but publishing requires auth.
  nsp.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        const payload = await verifyAppToken(token);
        socket.data.user = { id: payload.sub, email: payload.email };
      }
      next();
    } catch (err: any) {
      console.warn(`[location] auth failed on socket ${socket.id}:`, err.message);
      next(); // proceed as anonymous viewer
    }
  });

  nsp.on("connection", (socket: Socket) => {
    const publisher: PublisherState = {
      lastDbWriteMs: 0,
      lastPosition: null,
      shares: [],
      shareWithFriends: true,
    };
    let publisherReady = false;

    async function refreshPublisherState() {
      const userId = socket.data.user?.id;
      if (!userId) return;
      const [shares, settings] = await Promise.all([
        activeSharesFor(userId),
        getUserShareSettings(userId),
      ]);
      publisher.shares = shares.map((s) => ({
        id: s.id,
        token: s.token,
        expiresAt: s.expiresAt,
      }));
      publisher.shareWithFriends = settings?.shareWithFriends ?? true;
      publisherReady = true;
    }

    // ── Publisher: the sharer's phone streams its live position ────────
    socket.on("publish", async (payload: any) => {
      const userId = socket.data.user?.id;
      if (!userId) {
        socket.emit("location_error", { error: "Authentication required to publish" });
        return;
      }
      const parsed = publishPositionSchema.safeParse(payload);
      if (!parsed.success) return;

      try {
        if (!publisherReady) await refreshPublisherState();

        const pos: LivePosition = { ...parsed.data, tMs: Date.now() };
        publisher.lastPosition = pos;
        livePositions.set(userId, pos);

        // Drop shares that expired mid-session and tell their watchers.
        const now = Date.now();
        publisher.shares = publisher.shares.filter((s) => {
          if (s.expiresAt && s.expiresAt.getTime() < now) {
            nsp.to(`share_${s.token}`).emit("share_ended", { token: s.token });
            return false;
          }
          return true;
        });

        for (const share of publisher.shares) {
          nsp.to(`share_${share.token}`).emit("position", pos);
        }
        if (publisher.shareWithFriends) {
          nsp.to(`friends_${userId}`).emit("position", pos);
        }

        if (now - publisher.lastDbWriteMs >= DB_WRITE_INTERVAL_MS) {
          publisher.lastDbWriteMs = now;
          await Promise.all([
            upsertPresence(userId, parsed.data),
            ...publisher.shares.map((s) => updateShareLastPosition(s.id, parsed.data)),
          ]);
        }
      } catch (err) {
        console.error("[location] publish error:", err);
      }
    });

    // Called after the app creates or stops a share so the cached list is fresh.
    socket.on("refresh_shares", () => {
      refreshPublisherState().catch((err) =>
        console.error("[location] refresh_shares error:", err),
      );
    });

    // ── Watcher: follow a one-off share by token ────────────────────────
    socket.on("watch_share", async (payload: any) => {
      const token = typeof payload?.token === "string" ? payload.token : null;
      if (!token) return;
      try {
        const share = await prisma.locationShare.findUnique({ where: { token } });
        if (!share) {
          socket.emit("location_error", { error: "Share not found", token });
          return;
        }
        if (!isShareActive(share)) {
          socket.emit("share_ended", { token });
          return;
        }
        await socket.join(`share_${token}`);

        // Instant first fix: in-memory position if the sharer is live now,
        // otherwise the last persisted one.
        const live = livePositions.get(share.ownerId);
        if (live) {
          socket.emit("position", live);
        } else if (share.lastX != null && share.lastY != null && share.lastUpdateAt) {
          socket.emit("position", {
            x: share.lastX,
            y: share.lastY,
            floorLevel: share.lastFloorLevel ?? 0,
            buildingId: share.buildingId ?? "",
            tMs: share.lastUpdateAt.getTime(),
          });
        }
      } catch (err) {
        console.error("[location] watch_share error:", err);
      }
    });

    socket.on("unwatch_share", (payload: any) => {
      const token = typeof payload?.token === "string" ? payload.token : null;
      if (token) socket.leave(`share_${token}`);
    });

    // ── Watcher: follow a friend (requires auth + friendship) ──────────
    socket.on("watch_friend", async (payload: any) => {
      const userId = socket.data.user?.id;
      const friendUserId =
        typeof payload?.friendUserId === "string" ? payload.friendUserId : null;
      if (!friendUserId) return;
      if (!userId) {
        socket.emit("location_error", { error: "Authentication required" });
        return;
      }
      try {
        const [friends, settings] = await Promise.all([
          areFriends(userId, friendUserId),
          getUserShareSettings(friendUserId),
        ]);
        if (!friends) {
          socket.emit("location_error", { error: "Not friends with this user" });
          return;
        }
        if (!settings?.shareWithFriends) {
          socket.emit("location_error", { error: "This friend has location sharing off" });
          return;
        }
        await socket.join(`friends_${friendUserId}`);

        const live = livePositions.get(friendUserId);
        if (live) {
          socket.emit("position", live);
        } else {
          const presence = await prisma.userPresence.findUnique({
            where: { userId: friendUserId },
          });
          if (presence?.buildingId && presence.x != null && presence.y != null) {
            socket.emit("position", {
              x: presence.x,
              y: presence.y,
              floorLevel: presence.floorLevel ?? 0,
              buildingId: presence.buildingId,
              tMs: presence.updatedAt.getTime(),
            });
          }
        }
      } catch (err) {
        console.error("[location] watch_friend error:", err);
      }
    });

    socket.on("unwatch_friend", (payload: any) => {
      const friendUserId =
        typeof payload?.friendUserId === "string" ? payload.friendUserId : null;
      if (friendUserId) socket.leave(`friends_${friendUserId}`);
    });

    socket.on("disconnect", () => {
      const userId = socket.data.user?.id;
      // Keep UserPresence rows (they carry "last seen"); just clear the
      // in-memory live fix so watchers fall back to persisted data.
      if (userId && publisher.lastPosition) {
        livePositions.delete(userId);
      }
    });
  });
}
