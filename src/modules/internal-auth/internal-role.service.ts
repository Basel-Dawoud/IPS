import prisma from "../../lib/prisma";

export interface InternalAccess {
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
}

/** Null means "not an admin" — no InternalRole assigned to this User. */
export async function getInternalAccessForUser(userId: string): Promise<InternalAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      internalRoleId: true,
      internalRole: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });

  if (!user?.internalRoleId || !user.internalRole) return null;

  return {
    email: user.email ?? "",
    roleId: user.internalRoleId,
    roleKey: user.internalRole.key,
    roleName: user.internalRole.name,
    permissions: user.internalRole.permissions.map((rp) => rp.permission.key),
  };
}
