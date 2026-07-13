import { axiosClient } from "@/lib/axiosClient";
import type { CategoryTreeNode, CategoryNode, CategoryInput } from "./types";

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const res = await axiosClient.get("/admin/categories");
  return res.data.data;
}

export async function createCategory(input: CategoryInput): Promise<CategoryNode> {
  const res = await axiosClient.post("/admin/categories", input);
  return res.data.data;
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput>,
): Promise<CategoryNode> {
  const res = await axiosClient.patch(`/admin/categories/${id}`, input);
  return res.data.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await axiosClient.delete(`/admin/categories/${id}`);
}
