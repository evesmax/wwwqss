import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, sdRoleAssignments, sdAccounts, sdContracts, sdInstances } from "@shared/schema";

export type Scope = { global: boolean; productIds: Set<number>; accountIds: Set<number> };
export type Actor = { userId: number; roles: string[]; scope: Scope };

export function resolveScope(assignments: { scopeType: string; scopeId: number | null }[]): Scope {
  const scope: Scope = { global: false, productIds: new Set(), accountIds: new Set() };
  for (const a of assignments) {
    if (a.scopeType === "global") scope.global = true;
    else if (a.scopeType === "product" && a.scopeId != null) scope.productIds.add(a.scopeId);
    else if (a.scopeType === "account" && a.scopeId != null) scope.accountIds.add(a.scopeId);
  }
  return scope;
}

export function canAccessAccount(actor: Actor, accountId: number, accountProductIds: number[]): boolean {
  const s = actor.scope;
  if (s.global) return true;
  if (s.accountIds.has(accountId)) return true;
  return accountProductIds.some((p) => s.productIds.has(p));
}

export function hasRole(actor: Actor, ...roles: string[]): boolean {
  return actor.roles.some((r) => roles.includes(r));
}

export async function loadActor(userId: number): Promise<Actor | null> {
  const [u] = await db.select({ id: users.id, active: users.active }).from(users).where(eq(users.id, userId));
  if (!u || !u.active) return null;
  const rows = await db.select().from(sdRoleAssignments).where(eq(sdRoleAssignments.userId, userId));
  return {
    userId,
    roles: Array.from(new Set(rows.map((r) => r.role))),
    scope: resolveScope(rows),
  };
}

export async function accountProductMap(): Promise<Map<number, number[]>> {
  const map = new Map<number, Set<number>>();
  const add = (a: number, p: number) => { if (!map.has(a)) map.set(a, new Set()); map.get(a)!.add(p); };
  for (const c of await db.select({ a: sdContracts.accountId, p: sdContracts.productId }).from(sdContracts)) add(c.a, c.p);
  for (const i of await db.select({ a: sdInstances.accountId, p: sdInstances.productId }).from(sdInstances)) add(i.a, i.p);
  return new Map(Array.from(map.entries()).map(([a, s]) => [a, Array.from(s)]));
}

export async function visibleAccountIds(actor: Actor): Promise<number[]> {
  if (!actor.roles.length) return [];
  const all = await db.select({ id: sdAccounts.id }).from(sdAccounts);
  if (actor.scope.global) return all.map((a) => a.id);
  const pm = await accountProductMap();
  return all.filter((a) => canAccessAccount(actor, a.id, pm.get(a.id) ?? [])).map((a) => a.id);
}
