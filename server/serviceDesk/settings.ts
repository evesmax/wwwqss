import { eq } from "drizzle-orm";
import { db } from "../db";
import { sdSettings } from "@shared/schema";
import { encryptSecret, decryptSecret } from "./crypto";

export type SmtpConfig = {
  host: string; port: number; secure: boolean; user: string; password: string;
  fromName: string; fromEmail: string;
};
export type SmtpInput = Omit<SmtpConfig, "password"> & { password?: string };

type Stored = Omit<SmtpConfig, "password"> & { passwordEnc: string };

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const [row] = await db.select().from(sdSettings).where(eq(sdSettings.key, "smtp"));
  if (!row) return null;
  const { passwordEnc, ...rest } = row.value as Stored;
  return { ...rest, password: passwordEnc ? decryptSecret(passwordEnc) : "" };
}

export async function getSmtpPublic(): Promise<(Omit<SmtpConfig, "password"> & { hasPassword: boolean }) | null> {
  const [row] = await db.select().from(sdSettings).where(eq(sdSettings.key, "smtp"));
  if (!row) return null;
  const { passwordEnc, ...rest } = row.value as Stored;
  return { ...rest, hasPassword: !!passwordEnc };
}

export async function saveSmtpConfig(input: SmtpInput, userId: number): Promise<void> {
  const [row] = await db.select().from(sdSettings).where(eq(sdSettings.key, "smtp"));
  const prevEnc = row ? (row.value as Stored).passwordEnc : "";
  const { password, ...rest } = input;
  const passwordEnc = password ? encryptSecret(password) : prevEnc;
  const value: Stored = { ...rest, passwordEnc };
  await db.insert(sdSettings)
    .values({ key: "smtp", value, updatedBy: userId })
    .onConflictDoUpdate({ target: sdSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}
