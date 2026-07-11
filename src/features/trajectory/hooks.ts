import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTrajectorySessions,
  deleteTrajectorySession,
  exportTrajectorySession,
  replayTrajectorySession,
} from "./api";

export function useTrajectorySessions(buildingId: string | undefined) {
  return useQuery({
    queryKey: ["trajectory-sessions", buildingId],
    queryFn: () => getTrajectorySessions(buildingId!),
    enabled: !!buildingId,
  });
}

export function useDeleteTrajectorySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTrajectorySession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trajectory-sessions"] });
    },
  });
}

// ── Export helpers ──

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Build a safe filename stem from the typed session name (mirrors the backend's
 * CSV export naming): lowercase, non-alphanumerics → dashes, collapsed. Falls
 * back to the short id when the session was left unnamed. The full id is always
 * appended so files stay unique even when two sessions share a name.
 */
function fileStem(id: string, name: string | null | undefined): string {
  const slug = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = slug || id.slice(0, 8);
  return `${base}-${id.slice(0, 8)}`;
}

interface TrajectoryExportArgs {
  id: string;
  name: string | null;
  floorLevel?: number;
}

export function useExportTrajectorySession() {
  return useMutation({
    mutationFn: ({ id }: TrajectoryExportArgs) => exportTrajectorySession(id),
    onSuccess: (data, { id, name, floorLevel }) => {
      const floorStr = floorLevel !== undefined ? `-floor-${floorLevel}` : "";
      downloadJson(data, `trajectory-${fileStem(id, name)}${floorStr}-export.json`);
    },
  });
}

export function useReplayTrajectorySession() {
  return useMutation({
    mutationFn: ({ id }: TrajectoryExportArgs) => replayTrajectorySession(id),
    onSuccess: (data, { id, name, floorLevel }) => {
      const floorStr = floorLevel !== undefined ? `-floor-${floorLevel}` : "";
      downloadJson(data, `trajectory-${fileStem(id, name)}${floorStr}-replay.json`);
    },
  });
}
