/**
 * Seeds the internal-staff RBAC catalogue: permissions and the three system
 * roles (SUPER_ADMIN / ADMIN / STAFF). Then — only if no User currently has
 * internalRoleId set — grants SUPER_ADMIN to SEED_INTERNAL_ADMIN_EMAIL,
 * creating that User (with SEED_INTERNAL_ADMIN_PASSWORD) if it doesn't
 * already exist as a client account.
 *
 * There is no separate staff-account table: admin access is just
 * User.internalRoleId being non-null, so the bootstrap admin logs in
 * through the normal client email/password login.
 *
 * Idempotent: safe to re-run. Permissions/roles are upserted by their unique
 * `key`; the bootstrap grant only fires while zero Users have an internal
 * role yet.
 *
 * Run:  npx ts-node prisma/seed-internal-rbac.ts
 */
import "dotenv/config";
import * as argon2 from "argon2";
import prisma from "../src/lib/prisma";

const RESOURCES = [
  "buildings",
  "floors",
  "beacons",
  "map",
  "pois",
  "fingerprinting",
  "trajectory",
  "wifi-aps",
  "deals",
  "ips",
] as const;

const PERMISSIONS = [
  ...RESOURCES.flatMap((r) => [
    { key: `${r}:read`, description: `View ${r}` },
    { key: `${r}:write`, description: `Create/edit/delete ${r}` },
  ]),
  { key: "internal-users:manage", description: "Grant, change, or revoke staff access" },
];

const ROLES: { key: string; name: string; permissionKeys: string[] }[] = [
  {
    key: "SUPER_ADMIN",
    name: "Super Admin",
    permissionKeys: PERMISSIONS.map((p) => p.key),
  },
  {
    key: "ADMIN",
    name: "Admin",
    permissionKeys: PERMISSIONS.map((p) => p.key).filter((k) => k !== "internal-users:manage"),
  },
  {
    key: "STAFF",
    name: "Staff",
    permissionKeys: RESOURCES.map((r) => `${r}:read`),
  },
];

async function main() {
  console.log("[seed-internal-rbac] Upserting permission catalogue...");
  for (const perm of PERMISSIONS) {
    await prisma.internalPermission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm,
    });
  }

  console.log("[seed-internal-rbac] Upserting system roles...");
  for (const role of ROLES) {
    const dbRole = await prisma.internalRole.upsert({
      where: { key: role.key },
      update: { name: role.name },
      create: { key: role.key, name: role.name },
    });

    const permissions = await prisma.internalPermission.findMany({
      where: { key: { in: role.permissionKeys } },
    });

    // Reset then re-attach so removed permissions (e.g. after editing this
    // script) are actually revoked, not just left stale.
    await prisma.internalRolePermission.deleteMany({ where: { roleId: dbRole.id } });
    await prisma.internalRolePermission.createMany({
      data: permissions.map((p) => ({ roleId: dbRole.id, permissionId: p.id })),
    });

    console.log(`  - ${role.key}: ${permissions.length} permissions`);
  }

  const existingAdminCount = await prisma.user.count({ where: { internalRoleId: { not: null } } });
  if (existingAdminCount > 0) {
    console.log(`[seed-internal-rbac] ${existingAdminCount} User(s) already have internal access — skipping bootstrap admin.`);
    return;
  }

  const email = process.env.SEED_INTERNAL_ADMIN_EMAIL;
  const password = process.env.SEED_INTERNAL_ADMIN_PASSWORD;
  if (!email) {
    console.warn(
      "[seed-internal-rbac] No admin User exists and SEED_INTERNAL_ADMIN_EMAIL is not set — skipping bootstrap admin. Set it in .env and re-run."
    );
    return;
  }

  const superAdminRole = await prisma.internalRole.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    await prisma.user.update({ where: { id: existingUser.id }, data: { internalRoleId: superAdminRole.id } });
    console.log(`[seed-internal-rbac] Granted SUPER_ADMIN to existing account: ${email}`);
    return;
  }

  if (!password) {
    console.warn(
      `[seed-internal-rbac] No User exists for ${email} and SEED_INTERNAL_ADMIN_PASSWORD is not set — can't create the bootstrap account. Set it in .env and re-run.`
    );
    return;
  }

  const passwordHash = await argon2.hash(password);
  await prisma.user.create({
    data: { email, passwordHash, name: "Super Admin", internalRoleId: superAdminRole.id },
  });
  console.log(`[seed-internal-rbac] Created bootstrap SUPER_ADMIN account: ${email}`);
}

main()
  .catch((err) => {
    console.error("[seed-internal-rbac] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
