import { axiosClient } from "@/lib/axiosClient";
import type {
  CreateInternalRoleInput,
  GrantInternalRoleInput,
  InternalPermissionItem,
  InternalRoleListItem,
  InternalUserListItem,
} from "./types";

export async function getInternalUsers(): Promise<InternalUserListItem[]> {
  const res = await axiosClient.get("/internal-auth/users");
  return res.data.data;
}

export async function getInternalRoles(): Promise<InternalRoleListItem[]> {
  const res = await axiosClient.get("/internal-auth/users/roles");
  return res.data.data;
}

export async function getInternalPermissions(): Promise<InternalPermissionItem[]> {
  const res = await axiosClient.get("/internal-auth/users/permissions");
  return res.data.data;
}

export async function createInternalRole(input: CreateInternalRoleInput): Promise<InternalRoleListItem> {
  const res = await axiosClient.post("/internal-auth/users/roles", input);
  return res.data.data;
}

export async function grantInternalRole(input: GrantInternalRoleInput): Promise<InternalUserListItem> {
  const res = await axiosClient.post("/internal-auth/users", input);
  return res.data.data;
}

export async function updateInternalUserRole(id: string, roleId: string): Promise<InternalUserListItem> {
  const res = await axiosClient.patch(`/internal-auth/users/${id}`, { roleId });
  return res.data.data;
}

export async function revokeInternalRole(id: string): Promise<void> {
  await axiosClient.post(`/internal-auth/users/${id}/revoke`);
}
