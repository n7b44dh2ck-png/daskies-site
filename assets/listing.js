import { completeUrl, sb, $, esc, qs, header, card, money, price, day, photoUrl, levelBadge, errMsg, busy, toast, statusWord } from "./core.js?v=238cf24f";
import { vertical, isOil, LEVEL_NOTE, DEAL_KINDS, defaultDealKind } from "./taxonomy.js?v=238cf24f";

const m = await header("explore.html");
const main = $("#main");
const id = qs("id");

const { data: l, error } = id ? await sb.from("listings")
  .select("*, listing_photos(path,sort), businesses(name,city,country,verification_level,roles,year_established,description,export_import)")
  .eq("id", id).maybeSingle() : { data: null };
if (error || !l) {
  main.innerHTML = `<div class="panel empty"><h1>Listing not found</h1><p>It may have been closed or is still waiting for review.</p><a class="btn btn-primary" href="explore.html">Explore opportunities</a></div>`;
  throw new Error("stop");
}
document.title = `${l.title} — DASKIES`;
const v = vertical(l.vertical);
const mine = m.user && m.user.id === l.owner_id;
const b = l.businesses || {};
const photos = [...(l.listing_photos || [])].sort((a, c) => a.sort - c.sort);
const fields = [...(v ? v.fields : []), ...(l.vertical === "commodity" && isOil(l.subcategory) ? v.oilFields : [])];
const details = fields.filter(([k]) => l.details && l.details[k] !== undefined && l.details[k] !== "")
  .map(([k, label, type]) => `<dt>${esc(label)}</dt><dd>${esc(type === "yesno" ? (l.details[k] ? "Yes" : "No") : l.details[k])}</dd>`).join("");

main.innerHTML = `
  <p class="small"><a href="explore.html?v=${esc(l.vertical)}">${esc(v ? v.name : "")}</a> › ${esc(l.subcategory)}</p>
  ${mine && l.status !== "approved" ? `<p class="note"><b>${esc(statusWord(l.status))}.</b> ${l.status === "pending" ? "Only you and the DASKIES team can see this until it is approved." : l.admin_note ? "Note from DASKIES: " + esc(l.admin_note) : ""}</p>` : ""}
  <div class="split detail">
    <article>
      <div class="tags" style="margin-bottom:8px"><span class="tag tag-${l.kind}">${l.kind === "offer" ? "Available" : "Wanted"}</span>${(l.deal_types || []).map((d) => `<span class="tag tag-closed">${esc(d)}</span>`).join("")}</div>
      <h1>${esc(l.title)}</h1>
      <p class="muted" style="margin:0 0 16px">${esc([l.city, l.state, l.country].filter(Boolean).join(", "))} · Listed ${esc(day(l.created_at))}</p>
      ${photos.length ? `<div class="gallery" style="margin-bottom:20px"><img src="${esc(photoUrl(photos[0].path))}" alt="Photo 1 of ${esc(l.title)}"><div class="rest">${photos.slice(1, 3).map((p, i) => `<img src="${esc(photoUrl(p.path))}" alt="Photo ${i + 2}" loading="lazy">`).join("")}</div></div>` : ""}
      <div class="panel" style="margin-bottom:16px">
        <dl class="kv">
          <dt>${l.kind === "offer" ? "Price" : "Budget"}</dt><dd><b>${price(l.price, l.currency, l.price_unit)}</b>${l.price ? `<span class="small muted" style="display:block;margin-top:4px" data-fxnote data-c="${esc(l.currency || "INR")}" data-o="${esc(money(l.price, l.currency, l.price_unit))}" hidden></span>` : ""}</dd>
          ${l.quantity ? `<dt>Quantity</dt><dd>${esc(l.quantity)} ${esc(l.quantity_unit || "")}</dd>` : ""}
          ${l.wants_in_exchange ? `<dt>Would take in exchange</dt><dd>${esc(l.wants_in_exchange)}</dd>` : ""}
          ${l.expires_at ? `<dt>Open until</dt><dd>${esc(day(l.expires_at))}</dd>` : ""}
          ${details}
        </dl>
      </div>
      ${l.description ? `<h2>Description</h2><p style="white-space:pre-wrap">${esc(l.description)}</p>` : ""}
      ${l.vertical === "projects" ? `<p class="note">DASKIES is not a bank, lender, investment adviser or exchange. Finance is arranged only through appropriately licensed partners. No returns are promised. Read the risks above and do your own due diligence.</p>` : ""}
      <h2 style="margin-top:28px" id="mt">${l.kind === "offer" ? "Businesses that need this" : "Businesses that have this"}</h2>
      <div class="cards" id="matches"><p class="muted">Looking for matches…</p></div>
    </article>
    <aside class="grid">
      <div class="panel">
        <h3>${esc(b.name || "Member business")}</h3>
        <p class="small muted" style="margin:0 0 8px">${esc([b.city, b.country].filter(Boolean).join(", "))}${b.year_established ? " · since " + esc(b.year_established) : ""}</p>
        ${levelBadge(b.verification_level)}
        <p class="hint" style="margin:8px 0 0">${esc(LEVEL_NOTE)}</p>
      </div>
      <div class="panel" id="act"></div>
    </aside>
  </div>`;

const act = $("#act");
if (mine) {
  act.innerHTML = `<h3>Your listing</h3><p class="small muted">Status: ${esc(statusWord(l.status))}</p>
    <div class="grid"><a class="btn btn-ghost" href="post.html?id=${esc(l.id)}">Edit</a>${l.status !== "closed" ? '<button class="btn btn-ghost" id="close" type="button">Mark as closed</button>' : ""}<a class="btn btn-quiet" href="dashboard.html#messages">See enquiries</a></div>`;
  const c = $("#close");
  if (c) c.addEventListener("click", async () => {
    busy(c, true);
    const { error: e } = await sb.from("listings").update({ status: "closed" }).eq("id", l.id);
    if (e) { toast(errMsg(e), true); busy(c, false); } else { toast("Listing closed."); location.reload(); }
  });
} else if (!m.user) {
  act.innerHTML = `<h3>Interested?</h3><p class="small">Sign in to message this business. Contact details stay private until you both choose to share them.</p><a class="btn btn-primary" style="width:100%" href="account.html?mode=signup&next=${encodeURIComponent("listing.html?id=" + l.id)}">Join free to enquire</a><p class="small" style="margin-top:10px">Already a member? <a href="account.html?next=${encodeURIComponent("listing.html?id=" + l.id)}">Sign in</a></p>`;
} else if (!m.complete) {
  act.innerHTML = `<h3>Interested?</h3><p class="small">Complete your business profile to message this business or start a deal. DASKIES asks every member for their full business details.</p><a class="btn btn-primary" style="width:100%" href="${esc(completeUrl())}">Complete your profile</a>`;
} else {
  act.innerHTML = `<h3>Send an enquiry</h3>
    <form id="eq"><div class="field"><label class="sr" for="body">Message</label><textarea id="body" maxlength="4000" required placeholder="Ask about price, quantity, inspection, timeline or a swap.">Hello, I'm interested in "${esc(l.title)}". </textarea></div>
    <button class="btn btn-primary" style="width:100%">Send enquiry</button></form>
    <div class="dealbox"><h3>Ready to negotiate?</h3><p class="small muted" style="margin-top:-4px">Open a deal room to send a formal offer, counter and track every stage. Nothing is binding until both sides approve the same terms.</p>
      <form id="df"><div class="field"><label for="dk">Deal type</label><select id="dk">${Object.entries(DEAL_KINDS).filter(([k]) => !["multi_barter", "purchase"].includes(k)).map(([k, n]) => `<option value="${k}"${k === defaultDealKind(l) ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      <div class="field"><label for="dl">Offer one of your listings with it <span class="muted">(needed for a barter)</span></label><select id="dl"><option value="">None</option></select></div>
      <p class="err" id="dmsg" role="alert"></p><button class="btn btn-ghost" style="width:100%">Start a deal</button></form></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-quiet btn-sm" id="save" type="button">Save</button><button class="btn btn-quiet btn-sm" id="rep" type="button">Report this listing</button></div>`;
  $("#eq").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#eq button"), body = $("#body").value.trim();
    if (body.length < 2) return;
    busy(btn, true, "Sending…");
    const { data: conv, error: err } = await sb.rpc("start_enquiry", { p_listing: l.id, p_body: body });
    if (err) { toast(errMsg(err), true); busy(btn, false); return; }
    location.href = "dashboard.html?c=" + conv + "#messages";
  });
  sb.from("listings").select("id,title,status").eq("owner_id", m.user.id).in("status", ["approved", "pending"]).order("created_at", { ascending: false }).then(({ data }) => {
    $("#dl").insertAdjacentHTML("beforeend", (data || []).map((x) => `<option value="${x.id}">${esc(x.title)}${x.status === "pending" ? " (waiting for review)" : ""}</option>`).join(""));
  });
  $("#df").addEventListener("submit", async (e) => {
    e.preventDefault();
    const kind = $("#dk").value, mineId = $("#dl").value, btn = $("#df button");
    if (kind === "barter" && !mineId) { $("#dmsg").textContent = "Choose which of your listings you would give in the swap."; return; }
    busy(btn, true, "Opening…");
    const ids = mineId ? [mineId, l.id] : [l.id];
    const { data: deal, error: err } = await sb.rpc("create_deal", { p_kind: kind, p_title: (kind === "barter" ? "Swap: " : "") + l.title.slice(0, 150), p_listings: ids });
    if (err) { $("#dmsg").textContent = errMsg(err); busy(btn, false); return; }
    location.href = "deal.html?id=" + deal;
  });
  $("#save").addEventListener("click", async (e) => {
    const { error: err } = await sb.from("saved_listings").insert({ user_id: m.user.id, listing_id: l.id });
    if (err && !/duplicate/i.test(err.message)) toast(errMsg(err), true); else { toast("Saved to your dashboard."); e.target.textContent = "Saved"; e.target.disabled = true; }
  });
  $("#rep").addEventListener("click", async () => {
    const reason = prompt("What is wrong with this listing? (fake, duplicate, misleading, not the owner…)");
    if (!reason || reason.trim().length < 3) return;
    const { error: err } = await sb.from("reports").insert({ reporter_id: m.user.id, listing_id: l.id, reason: reason.trim().slice(0, 1000) });
    toast(err ? errMsg(err) : "Thank you. The DASKIES team will review it.", !!err);
  });
}

// Matches: the other side in the same vertical (same category first). Indicative only.
const other = l.kind === "offer" ? "need" : "offer";
const sel = "id,kind,vertical,subcategory,title,price,price_unit,currency,quantity,quantity_unit,city,country,status,owner_id,listing_photos(path,sort)";
const [{ data: same }, { data: near }] = await Promise.all([
  sb.from("listings").select(sel).eq("status", "approved").eq("kind", other).eq("vertical", l.vertical).eq("subcategory", l.subcategory).neq("owner_id", l.owner_id).limit(6),
  sb.from("listings").select(sel).eq("status", "approved").eq("kind", other).eq("vertical", l.vertical).neq("subcategory", l.subcategory).neq("owner_id", l.owner_id).order("created_at", { ascending: false }).limit(6)
]);
const list = [...(same || []), ...(near || [])].slice(0, 6);
$("#matches").innerHTML = list.length ? list.map(card).join("") : `<p class="muted">No ${other === "need" ? "requirements" : "offers"} in ${esc(v.short)} yet. Members get matched as soon as one is posted.</p>`;
