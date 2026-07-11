import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  useSession,
  useFingerprints,
  useSessionAnalytics,
  useAggregateSession,
  useExportFingerprintsCsv,
  useExportRawReadingsCsv,
  useUpdateSession,
  useDeleteSession,
  useDeleteSessionPoint,
  useDeleteSingleFingerprint,
} from "./hooks";
import { useBuilding } from "@/features/buildings/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Download,
  Layers,
  CheckCircle2,
  Trash2,
  FileSpreadsheet,
  Database,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

const AD_INTERVAL_MS = 200; // matches mobile EXPO_PUBLIC_BLE_AD_INTERVAL_MS

export function SessionDetailPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: session, isLoading: sessionLoading } = useSession(sessionId!);
  const { data: building } = useBuilding(session?.buildingId || "");
  const { data: analytics, isLoading: analyticsLoading } =
    useSessionAnalytics(sessionId!);

  const [page, setPage] = useState(1);
  const { data: fingerprintsData, isLoading: fpLoading } = useFingerprints(
    sessionId!,
    page
  );

  const aggregate = useAggregateSession();
  const exportFingerprints = useExportFingerprintsCsv();
  const exportRaw = useExportRawReadingsCsv();
  const updateSession = useUpdateSession();
  const deleteSession = useDeleteSession();
  const deletePoint = useDeleteSessionPoint();
  const deleteSingleFp = useDeleteSingleFingerprint();

  const [deleteSessionOpen, setDeleteSessionOpen] = useState(false);
  const [deletePointTarget, setDeletePointTarget] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [deleteSingleFpTarget, setDeleteSingleFpTarget] = useState<{
    id: string;
    x: number;
    y: number;
    sampleIndex: number | null;
  } | null>(null);
  const [expandedPoint, setExpandedPoint] = useState<string | null>(null);

  // Sort beacons by points seen descending for the analytics table
  const sortedBeacons = useMemo(() => {
    return analytics
      ? [...analytics.beacons].sort((a, b) => b.pointsSeen - a.pointsSeen)
      : [];
  }, [analytics]);

  if (sessionLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session) {
    return <p className="text-muted-foreground">Session not found.</p>;
  }

  const statusVariant =
    session.status === "COMPLETED"
      ? ("default" as const)
      : session.status === "IN_PROGRESS"
        ? ("secondary" as const)
        : ("outline" as const);

  const reads = session.pointDurationMs
    ? Math.round(session.pointDurationMs / AD_INTERVAL_MS)
    : null;

  // ── Action handlers ──

  const handleAggregate = () =>
    aggregate.mutate(sessionId!, {
      onSuccess: (r) =>
        toast.success(
          `Aggregated ${r.pointsProcessed} points (${r.pointsCreated} new, ${r.pointsUpdated} updated)`
        ),
      onError: () => toast.error("Failed to aggregate session"),
    });

  const handleExportFingerprints = () =>
    exportFingerprints.mutate(
      { id: sessionId!, floorLevel: session?.floorLevel },
      {
        onSuccess: () => toast.success("Fingerprints CSV downloaded"),
        onError: () => toast.error("Export failed"),
      }
    );

  const handleExportRaw = () =>
    exportRaw.mutate(
      { id: sessionId!, floorLevel: session?.floorLevel },
      {
        onSuccess: () => toast.success("Raw readings CSV downloaded"),
        onError: () => toast.error("Export failed"),
      }
    );

  const handleMarkComplete = () =>
    updateSession.mutate(
      { id: sessionId!, input: { status: "COMPLETED" } },
      {
        onSuccess: () => toast.success("Session marked as completed"),
        onError: () => toast.error("Failed to update session"),
      }
    );

  const handleConfirmDeleteSession = () =>
    deleteSession.mutate(sessionId!, {
      onSuccess: () => {
        toast.success("Session deleted");
        navigate("/fingerprinting");
      },
      onError: () => toast.error("Failed to delete session"),
    });

  const handleConfirmDeletePoint = () => {
    if (!deletePointTarget) return;
    deletePoint.mutate(
      { sessionId: sessionId!, x: deletePointTarget.x, y: deletePointTarget.y },
      {
        onSuccess: (r) => {
          toast.success(
            `Removed ${r.deleted} sample(s) at (${deletePointTarget.x}, ${deletePointTarget.y})`
          );
          setDeletePointTarget(null);
          setExpandedPoint(null);
        },
        onError: () => {
          toast.error("Failed to delete point");
          setDeletePointTarget(null);
        },
      }
    );
  };

  const handleConfirmDeleteSingleFp = () => {
    if (!deleteSingleFpTarget) return;
    deleteSingleFp.mutate(
      { sessionId: sessionId!, fingerprintId: deleteSingleFpTarget.id },
      {
        onSuccess: () => {
          toast.success(
            `Deleted sample #${(deleteSingleFpTarget.sampleIndex ?? 0) + 1} at (${deleteSingleFpTarget.x}, ${deleteSingleFpTarget.y})`
          );
          setDeleteSingleFpTarget(null);
        },
        onError: () => {
          toast.error("Failed to delete sample");
          setDeleteSingleFpTarget(null);
        },
      }
    );
  };

  return (
    <div>
      <Link
        to="/fingerprinting"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-3" />
        Back to Sessions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {session.name || "Untitled Session"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {building?.name || session.buildingId} &middot; Floor{" "}
            {session.floorLevel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.status === "IN_PROGRESS" && (
            <Button
              variant="outline"
              onClick={handleMarkComplete}
              disabled={updateSession.isPending}
            >
              <CheckCircle2 className="size-4" data-icon="inline-start" />
              Mark Complete
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleAggregate}
            disabled={aggregate.isPending}
          >
            <Layers className="size-4" data-icon="inline-start" />
            {aggregate.isPending ? "Aggregating..." : "Aggregate Radio Map"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteSessionOpen(true)}
          >
            <Trash2 className="size-4" data-icon="inline-start" />
            Delete
          </Button>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={statusVariant}>
              {session.status.replace("_", " ")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Grid Spacing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{session.gridSpacing} m</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reads / Beacon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{reads ?? "--"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Started
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {new Date(session.startedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="beacons">Per-Beacon</TabsTrigger>
          <TabsTrigger value="points">Per-Point</TabsTrigger>
          <TabsTrigger value="fingerprints">Fingerprints</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          {analyticsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : analytics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Unique Points"
                  value={analytics.totals.uniquePoints}
                />
                <StatCard
                  label="Total Samples"
                  value={analytics.totals.totalSamples}
                />
                <StatCard
                  label="Raw Readings"
                  value={analytics.totals.totalRawReadings.toLocaleString()}
                />
                <StatCard
                  label="Beacons Seen"
                  value={analytics.totals.uniqueBeacons}
                />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Coverage Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p>
                    Average raw readings per point:{" "}
                    <span className="font-medium text-foreground">
                      {analytics.totals.uniquePoints > 0
                        ? Math.round(
                            analytics.totals.totalRawReadings /
                              analytics.totals.uniquePoints
                          )
                        : 0}
                    </span>
                  </p>
                  <p>
                    Average samples per point:{" "}
                    <span className="font-medium text-foreground">
                      {analytics.totals.uniquePoints > 0
                        ? (
                            analytics.totals.totalSamples /
                            analytics.totals.uniquePoints
                          ).toFixed(2)
                        : 0}
                    </span>
                  </p>
                  <p>
                    Beacons consistently seen (≥75% of points):{" "}
                    <span className="font-medium text-foreground">
                      {
                        analytics.beacons.filter(
                          (b) =>
                            analytics.totals.uniquePoints > 0 &&
                            b.pointsSeen / analytics.totals.uniquePoints >= 0.75
                        ).length
                      }{" "}
                      / {analytics.totals.uniqueBeacons}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-muted-foreground">No analytics yet.</p>
          )}
        </TabsContent>

        {/* Per-Beacon */}
        <TabsContent value="beacons">
          {analyticsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beacon UID</TableHead>
                  <TableHead className="text-right">Points seen</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead className="text-right">Mean RSSI</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBeacons.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No beacons recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedBeacons.map((b) => (
                    <TableRow key={b.beaconUid}>
                      <TableCell className="font-mono text-xs">
                        {b.beaconUid}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.pointsSeen}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.sampleCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.meanRssi}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.minRssi}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.maxRssi}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Per-Point */}
        <TabsContent value="points">
          {analyticsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6"></TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead className="text-right">Raw readings</TableHead>
                  <TableHead className="text-right">Beacons</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!analytics || analytics.points.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No points collected yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  analytics.points.map((p, i) => {
                    const pointKey = `${p.x}-${p.y}-${i}`;
                    const isExpanded = expandedPoint === pointKey;
                    const hasMultiple = p.sampleCount > 1;
                    return (
                      <>
                        <TableRow
                          key={pointKey}
                          className={`cursor-pointer hover:bg-muted/50 transition-colors ${isExpanded ? "bg-muted/30" : ""}`}
                          onClick={() =>
                            setExpandedPoint(isExpanded ? null : pointKey)
                          }
                        >
                          <TableCell className="pr-0">
                            {isExpanded ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono">
                            ({p.x}, {p.y})
                            {hasMultiple && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-0.5">
                                {p.sampleCount} samples
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.sampleCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.rawReadingCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.beaconCount}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setDeletePointTarget({ x: p.x, y: p.y })
                              }
                              aria-label="Remove all samples at point"
                              title="Delete ALL samples at this point"
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded: per-sample sub-rows */}
                        {isExpanded && (
                          <TableRow key={`${pointKey}-expanded`}>
                            <TableCell colSpan={6} className="p-0 bg-muted/20">
                              <div className="px-8 py-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                                  <Clock className="size-3" />
                                  Individual Samples
                                </p>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-muted-foreground border-b">
                                      <th className="text-left pb-1 font-medium">Sample #</th>
                                      <th className="text-left pb-1 font-medium">Captured</th>
                                      <th className="w-8"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.samples.map((s, si) => (
                                      <tr
                                        key={s.id}
                                        className="border-b border-border/40 last:border-0"
                                      >
                                        <td className="py-1.5 tabular-nums font-mono text-xs">
                                          #{(s.sampleIndex ?? si) + 1}
                                        </td>
                                        <td className="py-1.5 text-muted-foreground">
                                          {new Date(s.createdAt).toLocaleString()}
                                        </td>
                                        <td className="py-1.5">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-6"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteSingleFpTarget({
                                                id: s.id,
                                                x: p.x,
                                                y: p.y,
                                                sampleIndex: s.sampleIndex,
                                              });
                                            }}
                                            aria-label={`Delete sample #${(s.sampleIndex ?? si) + 1}`}
                                            title="Delete this sample only"
                                          >
                                            <Trash2 className="size-3 text-destructive" />
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Fingerprints (paginated raw rows) */}
        <TabsContent value="fingerprints">
          {fpLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>X</TableHead>
                    <TableHead>Y</TableHead>
                    <TableHead className="text-right">Beacons</TableHead>
                    <TableHead className="text-right">Sample idx</TableHead>
                    <TableHead className="text-right">
                      Window (ms)
                    </TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!fingerprintsData?.data ||
                  fingerprintsData.data.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        No fingerprints recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    fingerprintsData.data.map((fp) => (
                      <TableRow key={fp.id}>
                        <TableCell className="tabular-nums">
                          {fp.x.toFixed(2)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {fp.y.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fp.beaconUids.length}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fp.sampleIndex ?? "--"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fp.durationMs ?? "--"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(fp.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {fingerprintsData?.pagination &&
                fingerprintsData.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {fingerprintsData.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        page >= fingerprintsData.pagination.totalPages
                      }
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
            </>
          )}
        </TabsContent>

        {/* Export */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4" />
                Raw Readings CSV (for ML training)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                One row per BLE advertisement. Columns:{" "}
                <span className="font-mono text-xs">
                  capturedAt, x, y, floorLevel, beaconUid, rssi, gyroX, gyroY,
                  gyroZ, fingerprintId
                </span>
                . Hand this directly to your AI engineer.
              </p>
              <Button
                onClick={handleExportRaw}
                disabled={exportRaw.isPending}
              >
                <Download className="size-4" data-icon="inline-start" />
                {exportRaw.isPending ? "Preparing..." : "Download Raw CSV"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="size-4" />
                Aggregated Fingerprints CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Wide format. One row per sample, one column per beacon UID with
                its IQR-filtered median RSSI. Missing beacons default to{" "}
                <span className="font-mono">-100</span>. Useful for KNN-style
                analysis directly in Excel/pandas.
              </p>
              <Button
                variant="outline"
                onClick={handleExportFingerprints}
                disabled={exportFingerprints.isPending}
              >
                <Download className="size-4" data-icon="inline-start" />
                {exportFingerprints.isPending
                  ? "Preparing..."
                  : "Download Fingerprints CSV"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm: delete session */}
      <Dialog open={deleteSessionOpen} onOpenChange={setDeleteSessionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              All {analytics?.totals.totalSamples ?? "?"} samples and{" "}
              {analytics?.totals.totalRawReadings ?? "?"} raw readings collected
              in this session will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteSessionOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteSession}
              disabled={deleteSession.isPending}
            >
              {deleteSession.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: delete a single point */}
      <Dialog
        open={!!deletePointTarget}
        onOpenChange={(open) => !open && setDeletePointTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this point?</DialogTitle>
            <DialogDescription>
              Delete all samples and raw readings collected at{" "}
              <span className="font-mono">
                ({deletePointTarget?.x}, {deletePointTarget?.y})
              </span>{" "}
              in this session. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePointTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeletePoint}
              disabled={deletePoint.isPending}
            >
              {deletePoint.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: delete a single fingerprint sample */}
      <Dialog
        open={!!deleteSingleFpTarget}
        onOpenChange={(open) => !open && setDeleteSingleFpTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this sample?</DialogTitle>
            <DialogDescription>
              Delete sample{" "}
              <span className="font-mono">
                #{(deleteSingleFpTarget?.sampleIndex ?? 0) + 1}
              </span>{" "}
              at{" "}
              <span className="font-mono">
                ({deleteSingleFpTarget?.x}, {deleteSingleFpTarget?.y})
              </span>
              . The other samples at this point will remain. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteSingleFpTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteSingleFp}
              disabled={deleteSingleFp.isPending}
            >
              {deleteSingleFp.isPending ? "Deleting..." : "Delete Sample"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
