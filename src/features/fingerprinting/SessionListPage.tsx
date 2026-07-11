import { useState } from "react";
import { useBuildings } from "@/features/buildings/hooks";
import { useSessions, useDeleteSession } from "./hooks";
import { SessionTable } from "./components/SessionTable";
import {
  useTrajectorySessions,
  useDeleteTrajectorySession,
  useExportTrajectorySession,
  useReplayTrajectorySession,
} from "@/features/trajectory/hooks";
import { TrajectorySessionTable } from "@/features/trajectory/components/TrajectorySessionTable";
import type { TrajectorySession } from "@/features/trajectory/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FingerprintSession } from "./types";

export function SessionListPage() {
  const { data: buildings, isLoading: buildingsLoading } = useBuildings();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const { data: sessions, isLoading } = useSessions(
    selectedBuildingId || undefined
  );
  const { data: trajectorySessions, isLoading: trajectoryLoading } =
    useTrajectorySessions(selectedBuildingId || undefined);

  const deleteMutation = useDeleteSession();
  const [confirmDelete, setConfirmDelete] = useState<FingerprintSession | null>(
    null
  );

  const deleteTrajectoryMutation = useDeleteTrajectorySession();
  const exportTrajectory = useExportTrajectorySession();
  const replayTrajectory = useReplayTrajectorySession();
  const [confirmDeleteTrajectory, setConfirmDeleteTrajectory] =
    useState<TrajectorySession | null>(null);

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        toast.success(
          `Deleted "${confirmDelete.name || confirmDelete.id.slice(0, 8)}"`
        );
        setConfirmDelete(null);
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        toast.error(e.response?.data?.error || e.message || "Delete failed");
      },
    });
  };

  const handleConfirmDeleteTrajectory = () => {
    if (!confirmDeleteTrajectory) return;
    deleteTrajectoryMutation.mutate(confirmDeleteTrajectory.id, {
      onSuccess: () => {
        toast.success(
          `Deleted "${
            confirmDeleteTrajectory.name ||
            confirmDeleteTrajectory.id.slice(0, 8)
          }"`
        );
        setConfirmDeleteTrajectory(null);
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        toast.error(e.response?.data?.error || e.message || "Delete failed");
      },
    });
  };

  const handleExportTrajectory = (s: TrajectorySession) => {
    exportTrajectory.mutate(
      { id: s.id, name: s.name, floorLevel: s.floorLevel },
      {
        onSuccess: () => toast.success("Walk export downloaded"),
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast.error(e.response?.data?.error || e.message || "Export failed");
        },
      }
    );
  };

  const handleReplayTrajectory = (s: TrajectorySession) => {
    replayTrajectory.mutate(
      { id: s.id, name: s.name, floorLevel: s.floorLevel },
      {
        onSuccess: () => toast.success("Replay tape downloaded"),
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast.error(e.response?.data?.error || e.message || "Replay failed");
        },
      }
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Fingerprinting
          </h1>
          <p className="text-sm text-muted-foreground">
            Inspect collection sessions, analyze coverage, and export raw data
            for ML training.
          </p>
        </div>
      </div>

      <div className="mb-4">
        {buildingsLoading ? (
          <Skeleton className="h-10 w-[260px]" />
        ) : (
          <Select
            value={selectedBuildingId}
            onValueChange={(value) => setSelectedBuildingId(value ?? "")}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Pick a building to view sessions" />
            </SelectTrigger>
            <SelectContent>
              {buildings?.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!selectedBuildingId ? (
        <p className="text-sm text-muted-foreground">
          Select a building above to load its fingerprint and trajectory
          sessions.
        </p>
      ) : (
        <Tabs defaultValue="point" className="w-full">
          <TabsList>
            <TabsTrigger value="point">Point Sessions</TabsTrigger>
            <TabsTrigger value="trajectory">Trajectory Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="point" className="pt-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <SessionTable
                sessions={sessions || []}
                onDelete={(s) => setConfirmDelete(s)}
              />
            )}
          </TabsContent>

          <TabsContent value="trajectory" className="pt-4">
            {trajectoryLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <TrajectorySessionTable
                sessions={trajectorySessions || []}
                onExport={handleExportTrajectory}
                onReplay={handleReplayTrajectory}
                onDelete={(s) => setConfirmDeleteTrajectory(s)}
                exportingId={
                  exportTrajectory.isPending
                    ? exportTrajectory.variables?.id
                    : null
                }
                replayingId={
                  replayTrajectory.isPending
                    ? replayTrajectory.variables?.id
                    : null
                }
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
            <DialogDescription>
              This will permanently remove session{" "}
              <span className="font-mono">
                "{confirmDelete?.name || confirmDelete?.id.slice(0, 8)}"
              </span>{" "}
              and all of its fingerprints and raw readings. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmDeleteTrajectory}
        onOpenChange={(open) => !open && setConfirmDeleteTrajectory(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete trajectory session?</DialogTitle>
            <DialogDescription>
              This will permanently remove trajectory session{" "}
              <span className="font-mono">
                "
                {confirmDeleteTrajectory?.name ||
                  confirmDeleteTrajectory?.id.slice(0, 8)}
                "
              </span>{" "}
              and all of its walks, steps, IMU, BLE and WiFi readings. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteTrajectory(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteTrajectory}
              disabled={deleteTrajectoryMutation.isPending}
            >
              {deleteTrajectoryMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
