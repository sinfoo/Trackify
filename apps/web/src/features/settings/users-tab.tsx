"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Lock, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, TimeAgo, humanize } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import type { Paged, Permission, Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Notice, errorText } from "@/features/security/shared";

export const usersKey = ["settings", "users"] as const;
export const useRoles = () => useQuery({ queryKey: ["settings", "roles"], queryFn: () => api.get<Role[]>("/roles") });

// Prototype role chip tints.
const ROLE_TONE: Record<string, { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: "var(--brand-bg)", fg: "var(--brand-text)" },
  FINANCE_MANAGER: { bg: "var(--success-bg)", fg: "var(--success)" },
  SECURITY_ANALYST: { bg: "var(--danger-bg)", fg: "var(--danger)" },
  SALES_MANAGER: { bg: "var(--info-bg)", fg: "var(--info)" },
  VIEWER: { bg: "var(--neutral-bg)", fg: "var(--neutral)" },
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function RolePicker({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-bold">Roles</legend>
      {roles.map((r) => (
        <label key={r.name} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-hair p-2.5 text-sm has-checked:border-brand has-checked:bg-brand-bg/40">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={value.includes(r.name)} onChange={(e) => onChange(e.target.checked ? [...value, r.name] : value.filter((n) => n !== r.name))} />
          <span>
            <span className="num block text-xs font-bold">{r.name}</span>
            <span className="text-[13px] text-t3">{r.description}</span>
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
  const [form, setForm] = useState({ email: "", full_name: isNew ? "" : user.full_name, password: "", roles: isNew ? ["VIEWER"] : user.roles });
  const save = useMutation({
    mutationFn: () => (isNew ? api.post<User>("/users", form) : api.patch<User>(`/users/${user.id}`, { full_name: form.full_name, roles: form.roles })),
    onSuccess: () => {
      toast.success(isNew ? "Invitation sent: user created" : "User updated");
      qc.invalidateQueries({ queryKey: usersKey });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Invite a user" : `Edit ${user.full_name}`}</DialogTitle>
          <DialogDescription>You can only grant permissions you already hold. The server rejects any privilege escalation.</DialogDescription>
        </DialogHeader>
        <form
          id="user-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {isNew && (
            <div className="grid gap-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="u-name">Full name</Label>
            <Input id="u-name" required minLength={2} maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          {isNew && (
            <div className="grid gap-1.5">
              <Label htmlFor="u-pass">Initial password</Label>
              <Input id="u-pass" type="password" required minLength={10} autoComplete="new-password" aria-describedby="u-pass-hint" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <p id="u-pass-hint" className="text-xs text-t3">At least 10 characters. Stored as an Argon2id hash.</p>
            </div>
          )}
          {roles.data ? (
            <RolePicker roles={roles.data} value={form.roles} onChange={(r) => setForm({ ...form, roles: r })} />
          ) : roles.error ? (
            <p className="text-sm text-danger">Could not load roles: {errorText(roles.error)}</p>
          ) : (
            <p className="text-sm text-t3">Loading roles…</p>
          )}
          {save.error && (
            <div role="alert">
              <Notice tone="danger" title="Could not save.">
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
            {save.isPending ? "Saving…" : isNew ? "Invite" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Role × permission matrix (collapsed under the user list). */
function RolesMatrix() {
  const [open, setOpen] = useState(false);
  const roles = useRoles();
  const perms = useQuery({ queryKey: ["settings", "permissions"], queryFn: () => api.get<Permission[]>("/permissions"), enabled: open });
  const rs = roles.data ?? [];
  return (
    <div className="border-t border-hair">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-panel2">
        <span>
          <span className="block text-sm font-bold">Roles and permissions</span>
          <span className="block text-[12.5px] text-t3">{rs.length ? `${rs.length} roles · what each one may do` : "Loading roles"}</span>
        </span>
        <ChevronDown aria-hidden className={cn("size-4 text-t3 transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        (roles.isLoading || perms.isLoading ? (
          <Skeleton className="mx-5 mb-5 h-48" />
        ) : roles.error || perms.error ? (
          <div className="px-5 pb-5">
            <ErrorState error={roles.error ?? perms.error} onRetry={() => (roles.refetch(), perms.refetch())} />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-hair">
            <table className="w-full min-w-[44rem] text-[13px]">
              <caption className="sr-only">Permissions granted to each role</caption>
              <thead>
                <tr className="border-b border-hair">
                  <th scope="col" className="sticky left-0 bg-panel px-5 py-2.5 text-left text-[11.5px] font-bold tracking-[.06em] uppercase text-t4">
                    Permission
                  </th>
                  {rs.map((r) => (
                    <th key={r.name} scope="col" className="px-2 py-2.5 text-center text-[11px] font-bold text-t3">
                      {humanize(r.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(perms.data ?? []).map((p) => (
                  <tr key={p.code} className="border-b border-hair last:border-0 hover:bg-panel2">
                    <th scope="row" className="sticky left-0 bg-panel px-5 py-2 text-left font-normal">
                      <span className="num block text-xs font-bold">{p.code}</span>
                      <span className="text-xs text-t3">{p.description}</span>
                    </th>
                    {rs.map((r) => (
                      <td key={r.name} className="px-2 py-2 text-center">
                        {r.permissions.includes(p.code) ? <Check aria-label="Granted" className="mx-auto size-4 text-success" /> : <Minus aria-label="Not granted" className="mx-auto size-4 text-t4/50" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

export function UsersTab() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const writable = can(me, "users:write");
  const readable = can(me, "users:read");
  const users = useQuery({ queryKey: usersKey, queryFn: () => api.get<Paged<User>>("/users", { query: { page_size: 200 } }), enabled: readable });
  const toggle = useMutation({
    mutationFn: (u: User) => api.patch<User>(`/users/${u.id}`, { is_active: !u.is_active }),
    onSuccess: (u) => toast.success(`${u.full_name} ${u.is_active ? "activated" : "deactivated"}`),
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: usersKey }),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-hair px-5 py-[18px]">
        <div>
          <h3 className="text-base font-extrabold">Users and roles</h3>
          <p className="mt-0.5 text-[13px] text-t3">RBAC is enforced by the API; the UI only hides what a role cannot use.</p>
        </div>
        {writable && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex h-9 items-center gap-[7px] rounded-[11px] bg-brand px-3.5 text-[13px] font-extrabold text-on-brand">
            <Plus aria-hidden className="size-3.5" strokeWidth={2.4} /> Invite
          </button>
        )}
      </div>
      {!readable ? (
        <div className="p-5">
          <Notice icon={Lock} tone="neutral" title="Requires users:read.">
            Your role cannot view other accounts.
          </Notice>
        </div>
      ) : users.error ? (
        <div className="p-5">
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        </div>
      ) : (
        <ul>
          {users.isLoading &&
            [0, 1, 2].map((i) => (
              <li key={i} className="border-t border-hair px-5 py-3">
                <Skeleton className="h-9" />
              </li>
            ))}
          {users.data?.items.map((u) => {
            const role = u.roles[0] ?? "VIEWER";
            const tone = ROLE_TONE[role] ?? ROLE_TONE.VIEWER;
            return (
              <li key={u.id} className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-hair px-5 py-3", !u.is_active && "opacity-60")}>
                <span className="flex min-w-0 flex-1 basis-[200px] items-center gap-2.5">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-panel3 text-[11.5px] font-extrabold">{initials(u.full_name)}</span>
                  <span className="min-w-0 leading-[1.2]">
                    <span className="block text-sm font-bold">{u.full_name}</span>
                    <span className="num block truncate text-[11.5px] text-t3">{u.email}</span>
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <span key={r} className="inline-flex h-6 items-center rounded-full px-[9px] text-xs font-bold lowercase" style={{ background: (ROLE_TONE[r] ?? tone).bg, color: (ROLE_TONE[r] ?? tone).fg }}>
                      {r.replace(/_/g, " ")}
                    </span>
                  ))}
                </span>
                <span className="text-[13px] whitespace-nowrap text-t3">
                  {u.is_active ? "Active " : "Inactive · "}
                  <TimeAgo date={u.last_login_at} />
                </span>
                {writable && (
                  <span className="ml-auto flex gap-1.5 text-right">
                    <button
                      type="button"
                      disabled={(toggle.isPending && toggle.variables?.id === u.id) || u.id === me?.id}
                      title={u.id === me?.id ? "You cannot deactivate your own account" : undefined}
                      onClick={() => toggle.mutate(u)}
                      className="h-[30px] rounded-[9px] border border-hair bg-panel2 px-2.5 text-[12.5px] font-bold text-t2 hover:bg-panel3 disabled:opacity-50"
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" onClick={() => setEditing(u)} className="h-[30px] rounded-[9px] border border-hair bg-panel2 px-2.5 text-[12.5px] font-bold text-t2 hover:bg-panel3">
                      Edit
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {readable && <RolesMatrix />}
      {readable && users.data && (
        <p className="border-t border-hair px-5 py-3 text-xs text-t4">
          <span className="num">{users.data.total}</span> accounts. Accounts are deactivated, never deleted, so the audit trail stays intact.
        </p>
      )}
      {editing && <UserDialog key={editing === "new" ? "new" : editing.id} user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
