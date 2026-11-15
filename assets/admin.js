import { sb, $, $$, esc, header, requireAuth, money, day, when, errMsg, toast, statusWord } from "./core.js";
import { vertical, DOC_KINDS, LEVELS } from "./taxonomy.js";

await header("admin.html");
const m = await requireAuth();
if (!m) throw new Error("stop");
const main = $("#main");
if (!m.profile?.is_admin) { main.innerHTML = `<div class="panel empty"><h1>Admins only</h1><p>This page is for the DASKIES team.</p></div>`; throw new Error("stop"); }

const TABS = [["queue", "Review queue"], ["listings", "All listings"], ["businesses", "Businesses"], ["documents", "Documents"], ["reports", "Reports"], ["users", "Users"], ["audit", "Audit log"]];
let tab = (location.hash || "#queue").slice(1);
if (!TABS.some(([t]) => t === tab)) tab = "queue";
main.innerHTML = `<h1>Admin</h1><div class="tabs" role="tablist">${TABS.map(([t, n]) => `<button role="tab" type="button" data-t="${t}" aria-selected="${t === tab}">${n}</button>`).join("")}</div><section id="pane"></section>`;
$(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; history.replaceState(null, "", "#" + tab); show(); } });
const pane = $("#pane");

async function show() {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.t === tab));
  pane.innerHTML = `<p class="muted">Loading…</p>`; pane.onclick = null;
  try { await ({ queue, listings, businesses, documents, reports, users, audit })[tab](); } catch (err) { pane.innerHTML = `<p class="err">${esc(errMsg(err))}</p>`; }
}

const sel = "*, businesses(name,verification_level), listing_photos(path,sort)";
async function review(id, decision, note) {
  const { error } = await sb.rpc("admin_review_listing", { p_id: id, p_decision: decision, p_note: note || null });
  if (error) return toast(errMsg(error), true);
  toast(decision === "approved" ? "Approved and live." : "Updated."); show();
}

async function queue() {
  const { data, error } = await sb.from("listings").select(sel).eq("status", "pending").order("created_at");
  if (error) throw error;
  const ids = data.map((l) => l.id);
  const { data: docs } = ids.length ? await sb.from("documents").select("id,listing_id,path,file_name,kind").in("listing_id", ids) : { data: [] };
  // Possible duplicates: same owner, same title already approved
  pane.innerHTML = data.length ? data.map((l) => `<div class="panel" style="margin-bottom:14px">
      <div class="tags"><span class="tag tag-${l.kind}">${l.kind}</span><span class="tag tag-closed">${esc(vertical(l.vertical)?.short)} · ${esc(l.subcategory)}</span></div>
      <h2 style="margin-top:8px"><a href="listing.html?id=${l.id}" target="_blank" rel="noopener">${esc(l.title)}</a></h2>
      <p class="small muted">${esc(l.businesses?.name)} · Level ${l.businesses?.verification_level || 1} · ${esc([l.city, l.country].filter(Boolean).join(", "))} · ${esc(money(l.price, l.currency, l.price_unit))} · ${(l.listing_photos || []).length} photos · sent ${esc(when(l.created_at))}</p>
      <p style="white-space:pre-wrap;max-height:120px;overflow:auto">${esc(l.description)}</p>
      ${(docs || []).filter((d) => d.listing_id === l.id).map((d) => `<button class="btn btn-quiet btn-sm" type="button" data-doc="${esc(d.path)}">Open ${esc((DOC_KINDS.find(([k]) => k === d.kind) || [, "document"])[1])}</button>`).join("")}
      <div class="row2" style="align-items:end;margin-top:10px"><div class="field" style="margin:0"><label for="n-${l.id}">Note to the member (shown if not approved)</label><input id="n-${l.id}" maxlength="500"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" type="button" data-ok="${l.id}">Approve</button><button class="btn btn-danger btn-sm" type="button" data-no="${l.id}">Not approve</button></div></div></div>`).join("")
    : `<div class="panel empty"><h2>Queue is empty</h2><p>New listings appear here for review.</p></div>`;
  pane.onclick = async (e) => {
    const ok = e.target.closest("[data-ok]"), no = e.target.closest("[data-no]"), d = e.target.closest("[data-doc]");
    if (ok) review(ok.dataset.ok, "approved");
    if (no) { const note = $("#n-" + no.dataset.no).value.trim(); if (!note) return toast("Add a note so the member knows what to fix.", true); review(no.dataset.no, "rejected", note); }
    if (d) openDoc(d.dataset.doc);
  };
}

async function openDoc(path) {
  const { data, error } = await sb.storage.from("documents").createSignedUrl(path, 120);
  if (error) return toast(errMsg(error), true);
  window.open(data.signedUrl, "_blank", "noopener");
}

async function listings() {
  const { data, error } = await sb.from("listings").select(sel).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  pane.innerHTML = `<div class="tablewrap"><table class="list"><thead><tr><th>Listing</th><th>Business</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${data.map((l) => `<tr>
    <td><a href="listing.html?id=${l.id}" target="_blank" rel="noopener">${esc(l.title)}</a><div class="small muted">${esc(l.kind)} · ${esc(vertical(l.vertical)?.short)}</div></td><td>${esc(l.businesses?.name)}</td>
    <td><span class="tag tag-${l.status}">${esc(statusWord(l.status))}</span></td><td>${esc(day(l.created_at))}</td>
    <td style="white-space:nowrap">${l.status !== "approved" ? `<button class="btn btn-quiet btn-sm" type="button" data-s="approved" data-id="${l.id}">Approve</button>` : ""}${l.status !== "closed" ? `<button class="btn btn-quiet btn-sm" type="button" data-s="closed" data-id="${l.id}">Close</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
  pane.onclick = (e) => { const b = e.target.closest("[data-s]"); if (b) review(b.dataset.id, b.dataset.s); };
}

async function businesses() {
  const { data, error } = await sb.from("businesses").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  pane.innerHTML = `<p class="hint">${esc(LEVELS.slice(1).map((n, i) => `Level ${i + 1}: ${n}`).join(" · "))}</p><div class="tablewrap"><table class="list"><thead><tr><th>Business</th><th>Place</th><th>Roles</th><th>Verification</th><th>Joined</th></tr></thead><tbody>${data.map((b) => `<tr>
    <td><b>${esc(b.name)}</b><div class="small muted">${esc(b.industry || "")}</div></td><td>${esc([b.city, b.country].filter(Boolean).join(", "))}</td><td class="small">${esc((b.roles || []).join(", "))}</td>
    <td><select data-b="${b.id}" aria-label="Verification level for ${esc(b.name)}">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === b.verification_level ? " selected" : ""}>Level ${n}</option>`).join("")}</select></td><td>${esc(day(b.created_at))}</td></tr>`).join("")}</tbody></table></div>`;
  pane.onchange = async (e) => {
    const s = e.target.closest("[data-b]"); if (!s) return;
    const { error: er } = await sb.rpc("admin_set_verification", { p_business: s.dataset.b, p_level: Number(s.value), p_note: null });
    toast(er ? errMsg(er) : "Verification updated.", !!er);
  };
}

async function documents() {
  const { data, error } = await sb.from("documents").select("*, businesses(name)").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  pane.innerHTML = `<div class="tablewrap"><table class="list"><thead><tr><th>Business</th><th>Document</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>${data.map((d) => `<tr>
    <td>${esc(d.businesses?.name || "")}</td><td>${esc((DOC_KINDS.find(([k]) => k === d.kind) || [, d.kind])[1])}<div class="small muted">${esc(d.file_name || "")}</div></td>
    <td><span class="tag tag-${d.review_status === "reviewed" ? "approved" : d.review_status === "rejected" ? "rejected" : "pending"}">${esc(d.review_status)}</span></td><td>${esc(day(d.created_at))}</td>
    <td style="white-space:nowrap"><button class="btn btn-quiet btn-sm" type="button" data-doc="${esc(d.path)}">Open</button><button class="btn btn-quiet btn-sm" type="button" data-r="reviewed" data-id="${d.id}">Mark reviewed</button><button class="btn btn-quiet btn-sm" type="button" data-r="rejected" data-id="${d.id}">Reject</button></td></tr>`).join("") || '<tr><td colspan="5" class="muted">No documents.</td></tr>'}</tbody></table></div>`;
  pane.onclick = async (e) => {
    const d = e.target.closest("[data-doc]"), r = e.target.closest("[data-r]");
    if (d) openDoc(d.dataset.doc);
    if (r) { const { error: er } = await sb.rpc("admin_review_document", { p_id: r.dataset.id, p_status: r.dataset.r }); er ? toast(errMsg(er), true) : show(); }
  };
}

async function reports() {
  const { data, error } = await sb.from("reports").select("*, listings(title)").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  pane.innerHTML = `<div class="tablewrap"><table class="list"><thead><tr><th>Listing</th><th>Reason</th><th>Status</th><th>When</th><th></th></tr></thead><tbody>${data.map((r) => `<tr>
    <td><a href="listing.html?id=${r.listing_id}" target="_blank" rel="noopener">${esc(r.listings?.title || "listing")}</a></td><td>${esc(r.reason)}</td><td>${esc(r.status)}</td><td>${esc(day(r.created_at))}</td>
    <td>${r.status === "open" ? `<button class="btn btn-quiet btn-sm" type="button" data-close="${r.id}">Mark handled</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No reports.</td></tr>'}</tbody></table></div>`;
  pane.onclick = async (e) => { const c = e.target.closest("[data-close]"); if (c) { const { error: er } = await sb.from("reports").update({ status: "closed" }).eq("id", c.dataset.close); er ? toast(errMsg(er), true) : show(); } };
}

async function users() {
  const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  pane.innerHTML = `<p class="small muted">${data.length} accounts</p><div class="tablewrap"><table class="list"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Admin</th><th>Joined</th></tr></thead><tbody>${data.map((p) => `<tr>
    <td>${esc(p.full_name || "")}</td><td>${esc(p.email || "")}</td><td>${esc(p.phone || "")}</td><td>${p.is_admin ? "Yes" : ""}</td><td>${esc(day(p.created_at))}</td></tr>`).join("")}</tbody></table></div>`;
}

async function audit() {
  const { data, error } = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  pane.innerHTML = `<div class="tablewrap"><table class="list"><thead><tr><th>When</th><th>Action</th><th>Item</th><th>Detail</th></tr></thead><tbody>${data.map((a) => `<tr>
    <td>${esc(when(a.created_at))}</td><td>${esc(a.action)}</td><td class="small">${esc(a.entity)} ${esc((a.entity_id || "").slice(0, 8))}</td><td class="small">${esc(JSON.stringify(a.detail))}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>'}</tbody></table></div>`;
}

show();
