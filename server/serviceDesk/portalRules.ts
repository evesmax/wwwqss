export type PortalContact = { id: number; accountId: number; role: string };
export type TicketVis = { type?: string; accountId: number; requesterContactId: number | null; sharedWithAccount: boolean };

// A contact sees: everything in their account if account_admin; otherwise tickets they
// requested, plus tickets flagged as shared with the account. Never other accounts.
export function canContactSeeTicket(contacts: PortalContact[], t: TicketVis): boolean {
  if (t.type === "internal_task") return false;
  return contacts.some((c) => c.accountId === t.accountId && (
    c.role === "account_admin" || t.sharedWithAccount || (t.requesterContactId !== null && t.requesterContactId === c.id)));
}
export const PORTAL_TYPES = ["incident", "service_request", "feature_request", "question"] as const;
