import { useState } from "react";
import { Plus, Pencil, Trash2, Tags, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  useCategoryTree,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "./hooks";
import type { CategoryNode, CategoryTreeNode } from "./types";

const toCsv = (a: string[]) => a.join(", ");
const fromCsv = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

type EditorState =
  | { mode: "create-category" }
  | { mode: "create-sub"; parentId: string; parentName: string }
  | { mode: "edit"; node: CategoryNode };

export function CategoriesPage() {
  const { data: tree, isLoading } = useCategoryTree();
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();

  const [editor, setEditor] = useState<EditorState | null>(null);

  const handleDelete = (node: CategoryNode) => {
    if (!window.confirm(`Delete "${node.name}"? This can't be undone.`)) return;
    deleteMut.mutate(node.id, {
      onSuccess: () => toast.success(`Deleted "${node.name}"`),
      onError: (e: any) =>
        toast.error(e?.response?.data?.error ?? "Failed to delete category"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Tags className="size-6" /> Categories
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Interest categories and their sub-categories. Keywords are suggested onto POIs.
          </p>
        </div>
        <Button onClick={() => setEditor({ mode: "create-category" })}>
          <Plus className="size-4" /> Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {(tree ?? []).map((parent) => (
            <ParentCard
              key={parent.id}
              parent={parent}
              onAddSub={() =>
                setEditor({ mode: "create-sub", parentId: parent.id, parentName: parent.name })
              }
              onEdit={(node) => setEditor({ mode: "edit", node })}
              onDelete={handleDelete}
            />
          ))}
          {(tree ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          )}
        </div>
      )}

      {editor && (
        <CategoryDialog
          editor={editor}
          saving={createMut.isPending || updateMut.isPending}
          onClose={() => setEditor(null)}
          onSubmit={(input) => {
            const done = {
              onSuccess: () => {
                toast.success("Saved");
                setEditor(null);
              },
              onError: (e: any) =>
                toast.error(e?.response?.data?.error ?? "Failed to save category"),
            };
            if (editor.mode === "edit") {
              updateMut.mutate({ id: editor.node.id, input }, done);
            } else {
              const parentId = editor.mode === "create-sub" ? editor.parentId : null;
              createMut.mutate({ ...input, parentId }, done);
            }
          }}
        />
      )}
    </div>
  );
}

function ParentCard({
  parent,
  onAddSub,
  onEdit,
  onDelete,
}: {
  parent: CategoryTreeNode;
  onAddSub: () => void;
  onEdit: (n: CategoryNode) => void;
  onDelete: (n: CategoryNode) => void;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{parent.name}</span>
            <span className="text-[10px] uppercase tracking-wide rounded bg-primary/10 text-primary px-1.5 py-0.5">
              Category
            </span>
          </div>
          {parent.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{parent.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {parent.children.length} sub-categories · {parent.poiCount} POIs
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={onAddSub}>
            <Plus className="size-3.5" /> Sub
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onEdit(parent)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(parent)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      {parent.children.length > 0 && (
        <div className="divide-y border-t">
          {parent.children.map((child) => (
            <div key={child.id} className="flex items-start justify-between gap-3 px-4 py-2.5 pl-6">
              <div className="min-w-0">
                <span className="text-sm font-medium">{child.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {child.keywords.length} keywords · {child.poiCount} POIs · {child.productCount} products
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(child)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(child)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryDialog({
  editor,
  saving,
  onClose,
  onSubmit,
}: {
  editor: EditorState;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string | null; keywords: string[] }) => void;
}) {
  const existing = editor.mode === "edit" ? editor.node : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [keywords, setKeywords] = useState(toCsv(existing?.keywords ?? []));

  const title =
    editor.mode === "edit"
      ? `Edit "${existing!.name}"`
      : editor.mode === "create-sub"
        ? `Add sub-category to "${editor.parentName}"`
        : "Add category";

  const isSub = editor.mode === "create-sub" || (existing?.parentId != null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit({
              name: name.trim(),
              description: description.trim() || null,
              keywords: fromCsv(keywords),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isSub
                ? "Sub-categories hold product keywords suggested onto POIs."
                : "Top-level categories are the interests users pick during onboarding."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Input
                id="cat-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short blurb shown in onboarding"
              />
            </div>
            {isSub && (
              <div className="grid gap-2">
                <Label htmlFor="cat-kw">Keywords (comma-separated)</Label>
                <Input
                  id="cat-kw"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="phone, iphone, samsung, تليفون"
                />
                <p className="text-xs text-muted-foreground">
                  Suggested onto a POI's product keywords when this sub-category is assigned.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
