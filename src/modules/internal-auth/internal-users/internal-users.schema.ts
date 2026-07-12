import { z } from "zod";

// Grants an internal role to a User, identified by email. If that email has
// no existing User account yet, `password` creates one (min 6 chars — same
// rule as client self-signup). If the email already has an account, password
// is ignored — we grant the role to their existing login, we never touch it.
export const grantInternalRoleSchema = z.object({
  email: z.string().email(),
  roleId: z.string().min(1, "roleId is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  name: z.string().optional(),
});

export type GrantInternalRoleInput = z.infer<typeof grantInternalRoleSchema>;

export const updateInternalRoleSchema = z.object({
  roleId: z.string().min(1, "roleId is required"),
});

export type UpdateInternalRoleInput = z.infer<typeof updateInternalRoleSchema>;

export const createInternalRoleSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use uppercase letters, numbers, and underscores only (e.g. DEALS_MANAGER)"),
  name: z.string().min(1, "Name is required"),
  permissionKeys: z.array(z.string()).min(1, "Select at least one permission"),
});

export type CreateInternalRoleInput = z.infer<typeof createInternalRoleSchema>;
