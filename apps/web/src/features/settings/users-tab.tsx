"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, StatusBadge, TimeAgo, humanize, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import type { Paged, Role, User } from "@/lib/types";
import { Notice, errorText } from "@/features/security/shared";

export const usersKey = ["settings", "users"] as const;
export const useRoles = () => useQuery({ queryKey: ["settings", "roles"], queryFn: () => api.get<Role[]>("/roles") });

function RolePicker({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Roles</legend>
      {roles.map((r) => (
        <label key={r.name} className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm has-checked:border-info/40 has-checked:bg-info/5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--info)]"
            checked={value.includes(r.name)}
            onChange={(e) => onChange(e.target.checked ? [...value, r.name] : value.filter((n) => n !== r.name))}
          />
          <span>
            <span className="num block text-xs font-medium">{r.name}</span>
            <span className="text-muted-foreground">{r.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function UserDialog({ user, onClose }: { user: User | "new"; onClose: () => void }) {
  const qc = useQueryClient();
  const roles = useRoles();
  const isNew = user === "new";
  const [form, setForm] = useState({
    email: "",
    full_name: isNew ? "" : user.full_name,
    password: "",
    roles: isNew ? ["VIEWER"] : user.roles,
  });
  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.post<User>("/users", form)
        : api.patch<User>(`/users/${user.id}`, { full_name: form.full_name, roles: form.roles }),
    onSuccess: () => {
      toast.success(isNew ? "User created" : "User updated");
      qc.invalidateQueries({ queryKey: usersKey });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Create user" : `Edit ${user.full_name}`}</DialogTitle>
          <DialogDescription>
            You can only grant permissions you already hold. The server rejects any privilege escalation.
          </DialogDescription>
        </DialogHeader>
        <form
          id="user-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {isNew && (
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Full name</Label>
            <Input id="u-name" required minLength={2} maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          {isNew && (
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">Initial password</Label>
              <Input
                id="u-pass"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                aria-describedby="u-pass-hint"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <p id="u-pass-hint" className="text-xs text-muted-foreground">At least 10 characters. Stored as an Argon2id hash.</p>
            </div>
          )}
          {roles.data ? (
            <RolePicker roles={roles.data} value={form.roles} onChange={(r) => setForm({ ...form, roles: r })} />
          ) : roles.error ? (
            <p className="text-sm text-danger-text">Could not load roles: {errorText(roles.error)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Loading roles...</p>
          )}
          {save.error && (
            <div role="alert">
              <Notice tone="danger" title="Could not save">
                {errorText(save.error)}
              </Notice>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={save.isPending}>
            {save.isPending ? "Saving..." : isNew ? "Create user" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersTab() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const writable = can(me, "users:write");
  const users = useQuery({
    queryKey: usersKey,
    queryFn: () => api.get<Paged<User>>("/users", { query: { page_size: 200 } }),
    enabled: can(me, "users:read"),
  });
  const toggle = useMutation({
    mutationFn: (u: User) => api.patch<User>(`/users/${u.id}`, { is_active: !u.is_active }),
    onSuccess: (u) => toast.success(`${u.full_name} ${u.is_active ? "activated" : "deactivated"}`),
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: usersKey }),
  });

  if (!can(me, "users:read"))
    return (
      <Notice icon={Lock} tone="neutral" title="Requires users:read">
        Your role cannot view other accounts.
      </Notice>
    );

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "User",
      cell: (u) => (
        <div className="min-w-0">
          <div className="font-medium">{u.full_name}</div>
          <div className="num truncate text-xs text-muted-foreground">{u.email}</div>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      cell: (u) => (
        <span className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <span key={r} className="num rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs">
              {humanize(r)}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => <StatusBadge status={u.is_active ? "SUCCEEDED" : "DISABLED"} label={u.is_active ? "Active" : "Inactive"} />,
    },
    { key: "login", header: "Last login", className: "hidden md:table-cell", cell: (u) => <TimeAgo date={u.last_login_at} className="text-sm" /> },
    ...(writable
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            cell: (u: User) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${u.full_name}`} onClick={() => setEditing(u)}>
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(toggle.isPending && toggle.variables?.id === u.id) || u.id === me?.id}
                  title={u.id === me?.id ? "You cannot deactivate your own account" : undefined}
                  onClick={() => toggle.mutate(u)}
                >
                  {u.is_active ? "Deactivate" : "Activate"}
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {users.data ? <span className="num">{users.data.total}</span> : "-"} accounts. Accounts are deactivated, never deleted, so the audit trail stays intact.
        </p>
        {writable ? (
          <Button onClick={() => setEditing("new")}>
            <UserPlus aria-hidden /> Create user
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock aria-hidden className="size-4" /> Read-only (users:write required)
          </span>
        )}
      </div>
      <DataTable columns={columns} rows={users.data?.items} rowKey={(u) => u.id} loading={users.isLoading} error={users.error} onRetry={() => users.refetch()} />
      {editing && <UserDialog key={editing === "new" ? "new" : editing.id} user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
