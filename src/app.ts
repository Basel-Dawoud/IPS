import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { UPLOADS_ROOT } from "./lib/upload";
import { initChatSocket } from "./modules/client/chat/chat.socket";

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

// Serve uploaded floor plan images (backend/uploads → /uploads/...).
app.use("/uploads", express.static(UPLOADS_ROOT));
app.get("/", (req, res) => {
  res.send("Indoor Positioning System API");
});

// Initialize Socket.IO chatbot
initChatSocket(io);

import adminBuildingRoutes from "./modules/admin/buildings/buildings.routes";
import clientBuildingRoutes from "./modules/client/buildings/buildings.routes";
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
import { optionalAuth } from "./middleware/optional-auth";

app.use(optionalAuth);

app.use("/api/auth", authRoutes);
app.use("/api/admin/buildings", adminBuildingRoutes);
app.use("/api/client/buildings", clientBuildingRoutes);
app.use("/api/admin/floors", adminFloorRoutes);
app.use("/api/client/floors", clientFloorRoutes);
app.use("/api/admin/beacons", adminBeaconRoutes);
app.use("/api/client/positioning", clientPositioningRoutes);
app.use("/api/admin/map", adminMapRoutes);
app.use("/api/admin/pois", adminPoiRoutes);
app.use("/api/client/pois", clientPoiRoutes);
app.use("/api/client/navigation", clientNavigationRoutes);
app.use("/api/client/chat/sessions", clientChatSessionRoutes);
app.use("/api/client/recommendations", clientRecommendationRoutes);
app.use("/api/client/user", clientUserRoutes);
app.use("/api/admin/fingerprinting", adminFingerprintingRoutes);
app.use("/api/admin/trajectory", adminTrajectoryRoutes);
app.use("/api/admin/wifi-aps", adminWifiApRoutes);
app.use("/api/admin/deals", adminDealRoutes);
app.use("/api/client/deals", clientDealRoutes);
app.use("/api/client/visits", clientVisitRoutes);
app.use("/api/client/search", clientSearchRoutes);

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
