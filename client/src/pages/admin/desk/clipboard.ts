// Clipboard helpers for the "copy context for Claude" buttons. Browsers only put PNG images on the clipboard, and text and an image
// can travel together only as separate formats of one clipboard item; many apps take just one of them, hence the separate buttons.
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
}

export async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(String(r.status));
  return r.blob();
}

export const canCopyImages = () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

// Image only.
export async function copyImage(blob: Blob): Promise<boolean> {
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": toPng(blob) })]); return true; } catch { return false; }
}

// Text plus one image in a single clipboard item (Cmd+V pastes whichever the target understands).
export async function copyTextAndImage(text: string, blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "image/png": toPng(blob) })]);
    return true;
  } catch { return false; }
}

export function downloadFile(name: string, data: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
