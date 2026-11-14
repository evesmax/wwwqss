/*! QSS Soporte widget v1 — https://qsoftwaresolutions.com
 * Uso:
 *   <script src="https://qsoftwaresolutions.com/sdk/qss-widget.js"></script>
 *   QSSWidget.init({ getToken: () => fetch('/mi-backend/qss-token').then(r => r.text()), appVersion: '1.2.3' });
 * getToken debe devolver un JWT HS256 firmado por TU backend (claims: sub, email, name, tenant, iat, exp<=15min).
 * Opcional: position:'left' mueve el botón y el panel a la esquina inferior izquierda (por defecto, derecha),
 * útil si la app ya tiene otra burbuja (chat) abajo a la derecha.
 * position:'header' oculta el botón flotante y ancla el panel arriba a la derecha; ábrelo con el objeto que devuelve init() (api.open()/close()/destroy()).
 * Nunca pongas la llave secreta en el navegador. */
(function () {
  var errors = [];
  var origError = console.error;
  console.error = function () { try { errors.push(Array.prototype.map.call(arguments, function (a) { return a && a.stack ? a.stack : String(a); }).join(" ").slice(0, 500)); if (errors.length > 20) errors.shift(); } catch (e) {} return origError.apply(console, arguments); };
  window.addEventListener("error", function (e) { errors.push(String(e.message || e).slice(0, 500)); if (errors.length > 20) errors.shift(); });

  var CSS = ":host{all:initial}*{box-sizing:border-box;font-family:system-ui,Arial,sans-serif}" +
    ".fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;background:#00aeef;color:#fff;border:0;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}" +
    ".panel{position:fixed;right:20px;bottom:72px;z-index:2147483000;width:340px;max-width:calc(100vw - 40px);background:#fff;color:#222;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:16px;display:none}" +
    ".panel.open{display:block}h3{margin:0 0 10px;font-size:16px}label{display:block;font-size:12px;color:#555;margin:8px 0 3px}" +
    "input,select,textarea{width:100%;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:14px}textarea{min-height:90px;resize:vertical}" +
    ".row{display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px}.row input{width:auto}" +
    ".send{margin-top:12px;width:100%;background:#00aeef;color:#fff;border:0;border-radius:8px;padding:10px;font-size:14px;font-weight:600;cursor:pointer}.send:disabled{opacity:.5}" +
    ".mic{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;padding:9px;font-size:14px;font-weight:600;cursor:pointer}.mic.rec{background:#fee2e2;border-color:#ef4444;color:#b91c1c}.mic.rec i{animation:p 1s infinite}@keyframes p{50%{opacity:.25}}.mic i{width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block}.live{display:none;margin-top:6px;max-height:90px;overflow:auto;background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:8px;font-size:13px;color:#334155}.hint{font-size:11px;color:#64748b;margin-top:4px}.x{position:absolute;top:8px;right:10px;border:0;background:none;font-size:22px;line-height:1;color:#666;cursor:pointer}.x:hover{color:#000}.mine{margin-top:10px;background:none;border:0;color:#0088c2;font-size:13px;cursor:pointer;padding:0}.rpanel{width:380px;padding:0}.rhead{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:12px 40px 10px 14px;border-bottom:1px solid #e2e8f0}.rhead h3{margin:0;font-size:15px}.back{display:none;border:0;background:none;font-size:18px;cursor:pointer;color:#334155;padding:0 4px}.portal{margin-left:auto;font-size:12px;font-weight:600;color:#0088c2;text-decoration:none}.portal:hover{text-decoration:underline}.rbody{max-height:60vh;overflow:auto;font-size:13px}.item{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #e2e8f0;padding:9px 14px;cursor:pointer;color:#222}.item:hover{background:#f8fafc}.item .l1{display:flex;justify-content:space-between;font-size:12px;color:#64748b}.item .st{font-weight:600;color:#1d4ed8}.item .st.done{color:#15803d}.item .tt{font-size:14px;margin-top:2px}.item .up{font-size:12px;color:#94a3b8}.empty{padding:14px;color:#64748b}.det{padding:12px 14px}.tl{margin:10px 0 0;padding:0 0 0 12px;border-left:2px solid #e2e8f0;list-style:none}.tl li{position:relative;margin-bottom:10px}.tl li:before{content:'';position:absolute;left:-17px;top:5px;width:8px;height:8px;border-radius:50%;background:#94a3b8}.tl li.note:before{background:#2563eb}.tl .w{font-size:11px;color:#64748b}.tl .tx{white-space:pre-wrap}.tl li.status .tx{font-weight:600}.cm{border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px}.cm textarea{min-height:70px}.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.btn{border:0;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;color:#fff;background:#00aeef}.btn.g{background:#16a34a}.btn:disabled{opacity:.5}.note2{font-size:12px;color:#64748b}.msg{margin-top:8px;font-size:13px}.err{color:#b00020}.ok{color:#0a7d33}";

  function init(cfg) {
    cfg = cfg || {};
    var script = document.currentScript || document.querySelector('script[src*="qss-widget"]');
    var endpoint = (cfg.endpoint || (script && new URL(script.src).origin) || "https://qsoftwaresolutions.com").replace(/\/+$/, "") + "/api/v1/sdk";
    if (typeof cfg.getToken !== "function") throw new Error("QSSWidget.init: getToken es requerido");
    var host = document.createElement("div");
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<style>" + CSS + "</style><button class='fab' part='fab'>" + (cfg.buttonText || "Soporte") + "</button>" +
      "<div class='panel'><button class='x' type='button' aria-label='Cerrar' title='Cerrar'>&times;</button><h3>Reportar un problema</h3>" +
      "<label>Tipo</label><select id='type'><option value='incident'>Algo no funciona</option><option value='question'>Tengo una duda</option><option value='service_request'>Necesito un cambio o apoyo</option><option value='feature_request'>Sugerencia</option></select>" +
      "<div id='sevbox'><label>¿Qué tan urgente es para ti?</label><select id='sev'><option value=''>No sé</option><option value='P3'>Puedo esperar</option><option value='P2'>Me estorba</option><option value='P1'>Bloquea mi trabajo</option><option value='P0'>Está caído</option></select></div>" +
      "<div id='micbox'><button class='mic' type='button'><i></i><span>Dictar con voz</span></button><div class='live'></div><div class='hint'>Habla y escribimos por ti; al terminar armamos el resumen y el detalle para que los revises.</div></div>" +
      "<label>Resumen</label><input id='title' maxlength='200' placeholder='Ej. No me deja guardar la orden'>" +
      "<label>Detalle</label><textarea id='desc' placeholder='¿Qué hiciste y qué esperabas que pasara?'></textarea>" +
      "<div class='row'><input type='checkbox' id='shot'><label style='margin:0'>Adjuntar captura de pantalla (te pediremos permiso)</label></div>" +
      "<label>Más imágenes (hasta 5)</label><input type='file' id='files' accept='image/*' multiple>" +
      "<button class='send'>Enviar</button><div class='msg'></div>" +
      "<button class='mine' type='button'>Mis reportes</button></div>" +
      "<div class='panel rpanel'><button class='x rx' type='button' aria-label='Cerrar' title='Cerrar'>&times;</button>" +
      "<div class='rhead'><button class='back' type='button' aria-label='Volver' title='Volver'>&larr;</button><h3 class='rtitle'>Mis reportes a Soporte QSS</h3>" +
      "<a class='portal' target='_blank' rel='noopener' href='" + endpoint.replace(/\/api\/v1\/sdk$/, "") + "/portal'>Ver todos en el portal &#8599;</a></div>" +
      "<div class='rbody'></div></div>";
    if (cfg.position === "header") { var hs = document.createElement("style"); hs.textContent = ".fab{display:none}.panel{top:64px;right:16px;bottom:auto}"; root.appendChild(hs); }
    if (cfg.position === "left") { var pos = document.createElement("style"); pos.textContent = ".fab,.panel{right:auto;left:20px}"; root.appendChild(pos); }
    document.body.appendChild(host);
    var $ = function (s) { return root.querySelector(s); };
    var panel = $(".panel"), msg = $(".msg"), send = $(".send");
    $(".fab").onclick = function () { rpanel.classList.remove("open"); panel.classList.toggle("open"); };
    $(".x").onclick = function () { panel.classList.remove("open"); };
    var onKey = function (e) { if (e.key === "Escape") { panel.classList.remove("open"); rpanel.classList.remove("open"); } };
    document.addEventListener("keydown", onKey);
    $("#type").onchange = function () { $("#sevbox").style.display = this.value === "incident" ? "" : "none"; };

    function say(t, ok) { msg.textContent = t; msg.className = "msg " + (ok ? "ok" : "err"); }
    function capture() {
      return navigator.mediaDevices.getDisplayMedia({ video: true, preferCurrentTab: true }).then(function (stream) {
        return new Promise(function (resolve, reject) {
          var v = document.createElement("video"); v.srcObject = stream; v.muted = true;
          v.onloadedmetadata = function () { v.play().then(function () { setTimeout(function () {
            var c = document.createElement("canvas"); var s = Math.min(1, 1600 / v.videoWidth); c.width = v.videoWidth * s; c.height = v.videoHeight * s;
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); stream.getTracks().forEach(function (t) { t.stop(); });
            c.toBlob(function (b) { b ? resolve(b) : reject(new Error("captura")); }, "image/png");
          }, 300); }, reject); };
        });
      });
    }
    // --- Dictado por voz: transcribe en vivo (Web Speech API) y arma resumen + detalle ---
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, micBtn = $(".mic"), live = $(".live"), transcript = "", rec = null, recording = false;
    if (!SR) { $("#micbox").style.display = "none"; }
    function setMic(on) { recording = on; micBtn.classList.toggle("rec", on); micBtn.querySelector("span").textContent = on ? "Detener y armar el reporte" : "Dictar con voz"; }
    function draft() {
      var text = transcript.trim();
      if (text.length < 5) { live.style.display = "none"; return say("No alcancé a escuchar nada. Revisa el permiso del micrófono e inténtalo de nuevo.", false); }
      say("Armando el resumen…", true); micBtn.disabled = true;
      Promise.resolve(cfg.getToken()).then(function (token) {
        return fetch(endpoint + "/tickets/draft", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ transcript: text, type: $("#type").value }) })
          .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw new Error(j.message || "Error " + res.status); return j; }); });
      }).then(function (d) {
        $("#title").value = d.title; $("#desc").value = d.description; say(d.ai ? "Listo, revisa y corrige lo que quieras antes de enviar." : "Usamos tu dictado tal cual; revísalo antes de enviar.", true);
      }).catch(function () { $("#desc").value = text; $("#title").value = text.slice(0, 100); say("No pudimos armar el resumen; dejamos tu dictado tal cual para que lo edites.", false); })
        .then(function () { micBtn.disabled = false; });
    }
    function startRec() {
      transcript = ""; live.textContent = ""; live.style.display = "block"; msg.textContent = "";
      rec = new SR(); rec.lang = cfg.lang || (navigator.language && navigator.language.indexOf("es") === 0 ? navigator.language : "es-MX"); rec.continuous = true; rec.interimResults = true;
      rec.onresult = function (e) {
        var interim = "";
        for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) transcript += e.results[i][0].transcript + " "; else interim += e.results[i][0].transcript; }
        live.textContent = transcript + interim; live.scrollTop = live.scrollHeight;
      };
      rec.onerror = function (e) { if (e.error === "not-allowed" || e.error === "service-not-allowed") { recording = false; setMic(false); say("Permite el micrófono en tu navegador para dictar.", false); } };
      rec.onend = function () { if (recording) { try { rec.start(); } catch (e) {} } };
      try { rec.start(); setMic(true); } catch (e) { say("No se pudo iniciar el micrófono.", false); }
    }
    micBtn.onclick = function () {
      if (!recording) return startRec();
      setMic(false); try { rec.stop(); } catch (e) {}
      setTimeout(draft, 600);
    };
    $(".x").addEventListener("click", function () { if (recording) { setMic(false); try { rec.stop(); } catch (e) {} } });

    var LBL = { new: "Nuevo", triage: "En revisión", in_progress: "En progreso", waiting_customer: "Esperando tu respuesta", waiting_third_party: "Esperando a un tercero", resolved: "Resuelto", closed: "Cerrado", duplicate: "Duplicado", cancelled: "Cancelado", rejected: "Rechazado", requested: "Solicitado", in_review: "En revisión", quoted: "Cotizado", approved: "Aprobado", planned: "Planificado", in_development: "En desarrollo", in_testing: "En pruebas", released: "Liberado", deferred: "Diferido", blocked: "Bloqueado" };
    var DONE = { resolved: 1, closed: 1, released: 1 }, FINISHED = { resolved: 1, closed: 1, released: 1, duplicate: 1, cancelled: 1, rejected: 1 }, CONFIRMABLE = { resolved: 1, waiting_customer: 1 };
    var rpanel = $(".rpanel"), rbody = $(".rbody"), rtitle = $(".rtitle"), back = $(".back");
    function fmtD(d) { try { return new Date(d).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return d; } }
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function sdk(path, body) {
      return Promise.resolve(cfg.getToken()).then(function (token) {
        return fetch(endpoint + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? { Authorization: "Bearer " + token } : { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || "Error " + r.status); return j; }); });
    }
    function showList() {
      back.style.display = "none"; rtitle.textContent = "Mis reportes a Soporte QSS"; rbody.textContent = ""; rbody.appendChild(el("div", "empty", "Cargando…"));
      sdk("/tickets").then(function (rows) {
        rbody.textContent = "";
        if (!rows.length) { rbody.appendChild(el("div", "empty", "Aún no has enviado reportes.")); return; }
        rows.forEach(function (t) {
          var b = el("button", "item"); b.type = "button";
          var l1 = el("div", "l1"); l1.appendChild(el("span", null, t.key)); l1.appendChild(el("span", "st" + (DONE[t.status] ? " done" : ""), LBL[t.status] || t.status));
          b.appendChild(l1); b.appendChild(el("div", "tt", t.title)); b.appendChild(el("div", "up", "Actualizado " + fmtD(t.updatedAt)));
          b.onclick = function () { showDetail(t.id); }; rbody.appendChild(b);
        });
      }).catch(function () { rbody.textContent = ""; rbody.appendChild(el("div", "empty", "No se pudieron cargar tus reportes. Intenta de nuevo.")); });
    }
    function showDetail(id) {
      back.style.display = "inline-block"; rbody.textContent = ""; rbody.appendChild(el("div", "empty", "Cargando…"));
      sdk("/tickets/" + id).then(function (d) {
        var t = d.ticket; rtitle.textContent = t.key + " · " + (LBL[t.status] || t.status); rbody.textContent = "";
        var box = el("div", "det"); box.appendChild(el("b", null, t.title));
        var items = [{ at: t.createdAt, kind: "status", text: "Reporte recibido" }]
          .concat(d.history.map(function (h) { return { at: h.at, kind: "status", text: "Estatus: " + (h.from ? (LBL[h.from] || h.from) + " → " : "") + (LBL[h.to] || h.to) }; }))
          .concat(d.comments.map(function (c) { return { at: c.createdAt, kind: "note", text: c.body, who: c.authorType === "contact" ? "Tú" : "Soporte QSS" }; }))
          .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
        var ol = el("ol", "tl");
        items.forEach(function (it) { var li = el("li", it.kind); li.appendChild(el("div", "w", fmtD(it.at) + (it.who ? " · " + it.who : ""))); li.appendChild(el("div", "tx", it.text)); ol.appendChild(li); });
        box.appendChild(ol);
        var err = el("div", "msg err"); var actions = el("div", "cm");
        function confirmBtn(text) {
          var cb = el("button", "btn g", text); cb.type = "button";
          cb.onclick = function () { cb.disabled = true; err.textContent = ""; sdk("/tickets/" + id + "/confirm", {}).then(function () { showDetail(id); }).catch(function (e) { cb.disabled = false; err.textContent = e.message || "No se pudo marcar como resuelto."; }); };
          return cb;
        }
        if (t.status === "resolved") {
          actions.appendChild(el("div", "note2", "Soporte marcó este reporte como resuelto. Si todo quedó bien, confírmalo; si el problema continúa, abre un reporte nuevo."));
          var bt = el("div", "btns"); bt.appendChild(confirmBtn("Confirmar que quedó resuelto")); actions.appendChild(bt);
        } else if (FINISHED[t.status]) {
          actions.appendChild(el("div", "note2", "Este reporte ya está terminado. Si el problema continúa, abre un reporte nuevo."));
        } else {
          actions.appendChild(el("label", null, "Agregar un comentario"));
          var ta = el("textarea"); ta.maxLength = 5000; ta.placeholder = "Escribe aquí información adicional o tu respuesta a Soporte…"; actions.appendChild(ta);
          var bt2 = el("div", "btns"), sb = el("button", "btn", "Enviar comentario"); sb.type = "button";
          sb.onclick = function () {
            if (!ta.value.trim()) return; sb.disabled = true; err.textContent = "";
            sdk("/tickets/" + id + "/comments", { body: ta.value.trim() }).then(function () { showDetail(id); }).catch(function (e) { sb.disabled = false; err.textContent = e.message || "No se pudo enviar tu comentario."; });
          };
          bt2.appendChild(sb); if (CONFIRMABLE[t.status]) bt2.appendChild(confirmBtn("Marcar como resuelto")); actions.appendChild(bt2);
        }
        actions.appendChild(err); box.appendChild(actions); rbody.appendChild(box);
      }).catch(function () { rbody.textContent = ""; rbody.appendChild(el("div", "empty", "No se pudo cargar el reporte. Intenta de nuevo.")); });
    }
    function openReports() { panel.classList.remove("open"); rpanel.classList.add("open"); showList(); }
    back.onclick = showList;
    $(".rx").onclick = function () { rpanel.classList.remove("open"); };
    $(".mine").onclick = openReports;

    send.onclick = function () {
      var title = $("#title").value.trim();
      if (title.length < 3) return say("Escribe un resumen (mínimo 3 caracteres).", false);
      send.disabled = true; say("Enviando…", true);
      var type = $("#type").value;
      var shotP = $("#shot").checked ? capture().catch(function () { return null; }) : Promise.resolve(null);
      Promise.all([Promise.resolve(cfg.getToken()), shotP]).then(function (r) {
        var token = r[0], blob = r[1];
        var ctx = { url: location.href, userAgent: navigator.userAgent, appVersion: cfg.appVersion || "", viewport: innerWidth + "x" + innerHeight, locale: navigator.language, consoleErrors: errors.slice() };
        return fetch(endpoint + "/tickets", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ type: type, title: title, description: $("#desc").value + (transcript.trim() ? "\n\n— Transcripción original (dictado) —\n" + transcript.trim() : ""), perceivedSeverity: type === "incident" ? ($("#sev").value || null) : null, context: ctx }) })
          .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw new Error(j.message || "Error " + res.status); return j; }); })
          .then(function (t) {
            var items = []; if (blob) items.push({ name: "captura.png", type: "image/png", body: blob });
            Array.prototype.slice.call($("#files").files, 0, 5).forEach(function (f) { if (/^image\//.test(f.type) && f.size <= 3 * 1024 * 1024) items.push({ name: f.name, type: f.type, body: f }); });
            return Promise.all(items.map(function (it) {
              return fetch(endpoint + "/tickets/" + t.id + "/attachments?filename=" + encodeURIComponent(it.name), { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": it.type }, body: it.body }).catch(function () {});
            })).then(function () { return t; });
          });
      }).then(function (t) {
        say("¡Listo! Tu folio es " + t.key + ". Te avisaremos por correo.", true);
        $("#title").value = ""; $("#desc").value = ""; $("#shot").checked = false; $("#files").value = ""; transcript = ""; live.style.display = "none";
        if (cfg.onSent) try { cfg.onSent(t); } catch (e) {}
      }).catch(function (e) { say("No se pudo enviar: " + (e && e.message ? e.message : e), false); }).then(function () { send.disabled = false; });
    };
    return { open: function () { rpanel.classList.remove("open"); panel.classList.add("open"); }, openReports: function () { openReports(); }, close: function () { panel.classList.remove("open"); rpanel.classList.remove("open"); }, destroy: function () { document.removeEventListener("keydown", onKey); host.remove(); } };
  }
  window.QSSWidget = { init: init };
})();
