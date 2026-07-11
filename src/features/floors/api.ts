import { axiosClient } from "@/lib/axiosClient";
import type { Floor, CreateFloorInput, UpdateFloorInput } from "./types";

export async function getFloorsByBuilding(buildingId: string): Promise<Floor[]> {
  // Backend serves the path-param route, not a query param.
  const res = await axiosClient.get(`/admin/floors/building/${buildingId}`);
  return res.data.data;
}

export async function getFloorById(id: string): Promise<Floor> {
  const res = await axiosClient.get(`/admin/floors/${id}`);
  return res.data.data;
}

export async function createFloor(input: CreateFloorInput): Promise<Floor> {
  const res = await axiosClient.post("/admin/floors", input);
  return res.data.data;
}

export async function updateFloor(id: string, input: UpdateFloorInput): Promise<Floor> {
  const res = await axiosClient.patch(`/admin/floors/${id}`, input);
  return res.data.data;
}

export async function deleteFloor(id: string): Promise<void> {
  await axiosClient.delete(`/admin/floors/${id}`);
}

// Backfill: re-derive STAIRS/ELEVATOR POIs from the floor's stored vector map
// (for floors uploaded before auto-create existed). Returns the created counts.
export async function detectFloorTransitions(
  id: string,
): Promise<{ createdStairs: number; createdElevators: number }> {
  const res = await axiosClient.post(`/admin/floors/${id}/detect-transitions`);
  return res.data.data;
}

// Uploads a floor plan image (multipart). The backend stores it, reads its
// pixel dimensions, and returns the updated floor with mapUrl + imageWidthPx/Px.
export async function uploadFloorImage(id: string, file: File): Promise<Floor> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await axiosClient.post(`/admin/floors/${id}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}
