import { sb, $, $$, esc, qs, header, requireAuth, money, when, day, errMsg, busy, toast, levelBadge, pagehead } from "./core.js?v=10fbaccf";
import { paymentsOn, pay } from "./pay.js?v=10fbaccf";
import { DEAL_STAGES as STAGES, DEAL_KINDS as KIND } from "./taxonomy.js?v=10fbaccf";

await header("dashboard.html");
const m = await requireAuth();
if (!m) throw new Error("stop");
const main = $("#main");
const id = qs("id");

const TERMS = [["price", "Price / total value", "number"], ["cash_adjustment", "Cash adjustment", "number"], ["cash_payer", "Cash paid by", "party"], ["quantity", "Quantity", "text"], ["delivery_terms", "Delivery terms (e.g. ex-works, FOB, CIF)", "text"], ["payment_terms", "Payment terms", "text"], ["timeline", "Timeline / delivery date", "text"], ["inspection", "Inspection and quality", "text"], ["lease_period", "Lease period (if leasing)", "text"], ["notes", "Other terms", "textarea"]];

let deal, parties, offers, events;
async function load() {
  const [d, p, o, e] = await Promise.all([
    sb.from("deals").select("*").eq("id", id).maybeSingle(),
    sb.from("deal_party_view").select("*").eq("deal_id", id).order("position"),
    sb.from("deal_offers").select("*").eq("deal_id", id).order("version", { ascending: false }),
    sb.from("deal_events").select("*").eq("deal_id", id).order("created_at", { ascending: false })
  ]);
  deal = d.data; parties = p.data || []; offers = o.data || []; events = e.data || [];
  // Fees exist only once the contract is signed; members see only their own (database rule).
  const f = deal && ["contract_signed", "settlement", "delivery", "completed", "cancelled"].includes(deal.stage) ? await sb.from("deal_fees").select("*").eq("deal_id", id) : { data: [] };
  fees = f.data || [];
}
let fees = [];
const inr = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: deal.currency || "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v) || 0);
const FEE_WORD = { due: "Due", paid: "Paid, thank you", waived: "Waived", cancelled: "Cancelled (deal cancelled)" };
function feeHTML() {
  const mine = fees.find((x) => x.user_id === m.user.id);
  if (mine) {
    const basisLabel = mine.basis_source === "none" ? "Deal value" : mine.basis_source === "agreed" ? (deal.kind.includes("barter") ? "Agreed value of what you give" : "Agreed deal value") : "Value confirmed by DASKIES";
    return `<section class="panel feebox"><h2>Your DASKIES success fee</h2>
      <p class="small muted" style="margin-top:-6px">Only you and DASKIES can see this. It is set out in your signed deal contract and is non-refundable.</p>
      <dl class="kv"><dt>${esc(basisLabel)}</dt><dd>${mine.basis_source === "none" ? "DASKIES will confirm it with you" : esc(inr(mine.basis))}</dd>
        <dt>Success fee (${esc(String(Number(mine.rate)))}%)</dt><dd>${esc(inr(mine.fee))}</dd><dt>GST (${esc(String(Number(mine.gst_rate)))}%)</dt><dd>${esc(inr(mine.gst))}</dd>
        <dt>Total payable</dt><dd><b>${esc(inr(Number(mine.fee) + Number(mine.gst)))}</b></dd><dt>Status</dt><dd><span class="tag ${mine.status === "due" ? "tag-pending" : mine.status === "cancelled" ? "tag-rejected" : "tag-approved"}">${esc(FEE_WORD[mine.status] || mine.status)}</span></dd></dl>
      ${mine.note ? `<p class="small">${esc(mine.note)}</p>` : ""}
      ${mine.status === "due" && paymentsOn() && mine.currency === "INR" ? `<p style="margin:12px 0 4px"><button class="btn btn-primary" id="payFee" data-fee="${esc(mine.id)}" type="button">Pay ${esc(inr(Number(mine.fee) + Number(mine.gst)))} now</button></p><p class="small muted">UPI, card or net banking. Your GST invoice follows by email. Payment and settlement between the parties open once every party's fee is paid.</p>` : mine.status === "due" ? `<p class="small"><b>How to pay:</b> DASKIES will send your GST invoice and payment details. Payment and settlement between the parties open once every party's fee is paid.</p>` : ""}</section>`;
  }
  if (fees.length && m.profile?.is_admin) {
    return `<section class="panel feebox"><h2>Success fees <span class="small muted">admin view</span></h2><div class="tablewrap"><table class="list"><thead><tr><th>Party</th><th>Value</th><th>Fee</th><th>GST</th><th>Status</th></tr></thead><tbody>
      ${fees.map((x) => `<tr><td>${esc(nameOf(x.user_id))}</td><td>${esc(inr(x.basis))}</td><td>${esc(inr(x.fee))} (${esc(String(Number(x.rate)))}%)</td><td>${esc(inr(x.gst))}</td><td>${esc(FEE_WORD[x.status] || x.status)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small"><a href="admin.html#fees">Manage fees</a></p></section>`;
  }
  return "";
}
const nameOf = (uid) => (parties.find((p) => p.user_id === uid) || {}).business || (uid === m.user.id ? "You" : "A party");
const me = () => parties.find((p) => p.user_id === m.user.id) || {};
const fmt = (v) => money(v, deal.currency);

function termsHTML(t) {
  const rows = TERMS.filter(([k]) => t[k] !== undefined && t[k] !== "" && t[k] !== null).map(([k, label, type]) =>
    `<dt>${esc(label)}</dt><dd>${esc(type === "number" ? fmt(t[k]) : type === "party" ? nameOf(t[k]) : t[k])}</dd>`).join("");
  const vals = t.values ? Object.entries(t.values).filter(([, v]) => v !== "" && v !== null).map(([uid, v]) => `<dt>Value of what ${esc(nameOf(uid))} gives</dt><dd>${esc(fmt(v))}</dd>`).join("") : "";
  return `<dl class="kv">${rows}${vals}</dl>`;
}

function render() {
  if (!deal) { main.innerHTML = `<div class="panel empty"><h1>Deal not found</h1><p>Only the businesses in a deal can open it.</p><a class="btn btn-primary" href="dashboard.html#deals">Your deals</a></div>`; return; }
  document.title = `${deal.title} — DASKIES`;
  const idx = STAGES.findIndex(([s]) => s === deal.stage);
  const open = !["completed", "cancelled"].includes(deal.stage);
  const negotiating = ["enquiry", "discussion", "offer", "counteroffer"].includes(deal.stage);
  const cur = offers.find((o) => o.status === "proposed");
  const agreed = offers.find((o) => o.status === "accepted");
  const iApproved = me().approved;
  const party = parties.some((p) => p.user_id === m.user.id);
  main.innerHTML = `
  ${pagehead({ crumb: `<a href="dashboard.html#deals">Your deals</a>`,
    pre: `<div class="tags"><span class="tag tag-closed">${esc(KIND[deal.kind] || deal.kind)}</span>${deal.stage === "cancelled" ? '<span class="tag tag-rejected">Cancelled</span>' : ""}</div>`,
    title: esc(deal.title),
    lead: `Started ${esc(day(deal.created_at))}. Nothing is binding until every party approves the same terms and signs the final contract.`,
    body: `<ol class="stages" aria-label="Deal stage">${STAGES.map(([s, n], i) => `<li class="${i < idx ? "done" : i === idx ? "now" : ""}"${i === idx ? ' aria-current="step"' : ""}>${esc(n)}</li>`).join("")}</ol>` })}
  <div class="split detail">
    <div class="grid">
      <section class="panel"><h2>${deal.kind === "multi_barter" || deal.kind === "barter" ? "Who gives what" : "Parties"}</h2>
        <div class="chain">${parties.map((p, i) => `<div class="stat" style="padding:12px"><span class="small muted">${p.user_id === m.user.id ? "You" : esc(p.business || "Party")}${p.approved && negotiating ? " · approved ✓" : ""}${p.completed ? " · confirmed ✓" : ""}</span>
          <b style="font-size:1rem">${p.listing_id ? `<a href="listing.html?id=${p.listing_id}">${esc(p.listing_title)}</a>` : "Cash / to be agreed"}</b>
          <span class="small">${p.price ? esc(money(p.price, p.currency)) : ""}</span>${levelBadge(p.verification_level)}</div>${i < parties.length - 1 && (deal.kind === "multi_barter" || deal.kind === "barter") ? '<div aria-hidden="true" class="arrow">→</div>' : ""}`).join("")}</div>
        ${deal.kind === "multi_barter" ? '<p class="hint">Each party gives to the next; the last gives back to the first. Any value gap is settled in cash.</p>' : ""}
      </section>
      ${cur ? `<section class="panel"><h2>Offer on the table <span class="small muted">v${cur.version} by ${esc(nameOf(cur.author_id))}, ${esc(when(cur.created_at))}</span></h2>${termsHTML(cur.terms)}
        <p class="small muted">${parties.filter((p) => p.approved).length} of ${parties.length} parties have approved.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap" ${party ? "" : "hidden"}>${!iApproved ? `<button class="btn btn-primary" id="approve" type="button">Approve these terms</button><button class="btn btn-danger" id="reject" type="button">Reject</button>` : '<span class="tag tag-approved">You approved</span>'}<button class="btn btn-ghost" id="counter" type="button">Make a counteroffer</button></div></section>` : ""}
      ${agreed ? `<section class="panel"><h2>Agreed terms <span class="small muted">v${agreed.version}</span></h2>${termsHTML(agreed.terms)}</section>` : ""}
      ${party && negotiating && !cur ? `<section class="panel"><h2>Make the first offer</h2><p class="muted small">Set out price, any cash adjustment, delivery and payment terms. Every party then approves, rejects or counters.</p><button class="btn btn-primary" id="counter" type="button">Write an offer</button></section>` : ""}
      <section class="panel" id="offerForm" hidden></section>
      ${party && open && !negotiating ? `<section class="panel"><h2>Next step</h2>${deal.stage === "delivery"
        ? `<p>When you have received what was agreed, confirm completion. The deal completes when every party confirms.</p>${me().completed ? '<span class="tag tag-approved">You confirmed</span>' : '<button class="btn btn-primary" id="complete" type="button">Confirm completion</button>'}`
        : deal.stage === "contract_signed" && (fees.find((x) => x.user_id === m.user.id) || {}).status === "due"
        ? `<p>The contract is signed. Pay your DASKIES success fee below; payment and settlement between the parties open once every party's fee is paid.</p><button class="btn btn-primary" type="button" disabled>Move to: Payment / settlement</button>`
        : `<div class="field"><label for="stNote">Note for the other parties (optional)</label><input id="stNote" maxlength="500" placeholder="e.g. Inspection report shared, contract signed on 20 Nov"></div><button class="btn btn-primary" id="advance" type="button">Move to: ${esc(STAGES[idx + 1] ? STAGES[idx + 1][1] : "")}</button>`}</section>` : ""}
      ${feeHTML()}
      ${party && deal.stage === "enquiry" ? `<section class="panel"><button class="btn btn-ghost" id="advance" type="button">Mark as in discussion</button></section>` : ""}
      <section class="panel"><h2>Documents</h2><p class="hint" style="margin-top:-6px">Templates filled from ${agreed ? "the agreed terms" : "the latest offer"}. Have a lawyer review before anyone signs. DASKIES does not hold money or act as escrow.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-doc="offer" type="button">Offer sheet</button><button class="btn btn-ghost btn-sm" data-doc="mou" type="button">MOU</button>${deal.kind.includes("barter") ? '<button class="btn btn-ghost btn-sm" data-doc="barter" type="button">Barter agreement</button>' : '<button class="btn btn-ghost btn-sm" data-doc="agreement" type="button">Deal agreement</button>'}<button class="btn btn-ghost btn-sm" data-doc="delivery" type="button">Delivery confirmation</button><button class="btn btn-ghost btn-sm" data-doc="settlement" type="button">Settlement statement</button></div></section>
    </div>
    <aside class="grid">
      <section class="panel"><h2>History</h2>
        <form id="nf" style="display:flex;gap:6px;margin-bottom:12px" ${party ? "" : "hidden"}><label class="sr" for="note">Add a note</label><input class="input" id="note" maxlength="2000" placeholder="Add a note"><button class="btn btn-ghost btn-sm">Add</button></form>
        <ol class="history">${events.map((e) => `<li>${["terms_agreed", "completed"].includes(e.type) ? "" : `<b>${esc(nameOf(e.actor_id))}</b> `}${esc(eventWord(e))}<time>${esc(when(e.created_at))}</time></li>`).join("")}</ol></section>
      ${open && (party || m.profile?.is_admin) ? `<button class="btn btn-quiet btn-sm" id="cancel" type="button">Cancel this deal</button>` : ""}
      ${party ? "" : '<p class="hint">You are viewing this deal as a DASKIES admin. Only the parties can make offers or move stages.</p>'}
    </aside>
  </div>`;
  wire(cur);
  const ol = $(".stages"), nowEl = $(".stages .now");
  if (ol && nowEl) ol.scrollLeft = nowEl.offsetLeft - ol.clientWidth / 2 + nowEl.clientWidth / 2;
}

function eventWord(e) {
  const d = e.detail || {};
  return ({ created: "started the deal", offer: `made offer v${d.version}`, counteroffer: `made counteroffer v${d.version}`, approved: "approved the terms", rejected: `rejected the offer${d.reason ? ": " + d.reason : ""}`,
    terms_agreed: "Every party approved. Terms agreed.", stage: `moved the deal to ${(STAGES.find(([s]) => s === d.to) || [, d.to])[1]}${d.note ? ": " + d.note : ""}`, confirmed_completion: "confirmed completion",
    completed: "Every party confirmed. Deal completed.", cancelled: `cancelled the deal${d.reason ? ": " + d.reason : ""}`, note: `noted: ${d.note}` })[e.type] || e.type;
}

function offerForm(prefill = {}) {
  const box = $("#offerForm");
  const isBarter = deal.kind.includes("barter");
  box.hidden = false;
  box.innerHTML = `<h2>${offers.length ? "Counteroffer" : "Offer"}</h2><form id="of" novalidate><div class="row2">${TERMS.map(([k, label, type]) =>
    type === "textarea" ? `<div class="field" style="grid-column:1/-1"><label for="t_${k}">${esc(label)}</label><textarea id="t_${k}" maxlength="3000">${esc(prefill[k] || "")}</textarea></div>`
    : type === "party" ? `<div class="field"><label for="t_${k}">${esc(label)}</label><select id="t_${k}"><option value="">No cash adjustment</option>${parties.map((p) => `<option value="${p.user_id}"${prefill[k] === p.user_id ? " selected" : ""}>${esc(p.user_id === m.user.id ? "You (" + (p.business || "") + ")" : p.business || "Party")}</option>`).join("")}</select></div>`
    : `<div class="field"><label for="t_${k}">${esc(label)}${type === "number" ? " (" + esc(deal.currency) + ")" : ""}</label><input id="t_${k}" ${type === "number" ? 'type="number" min="0" step="any"' : 'maxlength="300"'} value="${esc(prefill[k] ?? "")}"></div>`).join("")}</div>
    ${isBarter ? `<h3>Agreed value of what each party gives</h3><div class="row2">${parties.map((p) => `<div class="field"><label for="v_${p.user_id}">${esc(p.user_id === m.user.id ? "You" : p.business || "Party")}: ${esc(p.listing_title || "cash")}</label><input id="v_${p.user_id}" type="number" min="0" step="any" value="${esc((prefill.values || {})[p.user_id] ?? p.price ?? "")}"></div>`).join("")}</div>` : ""}
    <p class="err" id="omsg" role="alert"></p><div style="display:flex;gap:8px"><button class="btn btn-primary">Send ${offers.length ? "counteroffer" : "offer"}</button><button class="btn btn-ghost" type="button" id="ocancel">Cancel</button></div></form>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#ocancel").onclick = () => { box.hidden = true; };
  $("#of").onsubmit = async (e) => {
    e.preventDefault();
    const t = {};
    TERMS.forEach(([k, , type]) => { const v = $("#t_" + k).value.trim(); if (v !== "") t[k] = type === "number" ? Number(v) : v; });
    if (isBarter) { t.values = {}; parties.forEach((p) => { const v = $("#v_" + p.user_id).value; if (v !== "") t.values[p.user_id] = Number(v); }); }
    if (!Object.keys(t).length) { $("#omsg").textContent = "Add at least one term."; return; }
    const btn = $("#of button"); busy(btn, true, "Sending…");
    const { error } = await sb.rpc("make_offer", { p_deal: id, p_terms: t });
    if (error) { $("#omsg").textContent = errMsg(error); busy(btn, false); return; }
    toast("Sent. The other parties can now approve, reject or counter."); await refresh();
  };
}

function wire(cur) {
  const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };
  on("#counter", () => offerForm(cur ? cur.terms : {}));
  on("#payFee", async (e) => {
    const b = e.currentTarget; busy(b, true, "Opening payment…");
    try { await pay("fee", { fee_id: b.dataset.fee }); toast("Payment received. Thank you."); setTimeout(() => location.reload(), 900); }
    catch (err) { busy(b, false); toast(err.message, !err.cancelled); }
  });
  on("#approve", async (e) => { busy(e.target, true, "Approving…"); const { data, error } = await sb.rpc("approve_terms", { p_deal: id, p_offer: cur.id }); if (error) { toast(errMsg(error), true); busy(e.target, false); return; } toast(data === "terms_agreed" ? "All parties approved. Terms agreed." : "Approved. Waiting for the other parties."); refresh(); });
  on("#reject", async (e) => { const reason = prompt("Why are you rejecting? (optional, shown to the other parties)"); if (reason === null) return; busy(e.target, true); const { error } = await sb.rpc("reject_offer", { p_deal: id, p_offer: cur.id, p_reason: reason }); if (error) { toast(errMsg(error), true); busy(e.target, false); return; } toast("Rejected. Anyone can now make a counteroffer."); refresh(); });
  on("#advance", async (e) => { busy(e.target, true); const { error } = await sb.rpc("advance_stage", { p_deal: id, p_note: ($("#stNote") || {}).value || null }); if (error) { toast(errMsg(error), true); busy(e.target, false); return; } refresh(); });
  on("#complete", async (e) => { if (!confirm("Confirm that you received everything agreed in this deal?")) return; busy(e.target, true); const { data, error } = await sb.rpc("confirm_completion", { p_deal: id }); if (error) { toast(errMsg(error), true); busy(e.target, false); return; } toast(data === "completed" ? "Deal completed." : "Confirmed. Waiting for the other parties."); refresh(); });
  on("#cancel", async () => { const reason = prompt("Cancel this deal for every party? Give a short reason."); if (reason === null) return; const { error } = await sb.rpc("cancel_deal", { p_deal: id, p_reason: reason }); if (error) return toast(errMsg(error), true); toast("Deal cancelled."); refresh(); });
  $("#nf").addEventListener("submit", async (e) => { e.preventDefault(); const v = $("#note").value.trim(); if (!v) return; const { error } = await sb.rpc("deal_note", { p_deal: id, p_note: v }); if (error) return toast(errMsg(error), true); refresh(); });
  $$("[data-doc]").forEach((b) => b.addEventListener("click", () => printDoc(b.dataset.doc)));
}

function printDoc(kind) {
  const o = offers.find((x) => x.status === "accepted") || offers[0];
  const t = o ? o.terms : {};
  const titles = { offer: "Offer sheet", mou: "Memorandum of understanding", barter: "Barter agreement", agreement: "Deal agreement", delivery: "Delivery confirmation", settlement: "Settlement statement" };
  // Agreed value per party: from the terms when there are any (never the listing's asking price), otherwise the asking price.
  const agreedOf = (p) => t.values && t.values[p.user_id] != null && t.values[p.user_id] !== "" ? fmt(t.values[p.user_id])
    : o ? (!deal.kind.includes("barter") && p.listing_id && t.price != null && t.price !== "" ? fmt(t.price) : "")
    : p.price ? money(p.price, p.currency) + " (asking)" : "";
  const partyRows = parties.map((p, i) => `<tr><td>Party ${String.fromCharCode(65 + i)}</td><td>${esc(p.business || "")}</td><td>${esc(p.listing_title || "Cash")}</td><td>${esc(agreedOf(p))}</td></tr>`).join("");
  const body = {
    offer: `<p>This offer sheet records the commercial terms proposed in the DASKIES deal below. It is not a binding contract.</p>`,
    mou: `<p>The parties below record their intention to proceed on the terms set out here, subject to due diligence, documentation and a final signed contract. This memorandum is not legally binding except for confidentiality.</p>`,
    barter: `<p>Each party agrees to transfer the asset or goods listed against its name to the next party in the chain${parties.length > 2 ? ", the last party transferring to Party A" : ""}, on the terms below. Any difference in agreed value is settled in cash as stated.</p>`,
    agreement: `<p>The parties agree to complete the ${esc((KIND[deal.kind] || "deal").toLowerCase())} below on the terms set out here.</p>`,
    delivery: `<p>The receiving party confirms delivery of the items listed, in the quantity and condition agreed, on the date below.</p><p>Date of delivery: ____________ &nbsp; Place: ____________</p>`,
    settlement: `<p>Statement of amounts agreed between the parties. Payments are made directly between the parties or through a licensed payment provider; DASKIES does not hold funds.</p>`
  }[kind];
  const w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to open the document.", true);
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titles[kind])} — ${esc(deal.title)}</title><style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#222;line-height:1.5}h1{font-size:24px;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #bbb;padding:6px 8px;text-align:left;font-size:14px}.muted{color:#666;font-size:13px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}.sign div{border-top:1px solid #333;padding-top:6px;font-size:13px}@media print{button{display:none}}</style></head><body>
    <button onclick="print()">Print or save as PDF</button>
    <h1>${esc(titles[kind])}</h1><p class="muted">DASKIES deal: ${esc(deal.title)} · ${esc(KIND[deal.kind] || deal.kind)} · Reference ${esc(deal.id.slice(0, 8).toUpperCase())} · Prepared ${esc(day(new Date()))}${o ? ` · Terms version ${o.version}${o.status === "accepted" ? " (agreed by all parties)" : " (proposed, not yet agreed)"}` : ""}</p>
    ${body}
    <table><tr><th>Party</th><th>Business</th><th>Gives</th><th>Agreed value</th></tr>${partyRows}</table>
    <table>${TERMS.filter(([k]) => t[k] !== undefined && t[k] !== "").map(([k, label, type]) => `<tr><th style="width:40%">${esc(label)}</th><td>${esc(type === "number" ? fmt(t[k]) : type === "party" ? nameOf(t[k]) : t[k])}</td></tr>`).join("") || "<tr><td>No terms recorded yet.</td></tr>"}</table>
    ${kind === "barter" || kind === "agreement" ? `<h2 style="font-size:17px;margin-top:24px">DASKIES success fee</h2>
    <p>On signing this agreement, each party pays DASKIES a success fee of 5% of the agreed value of what it gives under this agreement (for a sale or lease, the agreed price), plus GST. For deals above ₹1 crore, the rate agreed in writing with DASKIES applies. The fee is payable on signing and is non-refundable. Payment and settlement between the parties open once every party's fee is paid.</p>
    <h2 style="font-size:17px">Risk and responsibility</h2>
    <p>From signing, all risk and responsibility for the goods or assets, payments, delivery, quality, title and performance under this agreement rest with the parties. DASKIES is not a party to this agreement, does not hold funds and gives no guarantee.</p>` : ""}
    <div class="sign">${parties.map((p, i) => `<div>Signed for Party ${String.fromCharCode(65 + i)}: ${esc(p.business || "")}<br>Name, title, date</div>`).join("")}</div>
    <p class="muted" style="margin-top:40px">Template generated by DASKIES from the deal record. It is not legal advice. Each party should have it reviewed by its own lawyer and adapt it to the applicable law before signing.</p></body></html>`);
  w.document.close();
}

async function refresh() { await load(); render(); }
await refresh();
