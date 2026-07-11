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
import { MoreHorizontal, SquareArrowOutUpRight, Trash2, ImageOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Building } from "../types";
import { resolveAssetUrl } from "@/lib/assets";

interface BuildingTableProps {
  buildings: Building[];
  onDelete: (id: string) => void;
}

export function BuildingTable({ buildings, onDelete }: BuildingTableProps) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="w-[70px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {buildings.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
              No buildings found. Create your first building to get started.
            </TableCell>
          </TableRow>
        ) : (
          buildings.map((building) => (
            <TableRow
              key={building.id}
              className="cursor-pointer"
              onClick={() => navigate(`/buildings/${building.id}`)}
            >
              <TableCell className="font-mono font-medium">{building.code}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {building.imageUrl ? (
                      <img
                        src={resolveAssetUrl(building.imageUrl) || undefined}
                        alt="Building preview"
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageOff className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <span>{building.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {building.description || "--"}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/buildings/${building.id}`)}>
                      <SquareArrowOutUpRight />
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(building.id)}
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
