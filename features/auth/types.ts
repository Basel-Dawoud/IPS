export type AuthProvider = "GOOGLE" | "APPLE";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  interests?: string[];
  age?: number | null;
  gender?: string | null;
  needsStepFree?: boolean;
  shareWithFriends?: boolean;
  hasPassword?: boolean;
  onboardingComplete: boolean;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}
