import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useFloor, useUpdateFloor, useUploadFloorImage } from "./hooks";
import { useBuilding } from "@/features/buildings/hooks";
import { FloorMapView } from "./components/FloorMapView";
import { FloorCalibrator } from "./components/FloorCalibrator";
import { usePois, useDeletePoi } from "@/features/pois/hooks";
import { PoiTable } from "@/features/pois/components/PoiTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { computeAutoZone } from "@/features/pois/poi-zone";
import type { FloorMapZone } from "./components/FloorMapView";

export function FloorDetailPage() {
  const { buildingId, floorId } = useParams<{ buildingId: string; floorId: string }>();
  const navigate = useNavigate();

  const { data: floor, isLoading } = useFloor(floorId!);
  const { data: building } = useBuilding(buildingId!);

  const updateFloor = useUpdateFloor();
  const uploadImage = useUploadFloorImage();

  // Calibration form state (synced from the floor).
  const [widthMeters, setWidthMeters] = useState("");
  const [heightMeters, setHeightMeters] = useState("");
  const [rotationDeg, setRotationDeg] = useState(0);
  const [originXm, setOriginXm] = useState("0");
  const [originYm, setOriginYm] = useState("0");

  useEffect(() => {
    if (floor) {
      setWidthMeters(floor.widthMeters != null ? String(floor.widthMeters) : "");
      setHeightMeters(floor.heightMeters != null ? String(floor.heightMeters) : "");
      setRotationDeg(floor.rotationDeg ?? 0);
      setOriginXm(String(floor.originXm ?? 0));
      setOriginYm(String(floor.originYm ?? 0));
    }
  }, [floor]);

  const { data: pois } = usePois(buildingId!, floor?.level);
  const deletePoi = useDeletePoi();

  const [deletePoiId, setDeletePoiId] = useState<string | null>(null);

  // Zones for the overview map: admin-drawn (solid) or auto-derived (dashed).
  const poiZones = useMemo<FloorMapZone[]>(() => {
    if (!floor) return [];
    return (pois ?? []).flatMap((p) => {
      const saved =
        p.areaX != null && p.areaY != null && p.areaW != null && p.areaH != null;
      const z = saved
        ? { x: p.areaX!, y: p.areaY!, w: p.areaW!, h: p.areaH! }
        : computeAutoZone(floor.vectorMap, p.x, p.y);
      return z ? [{ poiId: p.id, ...z, saved }] : [];
    });
  }, [floor, pois]);

  const handleSaveCalibration = () => {
    updateFloor.mutate(
      {
        id: floorId!,
        input: {
          widthMeters: widthMeters !== "" ? Number(widthMeters) : undefined,
          heightMeters: heightMeters !== "" ? Number(heightMeters) : undefined,
          rotationDeg,
          originXm: originXm !== "" ? Number(originXm) : undefined,
          originYm: originYm !== "" ? Number(originYm) : undefined,
        },
      },
      {
        onSuccess: () => toast.success("Calibration saved"),
        onError: () => toast.error("Failed to save calibration"),
      },
    );
  };

  const handleUploadImage = (file: File) => {
    uploadImage.mutate(
      { id: floorId!, file },
      {
        onSuccess: () => toast.success("Floor map uploaded"),
        onError: () => toast.error("Failed to upload map"),
      },
    );
  };

  const handleConfirmDeletePoi = () => {
    if (!deletePoiId) return;
    deletePoi.mutate(deletePoiId, {
      onSuccess: () => {
        toast.success("POI deleted");
        setDeletePoiId(null);
      },
      onError: () => toast.error("Failed to delete POI"),
    });
  };

  if (isLoading || !floor) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[360px] w-full" />
      </div>
    );
  }

  const poiMarkers = (pois ?? []).map((p) => ({
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          to={`/buildings/${buildingId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="size-3" />
          {building?.name ?? "Building"}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{floor.name}</h1>
        <p className="text-sm text-muted-foreground">Level {floor.level}</p>
      </div>

      {/* Overview map */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Location Map</h2>
          <p className="text-sm text-muted-foreground">
            Click the map to add a POI · click a marker to edit it
          </p>
        </div>
        <div className="rounded-xl border p-3 bg-muted/30">
          <div className="mx-auto max-w-3xl">
            <FloorMapView
              vectorMap={floor.vectorMap}
              mapUrl={floor.mapUrl}
              widthMeters={floor.widthMeters}
              heightMeters={floor.heightMeters}
              pois={poiMarkers}
              zones={poiZones}
              showAxes
              onChange={(x, y) => navigate(`/buildings/${buildingId}/pois/new?x=${x}&y=${y}`)}
              onSelectPoi={(id) => navigate(`/buildings/${buildingId}/pois/${id}`)}
            />
          </div>
        </div>
      </section>

      {/* Calibration */}
      <section className="rounded-xl border p-5 space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-xl font-semibold tracking-tight">Map Dimensions & Scaling</h2>
          <p className="text-sm text-muted-foreground">
            Upload the map file, then define real-world dimensions (meters) to align the coordinate grid.
          </p>
        </div>

        <FloorCalibrator
          imageUrl={floor.mapUrl}
          imageWidthPx={floor.imageWidthPx}
          imageHeightPx={floor.imageHeightPx}
          widthMeters={widthMeters}
          heightMeters={heightMeters}
          rotationDeg={rotationDeg}
          originXm={originXm}
          originYm={originYm}
          uploading={uploadImage.isPending}
          onFileSelected={handleUploadImage}
          onWidthMeters={setWidthMeters}
          onHeightMeters={setHeightMeters}
          onRotationDeg={setRotationDeg}
          onOriginXm={setOriginXm}
          onOriginYm={setOriginYm}
        />

        <Button onClick={handleSaveCalibration} disabled={updateFloor.isPending}>
          {updateFloor.isPending ? "Saving..." : "Save Calibration Settings"}
        </Button>
      </section>

      {/* POI Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Points of Interest</h2>
          <Button
            size="sm"
            onClick={() => {
              navigate(`/buildings/${buildingId}/pois/new`);
            }}
          >
            <Plus className="size-4" data-icon="inline-start" />
            Add POI
          </Button>
        </div>
        <PoiTable
          pois={pois || []}
          onRowClick={(p) => navigate(`/buildings/${buildingId}/pois/${p.id}`)}
          onDelete={setDeletePoiId}
        />
      </section>

      <Dialog open={!!deletePoiId} onOpenChange={(o) => !o && setDeletePoiId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete POI</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePoiId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeletePoi}
              disabled={deletePoi.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
