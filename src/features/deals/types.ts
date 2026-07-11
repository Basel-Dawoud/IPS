export interface Deal {
  id: string;
  poiId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountPct: number | null;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  poi?: {
    id: string;
    name: string;
    floorLevel: number;
  };
}

export interface CreateDealInput {
  poiId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  discountPct?: number;
  validFrom?: string;
  validUntil?: string;
  active?: boolean;
}

export interface UpdateDealInput {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  discountPct?: number | null;
  validFrom?: string;
  validUntil?: string | null;
  active?: boolean;
}
