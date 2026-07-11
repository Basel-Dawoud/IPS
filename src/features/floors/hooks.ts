import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFloorsByBuilding,
  getFloorById,
  createFloor,
  updateFloor,
  deleteFloor,
  uploadFloorImage,
  detectFloorTransitions,
} from "./api";
import type { CreateFloorInput, UpdateFloorInput } from "./types";

export function useFloorsByBuilding(buildingId: string) {
  return useQuery({
    queryKey: ["floors", buildingId],
    queryFn: () => getFloorsByBuilding(buildingId),
    enabled: !!buildingId,
  });
}

export function useFloor(id: string) {
  return useQuery({
    queryKey: ["floors", "byId", id],
    queryFn: () => getFloorById(id),
    enabled: !!id,
  });
}

export function useCreateFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFloorInput) => createFloor(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["floors", variables.buildingId] });
    },
  });
}

export function useUpdateFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFloorInput }) =>
      updateFloor(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["floors"] });
    },
  });
}

export function useDeleteFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFloor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["floors"] });
    },
  });
}

export function useUploadFloorImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadFloorImage(id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["floors"] });
    },
  });
}

export function useDetectFloorTransitions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => detectFloorTransitions(id),
    onSuccess: () => {
      // New POIs were created — refresh POI lists.
      qc.invalidateQueries({ queryKey: ["pois"] });
    },
  });
}
