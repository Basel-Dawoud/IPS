import { axiosClient } from "@/lib/axiosClient";
import type { Polygon } from "geojson";
import type { Building, CreateBuildingInput, UpdateBuildingInput } from "./types";

export async function getBuildings(): Promise<Building[]> {
  const res = await axiosClient.get("/admin/buildings");
  return res.data.data;
}

export async function getBuilding(id: string): Promise<Building> {
  const res = await axiosClient.get(`/admin/buildings/${id}`);
  return res.data.data;
}

export async function createBuilding(input: CreateBuildingInput): Promise<Building> {
  const res = await axiosClient.post("/admin/buildings", input);
  return res.data.data;
}

export async function updateBuilding(id: string, input: UpdateBuildingInput): Promise<Building> {
  const res = await axiosClient.patch(`/admin/buildings/${id}`, input);
  return res.data.data;
}

export async function deleteBuilding(id: string): Promise<void> {
  await axiosClient.delete(`/admin/buildings/${id}`);
}

export async function updateBuildingZone(id: string, zone: Polygon): Promise<void> {
  await axiosClient.put(`/admin/buildings/${id}/zone`, { zone });
}

export async function clearBuildingZone(id: string): Promise<void> {
  await axiosClient.delete(`/admin/buildings/${id}/zone`);
}

export async function uploadBuildingImage(id: string, file: File): Promise<Building> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await axiosClient.post(`/admin/buildings/${id}/image`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data.data;
}

export interface BlockedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  floorLevel: number;
}

export interface EmergencyAlert {
  id: string;
  buildingId: string;
  isActive: boolean;
  message: string | null;
  gatheringPointId: string | null;
  blockedPoiIds: string[];
  blockedZones: BlockedZone[];
  createdAt: string;
  updatedAt: string;
}

export async function getEmergencyState(buildingId: string): Promise<EmergencyAlert> {
  const res = await axiosClient.get(`/admin/buildings/${buildingId}/emergency`);
  return res.data.data;
}

export async function triggerEmergency(
  buildingId: string,
  input: {
    gatheringPointId?: string | null;
    blockedPoiIds?: string[];
    blockedZones?: BlockedZone[];
    message?: string;
  }
): Promise<EmergencyAlert> {
  const res = await axiosClient.post(`/admin/buildings/${buildingId}/emergency`, input);
  return res.data.data;
}

export async function clearEmergency(buildingId: string): Promise<EmergencyAlert> {
  const res = await axiosClient.post(`/admin/buildings/${buildingId}/emergency/clear`);
  return res.data.data;
}
