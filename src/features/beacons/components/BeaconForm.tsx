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
import type { Beacon, CreateBeaconInput } from "../types";

interface BeaconFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beacon?: Beacon | null;
  buildingId: string;
  onSubmit: (data: CreateBeaconInput) => void;
}

export function BeaconForm({ open, onOpenChange, beacon, buildingId, onSubmit }: BeaconFormProps) {
  const [beaconUid, setBeaconUid] = useState("");
  const [floorLevel, setFloorLevel] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [txPowerDbm, setTxPowerDbm] = useState("");
  const [refRssi1mDbm, setRefRssi1mDbm] = useState("");

  useEffect(() => {
    if (beacon) {
      setBeaconUid(beacon.beaconUid);
      setFloorLevel(String(beacon.floorLevel));
      setX(String(beacon.x));
      setY(String(beacon.y));
      setTxPowerDbm(beacon.txPowerDbm != null ? String(beacon.txPowerDbm) : "");
      setRefRssi1mDbm(beacon.refRssi1mDbm != null ? String(beacon.refRssi1mDbm) : "");
    } else {
      setBeaconUid("");
      setFloorLevel("");
      setX("");
      setY("");
      setTxPowerDbm("");
      setRefRssi1mDbm("");
    }
  }, [beacon, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      beaconUid,
      buildingId,
      floorLevel: Number(floorLevel),
      x: Number(x),
      y: Number(y),
      txPowerDbm: txPowerDbm ? Number(txPowerDbm) : undefined,
      refRssi1mDbm: refRssi1mDbm ? Number(refRssi1mDbm) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{beacon ? "Edit Beacon" : "Add Beacon"}</DialogTitle>
            <DialogDescription>
              {beacon
                ? "Update the beacon details below."
                : "Fill in the details to add a new beacon."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="beaconUid">Beacon UID</Label>
              <Input
                id="beaconUid"
                value={beaconUid}
                onChange={(e) => setBeaconUid(e.target.value)}
                placeholder="iBeacon UUID+major+minor"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="floorLevel">Floor Level</Label>
                <Input
                  id="floorLevel"
                  type="number"
                  value={floorLevel}
                  onChange={(e) => setFloorLevel(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="beacon-x">X (m)</Label>
                <Input
                  id="beacon-x"
                  type="number"
                  step="0.01"
                  value={x}
                  onChange={(e) => setX(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="beacon-y">Y (m)</Label>
                <Input
                  id="beacon-y"
                  type="number"
                  step="0.01"
                  value={y}
                  onChange={(e) => setY(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="txPower">Tx Power (dBm)</Label>
                <Input
                  id="txPower"
                  type="number"
                  step="0.1"
                  value={txPowerDbm}
                  onChange={(e) => setTxPowerDbm(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="refRssi">Ref RSSI 1m (dBm)</Label>
                <Input
                  id="refRssi"
                  type="number"
                  step="0.1"
                  value={refRssi1mDbm}
                  onChange={(e) => setRefRssi1mDbm(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">{beacon ? "Save Changes" : "Add Beacon"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
