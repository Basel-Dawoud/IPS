import { axiosClient } from "@/lib/axiosClient";
import type { PoiReview } from "./types";

// Reviews are served by the guest-accessible client endpoint (no auth); the
// dashboard reuses it read-only. Returns reviews newest-first with the author.
export async function getReviewsByPoi(poiId: string): Promise<PoiReview[]> {
  const res = await axiosClient.get(`/client/recommendations/${poiId}/reviews`);
  return res.data.data;
}
