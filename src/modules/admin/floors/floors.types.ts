export interface CreateFloorInput {
  buildingId: string;
  level: number;
  name: string;
  mapUrl?: string;
}

export interface UpdateFloorInput {
  level?: number;
  name?: string;
  mapUrl?: string;
}
