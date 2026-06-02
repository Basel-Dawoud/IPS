import { z } from "zod";

export const googleSignInSchema = z.object({
  idToken: z.string().min(10),
});

export const appleSignInSchema = z.object({
  identityToken: z.string().min(10),
  // Apple only sends `fullName` on FIRST sign-in. Optional and best-effort.
  fullName: z
    .object({
      givenName: z.string().nullable().optional(),
      familyName: z.string().nullable().optional(),
    })
    .optional(),
  // Same: only present on first sign-in. We accept it as a hint when the
  // identity token's email is missing (Apple sometimes omits it).
  email: z.string().email().optional(),
});

export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;
export type AppleSignInInput = z.infer<typeof appleSignInSchema>;
