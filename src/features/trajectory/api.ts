import { axiosClient } from "@/lib/axiosClient";
import type { TrajectorySession } from "./types";

// ── Sessions ──

export async function getTrajectorySessions(
  buildingId: string,
  floorLevel?: number,
  status?: string
): Promise<TrajectorySession[]> {
  const params: Record<string, string | number> = { buildingId };
  if (floorLevel !== undefined) params.floorLevel = floorLevel;
  if (status) params.status = status;
  const res = await axiosClient.get(`/admin/trajectory/sessions`, { params });
  return res.data.data;
}

export async function deleteTrajectorySession(id: string): Promise<void> {
  await axiosClient.delete(`/admin/trajectory/sessions/${id}`);
}

// ── Raw data export ──

/**
 * The trajectory export/replay endpoints are cursor-paginated (max 100 walks
 * per request). This walks every page and assembles one combined JSON payload
 * the AI team can download in a single file.
 */
async function fetchAllWalkPages(
  id: string,
  endpoint: "export" | "replay"
): Promise<{ session: unknown; walks: unknown[] }> {
  let cursor: string | null | undefined = undefined;
  let session: unknown = null;
  const walks: unknown[] = [];

  do {
    const params: Record<string, string | number> = { limit: 25 };
    if (cursor) params.cursor = cursor;
    const res = await axiosClient.get<{
      session?: unknown;
      walks?: unknown[];
      nextCursor?: string | null;
    }>(`/admin/trajectory/sessions/${id}/${endpoint}`, {
      params,
      timeout: 300_000,
    });
    if (res.data.session) session = res.data.session;
    if (Array.isArray(res.data.walks)) walks.push(...res.data.walks);
    cursor = res.data.nextCursor;
  } while (cursor);

  return { session, walks };
}

/** Full raw walk payload: steps, ~20Hz IMU stream, BLE, WiFi, checkpoints. */
export function exportTrajectorySession(id: string) {
  return fetchAllWalkPages(id, "export");
}

/**
 * Replay tape: per-walk anchor polyline + a time-ordered event stream, each
 * event tagged with its interpolated ground-truth (x, y). Best for offline
 * model evaluation.
 */
export function replayTrajectorySession(id: string) {
  return fetchAllWalkPages(id, "replay");
}
