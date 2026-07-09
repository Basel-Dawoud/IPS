export interface ShareCreateResult {
  token: string;
  code: string;
  url: string;
  expiresAt: string | null;
}

export interface SharePublicView {
  token: string;
  owner: { name: string | null; avatarUrl: string | null };
  building: {
    id: string;
    name: string;
    pinLat: number | null;
    pinLng: number | null;
  } | null;
  last: { x: number; y: number; floorLevel: number; updatedAt: string } | null;
  active: boolean;
}

export interface FriendInviteResult {
  token: string;
  code: string;
  url: string;
  expiresAt: string;
}

export interface FriendListEntry {
  user: { id: string; name: string | null; avatarUrl: string | null };
  friendsSince: string;
  presence: {
    buildingId: string;
    buildingName: string | null;
    floorLevel: number | null;
    x: number | null;
    y: number | null;
    updatedAt: string;
    online: boolean;
  } | null;
}

/** Position payload published over the /location socket namespace. */
export interface LivePosition {
  x: number;
  y: number;
  floorLevel: number;
  buildingId: string;
  tMs: number;
}
