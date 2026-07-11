import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDealsByPoi, createDeal, updateDeal, deleteDeal, uploadDealImage, getDealsByBuilding } from "./api";
import type { CreateDealInput, UpdateDealInput } from "./types";

export function useDealsByPoi(poiId: string | null) {
  return useQuery({
    queryKey: ["deals", "poi", poiId],
    queryFn: () => getDealsByPoi(poiId!),
    enabled: !!poiId,
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDealInput) => createDeal(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useUpdateDeal(_poiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDealInput }) =>
      updateDeal(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useDeleteDeal(_poiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDeal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useUploadDealImage(_poiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadDealImage(id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useDealsByBuilding(buildingId: string | null) {
  return useQuery({
    queryKey: ["deals", "building", buildingId],
    queryFn: () => getDealsByBuilding(buildingId!),
    enabled: !!buildingId,
  });
}
