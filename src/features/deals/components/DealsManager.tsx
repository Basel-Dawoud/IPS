import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Tag, X, ImageOff } from "lucide-react";
import { toast } from "sonner";
import {
  useDealsByPoi,
  useCreateDeal,
  useUpdateDeal,
  useDeleteDeal,
  useUploadDealImage,
} from "../hooks";
import { resolveAssetUrl } from "@/lib/assets";
import type { Deal } from "../types";

interface DealsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poiId: string | null;
  poiName: string;
}

// ISO datetime -> yyyy-mm-dd for <input type="date">.
const toDateInput = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : "";

interface FormState {
  title: string;
  description: string;
  discountPct: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  discountPct: "",
  validFrom: "",
  validUntil: "",
  active: true,
};

export function DealsManager({ open, onOpenChange, poiId, poiName }: DealsManagerProps) {
  const { data: deals, isLoading } = useDealsByPoi(open ? poiId : null);
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal(poiId ?? "");
  const deleteDeal = useDeleteDeal(poiId ?? "");
  const uploadImage = useUploadDealImage(poiId ?? "");

  // null = form hidden; "new" = creating; otherwise editing that deal id.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  // Staged banner file + the already-saved image URL (edit).
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = editing !== null && editing !== "new";

  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : resolveAssetUrl(existingImageUrl) ?? null),
    [imageFile, existingImageUrl],
  );
  useEffect(() => {
    return () => {
      if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imageFile, imagePreview]);

  const openNew = () => {
    setForm(emptyForm);
    setImageFile(null);
    setExistingImageUrl(null);
    setEditing("new");
  };

  const openEdit = (d: Deal) => {
    setForm({
      title: d.title,
      description: d.description ?? "",
      discountPct: d.discountPct != null ? String(d.discountPct) : "",
      validFrom: toDateInput(d.validFrom),
      validUntil: toDateInput(d.validUntil),
      active: d.active,
    });
    setImageFile(null);
    setExistingImageUrl(d.imageUrl ?? null);
    setEditing(d.id);
  };

  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setExistingImageUrl(null);
  };

  const submitting = createDeal.isPending || updateDeal.isPending || uploadImage.isPending;

  // Upload the staged banner (if any) for a saved deal, then finish.
  const finishWithImage = async (dealId: string, msg: string) => {
    if (imageFile) {
      try {
        await uploadImage.mutateAsync({ id: dealId, file: imageFile });
      } catch {
        toast.error("Deal saved, but the image failed to upload");
      }
    }
    toast.success(msg);
    closeForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poiId) return;
    const title = form.title.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    const discountPct = form.discountPct.trim() ? Number(form.discountPct) : undefined;
    if (discountPct !== undefined && (Number.isNaN(discountPct) || discountPct < 1 || discountPct > 100)) {
      toast.error("Discount must be between 1 and 100");
      return;
    }

    if (isEditing && editing) {
      updateDeal.mutate(
        {
          id: editing,
          input: {
            title,
            description: form.description.trim() || null,
            discountPct: discountPct ?? null,
            validFrom: form.validFrom || undefined,
            validUntil: form.validUntil || null,
            active: form.active,
          },
        },
        {
          onSuccess: () => finishWithImage(editing, "Deal updated"),
          onError: () => toast.error("Failed to update deal"),
        },
      );
    } else {
      createDeal.mutate(
        {
          poiId,
          title,
          description: form.description.trim() || undefined,
          discountPct,
          validFrom: form.validFrom || undefined,
          validUntil: form.validUntil || undefined,
          active: form.active,
        },
        {
          onSuccess: (created) => finishWithImage(created.id, "Deal created"),
          onError: () => toast.error("Failed to create deal"),
        },
      );
    }
  };

  const list = useMemo(() => deals ?? [], [deals]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deals — {poiName}</DialogTitle>
          <DialogDescription>
            Create and manage promotional deals shown for this shop in the app.
          </DialogDescription>
        </DialogHeader>

        {/* Existing deals */}
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading deals…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center rounded-lg border border-dashed">
              No deals yet for this shop.
            </p>
          ) : (
            list.map((d) => {
              const expired = d.validUntil ? new Date(d.validUntil) < new Date() : false;
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10">
                    {d.imageUrl ? (
                      <img
                        src={resolveAssetUrl(d.imageUrl) ?? ""}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Tag className="size-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{d.title}</p>
                      {d.discountPct ? (
                        <Badge variant="secondary">-{d.discountPct}%</Badge>
                      ) : null}
                      {!d.active ? (
                        <Badge variant="outline">Inactive</Badge>
                      ) : expired ? (
                        <Badge variant="outline">Expired</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {d.validUntil
                        ? `Ends ${new Date(d.validUntil).toLocaleDateString()}`
                        : "No end date"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(d)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      deleteDeal.mutate(d.id, {
                        onSuccess: () => toast.success("Deal deleted"),
                        onError: () => toast.error("Failed to delete deal"),
                      })
                    }
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* Add / edit form */}
        {editing === null ? (
          <Button variant="outline" onClick={openNew}>
            <Plus className="size-4" data-icon="inline-start" />
            Add Deal
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{isEditing ? "Edit deal" : "New deal"}</h3>
              <Button type="button" variant="ghost" size="icon-sm" onClick={closeForm}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="deal-title">Title</Label>
              <Input
                id="deal-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. 50% off Summer Collection"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="deal-desc">Description</Label>
              <textarea
                id="deal-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Optional promo copy shown on the deal page."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Banner image */}
            <div className="grid gap-2">
              <Label>Banner image</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Deal banner" className="size-full object-cover" />
                  ) : (
                    <ImageOff className="size-4 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setImageFile(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    {imagePreview ? "Replace image" : "Upload image"}
                  </Button>
                  {imageFile ? (
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setImageFile(null)}>
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Optional. Resized to a WebP banner on save.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="deal-discount">Discount %</Label>
                <Input
                  id="deal-discount"
                  type="number"
                  min={1}
                  max={100}
                  value={form.discountPct}
                  onChange={(e) => setForm((f) => ({ ...f, discountPct: e.target.value }))}
                  placeholder="e.g. 25"
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Button
                  type="button"
                  variant={form.active ? "default" : "outline"}
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                >
                  {form.active ? "Active" : "Inactive"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="deal-from">Start date</Label>
                <Input
                  id="deal-from"
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deal-until">End date</Label>
                <Input
                  id="deal-until"
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : isEditing ? "Save deal" : "Create deal"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
