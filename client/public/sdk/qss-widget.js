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
    ".x{position:absolute;top:8px;right:10px;border:0;background:none;font-size:22px;line-height:1;color:#666;cursor:pointer}.x:hover{color:#000}.msg{margin-top:8px;font-size:13px}.err{color:#b00020}.ok{color:#0a7d33}";

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
      "<label>Resumen</label><input id='title' maxlength='200' placeholder='Ej. No me deja guardar la orden'>" +
      "<label>Detalle</label><textarea id='desc' placeholder='¿Qué hiciste y qué esperabas que pasara?'></textarea>" +
      "<div class='row'><input type='checkbox' id='shot'><label style='margin:0'>Adjuntar captura de pantalla (te pediremos permiso)</label></div>" +
      "<button class='send'>Enviar</button><div class='msg'></div></div>";
    if (cfg.position === "header") { var hs = document.createElement("style"); hs.textContent = ".fab{display:none}.panel{top:64px;right:16px;bottom:auto}"; root.appendChild(hs); }
    if (cfg.position === "left") { var pos = document.createElement("style"); pos.textContent = ".fab,.panel{right:auto;left:20px}"; root.appendChild(pos); }
    document.body.appendChild(host);
    var $ = function (s) { return root.querySelector(s); };
    var panel = $(".panel"), msg = $(".msg"), send = $(".send");
    $(".fab").onclick = function () { panel.classList.toggle("open"); };
    $(".x").onclick = function () { panel.classList.remove("open"); };
    var onKey = function (e) { if (e.key === "Escape") panel.classList.remove("open"); };
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
          body: JSON.stringify({ type: type, title: title, description: $("#desc").value, perceivedSeverity: type === "incident" ? ($("#sev").value || null) : null, context: ctx }) })
          .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw new Error(j.message || "Error " + res.status); return j; }); })
          .then(function (t) {
            if (!blob) return t;
            return fetch(endpoint + "/tickets/" + t.id + "/attachments?filename=captura.png", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "image/png" }, body: blob }).then(function () { return t; }).catch(function () { return t; });
          });
      }).then(function (t) {
        say("¡Listo! Tu folio es " + t.key + ". Te avisaremos por correo.", true);
        $("#title").value = ""; $("#desc").value = ""; $("#shot").checked = false;
        if (cfg.onSent) try { cfg.onSent(t); } catch (e) {}
      }).catch(function (e) { say("No se pudo enviar: " + (e && e.message ? e.message : e), false); }).then(function () { send.disabled = false; });
    };
    return { open: function () { panel.classList.add("open"); }, close: function () { panel.classList.remove("open"); }, destroy: function () { document.removeEventListener("keydown", onKey); host.remove(); } };
  }
  window.QSSWidget = { init: init };
})();
