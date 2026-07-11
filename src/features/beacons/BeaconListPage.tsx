import { useState } from "react";
import { useBuildings } from "@/features/buildings/hooks";
import { useBeaconsByBuilding, useCreateBeacon, useUpdateBeacon, useDeleteBeacon } from "./hooks";
import { BeaconTable } from "./components/BeaconTable";
import { BeaconForm } from "./components/BeaconForm";
import { Button } from "@/components/ui/button";
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
import type { Beacon, CreateBeaconInput } from "./types";

export function BeaconListPage() {
  const { data: buildings } = useBuildings();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const { data: beacons, isLoading } = useBeaconsByBuilding(selectedBuildingId);
  const createMutation = useCreateBeacon();
  const updateMutation = useUpdateBeacon();
  const deleteMutation = useDeleteBeacon();

  const [formOpen, setFormOpen] = useState(false);
  const [editingBeacon, setEditingBeacon] = useState<Beacon | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingBeacon(null);
    setFormOpen(true);
  };

  const handleEdit = (beacon: Beacon) => {
    setEditingBeacon(beacon);
    setFormOpen(true);
  };

  const handleSubmit = (data: CreateBeaconInput) => {
    if (editingBeacon) {
      updateMutation.mutate(
        { id: editingBeacon.id, input: data },
        {
          onSuccess: () => {
            toast.success("Beacon updated successfully");
            setFormOpen(false);
          },
          onError: () => toast.error("Failed to update beacon"),
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          toast.success("Beacon created successfully");
          setFormOpen(false);
        },
        onError: () => toast.error("Failed to create beacon"),
      });
    }
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success("Beacon deleted successfully");
        setDeleteId(null);
      },
      onError: () => toast.error("Failed to delete beacon"),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Beacons</h1>
          <p className="text-sm text-muted-foreground">Manage BLE beacons across buildings.</p>
        </div>
        <Button onClick={handleCreate} disabled={!selectedBuildingId}>
          <Plus className="size-4" data-icon="inline-start" />
          Add Beacon
        </Button>
      </div>

      <div className="mb-4">
        <Select value={selectedBuildingId} onValueChange={(v) => setSelectedBuildingId(v ?? "")}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Select a building" />
          </SelectTrigger>
          <SelectContent>
            {buildings?.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedBuildingId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Select a building above to view its beacons.
        </p>
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <BeaconTable
          beacons={beacons || []}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {selectedBuildingId && (
        <BeaconForm
          open={formOpen}
          onOpenChange={setFormOpen}
          beacon={editingBeacon}
          buildingId={selectedBuildingId}
          onSubmit={handleSubmit}
        />
      )}

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Beacon</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this beacon? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
