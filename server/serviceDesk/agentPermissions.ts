// Pure rules (no I/O) for what an agent key may do. Enforced on the SERVER; the MCP client only mirrors them for UX.
export const AGENT_PERMISSIONS = ["transition_terminal", "release", "create_ticket"] as const;
export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

/** Statuses only a key with `transition_terminal` may set. */
export const TERMINAL_TARGETS = ["closed", "rejected", "cancelled", "duplicate"] as const;
/** Statuses that publish a delivery to the customer; need `release` (resolved for ops tickets, released for features). */
export const RELEASE_TARGETS = ["resolved", "released"] as const;

export const CREATE_ORIGINS = ["cliente", "transversal", "negocio"] as const;
export const CREATE_ALLOWED_ORIGINS = ["transversal", "negocio"] as const;
export const CREATE_ALLOWED_TYPES = ["incident", "service_request", "question", "internal_task"] as const;
export const CREATE_PRODUCT_CODE = "PLATAFORMAQSS";
export const CREATE_PER_HOUR = 20;

export function normalizePermissions(raw: unknown): AgentPermission[] {
  return Array.isArray(raw) ? raw.filter((x): x is AgentPermission => (AGENT_PERMISSIONS as readonly string[]).includes(x as string)) : [];
}

/** Returns an error message when the key may NOT move a ticket to `to`, otherwise null. */
export function checkTransition(perms: readonly string[], to: string): string | null {
  if ((TERMINAL_TARGETS as readonly string[]).includes(to) && !perms.includes("transition_terminal"))
    return `Esta llave no puede pasar tickets a "${to}": requiere aprobación humana.`;
  if ((RELEASE_TARGETS as readonly string[]).includes(to) && !perms.includes("release"))
    return `Esta llave no puede liberar tickets ("${to}"): requiere confirmación humana.`;
  return null;
}

export type CreateCheck = { perms: readonly string[]; productCode: string | null | undefined; origin: string; type: string };
/** Returns an error message when the key may NOT create this ticket, otherwise null. */
export function checkCreate(c: CreateCheck): string | null {
  if (!c.perms.includes("create_ticket")) return "Esta llave no puede crear tickets.";
  if (c.productCode !== CREATE_PRODUCT_CODE) return `Solo se pueden crear tickets en el producto ${CREATE_PRODUCT_CODE}.`;
  if (!(CREATE_ALLOWED_ORIGINS as readonly string[]).includes(c.origin)) return "Solo se permiten tickets de origen transversal o negocio.";
  if (!(CREATE_ALLOWED_TYPES as readonly string[]).includes(c.type)) return "Tipo de ticket no permitido para esta llave.";
  return null;
}

/** Product ids the key can see: all active products when `allProducts`, else its explicit list. */
export function visibleProductIds(key: { allProducts: boolean; productIds: unknown }, allActiveProductIds: number[]): number[] {
  if (key.allProducts) return allActiveProductIds;
  return ((key.productIds as unknown[]) ?? []).filter((x): x is number => Number.isInteger(x));
}
