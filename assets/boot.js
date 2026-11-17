/* DASKIES safety net. Loads first on every page (plain script, no modules), so it works even when the
   rest of the page fails to load. It:
   1. records unexpected errors to the database (Admin -> Errors) with a short reference,
   2. shows the visitor a clear "Reload" message instead of a broken or blank page,
   3. notices when a page never finishes loading.
   Publishable keys are public by design (same as assets/config.js); the table only accepts new reports. */
(function () {
  "use strict";
  var prod = location.hostname === "daskies.com" || location.hostname === "www.daskies.com";
  var API = prod
    ? { url: "https://auqhmkdeurfexrtzylyd.supabase.co", key: "sb_publishable_g2iFPCDFTggPiqXmsJgW4w_lUaoLbSu" }
    : { url: "https://pbnszadplkqxsvzronfp.supabase.co", key: "sb_publishable_NaeryF24hadyO9eqqXlypg_7vUBO_7y" };
  if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname) && !window.__dskTest) return;

  var ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  var sent = {}, count = 0, shown = false;

  function token() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { var s = JSON.parse(localStorage.getItem(k)); return s && s.access_token; }
      }
    } catch (e) {}
    return null;
  }
  function send(message, detail, auth) {
    var body = JSON.stringify({ page: (location.pathname + location.search).slice(0, 300), message: String(message).slice(0, 1000),
      detail: detail ? String(detail).slice(0, 4000) : null, user_agent: navigator.userAgent.slice(0, 400), ref: ref });
    var h = { "apikey": API.key, "Authorization": "Bearer " + (auth || API.key), "Content-Type": "application/json", "Prefer": "return=minimal" };
    try {
      fetch(API.url + "/rest/v1/client_errors", { method: "POST", headers: h, body: body, keepalive: true })
        .then(function (r) { if (r.status === 401 && auth) send(message, detail, null); })
        .catch(function () {});
    } catch (e) {}
  }
  function report(message, detail, visible) {
    message = String(message || "Unknown error");
    if (sent[message] || count >= 5) return;
    sent[message] = 1; count++;
    send(message, detail, token());
    if (visible) banner();
  }
  function banner(text) {
    if (shown) return;
    if (!document.body) { document.addEventListener("DOMContentLoaded", function () { banner(text); }); return; }   // failed while the page head was still loading
    shown = true;
    var d = document.createElement("div");
    d.setAttribute("role", "alert");
    d.className = "errbar";
    d.innerHTML = '<span>' + (text || "Something went wrong on this page.") + ' Reload to try again. If it keeps happening, WhatsApp us and quote <b>' + ref + '</b>.</span>' +
      '<button type="button" class="errbar-reload">Reload</button><button type="button" class="errbar-x" aria-label="Dismiss">×</button>';
    d.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#142A2E;color:#fff;padding:12px 14px;border-radius:10px;font:15px/1.4 Archivo,system-ui,sans-serif;box-shadow:0 12px 32px -12px rgba(0,0,0,.5);max-width:720px;margin:0 auto";
    d.querySelector(".errbar-reload").style.cssText = "margin-left:auto;background:#fff;color:#142A2E;border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer";
    d.querySelector(".errbar-x").style.cssText = "background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px";
    d.querySelector(".errbar-reload").onclick = function () { location.reload(); };
    d.querySelector(".errbar-x").onclick = function () { d.remove(); };
    document.body.appendChild(d);
  }
  var NETWORK = /Failed to fetch|NetworkError|Load failed|network connection was lost/i;
  var ours = function (file) { return !file || file.indexOf(location.origin) === 0; };

  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && (t.tagName === "SCRIPT" || t.tagName === "LINK")) {
      var src = t.src || t.href || "";
      if (src.indexOf(location.origin) === 0) report("Failed to load " + src.replace(location.origin, ""), null, true);
      return;
    }
    if (t && t !== window && t.nodeType === 1) return;   // a photo or other media that didn't load is not a page error
    var msg = e.message || "";
    if (/(^|\s)stop$/.test(msg) || (e.error && e.error.message === "stop")) return;   // intentional halt after a redirect
    if (msg === "Script error." || !ours(e.filename)) return;                          // browser extensions, other sites
    report(msg, (e.error && e.error.stack) || (e.filename + ":" + e.lineno), true);
  }, true);

  // Page-change animations (View Transitions) reject their promises when a visitor clicks on
  // before one finishes. That is expected, so catch it here instead of reporting it.
  function quietVT(e) { var t = e && e.viewTransition; if (!t) return; ["ready", "finished", "updateCallbackDone"].forEach(function (k) { if (t[k] && t[k].catch) t[k].catch(function () {}); }); }
  window.addEventListener("pagereveal", quietVT);
  window.addEventListener("pageswap", quietVT);

  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    var msg = r.message || String(r);
    if (msg === "stop") return;
    if (/Transition was (aborted|skipped)|ViewTransition/i.test(msg)) { e.preventDefault(); return; }   // page-change animation cut short by a quick click: harmless
    report("Unhandled: " + msg, r.stack, !NETWORK.test(msg));
  });

  // A member page that is still showing its loading placeholder after 15 seconds didn't load properly.
  setTimeout(function () {
    var m = document.getElementById("main");
    if (m && (m.querySelector(':scope > .skel') || /^\s*Loading…\s*$/.test(m.textContent))) {
      report("Page did not finish loading", null, false);
      m.innerHTML = '<div class="panel empty"><h1>This page didn’t load</h1><p>Check your connection and reload. If it keeps happening, WhatsApp us and quote <b>' + ref + '</b>.</p><button class="btn btn-primary" type="button" onclick="location.reload()">Reload</button></div>';
    }
  }, 15000);

  // Lets page code record errors it caught itself: window.dskReport("message", detail)
  window.dskReport = function (message, detail) { report(message, detail, false); };
})();
