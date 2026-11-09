export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\x00-\x1f"<>:*?|]/g, "_").replace(/^\.+/, "").slice(0, 120).trim();
  return cleaned || "archivo";
}

export function validateAttachment(filename: string, mime: string, size: number): { ok: true; filename: string; mime: string } | { ok: false; error: string } {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(m)) return { ok: false, error: "Tipo de archivo no permitido" };
  if (size < 1) return { ok: false, error: "Archivo vacío" };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "El archivo excede 5 MB" };
  return { ok: true, filename: cleanFilename(filename), mime: m };
}
