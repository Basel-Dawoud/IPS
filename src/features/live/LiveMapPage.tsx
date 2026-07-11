import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBuilding } from "@/features/buildings/hooks";
import { useFloorsByBuilding } from "@/features/floors/hooks";
import { usePois } from "@/features/pois/hooks";
import { FloorMapView } from "@/features/floors/components/FloorMapView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Activity, Flame, Radio, Users, Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLiveDevices } from "./hooks/useLiveDevices";
import { useGridHeatmap, useIpsHealth, useRoomHeatmap } from "./hooks/useIpsQueries";
import { HeatmapLayer, type HeatRoom } from "./components/HeatmapLayer";
import { AlertPulseLayer } from "./components/AlertPulseLayer";
import { LiveOverlay } from "./components/LiveOverlay";

// 60-min heat window, polled every 5s so the tint keeps closer pace with the
// WebSocket-driven dots without waiting a full 15s.
const HEATMAP_MINUTES = 60;
const HEATMAP_REFETCH_MS = 5000;

/**
 * Real-time floor map: moving user dots + room heatmap + crowd alerts.
 * Geometry (floors, POI zones, plan images) comes from the Node backend;
 * live positions and heat intensities come from the IPS FastAPI plane.
 */
export function LiveMapPage() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();

  const { data: building } = useBuilding(buildingId!);
  const { data: floors, isLoading: floorsLoading } = useFloorsByBuilding(buildingId!);
  const { data: pois } = usePois(buildingId!);

  const [floorLevel, setFloorLevel] = useState<number | null>(null);
  const [heatMode, setHeatMode] = useState<"off" | "rooms" | "grid">("rooms");
  const [counts, setCounts] = useState({ onFloor: 0, total: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sortedFloors = useMemo(
    () => (floors ?? []).slice().sort((a, b) => a.level - b.level),
    [floors],
  );

  useEffect(() => {
    if (floorLevel == null && sortedFloors.length > 0) {
      setFloorLevel(sortedFloors[0].level);
    }
  }, [sortedFloors, floorLevel]);

  const activeFloor = sortedFloors.find((f) => f.level === floorLevel) ?? null;

  // POI zone rects on the active floor = the heatmap "rooms".
  const rooms: HeatRoom[] = useMemo(() => {
    if (!pois || floorLevel == null) return [];
    return pois
      .filter(
        (p) =>
          p.floorLevel === floorLevel &&
          p.areaX != null && p.areaY != null && p.areaW != null && p.areaH != null,
      )
      .map((p) => ({ id: p.id, name: p.name, x: p.areaX!, y: p.areaY!, w: p.areaW!, h: p.areaH! }));
  }, [pois, floorLevel]);

  // Zone rects for FloorMapView so it renders names/icons inside each room.
  const mapZones = useMemo(
    () => rooms.map((r) => ({ poiId: r.id, x: r.x, y: r.y, w: r.w, h: r.h, saved: true })),
    [rooms],
  );

  const mapPois = useMemo(() => {
    if (!pois || floorLevel == null) return [];
    return pois
      .filter((p) => p.floorLevel === floorLevel)
      .map((p) => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        iconUrl: p.iconUrl,
        areaX: p.areaX,
        areaY: p.areaY,
        areaW: p.areaW,
        areaH: p.areaH,
      }));
  }, [pois, floorLevel]);

  const { devicesRef, alerts, connected, msgsPerSec } = useLiveDevices(buildingId!);
  const { data: health } = useIpsHealth();
  const { data: roomHeat } = useRoomHeatmap(
    buildingId!, floorLevel, HEATMAP_MINUTES, heatMode === "rooms", HEATMAP_REFETCH_MS,
  );
  const { data: gridHeat } = useGridHeatmap(
    buildingId!, floorLevel, HEATMAP_MINUTES, heatMode === "grid", HEATMAP_REFETCH_MS,
  );

  const onCounts = useCallback((onFloor: number, total: number) => {
    setCounts((prev) =>
      prev.onFloor === onFloor && prev.total === total ? prev : { onFloor, total },
    );
  }, []);

  const s = activeFloor
    ? Math.max(activeFloor.widthMeters ?? 0, activeFloor.heightMeters ?? 0) || 50
    : 50;

  const alertCount = Object.keys(alerts).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-3">
        <div className="min-w-0">
          <Link
            to={`/buildings/${buildingId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5"
          >
            <ArrowLeft className="size-3" /> Back to {building?.name ?? "Building"}
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold truncate">Live Map</h1>
            <Badge
              variant={connected ? "default" : "destructive"}
              className="text-[10px] gap-1"
            >
              <Radio className="size-3" />
              {connected ? "LIVE" : "RECONNECTING…"}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/buildings/${buildingId}/analytics`)}
        >
          <Activity className="size-3.5 mr-1" /> Analytics
        </Button>
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 flex flex-row items-center gap-3">
          <Users className="size-4 text-primary shrink-0" />
          <div>
            <div className="text-lg font-bold leading-none">{counts.total}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              devices online ({counts.onFloor} on this floor)
            </div>
          </div>
        </Card>
        <Card className="p-3 flex flex-row items-center gap-3">
          <Activity className="size-4 text-primary shrink-0" />
          <div>
            <div className="text-lg font-bold leading-none">{msgsPerSec}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">messages / sec</div>
          </div>
        </Card>
        <Card className="p-3 flex flex-row items-center gap-3">
          <Flame className={`size-4 shrink-0 ${alertCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          <div>
            <div className="text-lg font-bold leading-none">{alertCount}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">crowd alerts</div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground mb-1">IPS server</div>
          <div className="flex flex-wrap gap-1">
            <Badge variant={health?.mqtt_connected ? "default" : "destructive"} className="text-[9px] py-0">MQTT</Badge>
            <Badge variant={health?.postgres_connected ? "default" : "destructive"} className="text-[9px] py-0">DB</Badge>
            <Badge variant={health?.geometry_synced ? "default" : "destructive"} className="text-[9px] py-0">GEOMETRY</Badge>
          </div>
        </Card>
      </div>

      {/* Floor tabs + heat toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {floorsLoading ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <Tabs
            value={floorLevel != null ? String(floorLevel) : undefined}
            onValueChange={(v) => setFloorLevel(Number(v))}
          >
            <TabsList>
              {sortedFloors.map((f) => (
                <TabsTrigger key={f.id} value={String(f.level)}>
                  {f.name || `Level ${f.level}`}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <div className="flex items-center gap-2">
          <Tabs value={heatMode} onValueChange={(v) => setHeatMode(v as typeof heatMode)}>
            <TabsList>
              <TabsTrigger value="off">Heatmap off</TabsTrigger>
              <TabsTrigger value="rooms">Rooms</TabsTrigger>
              <TabsTrigger value="grid">Density grid</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(true)}
            className="gap-1.5 h-9"
          >
            <Maximize2 className="size-4" />
            Fullscreen
          </Button>
        </div>
      </div>

      {/* Map */}
      {activeFloor ? (
        activeFloor.widthMeters && activeFloor.heightMeters ? (
          <Card className="p-6">
            <FloorMapView
              vectorMap={activeFloor.vectorMap}
              mapUrl={activeFloor.mapUrl}
              widthMeters={activeFloor.widthMeters}
              heightMeters={activeFloor.heightMeters}
              pois={mapPois}
              zones={mapZones}
              className="w-full"
            >
              {heatMode !== "off" ? (
                <HeatmapLayer
                  rooms={rooms}
                  roomHeat={heatMode === "rooms" ? roomHeat?.items : undefined}
                  gridHeat={heatMode === "grid" ? gridHeat?.items : undefined}
                  gridCellMeters={gridHeat?.cell_meters}
                  s={s}
                />
              ) : null}
              {floorLevel != null ? (
                <AlertPulseLayer alerts={alerts} rooms={rooms} floor={floorLevel} s={s} />
              ) : null}
              {floorLevel != null ? (
                <LiveOverlay devicesRef={devicesRef} floor={floorLevel} s={s} onCounts={onCounts} />
              ) : null}
            </FloorMapView>
            <div className="flex items-center gap-4 mt-2 px-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: "#2DD4A7" }} />
                walking
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: "#F2A33C" }} />
                stationary
              </span>
              {heatMode !== "off" ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-10 rounded-sm"
                    style={{ background: "linear-gradient(90deg,#2DD4A7,#14B8A6,#F2A33C,#EF4444)" }}
                  />
                  visits (last {HEATMAP_MINUTES} min)
                </span>
              ) : null}
            </div>
          </Card>
        ) : (
          <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20 text-sm text-muted-foreground">
            This floor has no calibration (width/height in meters) yet — set it in
            the building's Levels &amp; Maps tab before live positions can be drawn.
          </div>
        )
      ) : (
        <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20 text-sm text-muted-foreground">
          No floors in this building yet.
        </div>
      )}

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-6 bg-card border">
          <DialogHeader className="pb-3 border-b flex flex-row items-center justify-between shrink-0">
            <div>
              <DialogTitle className="text-xl font-bold">
                Live Map Fullscreen Preview — {activeFloor?.name || `Level ${activeFloor?.level}`}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time device positioning and room occupancy heatmap
              </p>
            </div>
          </DialogHeader>
          <div className="flex-grow min-h-0 overflow-hidden relative flex items-center justify-center p-6 bg-muted/10 rounded-xl border mt-4">
            {activeFloor && (
              <FloorMapView
                vectorMap={activeFloor.vectorMap}
                mapUrl={activeFloor.mapUrl}
                widthMeters={activeFloor.widthMeters}
                heightMeters={activeFloor.heightMeters}
                pois={mapPois}
                zones={mapZones}
                className="max-h-full max-w-full"
              >
                {heatMode !== "off" ? (
                  <HeatmapLayer
                    rooms={rooms}
                    roomHeat={heatMode === "rooms" ? roomHeat?.items : undefined}
                    gridHeat={heatMode === "grid" ? gridHeat?.items : undefined}
                    gridCellMeters={gridHeat?.cell_meters}
                    s={s}
                  />
                ) : null}
                {floorLevel != null ? (
                  <AlertPulseLayer alerts={alerts} rooms={rooms} floor={floorLevel} s={s} />
                ) : null}
                {floorLevel != null ? (
                  <LiveOverlay devicesRef={devicesRef} floor={floorLevel} s={s} onCounts={onCounts} />
                ) : null}
              </FloorMapView>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
