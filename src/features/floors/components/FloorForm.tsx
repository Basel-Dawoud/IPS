import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Floor, CreateFloorInput } from "../types";

interface FloorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floor?: Floor | null;
  buildingId: string;
  onSubmit: (data: CreateFloorInput) => void;
}

/**
 * Create / rename a floor (level + name only). The plan image upload and
 * pixel↔meter calibration live on the floor detail page (FloorCalibrator).
 */
export function FloorForm({ open, onOpenChange, floor, buildingId, onSubmit }: FloorFormProps) {
  const [level, setLevel] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (floor) {
      setLevel(String(floor.level));
      setName(floor.name);
    } else {
      setLevel("");
      setName("");
    }
  }, [floor, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ buildingId, level: Number(level), name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{floor ? "Edit Floor" : "Add Floor"}</DialogTitle>
            <DialogDescription>
              {floor
                ? "Update the floor level and name."
                : "Add a floor. Upload its map and calibrate it from the floor page."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <div className="grid gap-2">
              <Label htmlFor="level">Level</Label>
              <Input
                id="level"
                type="number"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="e.g. 0, 1, 2"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="floor-name">Name</Label>
              <Input
                id="floor-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ground Floor"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">{floor ? "Save Changes" : "Add Floor"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
