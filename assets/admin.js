import { sb, $, $$, esc, header, requireAuth, money, day, when, errMsg, toast, statusWord, busy } from "./core.js?v=3dfed3ba";
import { vertical, DOC_KINDS, LEVELS, DEAL_KINDS, stageName } from "./taxonomy.js?v=3dfed3ba";

await header("admin.html");
const m = await requireAuth();
if (!m) throw new Error("stop");
const main = $("#main");
if (!m.profile?.is_admin) { main.innerHTML = `<div class="panel empty"><h1>Admins only</h1><p>This page is for the DASKIES team.</p></div>`; throw new Error("stop"); }

const TABS = [["queue", "Review queue"], ["owners", "For owners"], ["listings", "All listings"], ["businesses", "Businesses"], ["documents", "Documents"], ["deals", "Deals"], ["fees", "Fees"], ["payments", "Payments"], ["invoices", "Invoices"], ["reports", "Reports"], ["users", "Users"], ["errors", "Errors"], ["audit", "Audit log"]];
let tab = (location.hash || "#queue").slice(1);
if (!TABS.some(([t]) => t === tab)) tab = "queue";
main.innerHTML = `<h1>Admin</h1><div class="tabs" role="tablist">${TABS.map(([t, n]) => `<button role="tab" type="button" data-t="${t}" aria-selected="${t === tab}">${n}</button>`).join("")}</div><section id="pane"></section>`;
$(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; history.replaceState(null, "", "#" + tab); show(); } });
const pane = $("#pane");

async function show() {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.t === tab));
  pane.innerHTML = `<div class="skel" role="status" aria-label="Loading"><span class="sk sk-l"></span><span class="sk sk-row"></span><span class="sk sk-row"></span><span class="sk sk-row"></span></div>`; pane.onclick = null;
  try { await ({ queue, owners, listings, businesses, documents, deals, fees, payments, invoices, reports, users, errors, audit })[tab](); } catch (err) { pane.innerHTML = `<p class="err">${esc(errMsg(err))}</p>`; }
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

// Listings DASKIES posts on an owner's behalf. The owner's details are visible to admins only.
async function owners() {
  const { data, error } = await sb.from("listings").select("id,title,kind,status,created_at,managed_owners(owner_name,contact_name,phone,email,consent)").eq("managed", true).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const o = (l) => (Array.isArray(l.managed_owners) ? l.managed_owners[0] : l.managed_owners) || {};
  pane.innerHTML = `<div class="panel" style="margin-bottom:16px"><h2 style="margin-top:0">List for an owner</h2>
      <p class="small muted" style="margin:0 0 12px">Call or WhatsApp the owner, get their OK, then post it here. The listing shows "Listed by DASKIES on the owner's behalf", enquiries come to you, and the owner's contact details stay private. When the owner joins, hand the listing over to them.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="post.html?kind=offer&for=owner">List an offer for an owner</a><a class="btn btn-ghost" href="post.html?kind=need&for=owner">Post a need for an owner</a></div></div>
    ${rows.length ? `<div class="tablewrap"><table class="list"><thead><tr><th>Listing</th><th>Owner</th><th>Contact</th><th>Consent</th><th>Status</th><th>Hand over when they join</th></tr></thead><tbody>${rows.map((l) => { const w = o(l); return `<tr>
      <td><a href="listing.html?id=${esc(l.id)}">${esc(l.title)}</a><div class="small muted">${l.kind === "offer" ? "Offer" : "Need"} · ${esc(day(l.created_at))} · <a href="post.html?id=${esc(l.id)}">Edit</a></div></td>
      <td>${esc(w.owner_name || "")}${w.contact_name ? `<div class="small muted">${esc(w.contact_name)}</div>` : ""}</td>
      <td>${w.phone ? `<a href="tel:${esc(String(w.phone).replace(/[^\d+]/g, ""))}">${esc(w.phone)}</a>` : ""}${w.email ? `<div class="small"><a href="mailto:${esc(w.email)}">${esc(w.email)}</a></div>` : ""}</td>
      <td class="small">${esc(w.consent || "")}</td>
      <td><span class="tag tag-${esc(l.status)}">${esc(statusWord(l.status))}</span></td>
      <td><form class="ho" data-id="${esc(l.id)}" style="display:flex;gap:6px;min-width:250px"><label class="sr" for="ho-${esc(l.id)}">Owner's DASKIES email</label><input class="input" id="ho-${esc(l.id)}" type="email" placeholder="Owner's DASKIES email" value="${esc(w.email || "")}"><button class="btn btn-ghost btn-sm">Hand over</button></form></td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="panel empty"><h2>No listings for owners yet</h2><p>Your first one takes a few minutes.</p></div>`}`;
  pane.querySelectorAll("form.ho").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = f.querySelector("input").value.trim(), btn = f.querySelector("button");
    if (!email) return toast("Enter the email the owner joined with.", true);
    busy(btn, true, "Moving…");
    const { error: er } = await sb.rpc("admin_handover_listing", { p_listing: f.dataset.id, p_email: email });
    if (er) { toast(errMsg(er), true); busy(btn, false); return; }
    toast("Handed over. The owner has an alert."); show();
  }));
}

// GST invoices: the supplier details that go on every invoice, and every invoice issued.
async function invoices() {
  const [{ data: st }, { data: ready }, { data: invs }, { data: paid }] = await Promise.all([
    sb.from("invoice_settings").select("*").eq("id", 1).maybeSingle(),
    sb.rpc("invoice_settings_ready"),
    sb.from("invoices").select("id,number,issued_at,buyer,total_paise,emailed_at,email_to,email_error,payment_id").order("issued_at", { ascending: false }).limit(300),
    sb.from("payments").select("id,kind,amount_paise,paid_at,description").eq("status", "paid").order("paid_at", { ascending: false }).limit(300)]);
  const s = st || {};
  const have = new Set((invs || []).map((i) => i.payment_id));
  const missing = (paid || []).filter((p) => !have.has(p.id));
  const f = (id, label, val, attrs = "", hint = "") => `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(val || "")}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const rs = (p) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  pane.innerHTML = `
    <div class="panel" style="margin-bottom:16px">
      <h2 style="margin-top:0">Details on every invoice</h2>
      <p class="${ready ? "ok" : "note"}" style="margin:0 0 14px">${ready ? "Complete. Every online payment gets a GST invoice, emailed to the buyer with a copy to info@daskies.com." : "Fill these in before online payments open. Until then nobody can pay online, so no payment ever goes without an invoice."}</p>
      <form id="invset" class="grid" novalidate>
        <div class="row2">${f("is_legal", "Name exactly as on your GST registration <span class=\"req\">*</span>", s.legal_name, 'maxlength="160"', "GST invoices must show the registered name. Check the spelling with your GST certificate.")}${f("is_trade", "Trade name", s.trade_name || "DASKIES", 'maxlength="80"')}</div>
        <div class="row2">${f("is_gstin", "GSTIN <span class=\"req\">*</span>", s.gstin, 'maxlength="15" style="text-transform:uppercase"')}${f("is_email", "Invoice email", s.email || "info@daskies.com", 'type="email" maxlength="120"')}</div>
        ${f("is_addr", "Registered address <span class=\"req\">*</span>", s.address, 'maxlength="300"')}
        <div class="row3">${f("is_city", "City <span class=\"req\">*</span>", s.city, 'maxlength="80"')}${f("is_state", "State <span class=\"req\">*</span>", s.state, 'maxlength="80"')}${f("is_pin", "PIN code <span class=\"req\">*</span>", s.postal_code, 'inputmode="numeric" maxlength="6"')}</div>
        <div class="row3">${f("is_sacm", "SAC code: membership", s.sac_membership || "998599", 'inputmode="numeric" maxlength="8"', "Confirm with your CA.")}${f("is_sacf", "SAC code: success fee", s.sac_fee || "998599", 'inputmode="numeric" maxlength="8"', "Confirm with your CA.")}${f("is_lut", "LUT number (optional)", s.lut_number, 'maxlength="40"', "With an LUT, buyers outside India pay without GST.")}</div>
        <p class="err" id="ismsg" role="alert" hidden></p>
        <div><button class="btn btn-primary" id="issave">Save details</button></div>
      </form>
    </div>
    ${missing.length ? `<div class="panel" style="margin-bottom:16px"><h2 style="margin-top:0">Paid, waiting for an invoice</h2><p class="small muted">These were paid before the details above were complete.</p>
      <div class="tablewrap"><table class="list"><tbody>${missing.map((p) => `<tr><td>${esc(p.description || p.kind)}</td><td>${esc(day(p.paid_at))}</td><td>${rs(p.amount_paise)}</td><td><button class="btn btn-ghost btn-sm" data-issue="${esc(p.id)}" type="button"${ready ? "" : " disabled"}>Issue and email invoice</button></td></tr>`).join("")}</tbody></table></div></div>` : ""}
    <div class="panel"><h2 style="margin-top:0">Invoices issued</h2>
      ${(invs || []).length ? `<div class="tablewrap"><table class="list"><thead><tr><th>Invoice</th><th>Date</th><th>Buyer</th><th>Amount</th><th>Email</th><th></th></tr></thead><tbody>${invs.map((i) => `<tr>
        <td><a href="invoice.html?id=${esc(i.id)}">${esc(i.number)}</a></td><td>${esc(day(i.issued_at))}</td><td>${esc(i.buyer?.business || i.buyer?.name || "")}</td><td>${rs(i.total_paise)}</td>
        <td class="small">${i.emailed_at ? `Sent to ${esc(i.email_to)}, ${esc(when(i.emailed_at))}` : i.email_error ? `<span class="err" style="display:inline">${esc(i.email_error)}</span>` : "Not sent yet"}</td>
        <td><button class="btn btn-quiet btn-sm" data-send="${esc(i.id)}" type="button">${i.emailed_at ? "Send again" : "Send"}</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted" style="margin:0">No invoices yet. The first one is issued with the first online payment.</p>`}</div>`;

  $("#invset").addEventListener("submit", async (e) => {
    e.preventDefault();
    const g = (id) => $("#" + id).value.trim();
    const row = { legal_name: g("is_legal") || null, trade_name: g("is_trade") || "DASKIES", gstin: g("is_gstin").toUpperCase() || null, email: g("is_email") || "info@daskies.com",
      address: g("is_addr") || null, city: g("is_city") || null, state: g("is_state") || null, postal_code: g("is_pin") || null,
      sac_membership: g("is_sacm") || "998599", sac_fee: g("is_sacf") || "998599", lut_number: g("is_lut") || null, updated_at: new Date().toISOString() };
    const probs = [];
    if (row.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(row.gstin)) probs.push("a GSTIN in the right format (15 characters, like 24ABCDE1234F1Z5)");
    if (row.postal_code && !/^[0-9]{6}$/.test(row.postal_code)) probs.push("a 6-digit PIN code");
    if (!/^[0-9]{4,8}$/.test(row.sac_membership) || !/^[0-9]{4,8}$/.test(row.sac_fee)) probs.push("SAC codes of 4 to 8 digits");
    const msg = $("#ismsg");
    if (probs.length) { msg.textContent = "Please check: " + probs.join("; ") + "."; msg.hidden = false; return; }
    msg.hidden = true;
    const btn = $("#issave"); busy(btn, true, "Saving…");
    const { error } = await sb.from("invoice_settings").update(row).eq("id", 1);
    if (error) { busy(btn, false); msg.textContent = errMsg(error); msg.hidden = false; return; }
    toast("Saved."); show();
  });
  pane.onclick = async (e) => {
    const s1 = e.target.closest("[data-send]"), s2 = e.target.closest("[data-issue]");
    if (s1) {
      busy(s1, true, "Sending…");
      const { data, error } = await sb.functions.invoke("send-invoice", { body: { invoice_id: s1.dataset.send, force: true } });
      if (error || data?.error) { toast(data?.error || errMsg(error), true); busy(s1, false); return; }
      toast(data?.to ? "Sent to " + data.to + "." : "Sent."); show();
    } else if (s2) {
      busy(s2, true, "Issuing…");
      const { data: id, error } = await sb.rpc("issue_invoice", { p_payment: s2.dataset.issue });
      if (error || !id) { toast(error ? errMsg(error) : "Fill in the details first.", true); busy(s2, false); return; }
      const r = await sb.functions.invoke("send-invoice", { body: { invoice_id: id } });
      toast(r.error || r.data?.error ? "Invoice issued. The email didn't go: " + (r.data?.error || errMsg(r.error)) : "Invoice issued and emailed."); show();
    }
  };
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

async function deals() {
  const [{ data, error }, { data: ps }] = await Promise.all([
    sb.from("deals").select("*").order("updated_at", { ascending: false }).limit(300),
    sb.from("deal_party_view").select("deal_id,business,position").order("position").limit(2000)
  ]);
  if (error) throw error;
  const who = (id) => (ps || []).filter((p) => p.deal_id === id).map((p) => p.business || "member").join(", ");
  pane.innerHTML = `<p class="small muted">${data.length} deals. Admins can read every deal and cancel one (for example after a fraud report), but cannot make offers or move stages.</p>
    <div class="tablewrap"><table class="list"><thead><tr><th>Deal</th><th>Type</th><th>Stage</th><th>Parties</th><th>Updated</th></tr></thead><tbody>${data.map((d) => `<tr>
    <td><a href="deal.html?id=${d.id}" target="_blank" rel="noopener">${esc(d.title)}</a></td><td>${esc(DEAL_KINDS[d.kind] || d.kind)}</td><td>${esc(stageName(d.stage))}</td><td class="small">${esc(who(d.id))}</td><td>${esc(when(d.updated_at))}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No deals yet.</td></tr>'}</tbody></table></div>`;
}

// Success fees: worked out by the database when a deal reaches Payment / settlement. Each party sees only their own.
async function payments() {
  const { data, error } = await sb.rpc("admin_payments");
  if (error) throw error;
  const rs = (p) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format((Number(p) || 0) / 100);
  const paid = data.filter((x) => x.status === "paid");
  pane.innerHTML = `<p class="small muted">${data.length} payments · ${paid.length} paid (${esc(rs(paid.reduce((t, x) => t + Number(x.amount_paise), 0)))} incl. GST). Online payments through Razorpay; amounts include 18% GST.</p>
    ${data.length ? `<div class="tablewrap"><table class="list"><thead><tr><th>Date</th><th>Member</th><th>For</th><th>Amount</th><th>Status</th><th>Razorpay reference</th></tr></thead><tbody>
    ${data.map((x) => `<tr><td>${esc(when(x.paid_at || x.created_at))}</td><td>${esc(x.full_name || "")}<br><span class="small muted">${esc(x.business || "")} · ${esc(x.email || "")}</span></td><td>${x.kind === "membership" ? "Full membership" : "Success fee"}</td><td>${esc(rs(x.amount_paise))}</td><td><span class="tag ${x.status === "paid" ? "tag-approved" : x.status === "failed" ? "tag-rejected" : "tag-pending"}">${x.status === "paid" ? "Paid" : x.status === "failed" ? "Failed" : "Started, not paid"}</span></td><td class="small">${esc(x.razorpay_payment_id || "")}<br><span class="muted">${esc(x.razorpay_order_id)}</span></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="panel empty"><p>No online payments yet.</p></div>`}`;
}

async function fees() {
  const { data, error } = await sb.rpc("admin_fees");
  if (error) throw error;
  const inr = (v, c) => new Intl.NumberFormat("en-IN", { style: "currency", currency: c || "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v) || 0);
  const due = data.filter((f) => f.status === "due");
  const sum = (arr, k) => arr.reduce((s, f) => s + (f.currency === "INR" ? Number(f[k]) : 0), 0);
  pane.innerHTML = `<p class="small muted">${data.length} fees · ${due.length} due (${esc(inr(sum(due, "fee") + sum(due, "gst")))} incl. GST, INR deals). Members see their fee only from Payment / settlement. Delivery stays locked until every party's fee is paid or waived.</p>
    <div class="tablewrap"><table class="list"><thead><tr><th>Deal and party</th><th>Value</th><th>Fee</th><th>GST</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.map((f) => `<tr>
      <td><a href="deal.html?id=${f.deal_id}" target="_blank" rel="noopener">${esc(f.deal_title)}</a><div class="small">${esc(f.business || "")}</div><div class="small muted">${esc(stageName(f.stage))} · ${esc(day(f.created_at))}</div>${f.note ? `<div class="small muted">${esc(f.note)}</div>` : ""}</td>
      <td>${esc(inr(f.basis, f.currency))}<div class="small muted">${esc({ agreed: "agreed value", admin: "set by admin", valuation: "valuation report", none: "no value yet" }[f.basis_source] || f.basis_source)}</div></td>
      <td>${esc(inr(f.fee, f.currency))}<div class="small muted">${esc(String(Number(f.rate)))}%</div></td><td>${esc(inr(f.gst, f.currency))}</td>
      <td><span class="tag ${f.status === "due" ? "tag-pending" : f.status === "cancelled" ? "tag-rejected" : "tag-approved"}">${esc(f.status)}</span>${f.paid_ref ? `<div class="small muted">Ref ${esc(f.paid_ref)}</div>` : ""}</td>
      <td>${f.status === "cancelled" ? "" : `<div style="display:flex;gap:6px;flex-wrap:wrap">${f.status !== "paid" ? `<button class="btn btn-primary btn-sm" type="button" data-fee="${f.id}" data-act="paid">Mark paid</button>` : ""}${f.status === "due" ? `<button class="btn btn-ghost btn-sm" type="button" data-fee="${f.id}" data-act="waived">Waive</button>` : ""}<button class="btn btn-quiet btn-sm" type="button" data-fee="${f.id}" data-act="adjust">Change value or rate</button></div>`}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">No fees yet. They appear when a deal reaches Payment / settlement.</td></tr>'}</tbody></table></div>`;
  pane.onclick = async (e) => {
    const b = e.target.closest("[data-fee]"); if (!b) return;
    const args = { p_id: b.dataset.fee, p_status: null, p_basis: null, p_rate: null, p_note: null, p_ref: null };
    if (b.dataset.act === "paid") { const ref = prompt("Payment reference (UPI / bank / Razorpay ID):"); if (ref === null) return; args.p_status = "paid"; args.p_ref = ref.trim().slice(0, 120); }
    else if (b.dataset.act === "waived") { const why = prompt("Why waive this fee? (shown to the member)"); if (why === null) return; args.p_status = "waived"; args.p_note = why.trim().slice(0, 500) || null; }
    else {
      const v = prompt("New value in the deal currency (e.g. from the valuation report). Leave empty to keep it:"); if (v === null) return;
      const r = prompt("New rate in % (e.g. 5, or lower above Rs 1 crore). Leave empty to keep it:"); if (r === null) return;
      const why = prompt("Reason (shown to the member):"); if (why === null) return;
      if (v.trim() && !(Number(v) >= 0)) return toast("Value must be a number.", true);
      if (r.trim() && !(Number(r) >= 0 && Number(r) <= 20)) return toast("Rate must be between 0 and 20.", true);
      args.p_basis = v.trim() ? Number(v) : null; args.p_rate = r.trim() ? Number(r) : null; args.p_note = why.trim().slice(0, 500) || null;
    }
    const { error: er } = await sb.rpc("admin_update_fee", args);
    if (er) return toast(errMsg(er), true);
    toast("Fee updated."); show();
  };
}

// Errors visitors and members hit in their browsers (recorded by assets/boot.js). A reference lets you match a WhatsApp report.
async function errors() {
  const { data, error } = await sb.from("client_errors").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  const ids = [...new Set(data.map((e) => e.user_id).filter(Boolean))];
  const { data: ps } = ids.length ? await sb.from("profiles").select("id,email,full_name").in("id", ids) : { data: [] };
  const who = (id) => { const p = (ps || []).find((x) => x.id === id); return p ? p.full_name || p.email : id ? "member" : "visitor"; };
  const day1 = data.filter((e) => Date.now() - new Date(e.created_at) < 864e5).length;
  pane.innerHTML = `<p class="small muted">${data.length} recent reports · ${day1} in the last 24 hours. Each report is one error a person saw in their browser; the reference matches what they quote to you.</p>
    <div class="tablewrap"><table class="list"><thead><tr><th>When</th><th>Ref</th><th>Page</th><th>Error</th><th>Who</th></tr></thead><tbody>${data.map((e) => `<tr>
      <td>${esc(when(e.created_at))}</td><td><b>${esc(e.ref || "")}</b></td><td class="small">${esc(e.page || "")}</td>
      <td><span class="small">${esc(e.message)}</span>${e.detail ? `<details class="small"><summary>Details</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(e.detail)}</pre></details>` : ""}</td>
      <td class="small">${esc(who(e.user_id))}<div class="muted">${esc((e.user_agent || "").replace(/^Mozilla\/5\.0 /, "").slice(0, 60))}</div></td></tr>`).join("") || '<tr><td colspan="5" class="muted">No errors reported. Good.</td></tr>'}</tbody></table></div>`;
}

async function users() {
  const { data, error } = await sb.rpc("admin_members");
  if (error) throw error;
  const done = data.filter((u) => u.complete).length;
  pane.innerHTML = `<p class="small muted">${data.length} accounts · ${done} complete · ${data.length - done} still missing details. Members with missing details cannot post, enquire, message or start deals.</p>
    <div class="tablewrap"><table class="list"><thead><tr><th>Member</th><th>Business</th><th>Registered address</th><th>GSTIN</th><th>Profile</th><th>Joined</th></tr></thead><tbody>${data.map((u) => `<tr>
    <td><b>${esc(u.full_name || "—")}</b>${u.is_admin ? ' <span class="tag tag-closed">Admin</span>' : ""}<div class="small">${esc(u.email || "")}</div><div class="small">${esc(u.phone || "")}</div></td>
    <td>${esc(u.business || "—")}<div class="small muted">${esc((u.roles || []).join(", "))}</div>${u.business ? `<div class="small muted">Level ${u.verification_level || 1}</div>` : ""}</td>
    <td class="small">${esc([u.address, [u.city, u.state].filter(Boolean).join(", "), [u.postal_code, u.country].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—")}</td>
    <td class="small">${esc(u.gstin || "")}</td>
    <td>${u.complete ? '<span class="tag tag-approved">Complete</span>' : '<span class="tag tag-pending">Missing details</span>'}</td><td>${esc(day(u.joined))}</td></tr>`).join("")}</tbody></table></div>`;
}

async function audit() {
  const { data, error } = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  pane.innerHTML = `<div class="tablewrap"><table class="list"><thead><tr><th>When</th><th>Action</th><th>Item</th><th>Detail</th></tr></thead><tbody>${data.map((a) => `<tr>
    <td>${esc(when(a.created_at))}</td><td>${esc(a.action)}</td><td class="small">${esc(a.entity)} ${esc((a.entity_id || "").slice(0, 8))}</td><td class="small">${esc(JSON.stringify(a.detail))}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>'}</tbody></table></div>`;
}

show();
