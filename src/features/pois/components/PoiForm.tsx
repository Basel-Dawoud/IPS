import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, MapPin, Square } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { FloorMapView } from "@/features/floors/components/FloorMapView";
import { resolveAssetUrl } from "@/lib/assets";
import type { Floor } from "@/features/floors/types";
import { POI_TYPES } from "../types";
import type { CreatePoiInput, Poi, PoiType } from "../types";
import { computeAutoZone, type PoiZone } from "../poi-zone";
import ReactSelect from "react-select";
import { useCategoryTree } from "@/features/categories/hooks";

interface PoiFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poi?: Poi | null;
  buildingId: string;
  floorLevel: number;
  floor: Floor | null | undefined;
  pois: Poi[];
  /** Pre-fill x/y for a NEW poi (e.g. from a click on the floor map). */
  initialPoint?: { x: number; y: number } | null;
  /** `iconFile` (if any) is uploaded by the parent once the POI has an id. */
  onSubmit: (data: CreatePoiInput, iconFile?: File | null) => void;
}

const toCsv = (arr: string[]) => arr.join(", ");
const fromCsv = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

// Shared react-select theming so the multi-selects match the shadcn inputs.
const reactSelectStyles = {
  control: (base: any) => ({
    ...base,
    backgroundColor: "transparent",
    borderColor: "var(--color-border)",
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    minHeight: "2.25rem",
  }),
  menu: (base: any) => ({
    ...base,
    backgroundColor: "var(--color-popover)",
    color: "var(--color-popover-foreground)",
    zIndex: 50,
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isFocused ? "rgba(0,0,0,0.06)" : "transparent",
    color: "inherit",
    cursor: "pointer",
  }),
  multiValue: (base: any) => ({ ...base, backgroundColor: "var(--color-muted)" }),
  multiValueLabel: (base: any) => ({ ...base, color: "inherit" }),
  input: (base: any) => ({ ...base, color: "inherit" }),
};

export function PoiForm({
  open,
  onOpenChange,
  poi,
  buildingId,
  floorLevel,
  floor,
  pois,
  initialPoint,
  onSubmit,
}: PoiFormProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const { data: categoryTree, isLoading: categoriesLoading } = useCategoryTree();

  // Selected taxonomy ids, split by level.
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);

  // Options: parent categories, and sub-categories filtered to the chosen parents.
  const categoryOptions = useMemo(
    () => (categoryTree ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categoryTree],
  );
  const subOptions = useMemo(() => {
    const chosen = new Set(selectedCategoryIds);
    return (categoryTree ?? [])
      .filter((c) => chosen.has(c.id))
      .flatMap((c) =>
        c.children.map((s) => ({ value: s.id, label: s.name, keywords: s.keywords })),
      );
  }, [categoryTree, selectedCategoryIds]);

  // Suggested keywords = union across the selected sub-categories.
  const suggestedKeywords = useMemo(() => {
    const chosen = new Set(selectedSubIds);
    const set = new Set<string>();
    for (const c of categoryTree ?? [])
      for (const s of c.children)
        if (chosen.has(s.id)) for (const k of s.keywords) set.add(k);
    return [...set];
  }, [categoryTree, selectedSubIds]);

  const [type, setType] = useState<PoiType>("ROOM");
  const [description, setDescription] = useState("");
  const [aliases, setAliases] = useState("");
  const [productKeywords, setProductKeywords] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [active, setActive] = useState(true);
  const [isEmergencyExit, setIsEmergencyExit] = useState(false);
  const [isGatheringPoint, setIsGatheringPoint] = useState(false);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  // Admin-drawn zone (null = no saved zone → the app auto-derives one).
  const [zone, setZone] = useState<PoiZone | null>(null);
  // Map edit mode: "pin" = clicking places the pin, "area" = dragging draws the area zone
  const [mapEditMode, setMapEditMode] = useState<"pin" | "area">("pin");

  // String states for manual zone inputs to support smooth typing
  const [zoneXStr, setZoneXStr] = useState("");
  const [zoneYStr, setZoneYStr] = useState("");
  const [zoneWStr, setZoneWStr] = useState("");
  const [zoneHStr, setZoneHStr] = useState("");

  useEffect(() => {
    if (zone) {
      setZoneXStr(String(zone.x));
      setZoneYStr(String(zone.y));
      setZoneWStr(String(zone.w));
      setZoneHStr(String(zone.h));
    } else {
      setZoneXStr("");
      setZoneYStr("");
      setZoneWStr("");
      setZoneHStr("");
    }
  }, [zone]);

  const iconInputRef = useRef<HTMLInputElement>(null);

  // Preview the staged file (new pick) or the already-saved icon.
  const iconPreview = useMemo(
    () => (iconFile ? URL.createObjectURL(iconFile) : resolveAssetUrl(iconUrl) ?? null),
    [iconFile, iconUrl],
  );
  useEffect(() => {
    return () => {
      if (iconFile && iconPreview) URL.revokeObjectURL(iconPreview);
    };
  }, [iconFile, iconPreview]);

  useEffect(() => {
    if (poi) {
      setName(poi.name);
      setCode(poi.code ?? "");
      setType(poi.type);
      {
        const cats = poi.categories ?? [];
        setSelectedCategoryIds(cats.filter((c) => c.parentId === null).map((c) => c.id));
        setSelectedSubIds(cats.filter((c) => c.parentId !== null).map((c) => c.id));
      }
      setDescription(poi.description ?? "");
      setAliases(toCsv(poi.aliases ?? []));
      setProductKeywords(toCsv(poi.productKeywords ?? []));
      setX(String(poi.x));
      setY(String(poi.y));
      setActive(poi.active);
      setIsEmergencyExit(poi.isEmergencyExit ?? false);
      setIsGatheringPoint(poi.isGatheringPoint ?? false);
      setIconUrl(poi.iconUrl ?? null);
      setIconFile(null);
      setZone(
        poi.areaX != null && poi.areaY != null && poi.areaW != null && poi.areaH != null
          ? { x: poi.areaX, y: poi.areaY, w: poi.areaW, h: poi.areaH }
          : null,
      );
      setMapEditMode("pin");
    } else {
      setName("");
      setCode("");
      setType("ROOM");
      setSelectedCategoryIds([]);
      setSelectedSubIds([]);
      setDescription("");
      setAliases("");
      setProductKeywords("");
      const initX = initialPoint ? initialPoint.x : null;
      const initY = initialPoint ? initialPoint.y : null;
      setX(initX != null ? String(initX) : "");
      setY(initY != null ? String(initY) : "");
      setActive(true);
      setIsEmergencyExit(false);
      setIsGatheringPoint(false);
      setIconUrl(null);
      setIconFile(null);
      setMapEditMode("pin");

      if (initX != null && initY != null) {
        const detected = computeAutoZone(floor?.vectorMap, initX, initY);
        if (detected) {
          setZone(detected);
        } else {
          const limitW = floor?.widthMeters ?? 20;
          const limitH = floor?.heightMeters ?? 20;
          const fallbackW = 3;
          const fallbackH = 3;
          const fallbackX = Math.max(0, Math.min(limitW - fallbackW, initX - fallbackW / 2));
          const fallbackY = Math.max(0, Math.min(limitH - fallbackH, initY - fallbackH / 2));
          setZone({
            x: Math.round(fallbackX * 100) / 100,
            y: Math.round(fallbackY * 100) / 100,
            w: fallbackW,
            h: fallbackH,
          });
        }
      } else {
        setZone(null);
      }
    }
  }, [poi, open, initialPoint, floor?.vectorMap, floor?.widthMeters, floor?.heightMeters]);

  const handleZoneFieldChange = (field: "x" | "y" | "w" | "h", strVal: string) => {
    if (field === "x") setZoneXStr(strVal);
    else if (field === "y") setZoneYStr(strVal);
    else if (field === "w") setZoneWStr(strVal);
    else if (field === "h") setZoneHStr(strVal);

    const val = Number(strVal);
    if (Number.isNaN(val) || strVal.trim() === "") return;

    const limitW = floor?.widthMeters ?? 1000;
    const limitH = floor?.heightMeters ?? 1000;

    let nextZone = zone ? { ...zone } : { x: 0, y: 0, w: 1, h: 1 };
    nextZone[field] = Math.round(val * 100) / 100;

    // Clamping values to ensure it does not exceed map boundaries
    if (field === "x") {
      nextZone.x = Math.max(0, Math.min(limitW - nextZone.w, nextZone.x));
    } else if (field === "y") {
      nextZone.y = Math.max(0, Math.min(limitH - nextZone.h, nextZone.y));
    } else if (field === "w") {
      nextZone.w = Math.max(0.1, Math.min(limitW - nextZone.x, nextZone.w));
    } else if (field === "h") {
      nextZone.h = Math.max(0.1, Math.min(limitH - nextZone.y, nextZone.h));
    }

    setZone(nextZone);
  };

  const xNum = x === "" ? null : Number(x);
  const yNum = y === "" ? null : Number(y);
  const pickerValue =
    xNum != null && yNum != null && !Number.isNaN(xNum) && !Number.isNaN(yNum)
      ? { x: xNum, y: yNum }
      : null;

  // Preview of the zone the APP would derive from the walls when none is drawn.
  const autoZone = useMemo(
    () =>
      pickerValue ? computeAutoZone(floor?.vectorMap, pickerValue.x, pickerValue.y) : null,
    [floor?.vectorMap, pickerValue?.x, pickerValue?.y],
  );

  const shownZone = zone ?? autoZone;
  const mapZones = shownZone
    ? [{ poiId: poi?.id ?? "new", ...shownZone, saved: zone != null }]
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(
      {
        buildingId,
        floorLevel,
        name,
        code: code || undefined,
        type,
        x: Number(x),
        y: Number(y),
        areaX: zone?.x ?? null,
        areaY: zone?.y ?? null,
        areaW: zone?.w ?? null,
        areaH: zone?.h ?? null,
        categoryIds: [...selectedCategoryIds, ...selectedSubIds],
        description: description || undefined,
        aliases: fromCsv(aliases),
        productKeywords: fromCsv(productKeywords),
        active,
        isEmergencyExit,
        isGatheringPoint,
      },
      iconFile,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{poi ? "Edit POI" : "Add POI"}</DialogTitle>
            <DialogDescription>
              {poi
                ? "Update the location details below."
                : `Add a new location on floor ${floorLevel}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4 sm:grid-cols-2">
            {/* Left column: fields */}
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="poi-name">Name</Label>
                <Input
                  id="poi-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Computer Systems Hub"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="poi-code">Code</Label>
                  <Input
                    id="poi-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. 351"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="poi-type">Type</Label>
                  <Select value={type} onValueChange={(v) => v && setType(v as PoiType)}>
                    <SelectTrigger id="poi-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POI_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Categories</Label>
                <ReactSelect
                  isMulti
                  classNamePrefix="select"
                  isLoading={categoriesLoading}
                  options={categoryOptions}
                  value={categoryOptions.filter((o) => selectedCategoryIds.includes(o.value))}
                  onChange={(vals) => {
                    const ids = (vals as unknown as { value: string }[]).map((v) => v.value);
                    setSelectedCategoryIds(ids);
                    // Drop sub-categories whose parent is no longer selected.
                    const validSubs = new Set(
                      (categoryTree ?? [])
                        .filter((c) => ids.includes(c.id))
                        .flatMap((c) => c.children.map((s) => s.id)),
                    );
                    setSelectedSubIds((prev) => prev.filter((id) => validSubs.has(id)));
                  }}
                  placeholder="Select categories..."
                  styles={reactSelectStyles}
                />
              </div>
              <div className="grid gap-2">
                <Label>Sub-categories</Label>
                <ReactSelect
                  isMulti
                  classNamePrefix="select"
                  options={subOptions}
                  value={subOptions.filter((o) => selectedSubIds.includes(o.value))}
                  onChange={(vals) =>
                    setSelectedSubIds((vals as unknown as { value: string }[]).map((v) => v.value))
                  }
                  isDisabled={selectedCategoryIds.length === 0}
                  placeholder={
                    selectedCategoryIds.length === 0
                      ? "Pick a category first"
                      : "Select sub-categories..."
                  }
                  styles={reactSelectStyles}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="poi-x">X (m)</Label>
                  <Input
                    id="poi-x"
                    type="number"
                    step="0.01"
                    value={x}
                    onChange={(e) => setX(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="poi-y">Y (m)</Label>
                  <Input
                    id="poi-y"
                    type="number"
                    step="0.01"
                    value={y}
                    onChange={(e) => setY(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Right column: map picker + marker icon */}
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Location on floor plan</Label>

                {/* Mode toggle buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={mapEditMode === "pin" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMapEditMode("pin")}
                    className="gap-1.5"
                  >
                    <MapPin className="size-3.5" />
                    Place Pin
                  </Button>
                  <Button
                    type="button"
                    variant={mapEditMode === "area" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMapEditMode("area")}
                    className="gap-1.5"
                  >
                    <Square className="size-3.5" />
                    Draw Area
                  </Button>
                  {zone ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZone(null)}
                    >
                      Clear Zone
                    </Button>
                  ) : null}
                </div>

                <div className="max-h-[40vh] overflow-hidden" style={{ userSelect: "none" }}>
                  <FloorMapView
                    vectorMap={floor?.vectorMap}
                    mapUrl={floor?.mapUrl}
                    widthMeters={floor?.widthMeters}
                    heightMeters={floor?.heightMeters}
                    pois={[
                      ...pois
                        .filter((p) => p.id !== poi?.id && p.floorLevel === floorLevel)
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
                        })),
                      ...(pickerValue
                        ? [
                            {
                              id: poi?.id ?? "new",
                              name: name || (poi ? "" : "New POI"),
                              x: pickerValue.x,
                              y: pickerValue.y,
                              iconUrl: iconPreview,
                              areaX: shownZone?.x ?? null,
                              areaY: shownZone?.y ?? null,
                              areaW: shownZone?.w ?? null,
                              areaH: shownZone?.h ?? null,
                            },
                          ]
                        : []),
                    ]}
                    zones={mapZones}
                    highlightPoiId={poi?.id ?? "new"}
                    value={pickerValue}
                    onChange={
                      mapEditMode === "pin"
                        ? (nx, ny) => {
                            setX(String(nx));
                            setY(String(ny));
                            // Auto-set zone on first placement only
                            if (!zone) {
                              const detected = computeAutoZone(floor?.vectorMap, nx, ny);
                              if (detected) {
                                setZone(detected);
                              } else {
                                const limitW = floor?.widthMeters ?? 20;
                                const limitH = floor?.heightMeters ?? 20;
                                const fallbackW = 3;
                                const fallbackH = 3;
                                const fallbackX = Math.max(0, Math.min(limitW - fallbackW, nx - fallbackW / 2));
                                const fallbackY = Math.max(0, Math.min(limitH - fallbackH, ny - fallbackH / 2));
                                setZone({
                                  x: Math.round(fallbackX * 100) / 100,
                                  y: Math.round(fallbackY * 100) / 100,
                                  w: fallbackW,
                                  h: fallbackH,
                                });
                              }
                            }
                          }
                        : undefined
                    }
                    onDrawRect={
                      mapEditMode === "area"
                        ? (r) => {
                            setZone(r);
                            // If pin is outside the new zone, clear it
                            const px = Number(x);
                            const py = Number(y);
                            if (x !== "" && y !== "" && !Number.isNaN(px) && !Number.isNaN(py)) {
                              if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) {
                                setX("");
                                setY("");
                              }
                            }
                          }
                        : undefined
                    }
                    onResizeRect={(r) => {
                      setZone(r);
                      // If pin is outside the resized zone, clear it
                      const px = Number(x);
                      const py = Number(y);
                      if (x !== "" && y !== "" && !Number.isNaN(px) && !Number.isNaN(py)) {
                        if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) {
                          setX("");
                          setY("");
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Zone (shop footprint) */}
              <div className="grid gap-2">
                <Label>Zone</Label>
                <p className="text-xs text-muted-foreground">
                  {zone
                    ? `Custom Zone: ${zone.w.toFixed(1)} × ${zone.h.toFixed(1)} m at (${zone.x.toFixed(1)}, ${zone.y.toFixed(1)})`
                    : autoZone
                      ? `Auto zone from walls (dashed): ${autoZone.w.toFixed(1)} × ${autoZone.h.toFixed(1)} m — draw one to override.`
                      : "No zone — switch to \"Draw Area\" mode and drag on the map."}
                </p>
                {zone ? (
                  <div className="grid grid-cols-4 gap-2 border p-3 rounded-lg bg-muted/20">
                    <div className="grid gap-1">
                      <Label htmlFor="zone-x" className="text-xs">Zone X (m)</Label>
                      <Input
                        id="zone-x"
                        type="number"
                        step="0.01"
                        value={zoneXStr}
                        onChange={(e) => handleZoneFieldChange("x", e.target.value)}
                        className="h-8 text-xs bg-card"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="zone-y" className="text-xs">Zone Y (m)</Label>
                      <Input
                        id="zone-y"
                        type="number"
                        step="0.01"
                        value={zoneYStr}
                        onChange={(e) => handleZoneFieldChange("y", e.target.value)}
                        className="h-8 text-xs bg-card"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="zone-w" className="text-xs">Width (m)</Label>
                      <Input
                        id="zone-w"
                        type="number"
                        step="0.01"
                        value={zoneWStr}
                        onChange={(e) => handleZoneFieldChange("w", e.target.value)}
                        className="h-8 text-xs bg-card"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="zone-h" className="text-xs">Height (m)</Label>
                      <Input
                        id="zone-h"
                        type="number"
                        step="0.01"
                        value={zoneHStr}
                        onChange={(e) => handleZoneFieldChange("h", e.target.value)}
                        className="h-8 text-xs bg-card"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Marker icon */}
              <div className="grid gap-2">
                <Label>Marker icon</Label>
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {iconPreview ? (
                      <img src={iconPreview} alt="POI icon" className="size-full object-contain" />
                    ) : (
                      <ImageOff className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setIconFile(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => iconInputRef.current?.click()}
                  >
                    {iconPreview ? "Replace icon" : "Upload icon"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Resized to a small WebP on save. Uploaded once the POI is saved.
                </p>
              </div>
            </div>
          </div>

          {/* Full-width metadata */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="poi-description">Description</Label>
              <textarea
                id="poi-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Short description used by the chatbot."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="poi-aliases">Aliases (comma-separated)</Label>
              <Input
                id="poi-aliases"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder="computer, laptop, كمبيوتر"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="poi-keywords">Product keywords (comma-separated)</Label>
              <Input
                id="poi-keywords"
                value={productKeywords}
                onChange={(e) => setProductKeywords(e.target.value)}
                placeholder="cpu, gpu, ram, motherboard"
              />
              {suggestedKeywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground mr-1">
                    Suggested from sub-categories:
                  </span>
                  {(() => {
                    const current = new Set(fromCsv(productKeywords));
                    const missing = suggestedKeywords.filter((k) => !current.has(k));
                    return (
                      <>
                        {missing.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setProductKeywords(toCsv([...fromCsv(productKeywords), ...missing]))
                            }
                            className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                          >
                            + Add all ({missing.length})
                          </button>
                        )}
                        {suggestedKeywords.slice(0, 24).map((k) => {
                          const added = current.has(k);
                          return (
                            <button
                              key={k}
                              type="button"
                              disabled={added}
                              onClick={() =>
                                setProductKeywords(toCsv([...fromCsv(productKeywords), k]))
                              }
                              className={
                                "rounded-full border px-2 py-0.5 text-[11px] " +
                                (added
                                  ? "border-transparent bg-muted text-muted-foreground line-through"
                                  : "border-border hover:bg-muted cursor-pointer")
                              }
                            >
                              {k}
                            </button>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-6 pt-2 border-t mt-2">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEmergencyExit}
                  onChange={(e) => setIsEmergencyExit(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                />
                Is Default Emergency Exit
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGatheringPoint}
                  onChange={(e) => setIsGatheringPoint(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                />
                Is Default Gathering Point
              </label>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit">{poi ? "Save Changes" : "Add POI"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
