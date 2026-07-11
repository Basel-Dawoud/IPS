import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPois,
  createPoi,
  updatePoi,
  deletePoi,
  uploadPoiIcon,
  getFloorsForBuilding,
  getPoiCategories,
  getPoiById,
  uploadPoiGalleryImage,
  deletePoiGalleryImage,
} from "./api";
import type { CreatePoiInput, UpdatePoiInput } from "./types";

export function usePois(buildingId: string, floorLevel?: number) {
  return useQuery({
    queryKey: ["pois", buildingId, floorLevel ?? "all"],
    queryFn: () => getPois(buildingId, floorLevel),
    enabled: !!buildingId,
  });
}

export function usePoiFloors(buildingId: string) {
  return useQuery({
    queryKey: ["poi-floors", buildingId],
    queryFn: () => getFloorsForBuilding(buildingId),
    enabled: !!buildingId,
  });
}

export function useCreatePoi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePoiInput) => createPoi(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["pois", variables.buildingId] });
    },
  });
}

export function useUpdatePoi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePoiInput }) =>
      updatePoi(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pois"] });
    },
  });
}

export function useDeletePoi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePoi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pois"] });
    },
  });
}

export function useUploadPoiIcon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPoiIcon(id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pois"] });
    },
  });
}

export function usePoiCategories() {
  return useQuery({
    queryKey: ["poi-categories"],
    queryFn: getPoiCategories,
  });
}

export function usePoi(id: string) {
  return useQuery({
    queryKey: ["poi", id],
    queryFn: () => getPoiById(id),
    enabled: !!id,
  });
}

export function useUploadPoiGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPoiGalleryImage(id, file),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["poi", variables.id] });
      qc.invalidateQueries({ queryKey: ["pois"] });
    },
  });
}

export function useDeletePoiGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => deletePoiGalleryImage(id, url),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["poi", variables.id] });
      qc.invalidateQueries({ queryKey: ["pois"] });
    },
  });
}
