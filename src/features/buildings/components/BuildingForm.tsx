import { useEffect, useState, useRef, useMemo } from "react";
import type { Polygon } from "geojson";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useBuilding } from "../hooks";
import type { Building, CreateBuildingInput } from "../types";
import { ZoneEditorMap } from "./ZoneEditorMap";
import { PinEditorMap, type PinLatLng } from "./PinEditorMap";
import { resolveAssetUrl } from "@/lib/assets";
import { ImageOff } from "lucide-react";

export interface BuildingFormSubmit {
  text: CreateBuildingInput;
  /**
   * The polygon to persist after the building create/update succeeds.
   *  - `Polygon` → call `PUT /admin/buildings/:id/zone`
   *  - `null`    → call `DELETE /admin/buildings/:id/zone` (only when the
   *                building previously had a zone — the parent decides).
   *  - `undefined` → no change (don't touch the zone endpoint).
   */
  zone: Polygon | null | undefined;
  imageFile?: File;
}

interface BuildingFormProps {
  building?: Building | null;
  onSubmit: (data: BuildingFormSubmit) => void;
  submitting?: boolean;
  onCancel?: () => void;
}

export function BuildingForm({
  building,
  onSubmit,
  submitting,
  onCancel,
}: BuildingFormProps) {
  // For the edit flow we need the *full* building (including zone GeoJSON);
  // the list-fetch returns the slim shape. Skipped on create.
  const { data: detailed } = useBuilding(building?.id ?? "");
  const editTarget = detailed ?? building ?? null;

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [zone, setZone] = useState<Polygon | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Track whether the user touched the polygon at all in this session.
  // If untouched on save we send `undefined` so the zone endpoint isn't called.
  const [zoneTouched, setZoneTouched] = useState(false);

  const [pin, setPin] = useState<PinLatLng | null>(null);
  const [pinTouched, setPinTouched] = useState(false);

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
    if (editTarget) {
      setCode(editTarget.code);
      setName(editTarget.name);
      setDescription(editTarget.description || "");
      setZone(editTarget.zone ?? null);
      setImageUrl(editTarget.imageUrl ?? null);
      setImageFile(null);
      setPin(
        editTarget.pinLat != null && editTarget.pinLng != null
          ? { lat: editTarget.pinLat, lng: editTarget.pinLng }
          : null
      );
    } else {
      setCode("");
      setName("");
      setDescription("");
      setZone(null);
      setImageUrl(null);
      setImageFile(null);
      setPin(null);
    }
    setZoneTouched(false);
    setPinTouched(false);
  }, [editTarget]);

  const handleZoneChange = (next: Polygon | null) => {
    setZone(next);
    setZoneTouched(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      text: {
        code,
        name,
        description: description || undefined,
        pinLat: pin?.lat ?? null,
        pinLng: pin?.lng ?? null,
      },
      zone: zoneTouched ? zone : undefined,
      imageFile: imageFile || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{editTarget ? "Edit Building" : "Add Building"}</h2>
        <p className="text-sm text-muted-foreground">
          {editTarget
            ? "Update the building details and outdoor zone polygon."
            : "Fill in the details and (optionally) draw the outdoor zone on the map."}
        </p>
      </div>

      <div className="grid gap-4 py-4 md:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. BLD-01"
            required
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Building"
            required
          />
        </div>
        <div className="grid gap-2 md:col-span-3">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div className="grid gap-2 md:col-span-3">
          <Label>Building Image / Icon</Label>
          <div className="flex items-center gap-3">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {imagePreview ? (
                <img src={imagePreview} alt="Building preview" className="size-full object-cover" />
              ) : (
                <ImageOff className="size-6 text-muted-foreground" />
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
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
              onClick={() => imageInputRef.current?.click()}
            >
              {imagePreview ? "Replace image" : "Upload image"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This image will be displayed on the mobile app home screen proximity cards and maps.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 pb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Outdoor zone</Label>
            <p className="text-xs text-muted-foreground">
              Search for the location, hit <span className="font-medium">Draw zone</span>, then click
              to add corners (double-click to finish). Use <span className="font-medium">Edit corners</span> to adjust.
            </p>
          </div>
          <ZoneEditorMap
            value={zone}
            onChange={handleZoneChange}
            className="h-[320px] w-full overflow-hidden rounded-md border"
          />
          {zoneTouched && zone === null && editTarget?.zone ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Saving will remove this building's existing zone.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Exact Coordinates Pin</Label>
            <p className="text-xs text-muted-foreground">
              Search for the location and click on the map to set the primary building pin.
            </p>
          </div>
          <PinEditorMap
            value={pin}
            onChange={(next) => {
              setPin(next);
              setPinTouched(true);
            }}
            className="h-[320px] w-full overflow-hidden rounded-md border"
          />
          {pin && (
            <Button
              type="button"
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

      <div className="flex justify-end gap-3 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {editTarget ? "Save Changes" : "Create Building"}
        </Button>
      </div>
    </form>
  );
}
