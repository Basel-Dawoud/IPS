import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { UPLOADS_ROOT } from "./lib/upload";
import { initChatSocket } from "./modules/client/chat/chat.socket";
import { initLocationSocket } from "./modules/client/location-sharing/location-sharing.socket";
import {
  sharePage,
  friendInvitePage,
} from "./modules/client/location-sharing/location-sharing.pages";

const app = express();
const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Socket.IO rooms for buildings (emergency updates)
io.on("connection", (socket) => {
  socket.on("join_building", (buildingId: string) => {
    socket.join(`building_${buildingId}`);
    console.log(`[Socket.IO] Socket ${socket.id} joined building_${buildingId}`);
  });
  socket.on("leave_building", (buildingId: string) => {
    socket.leave(`building_${buildingId}`);
    console.log(`[Socket.IO] Socket ${socket.id} left building_${buildingId}`);
  });
});

// Middleware to attach io to req
app.use((req: any, res, next) => {
  req.io = io;
  next();
});

// Serve uploaded floor plan images (backend/uploads → /uploads/...).
app.use("/uploads", express.static(UPLOADS_ROOT));
app.get("/", (req, res) => {
  res.send("Indoor Positioning System API");
});

// Initialize Socket.IO chatbot
initChatSocket(io);

// Live location sharing: socket relay + browser redirect pages for links/QRs.
initLocationSocket(io);
app.get("/s/:token", sharePage);
app.get("/f/:token", friendInvitePage);

import adminBuildingRoutes from "./modules/admin/buildings/buildings.routes";
import clientBuildingRoutes from "./modules/client/buildings/buildings.routes";
import adminEmergencyRoutes from "./modules/admin/emergency/emergency.routes";
import clientEmergencyRoutes from "./modules/client/emergency/emergency.routes";
import adminFloorRoutes from "./modules/admin/floors/floors.routes";
import clientFloorRoutes from "./modules/client/floors/floors.routes";
import adminBeaconRoutes from "./modules/admin/beacons/beacons.routes";
import clientPositioningRoutes from "./modules/client/positioning/positioning.routes";
import adminMapRoutes from "./modules/admin/map/map.routes";
import adminPoiRoutes from "./modules/admin/pois/pois.routes";
import clientPoiRoutes from "./modules/client/pois/pois.routes";
import clientNavigationRoutes from "./modules/client/navigation/navigation.routes";
import adminFingerprintingRoutes from "./modules/admin/fingerprinting/fingerprinting.routes";
import adminTrajectoryRoutes from "./modules/admin/trajectory/trajectory.routes";
import adminWifiApRoutes from "./modules/admin/wifi-aps/wifi-aps.routes";
import authRoutes from "./modules/auth/auth.routes";
import clientChatSessionRoutes from "./modules/client/chat/chat-session.routes";
import clientRecommendationRoutes from "./modules/client/recommendation/recommendation.routes";
import clientUserRoutes from "./modules/client/user/user.routes";
import adminDealRoutes from "./modules/admin/deals/deals.routes";
import clientDealRoutes from "./modules/client/deals/deals.routes";
import clientVisitRoutes from "./modules/client/visits/visits.routes";
import clientSearchRoutes from "./modules/client/search/search.routes";
import clientLocationSharingRoutes from "./modules/client/location-sharing/location-sharing.routes";
import clientFriendsRoutes from "./modules/client/location-sharing/friends.routes";
import adminIpsRoutes from "./modules/admin/ips/ips.routes";
import internalUsersRoutes from "./modules/internal-auth/internal-users/internal-users.routes";
import { optionalAuth } from "./middleware/optional-auth";
import { optionalInternalAuth, requireInternalAuth } from "./middleware/internal-auth";

app.use(optionalAuth);
app.use(optionalInternalAuth);

app.use("/api/auth", authRoutes);
app.use("/api/internal-auth/users", internalUsersRoutes);
app.use("/api/admin/buildings", requireInternalAuth, adminBuildingRoutes);
app.use("/api/admin/buildings/:buildingId/emergency", requireInternalAuth, adminEmergencyRoutes);
app.use("/api/client/buildings", clientBuildingRoutes);
app.use("/api/client/buildings/:buildingId/emergency", clientEmergencyRoutes);
app.use("/api/admin/floors", requireInternalAuth, adminFloorRoutes);
app.use("/api/client/floors", clientFloorRoutes);
app.use("/api/admin/beacons", requireInternalAuth, adminBeaconRoutes);
app.use("/api/client/positioning", clientPositioningRoutes);
app.use("/api/admin/map", requireInternalAuth, adminMapRoutes);
app.use("/api/admin/pois", requireInternalAuth, adminPoiRoutes);
app.use("/api/client/pois", clientPoiRoutes);
app.use("/api/client/navigation", clientNavigationRoutes);
app.use("/api/client/chat/sessions", clientChatSessionRoutes);
app.use("/api/client/recommendations", clientRecommendationRoutes);
app.use("/api/client/user", clientUserRoutes);
app.use("/api/admin/fingerprinting", requireInternalAuth, adminFingerprintingRoutes);
app.use("/api/admin/trajectory", requireInternalAuth, adminTrajectoryRoutes);
app.use("/api/admin/wifi-aps", requireInternalAuth, adminWifiApRoutes);
app.use("/api/admin/deals", requireInternalAuth, adminDealRoutes);
app.use("/api/client/deals", clientDealRoutes);
app.use("/api/client/visits", clientVisitRoutes);
app.use("/api/client/search", clientSearchRoutes);
app.use("/api/client/location-sharing", clientLocationSharingRoutes);
app.use("/api/client/friends", clientFriendsRoutes);
app.use("/api/admin/ips", requireInternalAuth, adminIpsRoutes);

app.use(
  (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled error:", err.message);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  },
);

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (with Socket.IO enabled)`);
});

export default app;
