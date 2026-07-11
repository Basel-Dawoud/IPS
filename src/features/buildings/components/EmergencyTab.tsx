import { useEffect, useState, useMemo, useCallback } from "react";
import {
  useEmergencyState,
  useTriggerEmergency,
  useClearEmergency,
} from "../hooks";
import { usePois } from "@/features/pois/hooks";
import { useFloorsByBuilding } from "@/features/floors/hooks";
import { FloorMapView } from "@/features/floors/components/FloorMapView";
import type { BlockedMapZone } from "@/features/floors/components/FloorMapView";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BadgeAlert, Pencil, MapPin, Trash2, ShieldAlert, Info } from "lucide-react";
import { toast } from "sonner";
import type { BlockedZone } from "../api";

interface EmergencyTabProps {
  buildingId: string;
}

type MapMode = "gather" | "draw";

/** Convert a saved BlockedZone (from API) to a BlockedMapZone (for FloorMapView). */
function toMapZone(zone: BlockedZone, idx: number): BlockedMapZone {
  return { id: `zone-${idx}`, x: zone.x, y: zone.y, w: zone.w, h: zone.h };
}

export function EmergencyTab({ buildingId }: EmergencyTabProps) {
  const { data: emergency, isLoading: emergencyLoading } = useEmergencyState(buildingId);
  const { data: pois } = usePois(buildingId);
  const { data: floors } = useFloorsByBuilding(buildingId);

  const triggerEmergency = useTriggerEmergency();
  const clearEmergency = useClearEmergency();

  const [gatheringPointId, setGatheringPointId] = useState("none");
  const [blockedPoiIds, setBlockedPoiIds] = useState<string[]>([]);
  const [blockedZones, setBlockedZones] = useState<BlockedZone[]>([]);
  const [emergencyMessage, setEmergencyMessage] = useState(
    "Emergency alert! Please evacuate immediately."
  );
  const [selectedMapFloorId, setSelectedMapFloorId] = useState<string>("");
  const [mapMode, setMapMode] = useState<MapMode>("gather");

  useEffect(() => {
    if (emergency) {
      setEmergencyMessage(emergency.message || "Emergency alert! Please evacuate immediately.");
      setGatheringPointId(emergency.gatheringPointId || "none");
      setBlockedPoiIds(emergency.blockedPoiIds || []);
      setBlockedZones((emergency.blockedZones as BlockedZone[]) || []);
    }
  }, [emergency]);

  useEffect(() => {
    if (floors && floors.length > 0 && !selectedMapFloorId) {
      const gatheringPoi = pois?.find((p) => p.id === gatheringPointId);
      if (gatheringPoi) {
        const floor = floors.find((f) => f.level === gatheringPoi.floorLevel);
        if (floor) {
          setSelectedMapFloorId(floor.id);
          return;
        }
      }
      setSelectedMapFloorId(floors[0].id);
    }
  }, [floors, pois, gatheringPointId, selectedMapFloorId]);

  const selectedMapFloor = useMemo(() => {
    return floors?.find((f) => f.id === selectedMapFloorId) ?? null;
  }, [floors, selectedMapFloorId]);

  const mapPois = useMemo(() => {
    if (!selectedMapFloor || !pois) return [];
    return pois
      .filter((p) => p.floorLevel === selectedMapFloor.level)
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
  }, [selectedMapFloor, pois]);

  /** Blocked zones for the currently selected floor, converted for FloorMapView */
  const currentFloorBlockedMapZones = useMemo((): BlockedMapZone[] => {
    if (!selectedMapFloor) return [];
    return blockedZones
      .filter((z) => z.floorLevel === selectedMapFloor.level)
      .map((z, i) => toMapZone(z, i));
  }, [blockedZones, selectedMapFloor]);

  /** Handle a newly drawn rectangle in draw mode */
  const handleDrawRect = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      if (!selectedMapFloor) return;
      const newZone: BlockedZone = {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        floorLevel: selectedMapFloor.level,
      };
      setBlockedZones((prev) => [...prev, newZone]);
      toast.success(`Blocked zone added on Floor ${selectedMapFloor.level}.`);
    },
    [selectedMapFloor]
  );

  /** Remove a zone by global index */
  const removeZone = (idx: number) => {
    setBlockedZones((prev) => prev.filter((_, i) => i !== idx));
  };

  /** Count of zones per floor level */
  const zonesByFloor = useMemo(() => {
    const map = new Map<number, number>();
    for (const z of blockedZones) {
      map.set(z.floorLevel, (map.get(z.floorLevel) ?? 0) + 1);
    }
    return map;
  }, [blockedZones]);

  return (
    <div className="p-6 space-y-6 outline-none">
      {emergencyLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {emergency?.isActive ? (
            <div className="border border-red-600 bg-red-600 text-white rounded-lg p-5 space-y-4 shadow-lg">
              <div className="flex items-center gap-2 font-bold text-lg animate-pulse text-white">
                <BadgeAlert className="size-6 shrink-0 text-white" />
                <span>EMERGENCY ALERT ACTIVE!</span>
              </div>
              <p className="text-sm font-medium text-white/95">
                An emergency alert is currently broadcasted for this venue. All mobile app users
                connected to this building are forced into evacuation mode.
              </p>
              <div className="border-t border-red-500 pt-4 space-y-2 text-sm text-white/90">
                <div>
                  <strong>Alert Message:</strong>{" "}
                  <span className="text-white font-semibold">
                    {emergency.message || "Please evacuate."}
                  </span>
                </div>
                <div>
                  <strong>Gathering Point:</strong>{" "}
                  <span className="text-white font-semibold">
                    {pois?.find((p) => p.id === emergency.gatheringPointId)?.name ||
                      "Nearest Fire Exit"}
                  </span>
                </div>
                <div>
                  <strong>Blocked Stairs/Elevators:</strong>{" "}
                  <span className="text-white font-semibold text-wrap">
                    {emergency.blockedPoiIds.length > 0
                      ? emergency.blockedPoiIds
                          .map((id) => pois?.find((p) => p.id === id)?.name)
                          .filter(Boolean)
                          .join(", ")
                      : "None (All Accessible)"}
                  </span>
                </div>
                <div>
                  <strong>Inaccessible Zones:</strong>{" "}
                  <span className="text-white font-semibold">
                    {(emergency.blockedZones as BlockedZone[])?.length > 0
                      ? (() => {
                          const byFloor = new Map<number, number>();
                          for (const z of emergency.blockedZones as BlockedZone[]) {
                            byFloor.set(z.floorLevel, (byFloor.get(z.floorLevel) ?? 0) + 1);
                          }
                          return Array.from(byFloor.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([lvl, cnt]) => `Floor ${lvl}: ${cnt} zone${cnt > 1 ? "s" : ""}`)
                            .join(" · ");
                        })()
                      : "None"}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="bg-white text-red-600 hover:bg-red-50 hover:text-red-700 border-white font-bold"
                onClick={() => {
                  clearEmergency.mutate(buildingId, {
                    onSuccess: () => {
                      toast.success("Emergency alert cleared successfully");
                    },
                    onError: () => {
                      toast.error("Failed to clear emergency alert");
                    },
                  });
                }}
                disabled={clearEmergency.isPending}
              >
                {clearEmergency.isPending ? "Clearing..." : "Clear Emergency Alert"}
              </Button>
            </div>
          ) : (
            <div className="border border-border rounded-lg p-5 space-y-6">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Trigger Evacuation / Emergency Alert</h3>
                <p className="text-xs text-muted-foreground">
                  Broadcast a real-time emergency alert. This will immediately display an alarm on all active
                  shopper apps, set gathering points, and reroute around blocked staircases/elevators.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="em-message">Emergency Broadcast Message</Label>
                    <Input
                      id="em-message"
                      value={emergencyMessage}
                      onChange={(e) => setEmergencyMessage(e.target.value)}
                      placeholder="e.g. Fire detected on 3rd floor! Evacuate immediately."
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="em-gathering">Designated Gathering Point POI</Label>
                    <Select
                      value={gatheringPointId}
                      onValueChange={(val) => setGatheringPointId(val ?? "none")}
                    >
                      <SelectTrigger id="em-gathering">
                        <SelectValue placeholder="Select Gathering Point (Default: Nearest Exit)">
                          {gatheringPointId === "none" || !gatheringPointId
                            ? "Nearest Emergency Exit (Automatic)"
                            : pois?.find((p) => p.id === gatheringPointId)
                            ? `${
                                pois.find((p) => p.id === gatheringPointId)?.isGatheringPoint ||
                                pois.find((p) => p.id === gatheringPointId)?.isEmergencyExit
                                  ? "🚨 "
                                  : ""
                              }${pois.find((p) => p.id === gatheringPointId)?.name} (Floor ${
                                pois.find((p) => p.id === gatheringPointId)?.floorLevel
                              })`
                            : gatheringPointId}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nearest Emergency Exit (Automatic)</SelectItem>
                        {pois
                          ?.filter(
                            (p) =>
                              p.isGatheringPoint ||
                              p.isEmergencyExit ||
                              p.type === "ROOM" ||
                              p.type === "OTHER"
                          )
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.isGatheringPoint || p.isEmergencyExit ? "🚨 " : ""}
                              {p.name} (Floor {p.floorLevel})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Select Inaccessible/Blocked Stairs &amp; Elevators</Label>
                  <p className="text-xs text-muted-foreground">
                    Check any stairs/elevators that are blocked or unsafe. The navigation engine will
                    route users around them.
                  </p>
                  <div className="border rounded-lg p-3 max-h-[160px] overflow-y-auto space-y-2 bg-muted/20">
                    {pois?.filter((p) => p.type === "STAIRS" || p.type === "ELEVATOR").length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No stairs or elevators POIs defined in this building.
                      </p>
                    ) : (
                      pois
                        ?.filter((p) => p.type === "STAIRS" || p.type === "ELEVATOR")
                        .map((p) => {
                          const checked = blockedPoiIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setBlockedPoiIds((prev) =>
                                    checked ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                                  );
                                }}
                                className="rounded border-input text-destructive focus:ring-ring h-3.5 w-3.5 bg-card"
                              />
                              <span className="font-semibold text-destructive">{p.type}</span>:{" "}
                              {p.name} (Floor {p.floorLevel})
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Interactive Map Section ─── */}
              <div className="border-t pt-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Interactive Map</h4>
                    <p className="text-xs text-muted-foreground">
                      Switch between <strong>Gathering Point</strong> (click a POI to set it) and{" "}
                      <strong>Draw Zone</strong> (drag to mark inaccessible areas) modes.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Mode toggle */}
                    <div className="flex rounded-md border overflow-hidden text-xs">
                      <button
                        type="button"
                        className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                          mapMode === "gather"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card text-muted-foreground hover:bg-muted"
                        }`}
                        onClick={() => setMapMode("gather")}
                      >
                        <MapPin className="size-3.5" />
                        Gathering Point
                      </button>
                      <button
                        type="button"
                        className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors border-l ${
                          mapMode === "draw"
                            ? "bg-red-600 text-white"
                            : "bg-card text-muted-foreground hover:bg-muted"
                        }`}
                        onClick={() => setMapMode("draw")}
                      >
                        <Pencil className="size-3.5" />
                        Draw Zone
                      </button>
                    </div>

                    {/* Floor selector */}
                    {floors && floors.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="map-floor-select" className="text-xs shrink-0 font-medium">
                          Floor:
                        </Label>
                        <Select
                          value={selectedMapFloorId}
                          onValueChange={(val) => setSelectedMapFloorId(val ?? "")}
                        >
                          <SelectTrigger id="map-floor-select" className="w-[150px] h-8 text-xs bg-card">
                            <SelectValue placeholder="Select Floor">
                              {selectedMapFloor
                                ? `Level ${selectedMapFloor.level} (${selectedMapFloor.name})`
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {floors.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                Level {f.level} ({f.name})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mode hint banner */}
                {mapMode === "draw" && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300">
                    <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Draw Mode active.</strong> Drag on the map to draw a blocked/inaccessible
                      zone. Zones are shown as red hatched overlays. Switch to{" "}
                      <strong>Gathering Point</strong> mode to click a POI.
                    </span>
                  </div>
                )}
                {mapMode === "gather" && (
                  <div className="flex items-start gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
                    <Info className="size-4 shrink-0 mt-0.5" />
                    <span>
                      Click any POI on the map to set it as the{" "}
                      <strong>designated gathering point</strong>. Switch to{" "}
                      <strong>Draw Zone</strong> mode to mark inaccessible areas.
                    </span>
                  </div>
                )}

                {selectedMapFloor ? (
                  <div className="border rounded-lg overflow-hidden bg-muted/10 p-2">
                    <FloorMapView
                      vectorMap={selectedMapFloor.vectorMap}
                      mapUrl={selectedMapFloor.mapUrl}
                      widthMeters={selectedMapFloor.widthMeters}
                      heightMeters={selectedMapFloor.heightMeters}
                      pois={mapPois}
                      blockedZones={currentFloorBlockedMapZones}
                      highlightPoiId={gatheringPointId === "none" ? null : gatheringPointId}
                      onSelectPoi={
                        mapMode === "gather"
                          ? (poiId) => {
                              setGatheringPointId(poiId);
                              toast.success(
                                `Selected "${pois?.find((p) => p.id === poiId)?.name}" as gathering point.`
                              );
                            }
                          : undefined
                      }
                      onDrawRect={mapMode === "draw" ? handleDrawRect : undefined}
                      className="max-h-[420px] w-full mx-auto"
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg bg-muted/5">
                    No floors or maps available for this building.
                  </div>
                )}

                {/* ─── Blocked Zones List ─── */}
                {blockedZones.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-semibold">
                          Inaccessible Zones ({blockedZones.length})
                        </h5>
                        {Array.from(zonesByFloor.entries())
                          .sort(([a], [b]) => a - b)
                          .map(([lvl, cnt]) => (
                            <Badge
                              key={lvl}
                              variant="outline"
                              className="text-[10px] h-5 px-1.5 border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400"
                            >
                              Floor {lvl}: {cnt}
                            </Badge>
                          ))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setBlockedZones([])}
                      >
                        Clear all
                      </Button>
                    </div>
                    <div className="border rounded-lg divide-y divide-border max-h-[180px] overflow-y-auto bg-muted/10">
                      {blockedZones.map((z, idx) => {
                        const floorName = floors?.find((f) => f.level === z.floorLevel)?.name;
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between px-3 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/70 flex-shrink-0" />
                              <span className="font-medium text-muted-foreground">
                                Floor {z.floorLevel}
                                {floorName ? ` (${floorName})` : ""} —{" "}
                                <span className="text-foreground">
                                  {z.w.toFixed(1)}m × {z.h.toFixed(1)}m at ({z.x.toFixed(1)},{" "}
                                  {z.y.toFixed(1)})
                                </span>
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => removeZone(idx)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <Button
                variant="destructive"
                className="w-full sm:w-auto font-bold uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 animate-pulse"
                onClick={() => {
                  triggerEmergency.mutate(
                    {
                      buildingId,
                      input: {
                        gatheringPointId:
                          gatheringPointId === "none" || !gatheringPointId ? null : gatheringPointId,
                        blockedPoiIds,
                        blockedZones,
                        message: emergencyMessage,
                      },
                    },
                    {
                      onSuccess: () => {
                        toast.success("EMERGENCY ALERT TRIGGERED SUCCESSFULLY");
                      },
                      onError: () => {
                        toast.error("Failed to trigger emergency alert");
                      },
                    }
                  );
                }}
                disabled={triggerEmergency.isPending}
              >
                {triggerEmergency.isPending ? "Triggering..." : "🚨 ACTIVATE EMERGENCY ALERT"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
