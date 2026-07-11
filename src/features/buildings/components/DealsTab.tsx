import { useEffect, useState, useRef, useMemo } from "react";
import {
  useDealsByBuilding,
  useCreateDeal,
  useUpdateDeal,
  useDeleteDeal,
  useUploadDealImage,
} from "@/features/deals/hooks";
import { usePois } from "@/features/pois/hooks";
import type { Deal } from "@/features/deals/types";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tag, Calendar, Pencil, Trash2, Plus, BadgeAlert, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { resolveAssetUrl } from "@/lib/assets";

const toDateInput = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : "";

interface DealsTabProps {
  buildingId: string;
}

export function DealsTab({ buildingId }: DealsTabProps) {
  const { data: deals, isLoading: dealsLoading } = useDealsByBuilding(buildingId);
  const { data: pois } = usePois(buildingId);

  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal(buildingId);
  const deleteDeal = useDeleteDeal(buildingId);
  const uploadDealImage = useUploadDealImage(buildingId);

  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deleteDealId, setDeleteDealId] = useState<string | null>(null);

  const [dealPoiId, setDealPoiId] = useState("");
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
    [dealImageFile, dealExistingImageUrl]
  );

  useEffect(() => {
    return () => {
      if (dealImageFile && dealImagePreview) URL.revokeObjectURL(dealImagePreview);
    };
  }, [dealImageFile, dealImagePreview]);

  useEffect(() => {
    if (editingDeal) {
      setDealPoiId(editingDeal.poiId);
      setDealTitle(editingDeal.title);
      setDealDescription(editingDeal.description || "");
      setDealDiscount(editingDeal.discountPct != null ? String(editingDeal.discountPct) : "");
      setDealValidFrom(toDateInput(editingDeal.validFrom));
      setDealValidUntil(toDateInput(editingDeal.validUntil));
      setDealActive(editingDeal.active);
      setDealImageFile(null);
      setDealExistingImageUrl(editingDeal.imageUrl ?? null);
    } else {
      setDealPoiId(pois && pois.length > 0 ? pois[0].id : "");
      setDealTitle("");
      setDealDescription("");
      setDealDiscount("");
      setDealValidFrom(new Date().toISOString().slice(0, 10));
      setDealValidUntil("");
      setDealActive(true);
      setDealImageFile(null);
      setDealExistingImageUrl(null);
    }
  }, [editingDeal, dealFormOpen, pois]);

  const handleDealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealPoiId) {
      toast.error("Please select a POI");
      return;
    }
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
        }
      );
    } else {
      createDeal.mutate(
        {
          poiId: dealPoiId,
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
        }
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

  return (
    <div className="p-6 space-y-4 outline-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Active Shop Offers & Promotions</h3>
        <Button
          onClick={() => {
            setEditingDeal(null);
            setDealFormOpen(true);
          }}
          size="sm"
          disabled={!pois || pois.length === 0}
        >
          <Plus className="size-4 mr-1" /> Create Deal
        </Button>
      </div>

      {(!pois || pois.length === 0) && (
        <div className="flex items-center gap-2 p-3 text-xs bg-amber-500/10 text-amber-500 rounded-lg">
          <BadgeAlert className="size-4 shrink-0" />
          <span>You must add POIs/Shops first before you can associate deals with them.</span>
        </div>
      )}

      {dealsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !deals || deals.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg bg-muted/20">
          <Tag className="size-8 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No active deals found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {deals.map((deal) => {
            const expired = deal.validUntil ? new Date(deal.validUntil) < new Date() : false;
            return (
              <div
                key={deal.id}
                className="flex items-start gap-3 rounded-lg border p-4 bg-card relative group hover:border-muted-foreground/30 transition-colors"
              >
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-rose-50 border">
                  {deal.imageUrl ? (
                    <img
                      src={resolveAssetUrl(deal.imageUrl) ?? ""}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <Tag className="size-5 text-rose-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold text-sm leading-none tracking-tight text-foreground truncate">
                      {deal.title}
                    </p>
                    {deal.discountPct && (
                      <Badge variant="destructive" className="text-[10px] py-0 px-1">
                        -{deal.discountPct}%
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground font-medium truncate">
                    {deal.poi?.name ?? "Shop"} (L{deal.poi?.floorLevel})
                  </p>

                  {deal.description && (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-snug">
                      {deal.description}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
                    <Calendar className="size-3" />
                    <span>
                      {new Date(deal.validFrom).toLocaleDateString()}
                      {deal.validUntil
                        ? ` - ${new Date(deal.validUntil).toLocaleDateString()}`
                        : " (Permanent)"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      setEditingDeal(deal);
                      setDealFormOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteDealId(deal.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <div className="absolute top-3 right-3 flex items-center group-hover:opacity-0 transition-opacity">
                  {!deal.active ? (
                    <Badge variant="outline" className="text-[9px] bg-muted py-0">
                      Inactive
                    </Badge>
                  ) : expired ? (
                    <Badge variant="outline" className="text-[9px] bg-muted py-0">
                      Expired
                    </Badge>
                  ) : (
                    <Badge
                      variant="default"
                      className="text-[9px] bg-emerald-500 hover:bg-emerald-600 border-none py-0"
                    >
                      Active
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Deal Editor Dialog */}
      <Dialog open={dealFormOpen} onOpenChange={setDealFormOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <form onSubmit={handleDealSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingDeal ? "Edit Deal / Promotion" : "Create New Promotion"}
              </DialogTitle>
              <DialogDescription>
                Promotions appear inside the shopper app directory and map labels.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {!editingDeal && (
                <div className="grid gap-2">
                  <Label htmlFor="deal-poi-select">Select Store / POI</Label>
                  <Select value={dealPoiId} onValueChange={(val) => val && setDealPoiId(val)}>
                    <SelectTrigger id="deal-poi-select">
                      <SelectValue placeholder="Select POI">
                        {pois?.find((p) => p.id === dealPoiId)?.name || "Select POI"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {pois?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} (Floor {p.floorLevel})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="deal-title">Promotion Title</Label>
                <Input
                  id="deal-title"
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  placeholder="e.g. 20% Off Coffee Beverages"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="deal-desc">Description</Label>
                <Input
                  id="deal-desc"
                  value={dealDescription}
                  onChange={(e) => setDealDescription(e.target.value)}
                  placeholder="Optional details about this promotion"
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
                    placeholder="e.g. 20"
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
                disabled={createDeal.isPending || updateDeal.isPending || uploadDealImage.isPending}
              >
                {editingDeal ? "Save Changes" : "Create Promotion"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Deal Dialog */}
      <Dialog open={!!deleteDealId} onOpenChange={(o) => !o && setDeleteDealId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Deal Promotion</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this deal promotion? This action cannot be undone.
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
