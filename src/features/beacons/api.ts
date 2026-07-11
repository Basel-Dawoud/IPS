import { axiosClient } from "@/lib/axiosClient";
import type { Beacon, CreateBeaconInput, UpdateBeaconInput } from "./types";

export async function getBeaconsByBuilding(buildingId: string): Promise<Beacon[]> {
  const res = await axiosClient.get(`/admin/beacons/building/${buildingId}`);
  return res.data.data;
}

export async function createBeacon(input: CreateBeaconInput): Promise<Beacon> {
  const res = await axiosClient.post("/admin/beacons", input);
  return res.data.data;
}

export async function updateBeacon(id: string, input: UpdateBeaconInput): Promise<Beacon> {
  const res = await axiosClient.patch(`/admin/beacons/${id}`, input);
  return res.data.data;
}

export async function deleteBeacon(id: string): Promise<void> {
  await axiosClient.delete(`/admin/beacons/${id}`);
}
