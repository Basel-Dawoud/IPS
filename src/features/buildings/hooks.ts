import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Polygon } from "geojson";
import {
  clearBuildingZone,
  createBuilding,
  deleteBuilding,
  getBuilding,
  getBuildings,
  updateBuilding,
  updateBuildingZone,
  uploadBuildingImage,
  getEmergencyState,
  triggerEmergency,
  clearEmergency,
} from "./api";
import type { BlockedZone } from "./api";
import type { CreateBuildingInput, UpdateBuildingInput } from "./types";

export function useBuildings() {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: getBuildings,
  });
}

export function useBuilding(id: string) {
  return useQuery({
    queryKey: ["buildings", id],
    queryFn: () => getBuilding(id),
    enabled: !!id,
  });
}

export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBuildingInput) => createBuilding(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
    },
  });
}

export function useUpdateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBuildingInput }) =>
      updateBuilding(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
    },
  });
}

export function useDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBuilding(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
    },
  });
}

export function useUpdateBuildingZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, zone }: { id: string; zone: Polygon }) =>
      updateBuildingZone(id, zone),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["buildings", vars.id] });
    },
  });
}

export function useClearBuildingZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clearBuildingZone(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["buildings", id] });
    },
  });
}

export function useUploadBuildingImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadBuildingImage(id, file),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["buildings", vars.id] });
    },
  });
}

export function useEmergencyState(buildingId: string) {
  return useQuery({
    queryKey: ["emergency", buildingId],
    queryFn: () => getEmergencyState(buildingId),
    enabled: !!buildingId,
  });
}

export function useTriggerEmergency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      buildingId,
      input,
    }: {
      buildingId: string;
      input: {
        gatheringPointId?: string | null;
        blockedPoiIds?: string[];
        blockedZones?: BlockedZone[];
        message?: string;
      };
    }) => triggerEmergency(buildingId, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["emergency", vars.buildingId] });
    },
  });
}

export function useClearEmergency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (buildingId: string) => clearEmergency(buildingId),
    onSuccess: (_data, buildingId) => {
      qc.invalidateQueries({ queryKey: ["emergency", buildingId] });
    },
  });
}
