// Shared helpers for every DASKIES member page.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import CONFIG from "./config.js";
import { vertical, LEVELS } from "./taxonomy.js";

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
export const when = (d) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const day = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "Something went wrong");
  if (/Invalid login credentials/i.test(m)) return "Email or password is wrong.";
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
  const [{ data: profile }, { data: business }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    sb.from("businesses").select("*").eq("owner_id", user.id).maybeSingle()
  ]);
  return (_me = { user, profile, business });
}

export async function requireAuth() {
  const m = await me();
  if (!m.user) { location.href = "account.html?next=" + encodeURIComponent(location.pathname.replace(/^\//, "") + location.search); return null; }
  return m;
}

export const photoUrl = (path) => sb.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;

export function levelBadge(level = 1) {
  const n = Math.max(1, Math.min(5, level || 1));
  return `<span class="level" title="${esc(LEVELS[n])}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")} Level ${n}: ${esc(LEVELS[n])}</span>`;
}

export function card(l) {
  const v = vertical(l.vertical);
  const photo = l.listing_photos && l.listing_photos.length ? [...l.listing_photos].sort((a, b) => a.sort - b.sort)[0] : null;
  const where = [l.city, l.country].filter(Boolean).join(", ");
  return `<a class="card" href="listing.html?id=${esc(l.id)}">
    <div class="ph">${photo ? `<img src="${esc(photoUrl(photo.path))}" alt="" loading="lazy">` : esc(v ? v.short : "")}</div>
    <div class="bd">
      <div class="tags"><span class="tag tag-${l.kind}">${l.kind === "offer" ? "Available" : "Wanted"}</span>${l.status && l.status !== "approved" ? `<span class="tag tag-${l.status}">${esc(statusWord(l.status))}</span>` : ""}</div>
      <span class="small muted">${esc(v ? v.name : "")} · ${esc(l.subcategory)}</span>
      <h3>${esc(l.title)}</h3>
      <span class="small muted">${esc(where)}${l.quantity ? ` · ${esc(l.quantity)} ${esc(l.quantity_unit || "")}` : ""}</span>
      <span class="price">${esc(money(l.price, l.currency, l.price_unit))}</span>
    </div></a>`;
}
export const statusWord = (s) => ({ pending: "Waiting for review", approved: "Live", rejected: "Not approved", closed: "Closed", draft: "Draft" }[s] || s);

const BIRD = `<svg viewBox="12 28 314 230" aria-hidden="true"><path fill="#FFB52E" d="M22,104 C78,106 140,128 182,163 C132,154 74,134 22,104 Z"/><path fill="#1C8FD6" d="M18,36 C100,30 178,62 224,112 L232,150 C210,204 132,238 48,252 C100,220 146,190 173,161 C127,123 79,79 18,36 Z"/><path fill="#E8432F" d="M203,111 C211,86 234,69 259,69 C280,69 297,82 320,101 C298,104 289,110 285,120 C277,142 257,156 230,160 C224,141 216,125 203,111 Z"/></svg>`;
const WA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M8.6 12h.01M12 12h.01M15.4 12h.01" stroke-width="2.6"/></svg>`;

export async function header(active) {
  const m = await me();
  const page = (p, label) => `<a href="${p}"${active === p ? ' aria-current="page"' : ""}>${label}</a>`;
  const links = [page("explore.html", "Explore"), page("post.html?kind=need", "Post a need"), page("post.html?kind=offer", "List an offer")];
  if (m.user) links.push(page("dashboard.html", "Dashboard"));
  if (m.profile && m.profile.is_admin) links.push(page("admin.html", "Admin"));
  const right = m.user
    ? `<button class="btn btn-ghost btn-sm" id="signOut" type="button">Sign out</button>`
    : `<a class="btn btn-ghost btn-sm" href="account.html">Sign in</a><a class="btn btn-primary btn-sm" href="account.html?mode=signup">Join free</a>`;
  const hd = document.createElement("header");
  hd.className = "hd";
  hd.innerHTML = `${ENV === "staging" ? '<div class="envbar">Staging site: test data only</div>' : ""}<div class="wrap hd-row">
    <a class="brand" href="index.html" aria-label="DASKIES home">${BIRD}<b>DASKIES</b></a>
    <nav class="nav" id="nav" aria-label="Main">${links.join("")}</nav>
    <div class="hd-cta">${right}<button class="menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="nav"><span></span></button></div></div>`;
  document.body.prepend(hd);
  $("#menuBtn").addEventListener("click", (e) => { const o = $("#nav").classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", o); });
  const so = $("#signOut");
  if (so) so.addEventListener("click", async () => { await sb.auth.signOut(); location.href = "index.html"; });
  // WhatsApp, general enquiries; the number is assembled only on tap
  const wa = document.createElement("button");
  wa.className = "wa-btn"; wa.type = "button"; wa.setAttribute("aria-label", "WhatsApp: general enquiries");
  wa.innerHTML = `${WA}<span>WhatsApp</span>`;
  wa.addEventListener("click", () => {
    const url = "https://wa.me/" + ["91", "98252", "19071"].join("") + "?text=" + encodeURIComponent("Hello DASKIES, I have a general enquiry.");
    const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url;
  });
  document.body.appendChild(wa);
  const f = document.createElement("footer");
  f.className = "foot";
  f.innerHTML = `<div class="wrap">DASKIES connects businesses and reviews listings for completeness. We don't guarantee any listing, counterparty or outcome; do your own checks before any deal. © ${new Date().getFullYear()} Daskies.</div>`;
  document.body.appendChild(f);
  const badge = () => document.body.classList.toggle("has-badge", !!document.getElementById("nl-badge-frame"));
  badge(); new MutationObserver(badge).observe(document.body, { childList: true });
  return m;
}
