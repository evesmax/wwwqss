import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { sdContacts, sdPortalTokens } from "@shared/schema";
import { sendEmail } from "./emailService";
import { magicLinkEmail } from "./emailTemplates";
import { publicBaseUrl } from "./ticketService";

export const TOKEN_TTL_MS = 15 * 60_000;
export const MAX_LINKS_PER_HOUR = 5;
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const normEmail = (e: string) => e.trim().toLowerCase();

// Always resolves without revealing whether the email is registered.
export async function requestMagicLink(rawEmail: string): Promise<void> {
  const email = normEmail(rawEmail);
  const [known] = await db.select({ id: sdContacts.id }).from(sdContacts).where(sql`lower(${sdContacts.email}) = ${email}`).limit(1);
  if (!known) return;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(sdPortalTokens)
    .where(and(eq(sdPortalTokens.email, email), sql`${sdPortalTokens.createdAt} > now() - interval '1 hour'`));
  if (n >= MAX_LINKS_PER_HOUR) return;
  const token = randomBytes(32).toString("base64url");
  await db.insert(sdPortalTokens).values({ email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) });
  const url = `${publicBaseUrl()}/portal/verify?token=${token}`;
  await sendEmail({ to: email, ...magicLinkEmail(url) });
}

// Sign-in for a user already authenticated inside a host app: the widget token (signed by the host with the user's email)
// is exchanged for a short-lived single-use portal link. It is returned to the browser, never emailed.
export const SSO_TTL_MS = 2 * 60_000;
export async function issueSsoLink(rawEmail: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sdPortalTokens).values({ email: normEmail(rawEmail), tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SSO_TTL_MS) });
  return `${publicBaseUrl()}/portal/sso?token=${token}`;
}

// Single use: the UPDATE only matches an unused, unexpired token.
export async function consumeMagicToken(token: string): Promise<string | null> {
  const [row] = await db.update(sdPortalTokens).set({ usedAt: new Date() })
    .where(and(eq(sdPortalTokens.tokenHash, hashToken(String(token))), isNull(sdPortalTokens.usedAt), gt(sdPortalTokens.expiresAt, new Date())))
    .returning({ email: sdPortalTokens.email });
  return row?.email ?? null;
}
