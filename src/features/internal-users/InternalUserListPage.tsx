import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthContext";
import {
  useGrantInternalRole,
  useInternalRoles,
  useInternalUsers,
  useRevokeInternalRole,
  useUpdateInternalUserRole,
} from "./hooks";

export function InternalUserListPage() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useInternalUsers();
  const { data: roles } = useInternalRoles();
  const grantMutation = useGrantInternalRole();
  const revokeMutation = useRevokeInternalRole();
  const updateRoleMutation = useUpdateInternalUserRole();

  const [isGrantOpen, setIsGrantOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");

  function resetForm() {
    setEmail("");
    setName("");
    setPassword("");
    setRoleId("");
  }

  function handleGrant(e: FormEvent) {
    e.preventDefault();
    if (!roleId) {
      toast.error("Select a role");
      return;
    }
    grantMutation.mutate(
      { email, roleId, password: password || undefined, name: name || undefined },
      {
        onSuccess: () => {
          toast.success("Access granted");
          setIsGrantOpen(false);
          resetForm();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.error ?? "Failed to grant access");
        },
      }
    );
  }

  function handleRevoke(id: string) {
    revokeMutation.mutate(id, {
      onSuccess: () => toast.success("Access revoked"),
      onError: () => toast.error("Failed to revoke access"),
    });
  }

  function handleRoleChange(id: string, newRoleId: string) {
    updateRoleMutation.mutate(
      { id, roleId: newRoleId },
      {
        onSuccess: () => toast.success("Role updated"),
        onError: () => toast.error("Failed to update role"),
      }
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Users</h1>
          <p className="text-sm text-muted-foreground">
            Grant or revoke dashboard access. Access is granted directly on a Navimind
            account — there's no separate staff login.
          </p>
        </div>
        <Button onClick={() => setIsGrantOpen(true)}>
          <Plus className="size-4" data-icon="inline-start" />
          Grant Access
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Granted by</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(users ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.name ?? "—"}</TableCell>
                <TableCell>
                  <Select
                    value={u.roleId}
                    onValueChange={(value) => handleRoleChange(u.id, value as string)}
                    disabled={u.id === currentUser?.id}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue>{u.roleName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(roles ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {u.grantedByEmail ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={u.id === currentUser?.id}
                    onClick={() => handleRevoke(u.id)}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isGrantOpen} onOpenChange={setIsGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant admin access</DialogTitle>
            <DialogDescription>
              If this email already has a Navimind account, access is granted to it
              directly — leave the password blank. Otherwise a new account is created
              with the password you set here.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGrant} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grant-email">Email</Label>
              <Input
                id="grant-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grant-name">Name</Label>
              <Input id="grant-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grant-password">Password</Label>
              <Input
                id="grant-password"
                type="password"
                minLength={6}
                placeholder="Only required for a new account"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grant-role">Role</Label>
              <Select value={roleId} onValueChange={(value) => setRoleId(value as string)}>
                <SelectTrigger id="grant-role" className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {(roles ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsGrantOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={grantMutation.isPending}>
                {grantMutation.isPending ? "Granting…" : "Grant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
