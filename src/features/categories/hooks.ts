import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCategoryTree,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./api";
import type { CategoryInput } from "./types";

export function useCategoryTree() {
  return useQuery({ queryKey: ["category-tree"], queryFn: getCategoryTree });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["category-tree"] });
    qc.invalidateQueries({ queryKey: ["poi-categories"] });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CategoryInput> }) =>
      updateCategory(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: invalidate,
  });
}
