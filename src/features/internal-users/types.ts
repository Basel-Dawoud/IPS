export interface InternalUserListItem {
  id: string;
  email: string;
  name: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  grantedByEmail: string | null;
}

export interface InternalRoleListItem {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface GrantInternalRoleInput {
  email: string;
  roleId: string;
  /** Only required if this email has no existing Navimind account yet. */
  password?: string;
  name?: string;
}
