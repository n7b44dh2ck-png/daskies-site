/* DASKIES price display: visitors in India see rupees, everyone else sees US dollars.
   Prices are stored in the seller's own currency; this only changes how they are shown.
   Converted amounts are marked "≈" and use the European Central Bank reference rate
   (via frankfurter.dev). If no recent rate is available, the seller's original price is shown.
   Contracts, fees and deal rooms keep the original currency: they don't use this. */
(function () {
  "use strict";
  var KEY = "dsk_cur", RATES = "dsk_fx";
  var AED_PER_USD = 3.6725; // UAE dirham is pegged to the US dollar
  var listeners = [];

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function detect() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (/^Asia\/(Kolkata|Calcutta)$/.test(tz)) return "INR";
    } catch (e) {}
    var ls = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < ls.length; i++) if (/-IN$/i.test(String(ls[i]))) return "INR";
    return "USD";
  }
  var cur = read(KEY);
  if (cur !== "INR" && cur !== "USD") cur = detect();

  var fx = null;
  try { fx = JSON.parse(read(RATES) || "null"); } catch (e) { fx = null; }
  function usable() { return !!(fx && fx.rates && fx.rates.INR > 0 && Date.now() - fx.at < 7 * 864e5); }
  function fresh() { return usable() && Date.now() - fx.at < 12 * 36e5; }

  function fetchRates() {
    var urls = ["https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,EUR,GBP", "https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP"];
    function tryAt(i) {
      if (i >= urls.length) return;
      fetch(urls[i]).then(function (r) { if (!r.ok) throw new Error("rate " + r.status); return r.json(); }).then(function (d) {
        if (!d || !d.rates || !(d.rates.INR > 0)) throw new Error("rate data");
        var rates = { USD: 1, AED: AED_PER_USD };
        for (var k in d.rates) if (d.rates[k] > 0) rates[k] = d.rates[k];
        fx = { date: d.date, rates: rates, at: Date.now() };
        store(RATES, JSON.stringify(fx));
        paint(); emit();
      }).catch(function () { tryAt(i + 1); });
    }
    tryAt(0);
  }

  function conv(v, from, to) {
    v = Number(v); from = from || "INR";
    if (!isFinite(v)) return null;
    if (from === to) return v;
    if (!usable()) return null;
    var a = fx.rates[from], b = fx.rates[to];
    if (!(a > 0) || !(b > 0)) return null;
    return v / a * b;
  }
  // Converted amounts are approximate, so show three significant figures.
  function round3(n) { if (n <= 0) return 0; var p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 2)); return Math.round(n / p) * p; }
  function fmt(n, c) {
    n = round3(n);
    if (c === "USD") return n >= 1e6 ? "US$" + (+(n / 1e6).toFixed(2)) + " million" : "US$" + n.toLocaleString("en-US");
    return n >= 1e7 ? "₹" + (+(n / 1e7).toFixed(2)) + " crore" : n >= 1e5 ? "₹" + (+(n / 1e5).toFixed(2)) + " lakh" : "₹" + n.toLocaleString("en-IN");
  }
  // The amount in the visitor's currency, or null when it is already in that currency or no rate is available.
  function label(v, from) {
    if (v === null || v === undefined || v === "") return null;
    from = from || "INR";
    if (from === cur) return null;
    var x = conv(v, from, cur);
    if (x === null) return null;
    return x === 0 ? fmt(0, cur) : "≈ " + fmt(x, cur);
  }
  // The currency actually in use: dollars only once a recent rate is available.
  function eff() { return cur === "USD" && usable() ? "USD" : "INR"; }
  function day(d) { try { return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d; } }
  function rateLine() { return usable() ? "European Central Bank reference rate of " + day(fx.date) + " (US$1 = ₹" + fx.rates.INR.toFixed(2) + ")" : ""; }

  // Rupee amounts written into page text (₹15,000, 15 000 ₹, ₹0), for overseas visitors.
  var PRE = /₹\s?(\d{1,3}(?:[,.   ]\d{3})+|\d+)(?![\d.,]*\s?(?:lakh|crore|Lakh|Crore|लाख|करोड़))/g;
  var POST = /(\d{1,3}(?:[   ]\d{3})+)\s?₹/g;
  function text(s) {
    if (cur === "INR" || !usable() || !s || s.indexOf("₹") < 0) return s;
    function sw(m, d) { var l = label(Number(String(d).replace(/\D/g, "")), "INR"); return l || m; }
    return s.replace(PRE, sw).replace(POST, sw);
  }

  // Elements: <span class="pz" data-v="4500000" data-c="INR" data-u="/ month">₹45 lakh / month</span>
  // Only touches the text while converting, so page translation can work on the original freely.
  function paintOne(el) {
    var l = label(el.getAttribute("data-v"), el.getAttribute("data-c") || "INR");
    var on = el.hasAttribute("data-x");
    if (l) {
      if (!on) { el.setAttribute("data-o", el.textContent); el.setAttribute("data-x", ""); }
      var u = el.getAttribute("data-u"), t = l + (u ? " " + u : "");
      if (el.textContent !== t) el.textContent = t;
      var tip = "Seller's price: " + el.getAttribute("data-o");
      if (el.getAttribute("title") !== tip) el.setAttribute("title", tip);
    } else if (on) {
      el.removeAttribute("data-x"); el.removeAttribute("title");
      el.textContent = el.getAttribute("data-o") || "";
    }
  }
  // <p data-fxnote data-c="INR" data-o="₹45 lakh"></p>: explains a converted price, empty otherwise.
  function paintNote(el) {
    var c = el.getAttribute("data-c") || "INR", o = el.getAttribute("data-o") || "";
    var t = (c !== cur && usable() && fx.rates[c] > 0) ? "Shown in " + (cur === "USD" ? "US dollars" : "rupees") + " for your convenience, converted at the " + rateLine() + ". The seller's price is " + o + "; the deal is agreed in that currency." : "";
    if (el.textContent !== t) el.textContent = t;
    el.hidden = !t;
  }
  function picker(nav) {
    if (nav.querySelector(".curpick")) return;
    var w = document.createElement("label"); w.className = "curpick";
    w.innerHTML = 'Prices in <select aria-label="Show prices in"><option value="INR">₹ rupees</option><option value="USD">US$ dollars</option></select>';
    var s = w.querySelector("select"); s.value = cur;
    s.addEventListener("change", function () { set(s.value); });
    nav.appendChild(w);
  }
  var queued = false;
  function paint() {
    queued = false;
    var i, a = document.querySelectorAll(".pz[data-v]");
    for (i = 0; i < a.length; i++) paintOne(a[i]);
    a = document.querySelectorAll("[data-fxnote]");
    for (i = 0; i < a.length; i++) paintNote(a[i]);
    a = document.querySelectorAll("[data-cur-only]");
    for (i = 0; i < a.length; i++) {
      var hide = a[i].getAttribute("data-cur-only") !== eff();
      if (a[i].hidden !== hide) a[i].hidden = hide;
      var d = hide ? "none" : ""; if (a[i].style.display !== d) a[i].style.display = d; // page styles can override [hidden]
    }
    a = document.querySelectorAll(".foot-links");
    for (i = 0; i < a.length; i++) picker(a[i]);
    a = document.querySelectorAll(".curpick select");
    for (i = 0; i < a.length; i++) if (a[i].value !== cur) a[i].value = cur;
  }
  function soon() { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(paint); } }
  function emit() { listeners.forEach(function (f) { try { f(cur); } catch (e) {} }); }
  function set(c) {
    if (c !== "INR" && c !== "USD") return;
    cur = c; store(KEY, c);
    paint(); emit();
  }

  window.DSKFX = {
    cur: function () { return cur; },
    eff: eff,
    set: set, conv: conv, fmt: fmt, label: label, text: text, rateLine: rateLine,
    ready: function () { return usable(); },
    paint: paint,
    on: function (f) { listeners.push(f); }
  };

  function start() {
    paint();
    if (window.MutationObserver) new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  // Rupee-only visitors on rupee prices need no rates at all, but listings in other currencies do.
  if (!fresh()) fetchRates();
})();
