import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePois, useDeletePoi } from "@/features/pois/hooks";
import { useFloorsByBuilding } from "@/features/floors/hooks";
import { PoiTable } from "@/features/pois/components/PoiTable";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface PoisTabProps {
  buildingId: string;
}

export function PoisTab({ buildingId }: PoisTabProps) {
  const navigate = useNavigate();
  const { data: pois, isLoading: poisLoading } = usePois(buildingId);
  const { data: floors } = useFloorsByBuilding(buildingId);
  const deletePoi = useDeletePoi();

  const [deletePoiId, setDeletePoiId] = useState<string | null>(null);
  const [poiFilterFloorLevel, setPoiFilterFloorLevel] = useState<string>("all");

  const filteredPois = useMemo(() => {
    if (!pois) return [];
    if (poiFilterFloorLevel === "all") return pois;
    const lvl = Number(poiFilterFloorLevel);
    return pois.filter((p) => p.floorLevel === lvl);
  }, [pois, poiFilterFloorLevel]);

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

  return (
    <div className="p-6 space-y-4 outline-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor="floor-filter" className="text-xs font-semibold text-muted-foreground">
            Floor Level:
          </Label>
          <Select
            value={poiFilterFloorLevel}
            onValueChange={(val) => val && setPoiFilterFloorLevel(val)}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs bg-card">
              <SelectValue placeholder="All Floors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Floors</SelectItem>
              {floors?.map((f) => (
                <SelectItem key={f.id} value={String(f.level)}>
                  Level {f.level} ({f.name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => navigate(`/buildings/${buildingId}/pois/new`)} size="sm">
          <Plus className="size-4 mr-1" /> Add Location POI
        </Button>
      </div>

      {poisLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <PoiTable
            pois={filteredPois}
            onRowClick={(p) => navigate(`/buildings/${buildingId}/pois/${p.id}`)}
            onDelete={setDeletePoiId}
          />
        </div>
      )}

      {/* Delete POI Dialog */}
      <Dialog open={!!deletePoiId} onOpenChange={(o) => !o && setDeletePoiId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete POI Location</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this shop/location? Any deals pointing to it will become inactive or deleted.
            </DialogDescription>
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
