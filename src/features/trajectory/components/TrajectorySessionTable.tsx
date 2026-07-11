import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Film, Trash2 } from "lucide-react";
import type { TrajectorySession } from "../types";

interface TrajectorySessionTableProps {
  sessions: TrajectorySession[];
  onExport: (session: TrajectorySession) => void;
  onReplay: (session: TrajectorySession) => void;
  onDelete: (session: TrajectorySession) => void;
  exportingId?: string | null;
  replayingId?: string | null;
}

function statusVariant(status: string) {
  switch (status) {
    case "COMPLETED":
      return "default" as const;
    case "IN_PROGRESS":
      return "secondary" as const;
    case "ARCHIVED":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export function TrajectorySessionTable({
  sessions,
  onExport,
  onReplay,
  onDelete,
  exportingId,
  replayingId,
}: TrajectorySessionTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Floor</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Walks</TableHead>
          <TableHead className="text-right">Steps</TableHead>
          <TableHead>Started</TableHead>
          <TableHead className="text-right">Raw export</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={8}
              className="text-center text-muted-foreground py-8"
            >
              No trajectory sessions for this building.
            </TableCell>
          </TableRow>
        ) : (
          sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell className="font-medium">
                {session.name || "Untitled Walk Session"}
              </TableCell>
              <TableCell>{session.floorLevel}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(session.status)}>
                  {session.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {session.walkCount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {session.totalSteps}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(session.startedAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onExport(session)}
                    disabled={
                      session.walkCount === 0 || exportingId === session.id
                    }
                  >
                    <Download className="size-4" />
                    {exportingId === session.id ? "Exporting..." : "Walks JSON"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReplay(session)}
                    disabled={
                      session.walkCount === 0 || replayingId === session.id
                    }
                  >
                    <Film className="size-4" />
                    {replayingId === session.id ? "Building..." : "Replay JSON"}
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(session)}
                  aria-label="Delete trajectory session"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
