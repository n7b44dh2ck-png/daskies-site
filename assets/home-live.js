// Homepage: live listings from the database, and a signed-in member's header.
// While the marketplace is empty the page keeps its clearly labelled samples.
import { sb, esc, money, price, photoUrl } from "./core.js?v=10fbaccf";
import { vertical } from "./taxonomy.js?v=10fbaccf";

const $ = (s) => document.querySelector(s);
const ICON = { industrial: "lease", commodity: "agri", "real-assets": "infra", storage: "storage", "barter-tech": "tech", projects: "infra" };

async function member() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  const cta = $(".head-cta");
  if (cta) cta.innerHTML = '<a class="btn btn-primary btn-sm" href="dashboard.html" id="homeDash">Dashboard</a>';
  document.querySelectorAll('.nav a.nav-join').forEach((a) => {
    if (a.classList.contains("nav-signin")) { a.textContent = "Dashboard"; a.href = "dashboard.html"; }
    else if (a.getAttribute("href").startsWith("account.html")) a.hidden = true;
  });
  const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", data.session.user.id).maybeSingle();
  if (prof && prof.is_admin) {
    if (cta) cta.insertAdjacentHTML("afterbegin", '<a class="btn btn-ghost btn-sm home-admin" href="admin.html">Admin</a>');
    const signin = document.querySelector(".nav a.nav-signin");
    if (signin) signin.insertAdjacentHTML("beforebegin", '<a href="admin.html" class="nav-join">Admin</a>');
  }
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const btn = $("#homeDash");
  if (btn && count) btn.insertAdjacentHTML("beforeend", ` <span class="dash-n" aria-label="${count} unread alerts">${count > 99 ? "99+" : count}</span>`);
}

function card(l) {
  const ph = (l.listing_photos || []).slice().sort((a, b) => a.sort - b.sort)[0];
  const v = vertical(l.vertical) || {};
  const where = [l.city, l.state, l.country].filter(Boolean).slice(0, 2).join(", ");
  return `<article class="card live"><a class="ph t-${ICON[l.vertical] || "lease"}${ph ? " has-photo" : ""}" href="listing.html?id=${l.id}" tabindex="-1" aria-hidden="true">
      ${ph ? `<img src="${esc(photoUrl(ph.path))}" alt="" loading="lazy">` : `<svg aria-hidden="true"><use href="#i-${ICON[l.vertical] || "lease"}"/></svg>`}
      <span class="tag ${l.kind === "need" ? "tag-need" : "tag-offer"}">${l.kind === "need" ? "Need" : "Offer"}</span></a>
    <div class="card-body"><span class="small">${esc(v.name || "")}</span><h3 translate="no"><a href="listing.html?id=${l.id}">${esc(l.title)}</a></h3>
      <span class="where" translate="no">${esc(where)}</span>
      <span class="price num">${l.price ? price(l.price, l.currency, l.price_unit) : "Price on request"}</span>
      <a class="btn btn-ghost btn-sm" href="listing.html?id=${l.id}">View listing</a></div></article>`;
}

async function live() {
  const { data, count, error } = await sb.from("listings")
    .select("id,kind,vertical,title,price,currency,price_unit,city,state,country,created_at,listing_photos(path,sort)", { count: "exact" })
    .eq("status", "approved").order("created_at", { ascending: false }).limit(9);
  if (error || !data || !data.length) return;
  const sec = $("#marketplace .wrap");
  const block = document.createElement("div");
  block.className = "live-block";
  block.innerHTML = `<div class="live-head"><h3 class="d3">Live on DASKIES</h3><a class="btn btn-ghost btn-sm" href="explore.html">See all listings on Explore</a></div>
    <p class="small">Latest listings approved by DASKIES. Each is checked for completeness before it goes live; do your own checks before any deal.</p>
    <div class="grid3">${data.map(card).join("")}</div>`;
  sec.insertBefore(block, $("#chips"));
  const lede = $("#marketplace .lede");
  if (count >= 6) {
    ["#chips", "#listings", "#marketplace .note"].forEach((s) => { const el = $(s); if (el) el.style.display = "none"; });
    if (lede) lede.textContent = "What businesses are offering and looking for right now. Contact details stay private; talk through DASKIES messages.";
  } else {
    if (lede) lede.textContent = "Live listings first, then examples of what you can list.";
    const ex = document.createElement("h3"); ex.className = "d3 ex-head"; ex.textContent = "Examples of what you can list";
    sec.insertBefore(ex, $("#chips"));
  }
  if (count >= 3) {
    const tick = data.slice(0, 9).map((l) => `<span><i></i><b>${l.kind === "need" ? "Need" : "Offer"}</b><em translate="no">${esc(l.title)}</em><small translate="no">${esc(l.city || l.country || "")}</small></span>`).join("");
    const t = $("#ticker");
    if (t) { t.innerHTML = tick + tick.replace(/<span>/g, '<span aria-hidden="true">'); t.closest(".ticker").setAttribute("aria-label", "Latest live listings"); }
  }
}

member().catch(() => {});
live().catch(() => {});
