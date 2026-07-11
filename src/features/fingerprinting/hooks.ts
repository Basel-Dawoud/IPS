import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSessions,
  getSession,
  getFingerprints,
  getSessionAnalytics,
  aggregateSession,
  exportFingerprintsCsv,
  exportRawReadingsCsv,
  updateSession,
  deleteSession,
  deleteSessionPoint,
  deleteSingleFingerprint,
} from "./api";

export function useSessions(buildingId: string | undefined) {
  return useQuery({
    queryKey: ["sessions", buildingId],
    queryFn: () => getSessions(buildingId!),
    enabled: !!buildingId,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ["sessions", "detail", id],
    queryFn: () => getSession(id),
    enabled: !!id,
  });
}

export function useFingerprints(sessionId: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: ["fingerprints", sessionId, page, limit],
    queryFn: () => getFingerprints(sessionId, page, limit),
    enabled: !!sessionId,
  });
}

export function useSessionAnalytics(sessionId: string) {
  return useQuery({
    queryKey: ["analytics", sessionId],
    queryFn: () => getSessionAnalytics(sessionId),
    enabled: !!sessionId,
  });
}

export function useAggregateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aggregateSession(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["analytics", id] });
    },
  });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; status?: "IN_PROGRESS" | "COMPLETED" | "ARCHIVED" };
    }) => updateSession(id, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["sessions", "detail", vars.id] });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useDeleteSessionPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      x,
      y,
    }: {
      sessionId: string;
      x: number;
      y: number;
    }) => deleteSessionPoint(sessionId, x, y),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fingerprints", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["analytics", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useDeleteSingleFingerprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      fingerprintId,
    }: {
      sessionId: string;
      fingerprintId: string;
    }) => deleteSingleFingerprint(sessionId, fingerprintId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fingerprints", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["analytics", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

// ── Export helpers ──

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useExportFingerprintsCsv() {
  return useMutation({
    mutationFn: ({ id }: { id: string; floorLevel?: number }) => exportFingerprintsCsv(id),
    onSuccess: (blob, { id, floorLevel }) => {
      const floorStr = floorLevel !== undefined ? `-floor-${floorLevel}` : "";
      downloadBlob(blob, `session-${id}${floorStr}-fingerprints.csv`);
    },
  });
}

export function useExportRawReadingsCsv() {
  return useMutation({
    mutationFn: ({ id }: { id: string; floorLevel?: number }) => exportRawReadingsCsv(id),
    onSuccess: (blob, { id, floorLevel }) => {
      const floorStr = floorLevel !== undefined ? `-floor-${floorLevel}` : "";
      downloadBlob(blob, `session-${id}${floorStr}-raw-readings.csv`);
    },
  });
}
