import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import {
  usePoi,
  useUpdatePoi,
  useDeletePoi,
  useUploadPoiIcon,
  usePois,
  usePoiCategories,
  useCreatePoi,
  useUploadPoiGalleryImage,
  useDeletePoiGalleryImage,
} from "@/features/pois/hooks";
import { useBuilding } from "@/features/buildings/hooks";
import { useFloorsByBuilding } from "@/features/floors/hooks";
import {
  useDealsByPoi,
  useCreateDeal,
  useUpdateDeal,
  useDeleteDeal,
  useUploadDealImage,
} from "@/features/deals/hooks";
import { useReviewsByPoi } from "@/features/reviews/hooks";

import { FloorMapView } from "@/features/floors/components/FloorMapView";
import CreatableSelect from "react-select/creatable";
import { computeAutoZone, type PoiZone } from "./poi-zone";
import { POI_TYPES, type PoiType } from "./types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeft,
  Plus,
  Trash2,
  Tag,
  Pencil,
  Calendar,
  ImageOff,
  Layers,
  Check,
  X,
  Loader2,
  MapPin,
  Square,
  Star,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { resolveAssetUrl } from "@/lib/assets";
import type { CreatePoiInput } from "@/features/pois/types";
import type { Deal } from "@/features/deals/types";

const toCsv = (arr: string[]) => arr.join(", ");
const fromCsv = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

// ISO datetime -> yyyy-mm-dd for <input type="date">.
const toDateInput = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : "";

export function PoiDetailPage() {
  const { buildingId, poiId } = useParams<{ buildingId: string; poiId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = poiId === "new";

  // Queries
  const { data: poi, isLoading: poiLoading, refetch: refetchPoi } = usePoi(isNew ? "" : poiId!);
  const { data: building, isLoading: buildingLoading } = useBuilding(buildingId!);
  const { data: floors } = useFloorsByBuilding(buildingId!);
  const { data: pois } = usePois(buildingId!);
  const { data: deals, isLoading: dealsLoading } = useDealsByPoi(isNew ? "" : poiId!);
  const { data: reviews, isLoading: reviewsLoading } = useReviewsByPoi(isNew ? null : poiId!);
  const { data: categories, isLoading: categoriesLoading } = usePoiCategories();

  // Prefer the denormalized aggregate on the POI; fall back to computing from
  // the fetched list so the panel is still meaningful before aggregates exist.
  const reviewCount = poi?.reviewCount ?? reviews?.length ?? 0;
  const avgRating =
    poi?.avgRating && poi.avgRating > 0
      ? poi.avgRating
      : reviews && reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

  // Mutations
  const createPoiMutation = useCreatePoi();
  const updatePoiMutation = useUpdatePoi();
  const deletePoiMutation = useDeletePoi();
  const uploadPoiIconMutation = useUploadPoiIcon();
  const uploadPoiGalleryImageMutation = useUploadPoiGalleryImage();
  const deletePoiGalleryImageMutation = useDeletePoiGalleryImage();

  const galleryInputRef = useRef<HTMLInputElement>(null);
  // Tracks which POI id the editor form has already been hydrated from, so a
  // background refetch (e.g. after a gallery upload) doesn't re-hydrate the
  // form and kick the admin out of edit mode / discard unsaved edits.
  const hydratedIdRef = useRef<string | null>(null);

  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal(isNew ? "" : poiId!);
  const deleteDeal = useDeleteDeal(isNew ? "" : poiId!);
  const uploadDealImage = useUploadDealImage(isNew ? "" : poiId!);

  // UI Modes State
  const [isEditing, setIsEditing] = useState(isNew);
  const [confirmDeletePoi, setConfirmDeletePoi] = useState(false);

  // Editor Fields State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<PoiType>("ROOM");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [aliases, setAliases] = useState("");
  const [productKeywords, setProductKeywords] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [active, setActive] = useState(true);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Floor level (can change if creating a new POI, locked when editing existing)
  const [floorLevel, setFloorLevel] = useState(0);

  // Zone State
  const [zone, setZone] = useState<PoiZone | null>(null);
  // Map edit mode: "pin" = clicking places the pin, "area" = dragging draws the area zone
  const [mapEditMode, setMapEditMode] = useState<"pin" | "area">("pin");

  // String states for manual zone inputs
  const [zoneXStr, setZoneXStr] = useState("");
  const [zoneYStr, setZoneYStr] = useState("");
  const [zoneWStr, setZoneWStr] = useState("");
  const [zoneHStr, setZoneHStr] = useState("");

  const currentFloor = useMemo(() => {
    if (!floors) return null;
    return floors.find((f) => f.level === floorLevel) ?? null;
  }, [floors, floorLevel]);

  // Format category choices
  const categoryOptions = useMemo(() => {
    return (categories ?? []).map((c) => ({
      value: c.name,
      label: c.name,
    }));
  }, [categories]);

  // Sync editor fields when POI is loaded
  useEffect(() => {
    if (poi && !isNew) {
      // Only hydrate once per POI id. Subsequent refetches (gallery upload,
      // cache invalidation) must not reset the form or exit edit mode.
      if (hydratedIdRef.current === poi.id) return;
      hydratedIdRef.current = poi.id;
      setName(poi.name);
      setCode(poi.code ?? "");
      setType(poi.type);
      setCategory(poi.category ?? "");
      setDescription(poi.description ?? "");
      setAliases(toCsv(poi.aliases ?? []));
      setProductKeywords(toCsv(poi.productKeywords ?? []));
      setX(String(poi.x));
      setY(String(poi.y));
      setActive(poi.active);
      setIconUrl(poi.iconUrl ?? null);
      setIconFile(null);
      setFloorLevel(poi.floorLevel);
      setZone(
        poi.areaX != null && poi.areaY != null && poi.areaW != null && poi.areaH != null
          ? { x: poi.areaX, y: poi.areaY, w: poi.areaW, h: poi.areaH }
          : null,
      );
      setMapEditMode("pin");
      setIsEditing(false);
    } else if (isNew) {
      const qx = searchParams.get("x") || "";
      const qy = searchParams.get("y") || "";
      setName("");
      setCode("");
      setType("ROOM");
      setCategory("");
      setDescription("");
      setAliases("");
      setProductKeywords("");
      setX(qx);
      setY(qy);
      setActive(true);
      setIconUrl(null);
      setIconFile(null);
      setFloorLevel(floors && floors.length > 0 ? floors[0].level : 0);
      setZone(null);
      setMapEditMode("pin");
      setIsEditing(true);
    }
  }, [poi, isNew, floors, searchParams]);

  // Sync manual zone string inputs
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

  const handleZoneFieldChange = (field: "x" | "y" | "w" | "h", strVal: string) => {
    if (field === "x") setZoneXStr(strVal);
    else if (field === "y") setZoneYStr(strVal);
    else if (field === "w") setZoneWStr(strVal);
    else if (field === "h") setZoneHStr(strVal);

    const val = Number(strVal);
    if (Number.isNaN(val) || strVal.trim() === "") return;

    const limitW = currentFloor?.widthMeters ?? 1000;
    const limitH = currentFloor?.heightMeters ?? 1000;

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

  const iconPreview = useMemo(() => {
    return iconFile ? URL.createObjectURL(iconFile) : resolveAssetUrl(iconUrl) ?? null;
  }, [iconFile, iconUrl]);

  useEffect(() => {
    return () => {
      if (iconFile && iconPreview) URL.revokeObjectURL(iconPreview);
    };
  }, [iconFile, iconPreview]);

  // Save changes mutation handler
  const handleSavePoi = async () => {
    if (!name.trim()) {
      toast.error("POI Name is required");
      return;
    }
    if (x === "" || y === "") {
      toast.error("Please place the POI on the floor map layout");
      return;
    }

    const payload: CreatePoiInput = {
      buildingId: buildingId!,
      floorLevel,
      name: name.trim(),
      code: code.trim() || undefined,
      type,
      x: Number(x),
      y: Number(y),
      category: category.trim() || undefined,
      description: description.trim() || undefined,
      aliases: fromCsv(aliases),
      productKeywords: fromCsv(productKeywords),
      areaX: zone?.x ?? null,
      areaY: zone?.y ?? null,
      areaW: zone?.w ?? null,
      areaH: zone?.h ?? null,
      active,
    };

    const uploadIcon = async (poiId: string) => {
      if (iconFile) {
        try {
          await uploadPoiIconMutation.mutateAsync({ id: poiId, file: iconFile });
        } catch {
          toast.error("POI saved, but failed to upload custom marker icon");
        }
      }
    };

    try {
      if (isNew) {
        const created = await createPoiMutation.mutateAsync(payload);
        await uploadIcon(created.id);
        toast.success("POI created successfully");
        navigate(`/buildings/${buildingId}/pois/${created.id}`);
      } else {
        await updatePoiMutation.mutateAsync({ id: poiId!, input: payload });
        await uploadIcon(poiId!);
        toast.success("POI updated successfully");
        setIsEditing(false);
        refetchPoi();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save POI");
    }
  };

  const handleConfirmDeletePoi = () => {
    deletePoiMutation.mutate(poiId!, {
      onSuccess: () => {
        toast.success("POI deleted");
        setConfirmDeletePoi(false);
        navigate(`/buildings/${buildingId}`);
      },
      onError: () => toast.error("Failed to delete POI"),
    });
  };

  // Deals Local State
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deleteDealId, setDeleteDealId] = useState<string | null>(null);

  // Deal Form fields
  const [dealTitle, setDealTitle] = useState("");
  const [dealDescription, setDealDescription] = useState("");
  const [dealDiscount, setDealDiscount] = useState("");
  const [dealValidFrom, setDealValidFrom] = useState("");
  const [dealValidUntil, setDealValidUntil] = useState("");
  const [dealActive, setDealActive] = useState(true);
  const [dealImageFile, setDealImageFile] = useState<File | null>(null);
  const [dealExistingImageUrl, setDealExistingImageUrl] = useState<string | null>(null);
  const dealImageInputRef = useRef<HTMLInputElement>(null);

  const dealImagePreview = useMemo(
    () => (dealImageFile ? URL.createObjectURL(dealImageFile) : resolveAssetUrl(dealExistingImageUrl) ?? null),
    [dealImageFile, dealExistingImageUrl],
  );

  useEffect(() => {
    return () => {
      if (dealImageFile && dealImagePreview) URL.revokeObjectURL(dealImagePreview);
    };
  }, [dealImageFile, dealImagePreview]);

  useEffect(() => {
    if (editingDeal) {
      setDealTitle(editingDeal.title);
      setDealDescription(editingDeal.description || "");
      setDealDiscount(editingDeal.discountPct != null ? String(editingDeal.discountPct) : "");
      setDealValidFrom(toDateInput(editingDeal.validFrom));
      setDealValidUntil(toDateInput(editingDeal.validUntil));
      setDealActive(editingDeal.active);
      setDealImageFile(null);
      setDealExistingImageUrl(editingDeal.imageUrl ?? null);
    } else {
      setDealTitle("");
      setDealDescription("");
      setDealDiscount("");
      setDealValidFrom(new Date().toISOString().slice(0, 10));
      setDealValidUntil("");
      setDealActive(true);
      setDealImageFile(null);
      setDealExistingImageUrl(null);
    }
  }, [editingDeal, dealFormOpen]);

  const handleDealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    const discount = dealDiscount.trim() ? Number(dealDiscount) : undefined;
    if (discount !== undefined && (Number.isNaN(discount) || discount < 1 || discount > 100)) {
      toast.error("Discount must be between 1 and 100");
      return;
    }

    const finishWithImage = async (dealId: string, msg: string) => {
      if (dealImageFile) {
        try {
          await uploadDealImage.mutateAsync({ id: dealId, file: dealImageFile });
        } catch {
          toast.error("Deal saved, but banner image failed to upload");
        }
      }
      toast.success(msg);
      setDealFormOpen(false);
    };

    if (editingDeal) {
      updateDeal.mutate(
        {
          id: editingDeal.id,
          input: {
            title: dealTitle.trim(),
            description: dealDescription.trim() || null,
            discountPct: discount ?? null,
            validFrom: dealValidFrom || undefined,
            validUntil: dealValidUntil || null,
            active: dealActive,
          },
        },
        {
          onSuccess: () => finishWithImage(editingDeal.id, "Deal updated"),
          onError: () => toast.error("Failed to update deal"),
        },
      );
    } else {
      createDeal.mutate(
        {
          poiId: poiId!,
          title: dealTitle.trim(),
          description: dealDescription.trim() || undefined,
          discountPct: discount,
          validFrom: dealValidFrom || undefined,
          validUntil: dealValidUntil || undefined,
          active: dealActive,
        },
        {
          onSuccess: (created) => finishWithImage(created.id, "Deal created"),
          onError: () => toast.error("Failed to create deal"),
        },
      );
    }
  };

  const handleConfirmDeleteDeal = () => {
    if (!deleteDealId) return;
    deleteDeal.mutate(deleteDealId, {
      onSuccess: () => {
        toast.success("Deal deleted");
        setDeleteDealId(null);
      },
      onError: () => toast.error("Failed to delete deal"),
    });
  };

  // Map settings
  const xNum = x === "" ? null : Number(x);
  const yNum = y === "" ? null : Number(y);
  const pickerValue =
    xNum != null && yNum != null && !Number.isNaN(xNum) && !Number.isNaN(yNum)
      ? { x: xNum, y: yNum }
      : null;

  const autoZone = useMemo(() => {
    return pickerValue ? computeAutoZone(currentFloor?.vectorMap, pickerValue.x, pickerValue.y) : null;
  }, [currentFloor?.vectorMap, pickerValue?.x, pickerValue?.y]);

  const shownZone = zone ?? autoZone;
  const mapZones = shownZone
    ? [{ poiId: isNew ? "new" : poiId!, ...shownZone, saved: zone != null }]
    : [];

  if (buildingLoading || (!isNew && poiLoading)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!isNew && !poi) {
    return (
      <div className="text-center py-16">
        <h2 className="text-lg font-bold">POI not found</h2>
        <Link to={`/buildings/${buildingId}`} className="text-sm text-primary hover:underline">
          Go back to venue workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Navigation */}
      <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-3">
        <div className="min-w-0">
          <Link
            to={`/buildings/${buildingId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5"
          >
            <ArrowLeft className="size-3" /> Back to {building?.name || "Venue"}
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold truncate">
              {isNew ? "New Location POI" : name}
            </h1>
            {!isNew && (
              <Badge variant="secondary" className="font-mono text-xs">
                {poi?.code || "No Code"}
              </Badge>
            )}
            {isNew && <Badge className="text-xs bg-primary">Creating</Badge>}
          </div>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="size-3.5 mr-1" /> Edit POI
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDeletePoi(true)}>
              <Trash2 className="size-3.5 mr-1" /> Delete POI
            </Button>
          </div>
        )}
      </div>

      {/* 2. Main split layout */}
      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Column: POI Details and Form (Editable Inline) */}
        <div className="md:col-span-8 space-y-6">
          <Card className="border shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b pb-3 flex flex-row items-center justify-between bg-muted/10">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {isEditing ? "Configure POI Details" : "POI Configuration Details"}
              </CardTitle>
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      if (isNew) navigate(`/buildings/${buildingId}`);
                      else setIsEditing(false);
                    }}
                  >
                    <X className="size-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="xs"
                    onClick={handleSavePoi}
                    disabled={
                      createPoiMutation.isPending ||
                      updatePoiMutation.isPending ||
                      uploadPoiIconMutation.isPending
                    }
                  >
                    <Check className="size-3.5 mr-1" /> Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {isEditing ? (
                /* EDIT MODE */
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="poi-name">Location/Store Name</Label>
                      <Input
                        id="poi-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Starbucks Coffee"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="poi-code">Location Code (Unique)</Label>
                      <Input
                        id="poi-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="e.g. STARBUCKS-01"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="poi-floor">Floor Level</Label>
                      {isNew ? (
                        <Select value={String(floorLevel)} onValueChange={(val) => setFloorLevel(Number(val))}>
                          <SelectTrigger id="poi-floor">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {floors?.map((f) => (
                              <SelectItem key={f.id} value={String(f.level)}>
                                Level {f.level} ({f.name})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={`Level ${floorLevel}`} disabled className="bg-muted" />
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="poi-type">POI Type</Label>
                      <Select value={type} onValueChange={(val) => setType(val as PoiType)}>
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
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <CreatableSelect
                        className="basic-single"
                        classNamePrefix="select"
                        isClearable
                        isLoading={categoriesLoading}
                        value={category ? { value: category, label: category } : null}
                        onChange={(newValue) => setCategory(newValue ? newValue.value : "")}
                        options={categoryOptions}
                        placeholder="Select or type category..."
                        styles={{
                          control: (base) => ({
                            ...base,
                            backgroundColor: "transparent",
                            borderColor: "oklch(0.922 0 0)",
                            borderRadius: "calc(var(--radius) - 2px)",
                            fontSize: "0.875rem",
                            height: "2.5rem",
                          }),
                          menu: (base) => ({
                            ...base,
                            backgroundColor: "var(--color-popover)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-popover-foreground)",
                          }),
                          option: (base, state) => ({
                            ...base,
                            backgroundColor: state.isFocused ? "rgba(0,0,0,0.05)" : "transparent",
                            color: "inherit",
                            cursor: "pointer",
                          }),
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="poi-desc">Description</Label>
                    <Input
                      id="poi-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional details or opening hours"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="poi-aliases">Search Aliases (Comma separated)</Label>
                      <Input
                        id="poi-aliases"
                        value={aliases}
                        onChange={(e) => setAliases(e.target.value)}
                        placeholder="coffee, drinks, cafe"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="poi-keywords">Product Keywords (Comma separated)</Label>
                      <Input
                        id="poi-keywords"
                        value={productKeywords}
                        onChange={(e) => setProductKeywords(e.target.value)}
                        placeholder="latte, espresso, muffins"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Active Status</Label>
                      <div className="flex h-10 items-center justify-between rounded-md border px-3 bg-card">
                        <span className="text-sm font-medium">{active ? "Active" : "Inactive"}</span>
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => setActive(e.target.checked)}
                          className="size-4 accent-primary"
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 md:col-span-2">
                      <Label>POI Custom Icon / Marker Logo</Label>
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                          {iconPreview ? (
                            <img src={iconPreview} alt="" className="size-full object-contain" />
                          ) : (
                            <ImageOff className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <input
                          ref={iconInputRef}
                          type="file"
                          accept="image/*"
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
                          size="xs"
                          onClick={() => iconInputRef.current?.click()}
                        >
                          {iconPreview ? "Replace Logo" : "Upload Logo"}
                        </Button>
                        {iconPreview && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="text-destructive"
                            onClick={() => {
                              setIconUrl(null);
                              setIconFile(null);
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Image Gallery Upload */}
                  <div className="border-t pt-4 space-y-4">
                    <div>
                      <Label className="text-sm font-semibold">Image Gallery (Optimization for Phones)</Label>
                      <p className="text-xs text-muted-foreground">
                        Upload photos for this place. Images will be automatically optimized using sharp to save phone data and speed up loading.
                      </p>
                    </div>

                    {isNew ? (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 italic">
                        Please save the POI first before uploading gallery images.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {poi?.images?.map((imgUrl, idx) => (
                            <div key={idx} className="group relative aspect-video overflow-hidden rounded-lg border bg-muted/30">
                              <img src={resolveAssetUrl(imgUrl) ?? ""} alt="" className="size-full object-cover" />
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await deletePoiGalleryImageMutation.mutateAsync({ id: poiId!, url: imgUrl });
                                    toast.success("Image removed from gallery");
                                  } catch {
                                    toast.error("Failed to remove gallery image");
                                  }
                                }}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white rounded-lg"
                              >
                                <Trash2 className="size-5 text-destructive-foreground hover:scale-110 transition-transform" />
                              </button>
                            </div>
                          ))}
                          
                          <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            disabled={uploadPoiGalleryImageMutation.isPending}
                            className="aspect-video border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-colors bg-muted/10 active:bg-muted/20"
                          >
                            {uploadPoiGalleryImageMutation.isPending ? (
                              <Loader2 className="size-5 animate-spin text-muted-foreground" />
                            ) : (
                              <Plus className="size-5 text-muted-foreground" />
                            )}
                            <span className="text-xs font-medium text-muted-foreground">
                              {uploadPoiGalleryImageMutation.isPending ? "Uploading..." : "Add Image"}
                            </span>
                          </button>
                        </div>

                        <input
                          ref={galleryInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={async (e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            if (files.length === 0) return;
                            // Upload sequentially so each request appends to the
                            // gallery without racing the others.
                            let uploaded = 0;
                            for (const file of files) {
                              try {
                                await uploadPoiGalleryImageMutation.mutateAsync({ id: poiId!, file });
                                uploaded += 1;
                              } catch {
                                // keep going with the rest
                              }
                            }
                            if (uploaded === files.length) {
                              toast.success(
                                uploaded === 1
                                  ? "Image uploaded successfully"
                                  : `${uploaded} images uploaded successfully`,
                              );
                            } else if (uploaded > 0) {
                              toast.warning(`Uploaded ${uploaded} of ${files.length} images`);
                            } else {
                              toast.error("Failed to upload images");
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* MAP PLACEMENT & ZONE DRAWING */}
                  <div className="border-t pt-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold mb-1">POI Coordinate Placement</h3>
                      <p className="text-xs text-muted-foreground">
                        Use the toggle buttons below to switch between placing the pin or drawing the area zone.
                      </p>
                    </div>

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
                      {zone && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setZone(null)}
                        >
                          Clear Zone
                        </Button>
                      )}
                    </div>

                    <div className="max-h-[45vh] overflow-hidden rounded-lg border bg-muted/10 relative" style={{ userSelect: "none" }}>
                      <FloorMapView
                        vectorMap={currentFloor?.vectorMap}
                        mapUrl={currentFloor?.mapUrl}
                        widthMeters={currentFloor?.widthMeters}
                        heightMeters={currentFloor?.heightMeters}
                        pois={[
                          ...(pois || [])
                            .filter((p) => p.id !== poiId && p.floorLevel === floorLevel)
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
                                  id: isNew ? "new" : poiId!,
                                  name: name || (isNew ? "New POI" : ""),
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
                        highlightPoiId={isNew ? "new" : poiId!}
                        value={pickerValue}
                        onChange={
                          mapEditMode === "pin"
                            ? (nx, ny) => {
                                setX(String(nx));
                                setY(String(ny));
                                // Auto-set zone on first placement only
                                if (!zone) {
                                  const detected = computeAutoZone(currentFloor?.vectorMap, nx, ny);
                                  if (detected) {
                                    setZone(detected);
                                  } else {
                                    const limitW = currentFloor?.widthMeters ?? 20;
                                    const limitH = currentFloor?.heightMeters ?? 20;
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

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Zone Info</Label>
                        <p className="text-[11px] text-muted-foreground">
                          {zone
                            ? `Custom Zone: ${zone.w.toFixed(1)}m × ${zone.h.toFixed(1)}m at (${zone.x.toFixed(1)}, ${zone.y.toFixed(1)})`
                            : autoZone
                              ? `Auto zone (dashed): ${autoZone.w.toFixed(1)}m × ${autoZone.h.toFixed(1)}m`
                              : "No footprint. Switch to \"Draw Area\" mode and drag on the map."}
                        </p>
                      </div>

                      {zone && (
                        <div className="grid grid-cols-4 gap-2 border p-3 rounded-lg bg-muted/10 shrink-0">
                          <div className="grid gap-1">
                            <Label htmlFor="zone-x" className="text-[10px]">Zone X</Label>
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
                            <Label htmlFor="zone-y" className="text-[10px]">Zone Y</Label>
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
                            <Label htmlFor="zone-w" className="text-[10px]">Width</Label>
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
                            <Label htmlFor="zone-h" className="text-[10px]">Height</Label>
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
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* VIEW MODE */
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 shadow-inner">
                      {poi?.iconUrl ? (
                        <img
                          src={resolveAssetUrl(poi.iconUrl) ?? ""}
                          alt=""
                          className="size-full object-contain"
                        />
                      ) : (
                        <ImageOff className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground leading-snug">{poi?.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <Badge variant="outline" className="font-mono text-xs">
                          {poi?.code || "No code"}
                        </Badge>
                        <Badge variant={poi?.active ? "default" : "secondary"}>
                          {poi?.active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="secondary" className="font-semibold text-xs">
                          {poi?.type}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 border-t pt-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground block uppercase">
                          POI Category
                        </span>
                        <span className="text-foreground font-medium">{poi?.category || "--"}</span>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground block uppercase">
                          Floor Location
                        </span>
                        <span className="text-foreground font-medium flex items-center gap-1">
                          <Layers className="size-3.5" /> Level {poi?.floorLevel}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground block uppercase">
                          Coordinates
                        </span>
                        <span className="text-foreground font-mono">
                          X: {poi?.x.toFixed(2)}m, Y: {poi?.y.toFixed(2)}m
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground block uppercase">
                          Description
                        </span>
                        <span className="text-foreground font-medium">
                          {poi?.description || "No description provided."}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground block uppercase">
                          Zone Footprint dimensions
                        </span>
                        <span className="text-foreground font-medium">
                          {poi?.areaX != null
                            ? `${poi.areaW?.toFixed(1)}m × ${poi.areaH?.toFixed(1)}m at (${poi.areaX.toFixed(1)}, ${poi.areaY?.toFixed(1)})`
                            : "Derived automatically (Vector corridor bounds)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Image Gallery */}
                  <div className="border-t pt-4">
                    <span className="text-xs font-semibold text-muted-foreground block uppercase mb-3">
                      Image Gallery
                    </span>
                    {poi?.images && poi.images.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {poi.images.map((img, i) => (
                          <div key={i} className="group relative aspect-video overflow-hidden rounded-lg border bg-muted/40 shadow-sm">
                            <img src={resolveAssetUrl(img) ?? ""} alt="" className="size-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">No gallery images uploaded.</span>
                    )}
                  </div>

                  {poi?.aliases && poi.aliases.length > 0 && (
                    <div className="border-t pt-4">
                      <span className="text-xs font-semibold text-muted-foreground block uppercase mb-1">
                        Search Aliases
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {poi.aliases.map((alias, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-muted/40">
                            {alias}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {poi?.productKeywords && poi.productKeywords.length > 0 && (
                    <div className="border-t pt-4">
                      <span className="text-xs font-semibold text-muted-foreground block uppercase mb-1">
                        Product Keywords
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {poi.productKeywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-muted/40">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STATIC MAP VIEW */}
                  <div className="border-t pt-4">
                    <span className="text-xs font-semibold text-muted-foreground block uppercase mb-2">
                      POI Location Preview
                    </span>
                    <div className="max-h-[35vh] overflow-hidden rounded-lg border bg-muted/10">
                      <FloorMapView
                        vectorMap={currentFloor?.vectorMap}
                        mapUrl={currentFloor?.mapUrl}
                        widthMeters={currentFloor?.widthMeters}
                        heightMeters={currentFloor?.heightMeters}
                        pois={[
                          ...(pois || [])
                            .filter((p) => p.id !== poiId && p.floorLevel === floorLevel)
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
                                  id: isNew ? "new" : poiId!,
                                  name: name || (isNew ? "New POI" : ""),
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
                        highlightPoiId={isNew ? "new" : poiId!}
                        value={pickerValue}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Deals & Promotions (Always visible, except if creating new) */}
        <div className="md:col-span-4 space-y-6">
          <Card className="border shadow-sm bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between border-b bg-muted/10 py-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="size-4" /> Store Promotions
              </CardTitle>
              {!isNew && (
                <Button
                  onClick={() => {
                    setEditingDeal(null);
                    setDealFormOpen(true);
                  }}
                  size="xs"
                  className="h-7"
                >
                  <Plus className="size-3 mr-0.5" /> Add
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {isNew ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  You can configure and add deals after creating the POI location.
                </div>
              ) : dealsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : !deals || deals.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
                  No active promotions found.
                </div>
              ) : (
                <div className="space-y-3">
                  {deals.map((deal) => {
                    const expired = deal.validUntil ? new Date(deal.validUntil) < new Date() : false;
                    return (
                      <div
                        key={deal.id}
                        className="flex items-start gap-2.5 rounded-lg border p-3 bg-muted/10 relative group hover:border-muted-foreground/20 transition-colors"
                      >
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-rose-50/50">
                          {deal.imageUrl ? (
                            <img
                              src={resolveAssetUrl(deal.imageUrl) ?? ""}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <Tag className="size-4 text-rose-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h4 className="font-bold text-xs leading-none tracking-tight text-foreground truncate pr-6">
                            {deal.title}
                          </h4>
                          {deal.discountPct && (
                            <Badge variant="destructive" className="text-[9px] py-0 px-1 font-mono">
                              -{deal.discountPct}%
                            </Badge>
                          )}
                          {deal.description && (
                            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-normal">
                              {deal.description}
                            </p>
                          )}
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground pt-1">
                            <Calendar className="size-2.5" />
                            <span>
                              {new Date(deal.validFrom).toLocaleDateString()}
                              {deal.validUntil ? ` - ${new Date(deal.validUntil).toLocaleDateString()}` : " (Permanent)"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingDeal(deal);
                              setDealFormOpen(true);
                            }}
                          >
                            <Pencil className="size-3 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => setDeleteDealId(deal.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>

                        <div className="absolute top-2 right-2 flex items-center group-hover:opacity-0 transition-opacity">
                          {!deal.active ? (
                            <Badge variant="outline" className="text-[8px] bg-muted py-0 px-1">Inactive</Badge>
                          ) : expired ? (
                            <Badge variant="outline" className="text-[8px] bg-muted py-0 px-1">Expired</Badge>
                          ) : (
                            <Badge variant="default" className="text-[8px] bg-emerald-500 hover:bg-emerald-600 border-none py-0 px-1">Active</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer Reviews (read-only) */}
          <Card className="border shadow-sm bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between border-b bg-muted/10 py-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="size-4" /> Customer Reviews
              </CardTitle>
              {!isNew && reviewCount > 0 && (
                <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  {avgRating.toFixed(1)}
                  <span className="text-muted-foreground font-normal">({reviewCount})</span>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {isNew ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Reviews from app users will appear here after creating the POI.
                </div>
              ) : reviewsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : !reviews || reviews.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
                  No reviews yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-lg border p-3 bg-muted/10 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                          {review.user?.avatarUrl ? (
                            <img
                              src={resolveAssetUrl(review.user.avatarUrl) ?? ""}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {(review.user?.name ?? "?").charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-foreground truncate flex-1">
                          {review.user?.name ?? "Anonymous"}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={
                                s <= review.rating
                                  ? "size-3 fill-amber-400 text-amber-400"
                                  : "size-3 text-muted-foreground/40"
                              }
                            />
                          ))}
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          {review.comment}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <Calendar className="size-2.5" />
                        <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DIALOGS */}

      {/* PROMOTION EDITOR DIALOG */}
      <Dialog open={dealFormOpen} onOpenChange={setDealFormOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <form onSubmit={handleDealSubmit}>
            <DialogHeader>
              <DialogTitle>{editingDeal ? "Edit Promotion" : "Create Promotion"}</DialogTitle>
              <DialogDescription>
                Add or edit discount deals specifically for <strong>{poi?.name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Store / Location</Label>
                <Input value={poi?.name || ""} disabled className="bg-muted" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="deal-title">Promotion Title</Label>
                <Input
                  id="deal-title"
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  placeholder="e.g. Buy 1 Get 1 Free Espresso"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="deal-desc">Description</Label>
                <Input
                  id="deal-desc"
                  value={dealDescription}
                  onChange={(e) => setDealDescription(e.target.value)}
                  placeholder="Optional terms or details"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="deal-discount">Discount % (Optional)</Label>
                  <Input
                    id="deal-discount"
                    type="number"
                    min="1"
                    max="100"
                    value={dealDiscount}
                    onChange={(e) => setDealDiscount(e.target.value)}
                    placeholder="e.g. 15"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <div className="flex h-10 items-center justify-between rounded-md border px-3 bg-card">
                    <span className="text-sm font-medium">{dealActive ? "Active" : "Inactive"}</span>
                    <input
                      type="checkbox"
                      checked={dealActive}
                      onChange={(e) => setDealActive(e.target.checked)}
                      className="size-4 accent-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="deal-from">Start Date</Label>
                  <Input
                    id="deal-from"
                    type="date"
                    value={dealValidFrom}
                    onChange={(e) => setDealValidFrom(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="deal-until">End Date (Optional)</Label>
                  <Input
                    id="deal-until"
                    type="date"
                    value={dealValidUntil}
                    onChange={(e) => setDealValidUntil(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Promo Banner Image</Label>
                <div className="flex items-center gap-3">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {dealImagePreview ? (
                      <img src={dealImagePreview} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageOff className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <input
                    ref={dealImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setDealImageFile(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => dealImageInputRef.current?.click()}
                  >
                    {dealImagePreview ? "Change Banner" : "Upload Banner"}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDealFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createDeal.isPending || updateDeal.isPending || uploadDealImage.isPending
                }
              >
                {editingDeal ? "Save Changes" : "Create Promotion"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete POI Dialog */}
      <Dialog open={confirmDeletePoi} onOpenChange={setConfirmDeletePoi}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete POI Location</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this POI location? This action will remove
              the marker and disable any active promotions linked to this store.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeletePoi(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeletePoi}
              disabled={deletePoiMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Deal Dialog */}
      <Dialog open={!!deleteDealId} onOpenChange={(o) => !o && setDeleteDealId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Deal Promotion</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this promotion? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDealId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteDeal}
              disabled={deleteDeal.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
