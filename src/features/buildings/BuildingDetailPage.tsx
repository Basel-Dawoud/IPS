import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useBuilding, useDeleteBuilding } from "./hooks";
import { OverviewTab } from "./components/OverviewTab";
import { FloorsTab } from "./components/FloorsTab";
import { PoisTab } from "./components/PoisTab";
import { DealsTab } from "./components/DealsTab";
import { EmergencyTab } from "./components/EmergencyTab";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Trash2, Radio, Activity } from "lucide-react";
import { toast } from "sonner";

export function BuildingDetailPage() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();

  // Primary Building details query
  const { data: building, isLoading } = useBuilding(buildingId!);
  const deleteMutation = useDeleteBuilding();

  const [confirmDeleteBuilding, setConfirmDeleteBuilding] = useState(false);

  if (isLoading || !building) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Branded Detail Header */}
      <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-3">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5"
          >
            <ArrowLeft className="size-3" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold truncate">{building.name}</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              {building.code}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {building.description || "No description provided."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/buildings/${buildingId}/live`)}
          >
            <Radio className="size-3.5 mr-1" /> Live Map
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/buildings/${buildingId}/analytics`)}
          >
            <Activity className="size-3.5 mr-1" /> Analytics
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteBuilding(true)}
          >
            <Trash2 className="size-3.5 mr-1" /> Delete Venue
          </Button>
        </div>
      </div>

      {/* 2. Unified Tabbed Workspace */}
      <Card className="border shadow-md overflow-hidden bg-card/40 backdrop-blur-sm">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-card px-6 py-0 h-10 gap-2">
            <TabsTrigger
              value="overview"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
            >
              Overview & GPS
            </TabsTrigger>
            <TabsTrigger
              value="floors"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
            >
              Levels & Maps
            </TabsTrigger>
            <TabsTrigger
              value="pois"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
            >
              POIs Directory
            </TabsTrigger>
            <TabsTrigger
              value="deals"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
            >
              Deals & Offers
            </TabsTrigger>
            <TabsTrigger
              value="emergency"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-destructive data-[state=active]:text-destructive font-semibold"
            >
              ⚠️ Emergency Alert
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: OVERVIEW & LOCATION */}
          <TabsContent value="overview">
            <OverviewTab buildingId={buildingId!} building={building} />
          </TabsContent>

          {/* TAB 2: LEVELS & MAPS */}
          <TabsContent value="floors">
            <FloorsTab buildingId={buildingId!} />
          </TabsContent>

          {/* TAB 3: POIS DIRECTORY */}
          <TabsContent value="pois">
            <PoisTab buildingId={buildingId!} />
          </TabsContent>

          {/* TAB 4: DEALS & PROMOTIONS */}
          <TabsContent value="deals">
            <DealsTab buildingId={buildingId!} />
          </TabsContent>

          {/* TAB 5: EMERGENCY ALERT */}
          <TabsContent value="emergency">
            <EmergencyTab buildingId={buildingId!} />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Delete Building Dialog */}
      <Dialog open={confirmDeleteBuilding} onOpenChange={setConfirmDeleteBuilding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Venue</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this building? All levels, maps,
              and POIs associated with it will be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteBuilding(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteMutation.mutate(buildingId!, {
                  onSuccess: () => {
                    toast.success("Building deleted");
                    navigate("/buildings");
                  },
                  onError: () => toast.error("Failed to delete building"),
                })
              }
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
