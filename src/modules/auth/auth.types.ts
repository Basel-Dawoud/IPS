export interface InternalRoleSummary {
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
}

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  interests?: string[];
  onboardingComplete: boolean;
  age: number | null;
  gender: string | null;
  needsStepFree: boolean;
  shareWithFriends: boolean;
  hasPassword: boolean;
  /** Null = ordinary app user, no dashboard/admin access. */
  internalRole: InternalRoleSummary | null;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

/** Decoded payload of OUR app JWT (the one we issue, not Google's/Apple's). */
export interface AppJwtPayload {
  sub: string;          // User.id
  email?: string | null;
  iat: number;
  exp: number;
}
