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

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
