export interface CreateBeaconInput {
  beaconUid: string;
  buildingId: string;
  floorLevel: number;
  x: number;
  y: number;
  txPowerDbm?: number;
  refRssi1mDbm?: number;
  serviceData?: string;
}

export interface UpdateBeaconInput {
  beaconUid?: string;
  floorLevel?: number;
  x?: number;
  y?: number;
  txPowerDbm?: number;
  refRssi1mDbm?: number;
  active?: boolean;
  serviceData?: string;
}
