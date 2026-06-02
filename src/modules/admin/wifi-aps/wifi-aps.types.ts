export interface CreateWifiApInput {
  buildingId: string;
  bssid: string;
  ssid?: string;
  description?: string;
  floorLevel?: number;
}

export interface UpdateWifiApInput {
  ssid?: string;
  description?: string;
  floorLevel?: number | null;
  active?: boolean;
}
