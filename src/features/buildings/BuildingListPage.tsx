import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useBuildings,
  useDeleteBuilding,
} from "./hooks";
import { BuildingTable } from "./components/BuildingTable";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function BuildingListPage() {
  const navigate = useNavigate();
  const { data: buildings, isLoading } = useBuildings();
  const deleteMutation = useDeleteBuilding();

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success("Building deleted successfully");
        setDeleteId(null);
      },
      onError: () => toast.error("Failed to delete building"),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buildings</h1>
          <p className="text-sm text-muted-foreground">
            Click a building to manage its floors, maps and POIs.
          </p>
        </div>
        <Button onClick={() => navigate("/buildings/new")}>
          <Plus className="size-4" data-icon="inline-start" />
          Add Building
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <BuildingTable buildings={buildings || []} onDelete={setDeleteId} />
      )}

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Building</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this building? This action cannot be undone.
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
