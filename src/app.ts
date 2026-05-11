import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
+app.get("/", (req, res) => {
  res.send("Indoor Positioning System API");
});

import adminBuildingRoutes from "./modules/admin/buildings/buildings.routes";
import clientBuildingRoutes from "./modules/client/buildings/buildings.routes";
import adminFloorRoutes from "./modules/admin/floors/floors.routes";
import clientFloorRoutes from "./modules/client/floors/floors.routes";
import adminBeaconRoutes from "./modules/admin/beacons/beacons.routes";
import clientPositioningRoutes from "./modules/client/positioning/positioning.routes";
import adminMapRoutes from "./modules/admin/map/map.routes";
import clientNavigationRoutes from "./modules/client/navigation/navigation.routes";
import adminFingerprintingRoutes from "./modules/admin/fingerprinting/fingerprinting.routes";


app.use("/api/admin/buildings", adminBuildingRoutes);
app.use("/api/client/buildings", clientBuildingRoutes);
app.use("/api/admin/floors", adminFloorRoutes);
app.use("/api/client/floors", clientFloorRoutes);
app.use("/api/admin/beacons", adminBeaconRoutes);
app.use("/api/client/positioning", clientPositioningRoutes);
app.use("/api/admin/map", adminMapRoutes);
app.use("/api/client/navigation", clientNavigationRoutes);
app.use("/api/admin/fingerprinting", adminFingerprintingRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
