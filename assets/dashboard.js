import { sb, $, $$, esc, qs, header, requireAuth, card, money, when, day, errMsg, busy, toast, levelBadge, statusWord } from "./core.js?v=cf25345b";
import { detailsFields, readDetails, checkDetails, showProblems, saveDetails, detailsOf } from "./details.js?v=cf25345b";
import { ROLES, DOC_KINDS, LEVELS, LEVEL_NOTE, vertical, DEAL_KINDS, stageName, defaultDealKind } from "./taxonomy.js?v=cf25345b";

await header("dashboard.html");
const m = await requireAuth();
if (!m) throw new Error("stop");
const main = $("#main");
const TABS = [["overview", "Overview"], ["listings", "My offers & needs"], ["matches", "Matches & barter"], ["deals", "Deals"], ["messages", "Messages"], ["profile", "Business profile"], ["documents", "Documents"], ["saved", "Saved"]];
let tab = (location.hash || "#overview").slice(1);
if (!TABS.some(([t]) => t === tab)) tab = "overview";

main.innerHTML = `<h1>${m.business ? esc(m.business.name) : "Welcome to DASKIES"}</h1>
  <p class="muted" style="margin:0 0 18px">${esc(m.profile?.full_name || m.user.email)} · ${m.business ? levelBadge(m.business.verification_level) : "Add your business to start listing"}</p>
  ${qs("welcome") ? `<p class="note">Your account is ready. Add your business profile, then post what you have or what you need.</p>` : ""}
  ${qs("posted") ? `<p class="note">Sent for review. The DASKIES team checks every listing, usually within 48 hours; you'll see it marked Live here.</p>` : ""}
  <div class="tabs" role="tablist">${TABS.map(([t, n]) => `<button role="tab" type="button" data-t="${t}" aria-selected="${t === tab}">${n}<span class="count" id="n-${t}" hidden></span></button>`).join("")}</div>
  <section id="pane" tabindex="-1"></section>`;
$(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; history.replaceState(null, "", "dashboard.html#" + tab); show(); } });
const pane = $("#pane");
let poll = null;

async function myListings() {
  const { data } = await sb.from("listings").select("*, listing_photos(path,sort)").eq("owner_id", m.user.id).order("created_at", { ascending: false });
  return data || [];
}

async function show() {
  clearInterval(poll);
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.t === tab));
  pane.innerHTML = `<p class="muted">Loading…</p>`;
  try { await ({ overview, listings, matches, deals, messages, profile, documents, saved })[tab](); }
  catch (err) { pane.innerHTML = `<p class="err">${esc(errMsg(err))}</p>`; }
}

async function overview() {
  const mine = await myListings();
  const { count: convs } = await sb.from("conversations").select("id", { count: "exact", head: true });
  const c = (s) => mine.filter((l) => l.status === s).length;
  pane.innerHTML = `${m.profile?.is_admin ? `<div class="panel adminbox" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><h2 style="margin:0">You're a DASKIES admin</h2><p class="small muted" style="margin:4px 0 0">Review listings, members, documents, deals, fees and errors.</p></div><a class="btn btn-primary" href="admin.html">Open Admin</a></div>` : ""}<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr));margin-bottom:20px">
      <div class="stat"><b>${c("approved")}</b>Live listings</div><div class="stat"><b>${c("pending")}</b>Waiting for review</div>
      <div class="stat"><b>${mine.filter((l) => l.kind === "need").length}</b>Needs posted</div><div class="stat"><b>${convs || 0}</b>Conversations</div></div>
    <div class="panel grid" style="margin-bottom:16px"><h2>Next steps</h2>
      ${!m.business ? `<p>1. <a href="#profile" data-go="profile">Add your business profile</a></p>` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="post.html?kind=offer">List an offer</a><a class="btn btn-ghost" href="post.html?kind=need">Post a need</a><a class="btn btn-ghost" href="explore.html">Explore</a><button class="btn btn-ghost" type="button" data-go="matches">Find a barter match</button></div></div>
    <div class="panel"><h2>Verification</h2>${m.business ? levelBadge(m.business.verification_level) : ""}<p class="hint">${esc(LEVEL_NOTE)}</p>
      <p class="small">To move up a level, upload business documents under <a href="#documents" data-go="documents">Documents</a>. The team reviews them by hand.</p></div>`;
  pane.onclick = (e) => { const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); tab = g.dataset.go; history.replaceState(null, "", "#" + tab); show(); } };
}

async function listings() {
  const mine = await myListings();
  const row = (l) => `<tr><td><a href="listing.html?id=${l.id}">${esc(l.title)}</a><div class="small muted">${esc(vertical(l.vertical)?.short || "")} · ${esc(l.subcategory)}</div></td>
    <td><span class="tag tag-${l.kind}">${l.kind === "offer" ? "Offer" : "Need"}</span></td><td><span class="tag tag-${l.status}">${esc(statusWord(l.status))}</span>${l.admin_note && l.status === "rejected" ? `<div class="small muted">${esc(l.admin_note)}</div>` : ""}</td>
    <td>${esc(money(l.price, l.currency, l.price_unit))}</td><td style="white-space:nowrap"><a class="btn btn-quiet btn-sm" href="post.html?id=${l.id}">Edit</a>${l.status !== "closed" ? `<button class="btn btn-quiet btn-sm" type="button" data-close="${l.id}">Close</button>` : ""}<button class="btn btn-quiet btn-sm" type="button" data-del="${l.id}">Delete</button></td></tr>`;
  pane.innerHTML = mine.length ? `<div style="display:flex;gap:10px;margin-bottom:14px"><a class="btn btn-primary btn-sm" href="post.html?kind=offer">List an offer</a><a class="btn btn-ghost btn-sm" href="post.html?kind=need">Post a need</a></div>
    <div class="tablewrap"><table class="list"><thead><tr><th>Listing</th><th>Type</th><th>Status</th><th>Price</th><th></th></tr></thead><tbody>${mine.map(row).join("")}</tbody></table></div>`
    : `<div class="panel empty"><h2>Nothing posted yet</h2><p>List what you have, or post what you need. Both sides get matched.</p><a class="btn btn-primary" href="post.html?kind=offer">List an offer</a> <a class="btn btn-ghost" href="post.html?kind=need">Post a need</a></div>`;
  pane.onclick = async (e) => {
    const c = e.target.closest("[data-close]"), d = e.target.closest("[data-del]");
    if (c) { const { error } = await sb.from("listings").update({ status: "closed" }).eq("id", c.dataset.close); error ? toast(errMsg(error), true) : (toast("Closed."), show()); }
    if (d && confirm("Delete this listing permanently? Its photos and enquiries go too. This cannot be undone.")) {
      const { error } = await sb.from("listings").delete().eq("id", d.dataset.del); error ? toast(errMsg(error), true) : (toast("Deleted."), show());
    }
  };
}

// Indicative matching: supply/demand in the same vertical, plus 2-, 3- and 4-party barter chains built from
// "would accept from" preferences. Scores show compatibility only, never a promise that a deal will close.
async function matches() {
  const mine = (await myListings()).filter((l) => l.status === "approved" || l.status === "pending");
  if (!mine.length) { pane.innerHTML = `<div class="panel empty"><h2>No listings to match yet</h2><p>Post an offer (with what you'd accept in exchange) or a need, and matches appear here.</p><a class="btn btn-primary" href="post.html?kind=offer">List an offer</a></div>`; return; }
  const sel = "id,owner_id,kind,vertical,subcategory,deal_types,title,price,currency,price_unit,quantity,quantity_unit,city,country,wants_vertical,wants_in_exchange,status,listing_photos(path,sort)";
  const { data: others } = await sb.from("listings").select(sel).eq("status", "approved").neq("owner_id", m.user.id).order("created_at", { ascending: false }).limit(800);
  const pool = others || [];
  const offers = pool.filter((x) => x.kind === "offer");
  const score = (a, b) => {
    let s = 40; const why = [`same vertical (${vertical(a.vertical)?.short})`];
    if (a.subcategory === b.subcategory) { s += 30; why.push("same category"); }
    if (a.country && a.country === b.country) { s += 10; why.push(`both in ${a.country}`); }
    if (a.city && b.city && a.city.toLowerCase() === b.city.toLowerCase()) { s += 5; why.push(`both in ${a.city}`); }
    if (a.price && b.price && a.currency === b.currency) { const r = Math.min(a.price, b.price) / Math.max(a.price, b.price); if (r >= 0.75) { s += 15; why.push("price within 25%"); } }
    return { s: Math.min(99, s), why };
  };
  const direct = [];
  for (const l of mine) for (const o of pool) if (o.kind !== l.kind && o.vertical === l.vertical) { const { s, why } = score(l, o); direct.push({ l, o, s, why }); }
  direct.sort((a, b) => b.s - a.s);

  const chains = [];
  const myOffers = mine.filter((l) => l.kind === "offer" && l.wants_vertical);
  for (const a of myOffers) {
    for (const b of offers.filter((x) => x.vertical === a.wants_vertical && x.wants_vertical)) {
      if (b.wants_vertical === a.vertical) chains.push([a, b]);
      for (const c of offers.filter((x) => x.vertical === b.wants_vertical && x.wants_vertical && x.owner_id !== b.owner_id)) {
        if (c.wants_vertical === a.vertical) chains.push([a, b, c]);
        else for (const d of offers.filter((x) => x.vertical === c.wants_vertical && x.wants_vertical === a.vertical && ![b.owner_id, c.owner_id].includes(x.owner_id))) chains.push([a, b, c, d]);
        if (chains.length > 30) break;
      }
    }
  }
  const cash = (a, b) => (a.price && b.price && a.currency === b.currency) ? b.price - a.price : null;
  const chainHTML = (ch) => {
    const parts = ch.map((x, i) => `<div class="stat" style="padding:12px"><span class="small muted">${i === 0 ? "You give" : "Party " + String.fromCharCode(65 + i) + " gives"}</span><b style="font-size:1rem"><a href="listing.html?id=${x.id}">${esc(x.title)}</a></b><span class="small">${esc(money(x.price, x.currency))}</span></div>`).join('<div aria-hidden="true" style="align-self:center;font-size:20px;color:var(--accent)">→</div>');
    const adj = ch.length === 2 ? cash(ch[0], ch[1]) : null;
    return `<div class="panel" style="margin-bottom:12px"><div class="small muted" style="margin-bottom:8px">${ch.length}-party barter · each gives to the next, the last gives back to you</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:stretch">${parts}</div>
      ${adj !== null ? `<p class="small" style="margin:10px 0 0">Indicative cash adjustment: ${adj > 0 ? "you add" : adj < 0 ? "you receive" : "none,"} ${adj ? esc(money(Math.abs(adj), ch[0].currency)) : "values are equal"}.</p>` : `<p class="small muted" style="margin:10px 0 0">Values to be agreed between all parties; any gap is settled in cash.</p>`}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-primary btn-sm" type="button" data-swap="${ch.map((x) => x.id).join(",")}">Propose this swap</button><a class="btn btn-ghost btn-sm" href="listing.html?id=${ch[1].id}">See ${ch.length === 2 ? "their listing" : "party B's listing"}</a></div></div>`;
  };
  pane.innerHTML = `<p class="note" style="margin-top:0">Match scores are indicative: they show how well listings fit, not that a deal can close. Nothing is agreed until every party accepts the final terms.</p>
    <h2>Barter chains</h2>${chains.length ? chains.slice(0, 12).map(chainHTML).join("") : `<p class="muted">${myOffers.length ? "No chain found yet. As more members list what they'd accept, chains appear here." : "Set \"Would accept from\" on one of your offers to find barter chains."}</p>`}
    <h2 style="margin-top:24px">Direct matches</h2>
    ${direct.length ? `<div class="grid">${direct.slice(0, 20).map((d) => `<div class="panel" style="display:grid;grid-template-columns:72px 1fr;gap:14px;align-items:center"><div style="font-size:1.6rem;font-weight:800;color:var(--accent)">${d.s}%</div>
      <div><div class="small muted">For your ${d.l.kind}: ${esc(d.l.title)}</div><a href="listing.html?id=${d.o.id}"><b>${esc(d.o.title)}</b></a> <span class="tag tag-${d.o.kind}">${d.o.kind === "offer" ? "Available" : "Wanted"}</span>
      <div class="small muted">Why: ${esc(d.why.join(", "))}</div><button class="btn btn-quiet btn-sm" style="margin-top:6px" type="button" data-pair="${d.l.id},${d.o.id}" data-kind="${defaultDealKind(d.o)}">Start a deal</button></div></div>`).join("")}</div>` : `<p class="muted">No direct matches yet in your verticals.</p>`}`;
  const byId = Object.fromEntries([...mine, ...pool].map((x) => [x.id, x]));
  pane.onclick = async (e) => {
    const sw = e.target.closest("[data-swap]"), pr = e.target.closest("[data-pair]");
    if (!sw && !pr) return;
    const ids = (sw || pr).dataset[sw ? "swap" : "pair"].split(",");
    const kind = sw ? (ids.length === 2 ? "barter" : "multi_barter") : pr.dataset.kind;
    const title = sw ? (ids.length === 2 ? "Swap: " : ids.length + "-party swap: ") + ids.map((i) => byId[i]?.title || "").join(" ⇄ ") : byId[ids[1]]?.title || "Deal";
    busy(sw || pr, true, "Starting…");
    const { data, error } = await sb.rpc("create_deal", { p_kind: kind, p_title: title.slice(0, 160), p_listings: ids });
    if (error) { busy(sw || pr, false); return toast(errMsg(error), true); }
    location.href = "deal.html?id=" + data;
  };
}

// Deals the member is a party to, with what needs doing next.
function nextFor(d, mine, hasOpenOffer) {
  if (["completed", "cancelled"].includes(d.stage)) return "";
  if (d.stage === "delivery") return mine.completed ? "" : "Confirm completion";
  if (["offer", "counteroffer"].includes(d.stage)) return !hasOpenOffer ? "Make a new offer" : mine.approved ? "" : "Approve or counter";
  if (["enquiry", "discussion"].includes(d.stage)) return hasOpenOffer ? "" : "Make the first offer";
  return "";
}
async function dealList() {
  const { data: rows } = await sb.from("deal_parties").select("deal_id").eq("user_id", m.user.id);
  const ids = (rows || []).map((r) => r.deal_id);
  if (!ids.length) return [];
  const [{ data: ds }, { data: ps }, { data: os }] = await Promise.all([
    sb.from("deals").select("*").in("id", ids).order("updated_at", { ascending: false }),
    sb.from("deal_party_view").select("deal_id,user_id,business,approved,completed,position").in("deal_id", ids).order("position"),
    sb.from("deal_offers").select("deal_id").in("deal_id", ids).eq("status", "proposed")
  ]);
  return (ds || []).map((d) => {
    const parties = (ps || []).filter((p) => p.deal_id === d.id);
    const mineRow = parties.find((p) => p.user_id === m.user.id) || {};
    return { ...d, parties, todo: nextFor(d, mineRow, (os || []).some((o) => o.deal_id === d.id)) };
  });
}
async function deals() {
  const list = await dealList();
  const badge = $("#n-deals"); const n = list.filter((d) => d.todo).length; badge.hidden = !n; badge.textContent = n;
  if (!list.length) { pane.innerHTML = `<div class="panel empty"><h2>No deals yet</h2><p>Start a deal from any listing, or propose a swap from your barter matches. Offers, counteroffers and every stage up to completion are tracked here.</p><button class="btn btn-primary" type="button" data-go="matches">See your matches</button></div>`; pane.onclick = (e) => { if (e.target.closest("[data-go]")) { tab = "matches"; history.replaceState(null, "", "#matches"); show(); } }; return; }
  const open = list.filter((d) => !["completed", "cancelled"].includes(d.stage)), closed = list.filter((d) => !open.includes(d));
  const row = (d) => `<a class="panel deal-row" style="margin-bottom:10px;color:inherit;text-decoration:none" href="deal.html?id=${d.id}">
      <div><div class="tags"><span class="tag tag-closed">${esc(DEAL_KINDS[d.kind] || d.kind)}</span><span class="tag ${d.stage === "completed" ? "tag-approved" : d.stage === "cancelled" ? "tag-rejected" : "tag-pending"}">${esc(stageName(d.stage))}</span></div>
      <b style="display:block;margin-top:6px">${esc(d.title)}</b><span class="who">With ${esc(d.parties.filter((p) => p.user_id !== m.user.id).map((p) => p.business || "a member").join(", "))} · updated ${esc(when(d.updated_at))}</span></div>
      ${d.todo ? `<span class="btn btn-primary btn-sm">${esc(d.todo)}</span>` : '<span class="small muted">Waiting for others</span>'}</a>`;
  pane.innerHTML = `<p class="note" style="margin-top:0">A deal is binding only when every party approves the same terms and signs the final contract. DASKIES does not hold money or act as escrow.</p>
    ${open.length ? `<h2>Open</h2>${open.map(row).join("")}` : ""}${closed.length ? `<h2 style="margin-top:24px">Closed</h2>${closed.map(row).join("")}` : ""}`;
  pane.onclick = null;
}

async function messages() {
  const { data: convs, error } = await sb.from("conversation_people").select("*").order("last_message_at", { ascending: false });
  if (error) throw error;
  if (!convs.length) { pane.innerHTML = `<div class="panel empty"><h2>No messages yet</h2><p>Enquiries you send or receive appear here.</p><a class="btn btn-primary" href="explore.html">Explore opportunities</a></div>`; return; }
  let cur = qs("c") && convs.some((c) => c.conversation_id === qs("c")) ? qs("c") : convs[0].conversation_id;
  const who = (c) => c.buyer_id === m.user.id ? (c.seller_business || c.seller_name || "Seller") : (c.buyer_business || c.buyer_name || "Member");
  pane.innerHTML = `<div class="inbox"><div class="convs" role="list">${convs.map((c) => `<button class="conv" type="button" role="listitem" data-c="${c.conversation_id}"><b>${esc(who(c))}</b><div class="small muted">${esc(c.listing_title)}</div><div class="small muted">${esc(when(c.last_message_at))}</div></button>`).join("")}</div>
    <div class="thread"><div class="msgs" id="msgs" aria-live="polite"></div><form class="compose" id="cf"><label class="sr" for="mb">Message</label><textarea id="mb" maxlength="4000" placeholder="Write a message. Don't share bank details here."></textarea><button class="btn btn-primary">Send</button></form></div></div>
    <p class="hint">Keep negotiations on DASKIES so there is a record. Share phone numbers only when you choose to.</p>`;
  const load = async () => {
    $$(".conv").forEach((b) => b.setAttribute("aria-current", b.dataset.c === cur));
    const { data } = await sb.from("messages").select("*").eq("conversation_id", cur).order("created_at");
    const box = $("#msgs"); const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.innerHTML = (data || []).map((x) => `<div class="bubble${x.sender_id === m.user.id ? " mine" : ""}">${esc(x.body)}<time>${esc(when(x.created_at))}</time></div>`).join("");
    if (atEnd || !box.dataset.loaded) { box.scrollTop = box.scrollHeight; box.dataset.loaded = 1; }
  };
  $(".convs").addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) { cur = b.dataset.c; $("#msgs").dataset.loaded = ""; load(); } });
  $("#cf").addEventListener("submit", async (e) => {
    e.preventDefault(); const t = $("#mb"), body = t.value.trim(), btn = $("#cf button"); if (!body) return;
    busy(btn, true, "Sending…");
    const { error: er } = await sb.from("messages").insert({ conversation_id: cur, sender_id: m.user.id, body });
    busy(btn, false); if (er) return toast(errMsg(er), true);
    t.value = ""; load();
  });
  await load();
  poll = setInterval(load, 10000);
}

async function profile() {
  const b = m.business || {};
  const { data: locs } = m.business ? await sb.from("business_locations").select("*").eq("business_id", m.business.id) : { data: [] };
  pane.innerHTML = `<form id="bf" class="panel" novalidate>
    ${detailsFields(detailsOf(m))}
    <fieldset class="fs"><legend>More about the business <span class="muted">(optional)</span></legend>
      <div class="row2"><div class="field"><label for="bi">Industry</label><input id="bi" maxlength="120" value="${esc(b.industry || "")}"></div><div class="field"><label for="by">Year established</label><input id="by" type="number" min="1800" max="2100" value="${esc(b.year_established || "")}"></div></div>
      <div class="field"><label for="bpr">Products and services</label><input id="bpr" maxlength="1000" value="${esc(b.products || "")}"></div>
      <div class="row2"><div class="field"><label for="bw">Website</label><input id="bw" maxlength="200" value="${esc(b.website || "")}"></div><div class="field"><label for="bce">Certifications</label><input id="bce" maxlength="500" value="${esc(b.certifications || "")}"></div></div>
      <label class="small" style="display:flex;gap:8px"><input type="checkbox" id="bx"${b.export_import ? " checked" : ""} style="accent-color:var(--accent)"> We import or export</label></fieldset>
    <p class="small muted">Sign-in email: ${esc(m.user.email)}${m.profile?.terms_accepted_at ? ` · You accepted the <a href="terms.html">Terms</a> on ${esc(day(m.profile.terms_accepted_at))}` : ""} · Fields marked <span class="req">*</span> are required.</p>
    <p class="err" id="bmsg" role="alert"></p><div><button class="btn btn-primary" id="bsave">Save profile</button></div></form>
    ${m.business ? `<div class="panel" style="margin-top:16px"><h2>Operating locations</h2><ul id="locs">${(locs || []).map((l) => `<li>${esc([l.label, l.city, l.state, l.country].filter(Boolean).join(", "))} <button class="btn btn-quiet btn-sm" type="button" data-rl="${l.id}">Remove</button></li>`).join("") || '<li class="muted">None added</li>'}</ul>
      <form id="lf" class="row3" style="align-items:end"><div class="field"><label for="ll">Label</label><input id="ll" maxlength="80" placeholder="Plant 2"></div><div class="field"><label for="lc">City</label><input id="lc" maxlength="80"></div><div class="field"><label for="lk">Country</label><input id="lk" value="India" maxlength="60"></div><button class="btn btn-ghost btn-sm">Add location</button></form></div>` : ""}`;
  $("#bf").addEventListener("submit", async (e) => {
    e.preventDefault(); const btn = $("#bsave"), v = (id) => $("#" + id).value.trim();
    $("#bmsg").textContent = "";
    const d = readDetails();
    if (showProblems(checkDetails(d))) { $("#bmsg").textContent = "Some details are missing or need fixing; see the marked fields."; return; }
    busy(btn, true);
    try {
      await saveDetails(m, d, { industry: v("bi") || null, year_established: v("by") ? Number(v("by")) : null, products: v("bpr") || null,
        website: v("bw") || null, certifications: v("bce") || null, export_import: $("#bx").checked });
      toast("Profile saved."); await (await import("./core.js?v=cf25345b")).me(true); location.reload();
    } catch (err) { $("#bmsg").textContent = errMsg(err); busy(btn, false); }
  });
  const lf = $("#lf");
  if (lf) {
    lf.addEventListener("submit", async (e) => { e.preventDefault();
      const { error } = await sb.from("business_locations").insert({ business_id: m.business.id, owner_id: m.user.id, label: $("#ll").value.trim() || null, city: $("#lc").value.trim() || null, country: $("#lk").value.trim() || "India" });
      error ? toast(errMsg(error), true) : show(); });
    $("#locs").addEventListener("click", async (e) => { const r = e.target.closest("[data-rl]"); if (r) { await sb.from("business_locations").delete().eq("id", r.dataset.rl); show(); } });
  }
}

async function documents() {
  const { data: docs } = await sb.from("documents").select("*").eq("owner_id", m.user.id).order("created_at", { ascending: false });
  pane.innerHTML = `<div class="panel" style="margin-bottom:16px"><h2>Upload a document</h2><p class="hint" style="margin-top:-6px">Only you and the DASKIES team can open these. They are never shown on listings. ${esc(LEVEL_NOTE)}</p>
      ${m.business ? `<form id="df" class="row3" style="align-items:end"><div class="field"><label for="dk">Type</label><select id="dk">${DOC_KINDS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div class="field"><label for="dfile">File (PDF, JPG or PNG, up to 10 MB)</label><input id="dfile" type="file" accept=".pdf,image/jpeg,image/png"></div><button class="btn btn-primary">Upload</button></form>` : `<p>Add your business profile first.</p>`}</div>
    <div class="tablewrap"><table class="list"><thead><tr><th>Document</th><th>Type</th><th>Review</th><th>Added</th><th></th></tr></thead><tbody>
    ${(docs || []).map((d) => `<tr><td>${esc(d.file_name || "file")}</td><td>${esc((DOC_KINDS.find(([k]) => k === d.kind) || [, d.kind])[1])}</td><td><span class="tag tag-${d.review_status === "reviewed" ? "approved" : d.review_status === "rejected" ? "rejected" : "pending"}">${esc(d.review_status)}</span></td><td>${esc(day(d.created_at))}</td>
      <td style="white-space:nowrap"><button class="btn btn-quiet btn-sm" type="button" data-open="${esc(d.path)}">Open</button><button class="btn btn-quiet btn-sm" type="button" data-rm="${d.id}" data-p="${esc(d.path)}">Delete</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">No documents yet.</td></tr>`}</tbody></table></div>`;
  const df = $("#df");
  if (df) df.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = $("#dfile").files[0], btn = $("#df button");
    if (!f) return toast("Choose a file.", true); if (f.size > 10 * 1024 * 1024) return toast("That file is over 10 MB.", true);
    busy(btn, true, "Uploading…");
    const ext = (f.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${m.user.id}/kyc/${Date.now()}.${ext}`;
    const { error: ue } = await sb.storage.from("documents").upload(path, f, { contentType: f.type });
    if (ue) { busy(btn, false); return toast(errMsg(ue), true); }
    const { error } = await sb.from("documents").insert({ owner_id: m.user.id, business_id: m.business.id, kind: $("#dk").value, path, file_name: f.name.slice(0, 200) });
    busy(btn, false); error ? toast(errMsg(error), true) : (toast("Uploaded. The team will review it."), show());
  });
  pane.onclick = async (e) => {
    const o = e.target.closest("[data-open]"), r = e.target.closest("[data-rm]");
    if (o) { const { data, error } = await sb.storage.from("documents").createSignedUrl(o.dataset.open, 120); if (error) return toast(errMsg(error), true); window.open(data.signedUrl, "_blank", "noopener"); }
    if (r && confirm("Delete this document? This cannot be undone.")) { await sb.storage.from("documents").remove([r.dataset.p]); const { error } = await sb.from("documents").delete().eq("id", r.dataset.rm); error ? toast(errMsg(error), true) : show(); }
  };
}

async function saved() {
  const { data } = await sb.from("saved_listings").select("listing_id, listings(id,kind,vertical,subcategory,title,price,price_unit,currency,quantity,quantity_unit,city,country,status,listing_photos(path,sort))").eq("user_id", m.user.id).order("created_at", { ascending: false });
  const items = (data || []).map((x) => x.listings).filter(Boolean);
  pane.innerHTML = items.length ? `<div class="cards">${items.map(card).join("")}</div>` : `<div class="panel empty"><h2>Nothing saved yet</h2><p>Tap Save on any listing to keep it here.</p><a class="btn btn-primary" href="explore.html">Explore</a></div>`;
  pane.onclick = null;
}

show();
dealList().then((l) => { const n = l.filter((d) => d.todo).length, b = $("#n-deals"); if (b && n) { b.hidden = false; b.textContent = n; } }).catch(() => {});
