export type TrajectoryStatus = "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";

/**
 * Trajectory collection session (continuous walks), as returned by
 * `GET /admin/trajectory/sessions?buildingId=...` — mapped to
 * `TrajectorySessionWithStats` on the backend.
 */
export interface TrajectorySession {
  id: string;
  buildingId: string;
  floorLevel: number;
  name: string | null;
  deviceModel: string | null;
  notes: string | null;
  status: TrajectoryStatus;
  startedAt: string;
  completedAt: string | null;
  walkCount: number;
  totalSteps: number;
}
