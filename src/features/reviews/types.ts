export interface PoiReviewUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PoiReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt?: string;
  user: PoiReviewUser;
}
