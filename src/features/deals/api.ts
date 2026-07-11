import { axiosClient } from "@/lib/axiosClient";
import type { Deal, CreateDealInput, UpdateDealInput } from "./types";

export async function getDealsByPoi(poiId: string): Promise<Deal[]> {
  const res = await axiosClient.get(`/admin/deals/poi/${poiId}`);
  return res.data.data;
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const res = await axiosClient.post("/admin/deals", input);
  return res.data.data;
}

export async function updateDeal(id: string, input: UpdateDealInput): Promise<Deal> {
  const res = await axiosClient.patch(`/admin/deals/${id}`, input);
  return res.data.data;
}

export async function deleteDeal(id: string): Promise<void> {
  await axiosClient.delete(`/admin/deals/${id}`);
}

// Uploads a deal banner; the backend resizes it to a WebP and returns the
// updated deal with its imageUrl populated.
export async function uploadDealImage(id: string, file: File): Promise<Deal> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await axiosClient.post(`/admin/deals/${id}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

export async function getDealsByBuilding(buildingId: string): Promise<Deal[]> {
  const res = await axiosClient.get(`/admin/deals/building/${buildingId}`);
  return res.data.data;
}
