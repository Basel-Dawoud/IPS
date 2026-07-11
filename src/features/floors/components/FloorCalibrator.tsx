import { useEffect, useRef, useState } from "react";
import { resolveAssetUrl } from "@/lib/assets";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, ImageOff } from "lucide-react";

interface FloorCalibratorProps {
  imageUrl: string | null;
  imageWidthPx: number | null;
  imageHeightPx: number | null;
  widthMeters: string;
  heightMeters: string;
  rotationDeg: number;
  originXm: string;
  originYm: string;
  uploading: boolean;
  onFileSelected: (file: File) => void;
  onWidthMeters: (v: string) => void;
  onHeightMeters: (v: string) => void;
  onRotationDeg: (v: number) => void;
  onOriginXm: (v: string) => void;
  onOriginYm: (v: string) => void;
}

const ROTATIONS = [0, 90, 180, 270];

export function FloorCalibrator({
  imageUrl,
  imageWidthPx,
  imageHeightPx,
  widthMeters,
  heightMeters,
  rotationDeg,
  originXm,
  originYm,
  uploading,
  onFileSelected,
  onWidthMeters,
  onHeightMeters,
  onRotationDeg,
  onOriginXm,
  onOriginYm,
}: FloorCalibratorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);
  useEffect(() => setImgError(false), [imageUrl]);

  const wM = Number(widthMeters);
  const mpp =
    imageWidthPx && widthMeters !== "" && !Number.isNaN(wM) && wM > 0
      ? wM / imageWidthPx
      : null;

  return (
    <div className="grid gap-4">
      {/* Upload */}
      <div className="grid gap-2">
        <Label>Floor plan (image or .npy grid)</Label>
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.npy,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelected(f);
            e.target.value = ""; // allow re-uploading the same file
          }}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-4" data-icon="inline-start" />
            {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image / .npy"}
          </Button>
          {imageWidthPx && imageHeightPx ? (
            <span className="text-xs text-muted-foreground">
              {imageWidthPx} × {imageHeightPx} px
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No image yet</span>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex max-h-48 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {imageUrl && !imgError ? (
          <img
            src={resolveAssetUrl(imageUrl)}
            alt="Floor plan"
            className="max-h-48 w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
            <ImageOff className="size-5" />
            <span className="text-xs">
              {imgError ? "Couldn't load the plan image" : "Upload a plan to calibrate"}
            </span>
          </div>
        )}
      </div>

      {/* Real-world extent */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="floor-width-m">Real width (m)</Label>
          <Input
            id="floor-width-m"
            type="number"
            step="0.001"
            value={widthMeters}
            onChange={(e) => onWidthMeters(e.target.value)}
            placeholder="e.g. 93"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="floor-height-m">Real height (m)</Label>
          <Input
            id="floor-height-m"
            type="number"
            step="0.001"
            value={heightMeters}
            onChange={(e) => onHeightMeters(e.target.value)}
            placeholder="e.g. 17.352"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {mpp != null
          ? `Scale: ${mpp.toFixed(4)} m/pixel (real width ÷ ${imageWidthPx} px).`
          : "Enter the real width to compute the meters-per-pixel scale."}
      </p>

      {/* Rotation + origin */}
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="floor-rotation">Rotation</Label>
          <Select
            value={String(rotationDeg)}
            onValueChange={(v) => onRotationDeg(Number(v ?? "0"))}
          >
            <SelectTrigger id="floor-rotation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROTATIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r}°
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="floor-originx">Origin X (m)</Label>
          <Input
            id="floor-originx"
            type="number"
            step="0.01"
            value={originXm}
            onChange={(e) => onOriginXm(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="floor-originy">Origin Y (m)</Label>
          <Input
            id="floor-originy"
            type="number"
            step="0.01"
            value={originYm}
            onChange={(e) => onOriginYm(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}
