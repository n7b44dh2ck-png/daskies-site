// Shared helpers for every DASKIES member page.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import CONFIG from "./config.js?v=ee644fd6";
import { vertical, LEVELS } from "./taxonomy.js?v=ee644fd6";

export const ENV = CONFIG.name;
export const sb = createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export const $ = (s, c = document) => c.querySelector(s);
export const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const qs = (k) => new URLSearchParams(location.search).get(k);

export function money(v, cur = "INR", unit = "") {
  if (v === null || v === undefined || v === "") return "Price on request";
  const n = Number(v);
  let s;
  if (cur === "INR") {
    s = n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} crore` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} lakh` : `₹${n.toLocaleString("en-IN")}`;
  } else {
    try { s = new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); } catch { s = `${cur} ${n}`; }
  }
  return unit ? `${s} ${unit}` : s;
}
// A price while browsing: fx.js shows it in the visitor's currency (≈ US$ overseas, ₹ in India).
// The seller's own price stays in the page as the fallback. Contracts and fees use money(), not this.
export function price(v, cur = "INR", unit = "") {
  const s = esc(money(v, cur, unit));
  if (v === null || v === undefined || v === "" || !isFinite(Number(v))) return s;
  return `<span class="pz" data-v="${Number(v)}" data-c="${esc(cur || "INR")}"${unit ? ` data-u="${esc(unit)}"` : ""}>${s}</span>`;
}
export const when = (d) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const day = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "Something went wrong");
  if (/Invalid login credentials/i.test(m)) return "Email or password is wrong.";
  if (/Email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent when you joined.";
  if (/expired|invalid.*(link|token|otp)|otp_expired/i.test(m)) return "That email link has expired or was already used. Ask for a new one below.";
  if (/already registered|already been registered/i.test(m)) return "An account with this email already exists. Sign in instead.";
  if (/Password should be/i.test(m)) return "Use a password of at least 8 characters.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "No connection. Check your internet and try again.";
  return m;
}

export function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : "");
  t.setAttribute("role", bad ? "alert" : "status");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3500);
}

export function busy(btn, on, label = "Saving…") {
  if (!btn) return;
  if (on) { btn.dataset.l = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; }
}

let _me = null;
export async function me(force = false) {
  if (_me && !force) return _me;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (_me = { user: null });
  const user = session.user;
  const [{ data: profile }, { data: business }, { data: priv }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    sb.from("businesses").select("*").eq("owner_id", user.id).maybeSingle(),
    sb.from("business_private").select("*").eq("owner_id", user.id).maybeSingle()
  ]);
  const m = { user, profile, business, private: priv };
  m.missing = missing(m); m.complete = !m.missing.length;
  return (_me = m);
}

// What a member still has to give before they can post, enquire, message or deal (mirrors the database rule).
export function missing(m) {
  const p = m.profile || {}, b = m.business || {}, x = m.private || {}, out = [];
  const t = (v) => String(v || "").trim();
  if (t(p.full_name).length < 2) out.push("your name");
  const d = t(p.phone).replace(/\D/g, "").length; if (d < 10 || d > 15) out.push("mobile number");
  if (t(b.name).length < 2) out.push("business name");
  if (!(b.roles || []).length) out.push("what your business does");
  if (t(x.address).length < 8) out.push("address");
  if (!t(x.postal_code)) out.push("PIN code");
  if (t(b.city).length < 2) out.push("city");
  if (t(b.state).length < 2) out.push("state");
  if (t(b.country).length < 2) out.push("country");
  if (p.terms_version !== TERMS_VERSION) out.push("acceptance of the Terms");
  return out;
}
// Must match public.current_terms_version() in the database (supabase/005_fees_terms.sql).
export const TERMS_VERSION = "2026-11-16";
const here = () => location.pathname.replace(/^\//, "") + location.search + location.hash;
export const completeUrl = (next = here()) => "account.html?mode=complete&next=" + encodeURIComponent(next);

export async function requireAuth() {
  const m = await me();
  if (!m.user) { location.href = "account.html?next=" + encodeURIComponent(location.pathname.replace(/^\//, "") + location.search); return null; }
  if (!m.complete && !(m.profile && m.profile.is_admin)) { location.href = completeUrl(); return null; }
  return m;
}

export const photoUrl = (path) => sb.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;

export function levelBadge(level = 1) {
  const n = Math.max(1, Math.min(5, level || 1));
  return `<span class="level" title="${esc(LEVELS[n])}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")} Level ${n}: ${esc(LEVELS[n])}</span>`;
}

// Line drawings for the six verticals (the same drawings as the homepage).
const VI = {
  industrial: '<circle cx="12" cy="12" r="7.6" stroke-width="3.2" stroke-dasharray="2.9 3.07" stroke-linecap="butt"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="2.2"/>',
  commodity: '<path d="M12 22V9"/><path d="M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5zM12 17c0-3 2-5 5-5 0 3-2 5-5 5z"/>',
  "real-assets": '<path d="M3 21h18M5 21V9l5-3v15M10 21V4l9 4v13M13 10h3M13 13h3M13 16h3M7 12h1M7 15h1"/>',
  storage: '<path d="M2 9l10-6 10 6v12H2z"/><path d="M6 21v-8h12v8M6 16h12"/>',
  "barter-tech": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  projects: '<path d="M3 21V10l6 3V10l6 3V6l6 3v12H3z"/><path d="M7 17h2M11 17h2M15 17h2"/>',
  check: '<path d="M4 12.5l5 5L20 6.5" stroke-width="2.2"/>'
};
export const vicon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${VI[id] || VI.projects}</svg>`;

// Page head: the charcoal plate at the top of explore, dashboard, deal room and post pages. Arguments are HTML.
export const pagehead = ({ crumb = "", pre = "", title, lead = "", body = "", h = "h1" }) =>
  `<div class="phead"><div class="phead-in">${crumb ? `<p class="crumb">${crumb}</p>` : ""}${pre}<${h} class="pt">${title}</${h}>${lead ? `<p class="plead">${lead}</p>` : ""}${body}</div></div>`;

export function card(l) {
  const v = vertical(l.vertical);
  const photo = l.listing_photos && l.listing_photos.length ? [...l.listing_photos].sort((a, b) => a.sort - b.sort)[0] : null;
  const where = [l.city, l.country].filter(Boolean).join(", ");
  const qty = l.quantity ? `${l.quantity} ${l.quantity_unit || ""}`.trim() : "";
  return `<a class="card card-${l.kind === "need" ? "need" : "offer"}" href="listing.html?id=${esc(l.id)}">
    <div class="ph${photo ? " has-photo" : ""}">${photo ? `<img src="${esc(photoUrl(photo.path))}" alt="" loading="lazy">` : `${vicon(l.vertical)}<span class="vl">${esc(v ? v.short : "")}</span>`}</div>
    <div class="bd">
      <div class="tags"><span class="tag tag-${l.kind}">${l.kind === "offer" ? "Available" : "Wanted"}</span>${l.managed ? '<span class="tag tag-by">Listed by DASKIES</span>' : ""}${l.status && l.status !== "approved" ? `<span class="tag tag-${l.status}">${esc(statusWord(l.status))}</span>` : ""}</div>
      <h3>${esc(l.title)}</h3>
      <span class="sub">${esc(l.subcategory)}</span>
      <span class="where">${esc([where, qty].filter(Boolean).join(" · "))}</span>
      <span class="price">${price(l.price, l.currency, l.price_unit)}</span>
    </div></a>`;
}
export const statusWord = (s) => ({ pending: "Waiting for review", approved: "Live", rejected: "Not approved", closed: "Closed", draft: "Draft" }[s] || s);

const BIRD = `<svg viewBox="12 28 314 230" aria-hidden="true"><path fill="#FFB52E" d="M22,104 C78,106 140,128 182,163 C132,154 74,134 22,104 Z"/><path fill="#1C8FD6" d="M18,36 C100,30 178,62 224,112 L232,150 C210,204 132,238 48,252 C100,220 146,190 173,161 C127,123 79,79 18,36 Z"/><path fill="#E8432F" d="M203,111 C211,86 234,69 259,69 C280,69 297,82 320,101 C298,104 289,110 285,120 C277,142 257,156 230,160 C224,141 216,125 203,111 Z"/></svg>`;
const WA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M8.6 12h.01M12 12h.01M15.4 12h.01" stroke-width="2.6"/></svg>`;

export async function header(active) {
  const m = await me();
  const page = (p, label) => `<a href="${p}"${active === p ? ' aria-current="page"' : ""}>${label}</a>`;
  const MK = ["leasing.html", "machines.html", "storage.html", "agri.html", "construction.html", "technology.html"];
  const links = [page("explore.html", "Explore"),
    `<a href="index.html#categories"${MK.includes(active) ? ' aria-current="page"' : ""}>What you need</a>`,
    page("post.html?kind=need", "Post a need"), page("post.html?kind=offer", "List an offer")];
  if (m.user) links.push(page("dashboard.html", "Dashboard"));
  if (m.profile && m.profile.is_admin) links.push(page("admin.html", "Admin"));
  links.push(m.user ? `<a href="index.html" class="nav-m" data-signout>Sign out</a>` : `<a href="account.html" class="nav-m">Sign in</a>`);
  const right = m.user
    ? `<div class="bell-wrap"><button class="bell" id="bell" type="button" aria-label="Alerts" aria-expanded="false" aria-controls="bellPanel"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="bell-n" id="bellN" hidden></span></button>
        <div class="bell-panel" id="bellPanel" role="region" aria-label="Alerts" hidden></div></div>
       <button class="btn btn-ghost btn-sm" id="signOut" type="button">Sign out</button>`
    : `<a class="btn btn-ghost btn-sm" href="account.html">Sign in</a><a class="btn btn-primary btn-sm" href="account.html?mode=signup">Join free</a>`;
  const hd = document.createElement("header");
  hd.className = "hd";
  hd.innerHTML = `${ENV === "staging" ? '<div class="envbar">Staging site: test data only</div>' : ""}<div class="wrap hd-row">
    <a class="brand" href="index.html" aria-label="DASKIES home">${BIRD}<b>DASKIES</b></a>
    <nav class="nav" id="nav" aria-label="Main">${links.join("")}</nav>
    <div class="hd-cta">${right}<button class="menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="nav"><span></span></button></div></div>`;
  document.body.prepend(hd);
  if (m.user && !m.complete && !/account\.html$/.test(location.pathname)) {
    hd.insertAdjacentHTML("afterend", `<div class="profbar" role="status"><div class="wrap">Your profile is missing ${esc(m.missing.slice(0, 3).join(", "))}${m.missing.length > 3 ? " and more" : ""}. Complete it to post, enquire, message or start deals. <a href="${esc(completeUrl())}">Complete your profile</a></div></div>`);
  }
  $("#menuBtn").addEventListener("click", (e) => { const o = $("#nav").classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", o); });
  $$("#signOut, [data-signout]").forEach((so) => so.addEventListener("click", async (e) => { e.preventDefault(); await sb.auth.signOut(); location.href = "index.html"; }));
  if (m.user) alerts();
  // WhatsApp, general enquiries; the number is assembled only on tap
  const wa = document.createElement("button");
  wa.className = "wa-btn"; wa.type = "button"; wa.setAttribute("aria-label", "WhatsApp: general enquiries");
  wa.innerHTML = `${WA}<span>WhatsApp</span>`;
  wa.addEventListener("click", () => {
    const url = "https://wa.me/" + ["91", "98252", "12448"].join("") + "?text=" + encodeURIComponent("Hello DASKIES, I have a general enquiry.");
    const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url;
  });
  document.body.appendChild(wa);
  const f = document.createElement("footer");
  f.className = "foot";
  const CATS = [["leasing.html", "Industrial leasing"], ["machines.html", "Used machines"], ["storage.html", "Storage & warehousing"], ["agri.html", "Agriculture & commodities"], ["construction.html", "Construction at cost"], ["technology.html", "Technology & education"]];
  const li = ([h, n]) => `<li><a href="${h}">${n}</a></li>`;
  f.innerHTML = `<div class="wrap"><div class="foot-grid">
    <div><a class="brand" href="index.html" aria-label="DASKIES home">${BIRD}<b>DASKIES</b></a><p class="foot-tag">The business network for Indian industry: lease, buy, sell, barter or donate.</p></div>
    <div><h3>What you need</h3><ul>${CATS.map(li).join("")}</ul></div>
    <div><h3>Platform</h3><ul>${[["explore.html", "Explore"], ["post.html?kind=offer", "List an offer"], ["post.html?kind=need", "Post a need"], ["index.html#how-it-works", "How it works"], ["pricing.html", "Membership"], ["for-startups.html", "For startups"], ["for-businesses.html", "For established businesses"], ["guides.html", "Guides"]].map(li).join("")}</ul></div>
    <div><h3>Company</h3><ul>${[["about.html", "About us"], ["global-buyers.html", "Global buyers"], ["services.html", "Services"], ["partners.html", "Partner with us"], ["mailto:info@daskies.com", "info@daskies.com"]].map(li).join("")}</ul></div></div>
    <div class="legal"><p>DASKIES connects businesses and reviews listings for completeness. We don't guarantee any listing, counterparty or outcome; do your own checks before any deal.</p>
    <nav class="foot-links" aria-label="Policies"><a href="pricing.html">Pricing</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="refunds.html">Refunds and cancellations</a><a href="about.html">About us</a><a href="contact.html">Contact us</a></nav>
    <p class="copy">© ${new Date().getFullYear()} Daskies. All rights reserved.</p></div></div>`;
  document.body.appendChild(f);
  const badge = () => document.body.classList.toggle("has-badge", !!document.getElementById("nl-badge-frame"));
  badge(); new MutationObserver(badge).observe(document.body, { childList: true });
  return m;
}

// In-app alerts: the bell in the header. Alerts are written by the database; this only reads and marks them.
const ICON = { message: "✉", deal: "⇄", listing: "▦", document: "▤", verification: "✓", review: "!", payment: "₹" };
async function alerts() {
  const btn = $("#bell"), panel = $("#bellPanel"), badge = $("#bellN");
  let list = [];
  const setCount = (n) => {
    badge.hidden = !n; badge.textContent = n > 99 ? "99+" : n;
    btn.setAttribute("aria-label", n ? `Alerts, ${n} unread` : "Alerts");
    document.title = (n ? `(${n > 99 ? "99+" : n}) ` : "") + document.title.replace(/^\(\d+\+?\) /, "");
  };
  const count = async () => {
    const { count: n, error } = await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    if (!error) setCount(n || 0);
  };
  const render = () => {
    panel.innerHTML = `<div class="bell-head"><b>Alerts</b>${list.some((a) => !a.read_at) ? '<button class="linkbtn" type="button" id="bellAll">Mark all read</button>' : ""}</div>
      ${list.length ? `<ul class="bell-list">${list.map((a) => `<li class="${a.read_at ? "" : "unread"}"><a href="${esc(a.link)}" data-id="${a.id}">
        <span class="bell-ic" aria-hidden="true">${ICON[a.kind] || "•"}</span><span class="bell-tx"><b>${esc(a.title)}</b>${a.body ? `<span>${esc(a.body)}</span>` : ""}<time>${esc(when(a.created_at))}</time></span>${a.read_at ? "" : '<span class="sr">unread</span>'}</a></li>`).join("")}</ul>`
      : `<p class="bell-empty">No alerts yet. New messages, offers and decisions on your listings will show up here.</p>`}`;
  };
  const load = async () => {
    const { data, error } = await sb.from("notifications").select("id,kind,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(30);
    if (error) { panel.innerHTML = `<p class="bell-empty">${esc(errMsg(error))}</p>`; return; }
    list = data || []; render();
  };
  const open = async (on) => {
    panel.hidden = !on; btn.setAttribute("aria-expanded", on);
    if (on && getComputedStyle(panel).position === "fixed") panel.style.top = Math.round($(".hd").getBoundingClientRect().bottom + 8) + "px";
    if (on) { panel.innerHTML = '<p class="bell-empty">Loading…</p>'; await load(); }
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); open(panel.hidden); });
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target)) open(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { open(false); btn.focus(); } });
  panel.addEventListener("click", async (e) => {
    if (e.target.id === "bellAll") {
      e.stopPropagation();
      const { error } = await sb.rpc("mark_notifications_read", { p_ids: null });
      if (error) return toast(errMsg(error), true);
      list.forEach((a) => (a.read_at = a.read_at || new Date().toISOString())); render(); setCount(0); return;
    }
    const a = e.target.closest("a[data-id]");
    if (!a) return;
    e.preventDefault();
    const item = list.find((x) => String(x.id) === a.dataset.id);
    if (item && !item.read_at) await sb.rpc("mark_notifications_read", { p_ids: [item.id] });
    const to = new URL(a.getAttribute("href"), location.href);
    location.href = to.href;
    if (to.pathname === location.pathname && to.search === location.search) location.reload();
  });
  await count();
  setInterval(() => { if (document.visibilityState === "visible") count(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") count(); });
}
