export interface InternalRoleSummary {
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
}

export interface InternalUser {
  id: string;
  email: string | null;
  name: string | null;
  /** Null = this account is logged in but has no dashboard/admin access. */
  internalRole: InternalRoleSummary | null;
}

export interface AuthResult {
  token: string;
  user: InternalUser;
}
