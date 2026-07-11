import { useEffect, useState, useRef, useMemo } from "react";
import type { Polygon } from "geojson";
import {
  useUpdateBuilding,
  useUpdateBuildingZone,
  useClearBuildingZone,
  useUploadBuildingImage,
} from "../hooks";
import { ZoneEditorMap } from "./ZoneEditorMap";
import { PinEditorMap, type PinLatLng } from "./PinEditorMap";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageOff } from "lucide-react";
import { toast } from "sonner";
import { resolveAssetUrl } from "@/lib/assets";
import type { Building } from "../types";

interface OverviewTabProps {
  buildingId: string;
  building: Building;
}

export function OverviewTab({ buildingId, building }: OverviewTabProps) {
  const updateMutation = useUpdateBuilding();
  const zoneUpdate = useUpdateBuildingZone();
  const zoneClear = useClearBuildingZone();
  const uploadImageMutation = useUploadBuildingImage();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [zone, setZone] = useState<Polygon | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [zoneTouched, setZoneTouched] = useState(false);
  const [pin, setPin] = useState<PinLatLng | null>(null);
  const [pinTouched, setPinTouched] = useState(false);
  const [northOffset, setNorthOffset] = useState("");
  const [northOffsetTouched, setNorthOffsetTouched] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : resolveAssetUrl(imageUrl) ?? null),
    [imageFile, imageUrl]
  );

  useEffect(() => {
    return () => {
      if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imageFile, imagePreview]);

  useEffect(() => {
    if (building) {
      setCode(building.code);
      setName(building.name);
      setDescription(building.description || "");
      setZone(building.zone ?? null);
      setImageUrl(building.imageUrl ?? null);
      setImageFile(null);
      setZoneTouched(false);
      setPin(
        building.pinLat != null && building.pinLng != null
          ? { lat: building.pinLat, lng: building.pinLng }
          : null
      );
      setPinTouched(false);
      setNorthOffset(building.northOffsetDeg != null ? String(building.northOffsetDeg) : "");
      setNorthOffsetTouched(false);
    }
  }, [building]);

  const saveInfo = async () => {
    try {
      await updateMutation.mutateAsync({
        id: buildingId,
        input: { code, name, description: description || undefined },
      });
      if (imageFile) {
        await uploadImageMutation.mutateAsync({ id: buildingId, file: imageFile });
        setImageFile(null);
      }
      toast.success("Building updated");
    } catch {
      toast.error("Failed to update building");
    }
  };

  const saveZone = async () => {
    try {
      if (zone) await zoneUpdate.mutateAsync({ id: buildingId, zone });
      else await zoneClear.mutateAsync(buildingId);
      toast.success("Zone saved");
      setZoneTouched(false);
    } catch {
      toast.error("Failed to save zone");
    }
  };

  const savePin = async () => {
    try {
      await updateMutation.mutateAsync({
        id: buildingId,
        input: { pinLat: pin?.lat ?? null, pinLng: pin?.lng ?? null },
      });
      toast.success("Map pin saved");
      setPinTouched(false);
    } catch {
      toast.error("Failed to save map pin");
    }
  };

  const saveNorthOffset = async () => {
    const trimmed = northOffset.trim();
    let value: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || n > 360) {
        toast.error("North offset must be a number between 0 and 360");
        return;
      }
      value = n;
    }
    try {
      await updateMutation.mutateAsync({
        id: buildingId,
        input: { northOffsetDeg: value },
      });
      toast.success("North offset saved");
      setNorthOffsetTouched(false);
    } catch {
      toast.error("Failed to save north offset");
    }
  };

  return (
    <div className="p-6 space-y-6 outline-none">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="det-code">Venue Code</Label>
          <Input id="det-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="det-name">Venue Name</Label>
          <Input id="det-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2 md:col-span-3">
          <Label htmlFor="det-desc">Description</Label>
          <Input
            id="det-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div className="grid gap-2 md:col-span-3">
          <Label>Icon / Cover Image</Label>
          <div className="flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="size-full object-cover" />
              ) : (
                <ImageOff className="size-6 text-muted-foreground" />
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImageFile(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
            >
              {imagePreview ? "Change Cover" : "Upload Cover"}
            </Button>
          </div>
        </div>
      </div>
      <Button
        onClick={saveInfo}
        size="sm"
        disabled={updateMutation.isPending || uploadImageMutation.isPending}
      >
        {updateMutation.isPending || uploadImageMutation.isPending ? "Saving..." : "Save Venue Details"}
      </Button>

      <div className="border-t pt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Outdoor GPS Zone Boundary</h3>
            <Badge variant={zone ? "default" : "secondary"} className="text-[10px]">
              {zone ? "Configured" : "Not Set"}
            </Badge>
          </div>
          <ZoneEditorMap
            value={zone}
            onChange={(next) => {
              setZone(next);
              setZoneTouched(true);
            }}
            className="h-[240px] w-full overflow-hidden rounded-lg border bg-muted"
          />
          <Button
            onClick={saveZone}
            disabled={!zoneTouched || zoneUpdate.isPending || zoneClear.isPending}
            size="sm"
            variant="outline"
          >
            {zoneUpdate.isPending || zoneClear.isPending ? "Saving..." : "Save Zone Bounds"}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Exact Coordinates Pin</h3>
            <Badge variant={pin ? "default" : "secondary"} className="text-[10px]">
              {pin ? "Configured" : "Not Set"}
            </Badge>
          </div>
          <PinEditorMap
            value={pin}
            onChange={(next) => {
              setPin(next);
              setPinTouched(true);
            }}
            className="h-[240px] w-full overflow-hidden rounded-lg border bg-muted"
          />
          <div className="flex items-center justify-between">
            <Button
              onClick={savePin}
              disabled={!pinTouched || updateMutation.isPending}
              size="sm"
              variant="outline"
            >
              {updateMutation.isPending ? "Saving..." : "Save Coordinates"}
            </Button>
            {pin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 px-2 text-destructive"
                onClick={() => {
                  setPin(null);
                  setPinTouched(true);
                }}
              >
                Reset Pin
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Map North Offset</h3>
            <Badge
              variant={northOffset.trim() !== "" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {northOffset.trim() !== "" ? "Configured" : "Not Set"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Compass bearing (0–360°) that the floor map's <strong>up</strong> (−y) direction points
            toward in the real world. Drives the user direction cone in the app. The +x / +y axes are
            fixed to the plan; the floor's <strong>Rotation</strong> only changes how the app
            displays the map, <strong>not</strong> what +x/+y mean. To calibrate: facing +x (right), read Compass, enter Compass - 90.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Input
                id="det-north-offset"
                type="number"
                min={0}
                max={360}
                step={1}
                placeholder="e.g. 135"
                className="max-w-[140px]"
                value={northOffset}
                onChange={(e) => {
                  setNorthOffset(e.target.value);
                  setNorthOffsetTouched(true);
                }}
              />
              <span className="text-sm text-muted-foreground">degrees</span>
            </div>
            {(() => {
              const raw = northOffset.trim();
              const n = raw === "" ? NaN : Number(raw);
              const valid = Number.isFinite(n) && n >= 0 && n <= 360;
              const xBearing = valid ? Math.round((n + 90) % 360) : null;
              return (
                <div className="flex items-center gap-3">
                  <svg width={96} height={96} viewBox="0 0 96 96">
                    <rect
                      x={24}
                      y={24}
                      width={48}
                      height={48}
                      rx={4}
                      fill="var(--muted)"
                      stroke="var(--border)"
                    />
                    <text
                      x={48}
                      y={20}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--muted-foreground)"
                    >
                      UP (−y)
                    </text>
                    <line x1={48} y1={48} x2={68} y2={48} stroke="#06b6d4" strokeWidth={2} />
                    <polygon points="68,48 62,45 62,51" fill="#06b6d4" />
                    <text x={70} y={51} fontSize={9} fill="#06b6d4">
                      x
                    </text>
                    {valid ? (
                      <g transform={`rotate(${-n} 48 48)`}>
                        <line x1={48} y1={48} x2={48} y2={22} stroke="#f87171" strokeWidth={2} />
                        <polygon points="48,20 45,27 51,27" fill="#f87171" />
                        <text
                          x={48}
                          y={16}
                          textAnchor="middle"
                          fontSize={9}
                          fontWeight={700}
                          fill="#f87171"
                        >
                          N
                        </text>
                      </g>
                    ) : null}
                  </svg>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {valid ? (
                      <>
                        <span className="text-red-400 font-medium">Red N</span> = real north on the map.
                        <br />
                        +x points at compass <strong>{xBearing}°</strong>.
                      </>
                    ) : (
                      <span>Enter an offset to preview where north falls.</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={saveNorthOffset}
              disabled={!northOffsetTouched || updateMutation.isPending}
              size="sm"
              variant="outline"
            >
              {updateMutation.isPending ? "Saving..." : "Save North Offset"}
            </Button>
            {northOffset.trim() !== "" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 px-2 text-destructive"
                onClick={() => {
                  setNorthOffset("");
                  setNorthOffsetTouched(true);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
