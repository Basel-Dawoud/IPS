import { axiosClient } from "@/lib/axiosClient";
import type { Poi, CreatePoiInput, UpdatePoiInput, PoiFloor } from "./types";

export async function getPois(buildingId: string, floorLevel?: number): Promise<Poi[]> {
  const params: Record<string, string> = { buildingId };
  if (floorLevel !== undefined) params.floorLevel = String(floorLevel);
  const res = await axiosClient.get("/admin/pois", { params });
  return res.data.data;
}

export async function createPoi(input: CreatePoiInput): Promise<Poi> {
  const res = await axiosClient.post("/admin/pois", input);
  return res.data.data;
}

export async function updatePoi(id: string, input: UpdatePoiInput): Promise<Poi> {
  const res = await axiosClient.patch(`/admin/pois/${id}`, input);
  return res.data.data;
}

export async function deletePoi(id: string): Promise<void> {
  await axiosClient.delete(`/admin/pois/${id}`);
}

// Uploads a marker icon; the backend compresses/resizes it to a small WebP and
// returns the updated POI with its iconUrl populated.
export async function uploadPoiIcon(id: string, file: File): Promise<Poi> {
  const formData = new FormData();
  formData.append("icon", file);
  const res = await axiosClient.post(`/admin/pois/${id}/icon`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

// Floors are fetched via the path-param route the backend actually serves
// (`/admin/floors/building/:buildingId`), so the POI picker gets each floor's
// mapUrl + real-world extent.
export async function getFloorsForBuilding(buildingId: string): Promise<PoiFloor[]> {
  const res = await axiosClient.get(`/admin/floors/building/${buildingId}`);
  return res.data.data;
}

export interface PoiCategory {
  id: string;
  name: string;
}

export async function getPoiCategories(): Promise<PoiCategory[]> {
  const res = await axiosClient.get("/client/user/categories");
  return res.data.data;
}

export async function getPoiById(id: string): Promise<Poi> {
  const res = await axiosClient.get(`/admin/pois/${id}`);
  return res.data.data;
}

export async function uploadPoiGalleryImage(id: string, file: File): Promise<Poi> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await axiosClient.post(`/admin/pois/${id}/gallery`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

export async function deletePoiGalleryImage(id: string, url: string): Promise<Poi> {
  const res = await axiosClient.delete(`/admin/pois/${id}/gallery`, {
    params: { url },
  });
  return res.data.data;
}
