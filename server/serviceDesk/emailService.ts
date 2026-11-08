import nodemailer from "nodemailer";
import { db } from "../db";
import { sdEmailLog } from "@shared/schema";
import { getSmtpConfig, type SmtpConfig } from "./settings";

export type Mail = { to: string | string[]; subject: string; html: string; text?: string };
export type Transport = { sendMail(opts: any): Promise<unknown> };
export type SendStatus = "sent" | "failed" | "not_configured";

export function buildTransport(c: SmtpConfig): Transport {
  return nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.password } : undefined,
  });
}

export async function sendEmail(
  msg: Mail,
  deps: { getConfig?: () => Promise<SmtpConfig | null>; makeTransport?: (c: SmtpConfig) => Transport; log?: (row: typeof sdEmailLog.$inferInsert) => Promise<void> } = {},
): Promise<{ status: SendStatus; error?: string }> {
  const getConfig = deps.getConfig ?? getSmtpConfig;
  const makeTransport = deps.makeTransport ?? buildTransport;
  const log = deps.log ?? (async (row) => { await db.insert(sdEmailLog).values(row); });
  const to = Array.isArray(msg.to) ? msg.to.join(", ") : msg.to;

  let status: SendStatus;
  let error: string | undefined;
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.host || !cfg.fromEmail) {
      status = "not_configured";
    } else {
      await makeTransport(cfg).sendMail({
        from: cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail,
        to, subject: msg.subject, html: msg.html, text: msg.text,
      });
      status = "sent";
    }
  } catch (e: any) {
    status = "failed";
    error = String(e?.message ?? e).slice(0, 500);
  }
  await log({ toAddress: to, subject: msg.subject, status, error: error ?? null }).catch((e) => console.error("email log error:", e.message));
  return { status, error };
}
