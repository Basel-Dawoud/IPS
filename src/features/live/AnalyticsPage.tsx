import { useEffect, useMemo, useState } from "react";
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
import { ArrowLeft, Map as MapIcon, TrendingUp, Users } from "lucide-react";
import {
  useFloorOccupancy,
  useIpsHealth,
  useLivePositionsSnapshot,
  useRoomHeatmap,
  useTopRooms,
} from "./hooks/useIpsQueries";
import { HeatmapLayer, type HeatRoom } from "./components/HeatmapLayer";
import { HourlyChart } from "./components/HourlyChart";
import { TopRoomsList } from "./components/TopRoomsList";

const DAY_MINUTES = 1440;
const TOP_ROOMS_MINUTES = 60;
const HEATMAP_MINUTES = 60;

/**
 * Historical analytics for one building: 24h occupancy, top visited rooms,
 * devices online, per-floor heatmap previews. Ported from IPS analytics.html;
 * data from the IPS FastAPI plane, geometry from the Node backend.
 */
export function AnalyticsPage() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();

  const { data: building } = useBuilding(buildingId!);
  const { data: floors, isLoading: floorsLoading } = useFloorsByBuilding(buildingId!);
  const { data: pois } = usePois(buildingId!);

  const sortedFloors = useMemo(
    () => (floors ?? []).slice().sort((a, b) => a.level - b.level),
    [floors],
  );

  const [floorLevel, setFloorLevel] = useState<number | null>(null);
  useEffect(() => {
    if (floorLevel == null && sortedFloors.length > 0) setFloorLevel(sortedFloors[0].level);
  }, [sortedFloors, floorLevel]);

  const { data: health } = useIpsHealth();
  const { data: livePositions } = useLivePositionsSnapshot(buildingId!);
  const { data: dayOccupancy } = useFloorOccupancy(buildingId!, floorLevel, DAY_MINUTES);
  const { data: topRooms } = useTopRooms(buildingId!, TOP_ROOMS_MINUTES, 8);
  const { data: floorHeat } = useRoomHeatmap(buildingId!, floorLevel, HEATMAP_MINUTES);

  const peakOccupancy = useMemo(
    () => Math.max(0, ...(dayOccupancy?.items ?? []).map((p) => p.device_count)),
    [dayOccupancy],
  );
  const avgOccupancy = useMemo(() => {
    const items = dayOccupancy?.items ?? [];
    if (items.length === 0) return 0;
    return Math.round(items.reduce((sum, p) => sum + p.device_count, 0) / items.length);
  }, [dayOccupancy]);

  const activeFloor = sortedFloors.find((f) => f.level === floorLevel) ?? null;
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

  const mapZones = useMemo(
    () => rooms.map((r) => ({ poiId: r.id, x: r.x, y: r.y, w: r.w, h: r.h, saved: true })),
    [rooms],
  );

  const s = activeFloor
    ? Math.max(activeFloor.widthMeters ?? 0, activeFloor.heightMeters ?? 0) || 50
    : 50;

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
            <h1 className="text-2xl font-bold truncate">Movement Analytics</h1>
            <Badge
              variant={health?.status === "ok" ? "default" : "destructive"}
              className="text-[10px]"
            >
              {health?.status === "ok" ? "IPS ONLINE" : "IPS OFFLINE"}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/buildings/${buildingId}/live`)}
        >
          <MapIcon className="size-3.5 mr-1" /> Live Map
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-3 flex flex-row items-center gap-3">
          <Users className="size-4 text-primary shrink-0" />
          <div>
            <div className="text-lg font-bold leading-none">{livePositions?.count ?? 0}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">devices online now</div>
          </div>
        </Card>
        <Card className="p-3 flex flex-row items-center gap-3">
          <TrendingUp className="size-4 text-primary shrink-0" />
          <div>
            <div className="text-lg font-bold leading-none">{peakOccupancy}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              peak occupancy (24h, floor {floorLevel ?? "—"})
            </div>
          </div>
        </Card>
        <Card className="p-3 flex flex-row items-center gap-3">
          <TrendingUp className="size-4 text-muted-foreground shrink-0" />
          <div>
            <div className="text-lg font-bold leading-none">{avgOccupancy}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              avg per 5-min bucket (24h)
            </div>
          </div>
        </Card>
      </div>

      {/* Floor selector */}
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Occupancy over 24h */}
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">
            Occupancy — last 24h (floor {floorLevel ?? "—"})
          </h3>
          <HourlyChart items={dayOccupancy?.items ?? []} />
        </Card>

        {/* Top rooms */}
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">
            Most visited — last {TOP_ROOMS_MINUTES} min
          </h3>
          <TopRoomsList items={topRooms?.items ?? []} />
        </Card>
      </div>

      {/* Heatmap preview for the selected floor */}
      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">
          Room heatmap — last {HEATMAP_MINUTES} min (floor {floorLevel ?? "—"})
        </h3>
        {activeFloor && activeFloor.widthMeters && activeFloor.heightMeters ? (
          <FloorMapView
            vectorMap={activeFloor.vectorMap}
            mapUrl={activeFloor.mapUrl}
            widthMeters={activeFloor.widthMeters}
            heightMeters={activeFloor.heightMeters}
            pois={mapPois}
            zones={mapZones}
            className="w-full max-w-3xl"
          >
            <HeatmapLayer rooms={rooms} roomHeat={floorHeat?.items} s={s} />
          </FloorMapView>
        ) : (
          <div className="text-xs text-muted-foreground py-6 text-center">
            Floor not calibrated yet.
          </div>
        )}
      </Card>
    </div>
  );
}
