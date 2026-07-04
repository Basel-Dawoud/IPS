export interface CreateDealInput {
  poiId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  discountPct?: number;
  validFrom?: Date;
  validUntil?: Date;
  active?: boolean;
}

export interface UpdateDealInput {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  discountPct?: number | null;
  validFrom?: Date;
  validUntil?: Date | null;
  active?: boolean;
}
