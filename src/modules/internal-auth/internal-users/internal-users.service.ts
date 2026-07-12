import * as argon2 from "argon2";
import prisma from "../../../lib/prisma";
import type { CreateInternalRoleInput, GrantInternalRoleInput } from "./internal-users.schema";
import type {
  InternalPermissionItem,
  InternalRoleListItem,
  InternalUserListItem,
} from "./internal-users.types";

function toListItem(u: any): InternalUserListItem {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleId: u.internalRoleId,
    roleKey: u.internalRole.key,
    roleName: u.internalRole.name,
  };
}

const listInclude = {
  internalRole: true,
} as const;

export async function listInternalUsers(): Promise<InternalUserListItem[]> {
  const users = await prisma.user.findMany({
    where: { internalRoleId: { not: null } },
    include: listInclude,
    orderBy: { createdAt: "asc" },
  });
  return users.map(toListItem);
}

export async function getInternalUser(id: string): Promise<InternalUserListItem | null> {
  const user = await prisma.user.findUnique({
    where: { id, internalRoleId: { not: null } },
    include: listInclude,
  });
  return user ? toListItem(user) : null;
}

/**
 * Grants an internal role to the User with this email — creating the
 * account first (with `password`) if none exists yet. Overwrites any
 * existing role (also how you change someone's role, or re-grant after
 * a revoke), so this is the single entry point for "add/change staff".
 */
export async function grantInternalRole(input: GrantInternalRoleInput): Promise<InternalUserListItem> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { internalRoleId: input.roleId },
      include: listInclude,
    });
    return toListItem(user);
  }

  if (!input.password) {
    throw new Error("Password is required to create a new account for this email");
  }

  const passwordHash = await argon2.hash(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name ?? null,
      internalRoleId: input.roleId,
    },
    include: listInclude,
  });
  return toListItem(user);
}

export async function updateInternalUserRole(id: string, roleId: string): Promise<InternalUserListItem> {
  const user = await prisma.user.update({
    where: { id },
    data: { internalRoleId: roleId },
    include: listInclude,
  });
  return toListItem(user);
}

/** Revokes internal access — this IS the "fallback to null" disable. */
export async function revokeInternalRole(id: string): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: { internalRoleId: null },
  });
}

function toRoleListItem(r: any): InternalRoleListItem {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    permissions: r.permissions.map((rp: any) => rp.permission.key),
  };
}

export async function listInternalRoles(): Promise<InternalRoleListItem[]> {
  const roles = await prisma.internalRole.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: "asc" },
  });
  return roles.map(toRoleListItem);
}

export async function createInternalRole(input: CreateInternalRoleInput): Promise<InternalRoleListItem> {
  const existingKey = await prisma.internalRole.findUnique({ where: { key: input.key } });
  if (existingKey) {
    throw new Error(`Role key "${input.key}" already exists`);
  }

  const permissions = await prisma.internalPermission.findMany({
    where: { key: { in: input.permissionKeys } },
  });
  if (permissions.length !== input.permissionKeys.length) {
    throw new Error("One or more permission keys are invalid");
  }

  const role = await prisma.internalRole.create({
    data: {
      key: input.key,
      name: input.name,
      permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
    },
    include: { permissions: { include: { permission: true } } },
  });
  return toRoleListItem(role);
}

export async function listInternalPermissions(): Promise<InternalPermissionItem[]> {
  const permissions = await prisma.internalPermission.findMany({ orderBy: { key: "asc" } });
  return permissions.map((p) => ({ key: p.key, description: p.description }));
}
