export interface CategoryNode {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  parentId: string | null;
  poiCount: number;
  productCount: number;
}

export interface CategoryTreeNode extends CategoryNode {
  children: CategoryNode[];
}

export interface CategoryInput {
  name: string;
  description?: string | null;
  keywords?: string[];
  parentId?: string | null;
}
