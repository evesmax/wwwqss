import { useState } from "react";
import { buildTicketContext } from "./ticketContext";
import { canCopyImages, copyImage, copyText, copyTextAndImage, downloadFile, fetchBlob } from "./clipboard";

const isImage = (a: any) => String(a.mime ?? "").startsWith("image/");
const btn = "border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50";

// Everything an engineer (or Claude) needs to reproduce the case, ready to paste. Screenshots are copied as images (PNG).
export function ContextPanel({ d }: { d: any }) {
  const [internal, setInternal] = useState(true);
  const [msg, setMsg] = useState("");
  const images = (d.attachments ?? []).filter(isImage);
  const text = () => buildTicketContext(d, { includeInternal: internal });
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const run = async (fn: () => Promise<boolean>, ok: string, fail = "No se pudo copiar. Revisa los permisos del portapapeles del navegador.") => flash((await fn().catch(() => false)) ? ok : fail);

  return (
    <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
      <h3 className="font-semibold">Contexto para Claude</h3>
      <p className="text-xs text-gray-500">Copia el caso completo (datos, descripción, errores de consola, historial y notas) para pegarlo y resolverlo más rápido.</p>
      <div className="flex gap-2 flex-wrap">
        <button className={`${btn} bg-[#00aeef] text-white border-[#00aeef] hover:bg-[#0098d1]`} onClick={() => run(() => copyText(text()), "Contexto copiado ✓")}>Copiar contexto</button>
        {images.length > 0 && canCopyImages() && (
          <button className={btn} title="Copia el texto y la primera imagen juntos; si la app solo toma uno, pega el texto y luego la imagen"
            onClick={() => run(async () => copyTextAndImage(text(), await fetchBlob(`/api/desk/attachments/${images[0].id}`)), "Texto + imagen copiados ✓")}>Copiar texto + imagen</button>
        )}
        <button className={btn} onClick={async () => { downloadFile(`${d.ticket.key}.md`, new Blob([text()], { type: "text/markdown" })); flash("Descargado ✓"); }}>Descargar .md</button>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Incluir notas internas</label>
      {images.length > 0 && !canCopyImages() && <p className="text-xs text-amber-700">Este navegador no permite copiar imágenes: descárgalas y adjúntalas a mano.</p>}
      {msg && <p className="text-xs font-medium text-green-700">{msg}</p>}
    </div>
  );
}

export function AttachmentsCard({ d }: { d: any }) {
  const [msg, setMsg] = useState("");
  const list: any[] = d.attachments ?? [];
  if (!list.length) return null;
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const copyOne = async (a: any, withText: boolean) => {
    try {
      const blob = await fetchBlob(`/api/desk/attachments/${a.id}`);
      const ok = withText ? await copyTextAndImage(buildTicketContext(d), blob) : await copyImage(blob);
      flash(ok ? "Copiado ✓" : "No se pudo copiar la imagen");
    } catch { flash("No se pudo copiar la imagen"); }
  };
  const save = async (a: any) => { try { downloadFile(a.filename, await fetchBlob(`/api/desk/attachments/${a.id}`)); } catch { flash("No se pudo descargar"); } };
  const imgs = list.filter(isImage), others = list.filter((a) => !isImage(a));

  return (
    <div className="bg-white border rounded-xl p-4 text-sm space-y-3">
      <h3 className="font-semibold">Adjuntos ({list.length})</h3>
      {msg && <p className="text-xs font-medium text-green-700">{msg}</p>}
      {imgs.map((a) => (
        <div key={a.id} className="space-y-1">
          <a href={`/api/desk/attachments/${a.id}`} target="_blank" rel="noreferrer" title="Abrir en grande">
            <img src={`/api/desk/attachments/${a.id}`} alt={a.filename} loading="lazy" className="w-full max-h-48 object-contain rounded border bg-gray-50" />
          </a>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-gray-600">{a.filename} {a.visibility === "internal" ? "🔒" : ""} · {Math.ceil(a.size / 1024)} KB</span>
            <span className="flex gap-1 shrink-0">
              {canCopyImages() && <button className="border rounded px-2 py-1 hover:bg-gray-50" onClick={() => copyOne(a, false)}>Copiar imagen</button>}
              {canCopyImages() && <button className="border rounded px-2 py-1 hover:bg-gray-50" title="Texto del caso + esta imagen" onClick={() => copyOne(a, true)}>+ texto</button>}
              <button className="border rounded px-2 py-1 hover:bg-gray-50" onClick={() => save(a)}>Descargar</button>
            </span>
          </div>
        </div>
      ))}
      {others.map((a) => <a key={a.id} className="block text-[#0088c2]" href={`/api/desk/attachments/${a.id}`}>{a.filename} {a.visibility === "internal" ? "🔒" : ""} ({Math.ceil(a.size / 1024)} KB)</a>)}
    </div>
  );
}

// What the SDK widget captured in the user's browser (URL, browser, console errors).
export function TechContext({ ctx }: { ctx: any }) {
  const [copied, setCopied] = useState(false);
  if (!ctx || typeof ctx !== "object" || !Object.keys(ctx).length) return null;
  const errors: string[] = Array.isArray(ctx.consoleErrors) ? ctx.consoleErrors : [];
  const rows: [string, any][] = [["URL", ctx.url], ["Navegador", ctx.userAgent], ["Versión de la app", ctx.appVersion], ["Pantalla", ctx.viewport], ["Idioma", ctx.locale], ["Usuario en la app", ctx.sdkUser]];
  return (
    <div className="bg-white border rounded-xl p-4 text-sm space-y-2">
      <h3 className="font-semibold">Contexto técnico <span className="text-xs font-normal text-gray-500">(capturado por el widget)</span></h3>
      {rows.filter(([, v]) => v).map(([k, v]) => <p key={k} className="break-all"><span className="text-gray-500">{k}:</span> {k === "URL" ? <a className="text-[#0088c2]" href={String(v)} target="_blank" rel="noreferrer">{String(v)}</a> : String(v)}</p>)}
      {errors.length > 0 && <div>
        <div className="flex items-center justify-between"><p className="text-gray-500">Errores de consola ({errors.length})</p>
          <button className="text-xs border rounded px-2 py-1 hover:bg-gray-50" onClick={async () => { if (await copyText(errors.join("\n---\n"))) { setCopied(true); setTimeout(() => setCopied(false), 1800); } }}>{copied ? "✓ Copiado" : "Copiar errores"}</button></div>
        <pre className="mt-1 max-h-60 overflow-auto bg-gray-900 text-green-200 text-xs p-3 rounded-lg whitespace-pre-wrap">{errors.join("\n---\n")}</pre>
      </div>}
    </div>
  );
}
