"use client";

import type { ReactNode } from "react";
import type { User } from "./types";
import { useMe } from "./queries";

// UI convenience only. The backend enforces every permission.
export function can(user: Pick<User, "permissions" | "roles"> | null | undefined, perm: string): boolean {
  if (!user) return false;
  if (user.roles.includes("SUPER_ADMIN") || user.permissions.includes("*")) return true;
  if (user.permissions.includes(perm)) return true;
  const [resource] = perm.split(":");
  return user.permissions.includes(`${resource}:*`);
}

export function RequirePermission({
  perm,
  children,
  fallback = null,
}: {
  perm: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: user } = useMe();
  return <>{can(user, perm) ? children : fallback}</>;
}
