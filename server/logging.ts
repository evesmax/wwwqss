// Response bodies on these paths can carry secrets (TOTP secret, hashes, SMTP).
const NEVER_LOG_BODY = [/^\/api\/auth\//, /^\/api\/admin\/users/, /^\/api\/desk\/settings\//];
export function shouldLogBody(path: string): boolean {
  return !NEVER_LOG_BODY.some((r) => r.test(path));
}
