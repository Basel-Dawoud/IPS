export interface InternalUserListItem {
  id: string;
  email: string;
  name: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
}

export interface InternalRoleListItem {
  id: string;
  key: string;
  name: string;
  permissions: string[];
}

export interface InternalPermissionItem {
  key: string;
  description: string | null;
}
