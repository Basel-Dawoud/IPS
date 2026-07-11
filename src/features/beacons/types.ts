export interface Beacon {
  id: string;
  beaconUid: string;
  buildingId: string;
  floorLevel: number;
  x: number;
  y: number;
  txPowerDbm: number | null;
  refRssi1mDbm: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBeaconInput {
  beaconUid: string;
  buildingId: string;
  floorLevel: number;
  x: number;
  y: number;
  txPowerDbm?: number;
  refRssi1mDbm?: number;
  active?: boolean;
}

export interface UpdateBeaconInput {
  beaconUid?: string;
  buildingId?: string;
  floorLevel?: number;
  x?: number;
  y?: number;
  txPowerDbm?: number;
  refRssi1mDbm?: number;
  active?: boolean;
}
