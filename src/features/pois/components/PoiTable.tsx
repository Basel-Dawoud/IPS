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
import { MoreHorizontal, Trash2, Star } from "lucide-react";
import type { Poi } from "../types";

interface PoiTableProps {
  pois: Poi[];
  onRowClick: (poi: Poi) => void;
  onDelete: (id: string) => void;
}

export function PoiTable({ pois, onRowClick, onDelete }: PoiTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Floor</TableHead>
          <TableHead>Rating</TableHead>
          <TableHead>X</TableHead>
          <TableHead>Y</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[70px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pois.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
              No POIs found. Add one to get started.
            </TableCell>
          </TableRow>
        ) : (
          pois.map((poi) => (
            <TableRow
              key={poi.id}
              onClick={() => onRowClick(poi)}
              className="cursor-pointer hover:bg-muted/40 transition-colors"
            >
              <TableCell className="font-semibold text-foreground">{poi.name}</TableCell>
              <TableCell className="font-mono text-xs">{poi.code ?? "--"}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-medium">{poi.type}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{poi.category ?? "--"}</TableCell>
              <TableCell>{poi.floorLevel}</TableCell>
              <TableCell>
                {poi.reviewCount && poi.reviewCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-medium">{(poi.avgRating ?? 0).toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">({poi.reviewCount})</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </TableCell>
              <TableCell>{poi.x.toFixed(2)}</TableCell>
              <TableCell>{poi.y.toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={poi.active ? "default" : "secondary"}>
                  {poi.active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(poi.id);
                      }}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete POI
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
