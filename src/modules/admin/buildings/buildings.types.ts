export interface CreateBuildingInput {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateBuildingInput {
  code?: string;
  name?: string;
  description?: string;
}
