import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useFloorsByBuilding,
  useCreateFloor,
  useDeleteFloor,
  useUpdateFloor,
  useUploadFloorImage,
  useDetectFloorTransitions,
} from "@/features/floors/hooks";
import { FloorCalibrator } from "@/features/floors/components/FloorCalibrator";
import { FloorForm } from "@/features/floors/components/FloorForm";
import type { CreateFloorInput } from "@/features/floors/types";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Layers, Map, ArrowRight, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

interface FloorsTabProps {
  buildingId: string;
}

export function FloorsTab({ buildingId }: FloorsTabProps) {
  const { data: floors, isLoading: floorsLoading } = useFloorsByBuilding(buildingId);
  const createFloor = useCreateFloor();
  const deleteFloor = useDeleteFloor();
  const updateFloor = useUpdateFloor();
  const uploadFloorImage = useUploadFloorImage();
  const detectTransitions = useDetectFloorTransitions();

  const [floorFormOpen, setFloorFormOpen] = useState(false);
  const [deleteFloorId, setDeleteFloorId] = useState<string | null>(null);
  const [selectedCalibFloorId, setSelectedCalibFloorId] = useState<string | null>(null);

  const [fWidth, setFWidth] = useState("");
  const [fHeight, setFHeight] = useState("");
  const [fRotation, setFRotation] = useState(0);
  const [fOriginX, setFOriginX] = useState("0");
  const [fOriginY, setFOriginY] = useState("0");

  const selectedCalibFloor = useMemo(() => {
    return floors?.find((f) => f.id === selectedCalibFloorId) ?? null;
  }, [floors, selectedCalibFloorId]);

  useEffect(() => {
    if (selectedCalibFloor) {
      setFWidth(
        selectedCalibFloor.widthMeters != null ? String(selectedCalibFloor.widthMeters) : ""
      );
      setFHeight(
        selectedCalibFloor.heightMeters != null ? String(selectedCalibFloor.heightMeters) : ""
      );
      setFRotation(selectedCalibFloor.rotationDeg ?? 0);
      setFOriginX(String(selectedCalibFloor.originXm ?? 0));
      setFOriginY(String(selectedCalibFloor.originYm ?? 0));
    } else {
      setFWidth("");
      setFHeight("");
      setFRotation(0);
      setFOriginX("0");
      setFOriginY("0");
    }
  }, [selectedCalibFloor]);

  const handleAddFloor = (data: CreateFloorInput) => {
    createFloor.mutate(data, {
      onSuccess: () => {
        toast.success("Floor added");
        setFloorFormOpen(false);
      },
      onError: () => toast.error("Failed to add floor"),
    });
  };

  const handleFloorFile = (file: File) => {
    if (!selectedCalibFloorId) return;
    uploadFloorImage.mutate(
      { id: selectedCalibFloorId, file },
      {
        onSuccess: () => toast.success("Floor map uploaded"),
        onError: () => toast.error("Failed to upload map"),
      },
    );
  };

  const saveFloorCalibration = () => {
    if (!selectedCalibFloorId) return;
    updateFloor.mutate(
      {
        id: selectedCalibFloorId,
        input: {
          widthMeters: fWidth !== "" ? Number(fWidth) : undefined,
          heightMeters: fHeight !== "" ? Number(fHeight) : undefined,
          rotationDeg: fRotation,
          originXm: fOriginX !== "" ? Number(fOriginX) : undefined,
          originYm: fOriginY !== "" ? Number(fOriginY) : undefined,
        },
      },
      {
        onSuccess: () => toast.success("Calibration saved"),
        onError: () => toast.error("Failed to save calibration"),
      },
    );
  };

  const handleDetectTransitions = () => {
    if (!selectedCalibFloorId) return;
    detectTransitions.mutate(selectedCalibFloorId, {
      onSuccess: (res) => {
        const total = res.createdStairs + res.createdElevators;
        toast.success(
          total > 0
            ? `Created ${res.createdStairs} stairs + ${res.createdElevators} elevator POIs`
            : "No new stairs/elevators detected (already present)",
        );
      },
      onError: () => toast.error("Failed to detect stairs/elevators"),
    });
  };

  const handleConfirmDeleteFloor = () => {
    if (!deleteFloorId) return;
    deleteFloor.mutate(deleteFloorId, {
      onSuccess: () => {
        toast.success("Floor deleted");
        setDeleteFloorId(null);
        if (selectedCalibFloorId === deleteFloorId) {
          setSelectedCalibFloorId(null);
        }
      },
      onError: () => toast.error("Failed to delete floor"),
    });
  };

  return (
    <div className="p-6 space-y-6 outline-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Venue Floors List</h3>
        <Button onClick={() => setFloorFormOpen(true)} size="sm">
          <Plus className="size-4 mr-1" /> Add Floor Level
        </Button>
      </div>

      {floorsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !floors || floors.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg bg-muted/20">
          <Layers className="size-8 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">
            No floor plans added yet
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-12">
          {/* Floor list */}
          <div className="md:col-span-5 space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {floors
              .slice()
              .sort((a, b) => a.level - b.level)
              .map((floor) => {
                const isCalib = floor.widthMeters != null && floor.heightMeters != null;
                const isSelected = floor.id === selectedCalibFloorId;

                return (
                  <div
                    key={floor.id}
                    onClick={() => setSelectedCalibFloorId(floor.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary/5 border-primary"
                        : "bg-card hover:bg-muted/30"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm">{floor.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span>Level {floor.level}</span>
                        <span>•</span>
                        <Badge
                          variant={floor.mapUrl ? "default" : "secondary"}
                          className="text-[9px] py-0 px-1"
                        >
                          {floor.mapUrl
                            ? isCalib
                              ? "Calibrated"
                              : "Map Added"
                            : "No Map"}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteFloorId(floor.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
          </div>

          {/* Floor calibration form */}
          <div className="md:col-span-7 border rounded-lg p-4 bg-muted/10 space-y-4">
            {!selectedCalibFloorId ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-4">
                <Map className="size-8 text-muted-foreground/60 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Select a floor plan from the list to upload building maps and calibrate scale.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Map & Scale Calibration
                  </h4>
                  {selectedCalibFloor && (
                    <Link
                      to={`/buildings/${buildingId}/floors/${selectedCalibFloor.id}`}
                      className="text-xs flex items-center text-primary hover:underline"
                    >
                      Visual Editor <ArrowRight className="size-3 ml-0.5" />
                    </Link>
                  )}
                </div>

                {selectedCalibFloor && (
                  <FloorCalibrator
                    imageUrl={selectedCalibFloor.mapUrl}
                    imageWidthPx={selectedCalibFloor.imageWidthPx}
                    imageHeightPx={selectedCalibFloor.imageHeightPx}
                    widthMeters={fWidth}
                    heightMeters={fHeight}
                    rotationDeg={fRotation}
                    originXm={fOriginX}
                    originYm={fOriginY}
                    uploading={uploadFloorImage.isPending}
                    onFileSelected={handleFloorFile}
                    onWidthMeters={setFWidth}
                    onHeightMeters={setFHeight}
                    onRotationDeg={setFRotation}
                    onOriginXm={setFOriginX}
                    onOriginYm={setFOriginY}
                  />
                )}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={saveFloorCalibration}
                    size="sm"
                    disabled={updateFloor.isPending}
                  >
                    {updateFloor.isPending ? "Saving..." : "Save Calibration"}
                  </Button>
                  {selectedCalibFloor?.vectorMap && (
                    <Button
                      onClick={handleDetectTransitions}
                      size="sm"
                      variant="outline"
                      disabled={detectTransitions.isPending}
                    >
                      <ArrowUpDown className="size-4 mr-1" />
                      {detectTransitions.isPending
                        ? "Detecting…"
                        : "Detect stairs/elevators"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floor Form */}
      {buildingId && (
        <FloorForm
          open={floorFormOpen}
          onOpenChange={setFloorFormOpen}
          buildingId={buildingId}
          onSubmit={handleAddFloor}
        />
      )}

      {/* Delete Floor Dialog */}
      <Dialog open={!!deleteFloorId} onOpenChange={(o) => !o && setDeleteFloorId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Floor Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this level and its map? All calibrated positions and points of interest will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFloorId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteFloor}
              disabled={deleteFloor.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
