-- AuthProvider enum (used by Identity.provider)
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'APPLE');

-- App user. Email may be null because Apple's "Hide my email" relays an
-- address the user can revoke; we still want the row.
CREATE TABLE "User" (
  "id"        TEXT        NOT NULL,
  "email"     TEXT,
  "name"      TEXT,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- One row per (provider, providerUserId) — that pair is the actual
-- sign-in key. `providerUserId` is the `sub` claim from the ID token.
CREATE TABLE "Identity" (
  "id"             TEXT        NOT NULL,
  "userId"         TEXT        NOT NULL,
  "provider"       "AuthProvider" NOT NULL,
  "providerUserId" TEXT        NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Identity_provider_providerUserId_key"
  ON "Identity"("provider", "providerUserId");
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");

ALTER TABLE "Identity"
  ADD CONSTRAINT "Identity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
