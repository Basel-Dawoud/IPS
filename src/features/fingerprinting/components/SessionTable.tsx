import { Link } from "react-router-dom";
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
import { Trash2 } from "lucide-react";
import type { FingerprintSession } from "../types";

interface SessionTableProps {
  sessions: FingerprintSession[];
  onDelete: (session: FingerprintSession) => void;
  adIntervalMs?: number;
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

export function SessionTable({
  sessions,
  onDelete,
  adIntervalMs = 200,
}: SessionTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Floor</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Points</TableHead>
          <TableHead className="text-right">Samples</TableHead>
          <TableHead className="text-right">Reads/beacon</TableHead>
          <TableHead>Started</TableHead>
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
              No fingerprint sessions for this building.
            </TableCell>
          </TableRow>
        ) : (
          sessions.map((session) => {
            const reads = session.pointDurationMs
              ? Math.round(session.pointDurationMs / adIntervalMs)
              : null;
            return (
              <TableRow key={session.id}>
                <TableCell>
                  <Link
                    to={`/fingerprinting/${session.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {session.name || "Untitled Session"}
                  </Link>
                </TableCell>
                <TableCell>{session.floorLevel}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(session.status)}>
                    {session.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {session.uniquePointCount ?? "--"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {session.fingerprintCount ?? "--"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {reads ?? "--"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(session.startedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(session)}
                    aria-label="Delete session"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
