import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBeaconsByBuilding, createBeacon, updateBeacon, deleteBeacon } from "./api";
import type { CreateBeaconInput, UpdateBeaconInput } from "./types";

export function useBeaconsByBuilding(buildingId: string) {
  return useQuery({
    queryKey: ["beacons", buildingId],
    queryFn: () => getBeaconsByBuilding(buildingId),
    enabled: !!buildingId,
  });
}

export function useCreateBeacon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBeaconInput) => createBeacon(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["beacons", variables.buildingId] });
    },
  });
}

export function useUpdateBeacon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBeaconInput }) =>
      updateBeacon(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beacons"] });
    },
  });
}

export function useDeleteBeacon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBeacon(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beacons"] });
    },
  });
}
