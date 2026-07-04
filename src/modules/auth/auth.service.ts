/**
 * Auth service — verifies third-party ID tokens (Google, Apple) and
 * issues our own short-lived app JWT.
 *
 * Design choices:
 * - We trust the platform-issued ID tokens *only* after audience-checking
 *   them against the OAuth client IDs we own.
 * - Find-or-create is keyed on (provider, providerUserId) — never on email,
 *   because emails on Apple can change (private relay revocation, alias).
 * - Failures throw `AuthError` with a stable code so the controller can
 *   map to a clean HTTP status.
 */
import { OAuth2Client, type TokenPayload as GoogleTokenPayload } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import * as argon2 from "argon2";
import prisma from "../../lib/prisma";
import { AuthProvider } from "../../generated/prisma/client";
import type { AppJwtPayload, AuthResult, PublicUser } from "./auth.types";
import type { AppleSignInInput } from "./auth.schema";

// ── Errors ─────────────────────────────────────────────────────────────

export type AuthErrorCode =
  | "auth-not-configured"
  | "invalid-token"
  | "missing-subject";

export class AuthError extends Error {
  constructor(public code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// ── Config (lazy — only validated when an endpoint actually fires) ─────

function jwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new AuthError(
      "auth-not-configured",
      "JWT_SECRET is missing or too short (≥16 chars).",
    );
  }
  return new TextEncoder().encode(s);
}

function googleAudiences(): string[] {
  const ids = [
    process.env.GOOGLE_CLIENT_ID_IOS,
    process.env.GOOGLE_CLIENT_ID_ANDROID,
    process.env.GOOGLE_CLIENT_ID_WEB,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  if (ids.length === 0) {
    throw new AuthError(
      "auth-not-configured",
      "No Google client IDs configured (GOOGLE_CLIENT_ID_IOS/ANDROID/WEB).",
    );
  }
  return ids;
}

function appleAudience(): string {
  const v = process.env.APPLE_CLIENT_ID;
  if (!v) {
    throw new AuthError(
      "auth-not-configured",
      "APPLE_CLIENT_ID is not set (use the iOS bundle id).",
    );
  }
  return v;
}

// ── Google verification ────────────────────────────────────────────────

let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  if (!googleClient) googleClient = new OAuth2Client();
  return googleClient;
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken,
      audience: googleAudiences(),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new AuthError("missing-subject", "Token has no subject");
    return payload;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("invalid-token", "Google ID token verification failed");
  }
}

// ── Apple verification ─────────────────────────────────────────────────

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

async function verifyAppleIdentityToken(identityToken: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: appleAudience(),
    });
    if (!payload.sub) throw new AuthError("missing-subject", "Token has no subject");
    return payload;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("invalid-token", "Apple identity token verification failed");
  }
}

// ── Find-or-create + JWT issuance ──────────────────────────────────────

function toPublicUser(u: any): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    interests: u.interests ? u.interests.map((cat: any) => cat.name) : [],
    onboardingComplete: u.onboardingComplete ?? false,
    age: u.age ?? null,
    gender: u.gender ?? null,
    hasPassword: !!u.passwordHash,
  };
}

async function findOrCreateFromIdentity(args: {
  provider: AuthProvider;
  providerUserId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}): Promise<PublicUser> {
  const { provider, providerUserId, email, name, avatarUrl } = args;

  const existing = await prisma.identity.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: { include: { interests: true } } },
  });
  if (existing) return toPublicUser(existing.user);

  // No identity row → either link to a User found by email, or create both.
  const linkedUser = email
    ? await prisma.user.findUnique({
        where: { email },
        include: { interests: true },
      })
    : null;

  if (linkedUser) {
    await prisma.identity.create({
      data: { userId: linkedUser.id, provider, providerUserId },
    });
    return toPublicUser(linkedUser);
  }

  const created = await prisma.user.create({
    data: {
      email: email ?? null,
      name: name ?? null,
      avatarUrl: avatarUrl ?? null,
      identities: { create: { provider, providerUserId } },
    },
    include: { interests: true },
  });
  return toPublicUser(created);
}

async function signAppToken(user: PublicUser): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "24h";
  return new SignJWT({ email: user.email ?? undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer("navimind")
    .setExpirationTime(expiresIn)
    .sign(jwtSecret());
}

// ── Public API ─────────────────────────────────────────────────────────

export async function signInWithGoogle(idToken: string): Promise<AuthResult> {
  const payload = await verifyGoogleIdToken(idToken);
  const user = await findOrCreateFromIdentity({
    provider: AuthProvider.GOOGLE,
    providerUserId: payload.sub!,
    email: payload.email ?? null,
    name: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  });
  const token = await signAppToken(user);
  return { token, user };
}

export async function signInWithApple(input: AppleSignInInput): Promise<AuthResult> {
  const payload = await verifyAppleIdentityToken(input.identityToken);
  const composedName =
    input.fullName?.givenName || input.fullName?.familyName
      ? [input.fullName.givenName, input.fullName.familyName].filter(Boolean).join(" ")
      : undefined;
  const user = await findOrCreateFromIdentity({
    provider: AuthProvider.APPLE,
    providerUserId: payload.sub!,
    email: (payload.email as string | undefined) ?? input.email ?? null,
    name: composedName ?? null,
  });
  const token = await signAppToken(user);
  return { token, user };
}

/** Verify our own app JWT — used by the optional-auth middleware. */
export async function verifyAppToken(token: string): Promise<AppJwtPayload> {
  const { payload } = await jwtVerify(token, jwtSecret(), { issuer: "navimind" });
  if (!payload.sub) throw new AuthError("invalid-token", "Token has no subject");
  return {
    sub: payload.sub,
    email: (payload.email as string | undefined) ?? null,
    iat: payload.iat ?? 0,
    exp: payload.exp ?? 0,
  };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    include: { interests: true },
  });
  return u ? toPublicUser(u) : null;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string
): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError("invalid-token", "Email already in use");
  }

  // Hash the password using Argon2id (default in argon2 package)
  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name ?? null,
    },
    include: { interests: true },
  });

  const token = await signAppToken(toPublicUser(user));
  return { token, user: toPublicUser(user) };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AuthError("invalid-token", "User not found");
  }
  if (!user.passwordHash) {
    // OAuth-only account — no password to change.
    throw new AuthError("invalid-token", "No password set for this account");
  }

  const matches = await argon2.verify(user.passwordHash, currentPassword);
  if (!matches) {
    throw new AuthError("invalid-token", "Current password is incorrect");
  }

  const passwordHash = await argon2.hash(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { interests: true },
  });
  if (!user || !user.passwordHash) {
    throw new AuthError("invalid-token", "Invalid email or password");
  }

  const matches = await argon2.verify(user.passwordHash, password);
  if (!matches) {
    throw new AuthError("invalid-token", "Invalid email or password");
  }

  const token = await signAppToken(toPublicUser(user));
  return { token, user: toPublicUser(user) };
}
