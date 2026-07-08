/** Live position relayed over the /location socket namespace (meter coords). */
export interface LivePosition {
  x: number;
  y: number;
  floorLevel: number;
  buildingId: string;
  tMs: number;
}

export interface ShareCreateResult {
  token: string;
  url: string;
  expiresAt: string | null;
}

export interface SharePublicView {
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

export type ShareDurationMin = 15 | 60 | null;
