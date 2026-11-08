import { generateSecret, generateURI, verifySync } from "otplib";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, account: string): string {
  return generateURI({ issuer: "QSS", label: account, secret });
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    // epochTolerance in seconds: accept ±1 step (30 s)
    return verifySync({ secret, token, epochTolerance: 30 }).valid;
  } catch {
    return false;
  }
}
