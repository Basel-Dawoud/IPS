import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Beacon } from "../types";

interface BeaconTableProps {
  beacons: Beacon[];
  onEdit: (beacon: Beacon) => void;
  onDelete: (id: string) => void;
}

export function BeaconTable({ beacons, onEdit, onDelete }: BeaconTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Beacon UID</TableHead>
          <TableHead>Floor</TableHead>
          <TableHead>X</TableHead>
          <TableHead>Y</TableHead>
          <TableHead>Tx Power</TableHead>
          <TableHead>Ref RSSI 1m</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[70px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {beacons.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              No beacons found. Add a beacon to get started.
            </TableCell>
          </TableRow>
        ) : (
          beacons.map((beacon) => (
            <TableRow key={beacon.id}>
              <TableCell className="font-mono text-xs">{beacon.beaconUid}</TableCell>
              <TableCell>{beacon.floorLevel}</TableCell>
              <TableCell>{beacon.x.toFixed(2)}</TableCell>
              <TableCell>{beacon.y.toFixed(2)}</TableCell>
              <TableCell>{beacon.txPowerDbm ?? "--"}</TableCell>
              <TableCell>{beacon.refRssi1mDbm ?? "--"}</TableCell>
              <TableCell>
                <Badge variant={beacon.active ? "default" : "secondary"}>
                  {beacon.active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" />}
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(beacon)}>
                      <Pencil />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(beacon.id)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
