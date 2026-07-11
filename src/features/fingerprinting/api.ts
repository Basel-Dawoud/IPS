import { axiosClient } from "@/lib/axiosClient";
import type {
  FingerprintSession,
  Fingerprint,
  SessionAnalytics,
} from "./types";

// ── Sessions ──

export async function getSessions(
  buildingId: string,
  floorLevel?: number,
  status?: string
): Promise<FingerprintSession[]> {
  const params: Record<string, string | number> = {};
  if (floorLevel !== undefined) params.floorLevel = floorLevel;
  if (status) params.status = status;
  const res = await axiosClient.get(
    `/admin/fingerprinting/sessions/${buildingId}`,
    { params }
  );
  return res.data.data;
}

export async function getSession(id: string): Promise<FingerprintSession> {
  const res = await axiosClient.get(`/admin/fingerprinting/session/${id}`);
  return res.data.data;
}

export async function updateSession(
  id: string,
  input: { name?: string; status?: "IN_PROGRESS" | "COMPLETED" | "ARCHIVED" }
): Promise<FingerprintSession> {
  const res = await axiosClient.patch(
    `/admin/fingerprinting/session/${id}`,
    input
  );
  return res.data.data;
}

export async function deleteSession(id: string): Promise<void> {
  await axiosClient.delete(`/admin/fingerprinting/session/${id}`);
}

// ── Fingerprints (per-session, paginated) ──

export async function getFingerprints(
  sessionId: string,
  page = 1,
  limit = 50
): Promise<{
  data: Fingerprint[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const res = await axiosClient.get(
    `/admin/fingerprinting/session/${sessionId}/fingerprints`,
    { params: { page, limit } }
  );
  return { data: res.data.data, pagination: res.data.pagination };
}

// ── Analytics ──

export async function getSessionAnalytics(
  sessionId: string
): Promise<SessionAnalytics> {
  const res = await axiosClient.get(
    `/admin/fingerprinting/session/${sessionId}/analytics`
  );
  return res.data.data;
}

// ── Aggregation ──

export async function aggregateSession(id: string): Promise<{
  pointsProcessed: number;
  pointsCreated: number;
  pointsUpdated: number;
}> {
  const res = await axiosClient.post(
    `/admin/fingerprinting/session/${id}/aggregate`
  );
  return res.data.data;
}

// ── Exports ──

/**
 * Aggregated CSV: one row per fingerprint sample, wide format
 * (one column per beacon UID with its median RSSI).
 */
export async function exportFingerprintsCsv(id: string): Promise<Blob> {
  const res = await axiosClient.get(
    `/admin/fingerprinting/session/${id}/export`,
    { responseType: "blob", timeout: 300_000 }
  );
  return res.data;
}

/**
 * Raw per-advertisement CSV for ML training:
 * (capturedAt, x, y, floorLevel, beaconUid, rssi, gyroX/Y/Z, fingerprintId).
 */
export async function exportRawReadingsCsv(id: string): Promise<Blob> {
  const res = await axiosClient.get(
    `/admin/fingerprinting/session/${id}/export-raw`,
    { responseType: "blob", timeout: 300_000 }
  );
  return res.data;
}

/**
 * Delete all samples at a specific (x, y) within the session.
 * Used to remove duplicate / bad-quality points.
 */
export async function deleteSessionPoint(
  sessionId: string,
  x: number,
  y: number
): Promise<{ deleted: number }> {
  const res = await axiosClient.delete(
    `/admin/fingerprinting/session/${sessionId}/point`,
    { params: { x, y } }
  );
  return res.data.data;
}

/**
 * Delete a single fingerprint sample by ID within a session.
 */
export async function deleteSingleFingerprint(
  sessionId: string,
  fingerprintId: string
): Promise<{ deleted: number }> {
  const res = await axiosClient.delete(
    `/admin/fingerprinting/session/${sessionId}/fingerprint/${fingerprintId}`
  );
  return res.data.data;
}
