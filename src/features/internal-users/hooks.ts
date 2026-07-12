import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createInternalRole,
  getInternalPermissions,
  getInternalRoles,
  getInternalUsers,
  grantInternalRole,
  revokeInternalRole,
  updateInternalUserRole,
} from "./api";
import type { CreateInternalRoleInput, GrantInternalRoleInput } from "./types";

export function useInternalUsers() {
  return useQuery({ queryKey: ["internal-users"], queryFn: getInternalUsers });
}

export function useInternalRoles() {
  return useQuery({ queryKey: ["internal-roles"], queryFn: getInternalRoles });
}

export function useInternalPermissions() {
  return useQuery({ queryKey: ["internal-permissions"], queryFn: getInternalPermissions });
}

export function useCreateInternalRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInternalRoleInput) => createInternalRole(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-roles"] }),
  });
}

export function useGrantInternalRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GrantInternalRoleInput) => grantInternalRole(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-users"] }),
  });
}

export function useUpdateInternalUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) => updateInternalUserRole(id, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-users"] }),
  });
}

export function useRevokeInternalRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeInternalRole(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-users"] }),
  });
}
