import { sb, $, $$, esc, qs, header, requireAuth, errMsg, busy, toast, photoUrl, pagehead } from "./core.js?v=3dfed3ba";
import { VERTICALS, DEAL_TYPES, CURRENCIES, subcats, vertical, isOil } from "./taxonomy.js?v=3dfed3ba";

await header("post.html?kind=" + (qs("kind") === "offer" ? "offer" : "need"));
const m = await requireAuth();
if (!m) throw new Error("stop");
const main = $("#main");
const editId = qs("id");
const NEEDS_PROOF = ["industrial", "real-assets", "storage"]; // offers here need 3 photos + valuation report

let L = { kind: qs("kind") === "offer" ? "offer" : "need", vertical: qs("v") || "", subcategory: "", deal_types: [], currency: /^india$/i.test(m.business?.country || "India") ? "INR" : "USD", country: m.business?.country || "India", city: m.business?.city || "", details: {} };
let existingPhotos = [];
if (editId) {
  const { data } = await sb.from("listings").select("*, listing_photos(id,path,sort)").eq("id", editId).eq("owner_id", m.user.id).maybeSingle();
  if (!data) { main.innerHTML = `<div class="panel empty"><h1>Listing not found</h1></div>`; throw new Error("stop"); }
  L = data; existingPhotos = [...(data.listing_photos || [])].sort((a, b) => a.sort - b.sort);
}
const newPhotos = [];
let report = null;
// Admins can list for an owner who isn't on DASKIES yet (with the owner's OK). The owner's details stay private to admins.
const forOwner = !!m.profile?.is_admin && (qs("for") === "owner" || !!L.managed);
let O = { owner_name: "", contact_name: "", phone: "", email: "", consent: "", ok: false };
if (forOwner && !editId) Object.assign(L, { city: "", state: "" }); // the owner's place, not the admin's
if (forOwner && editId) {
  const { data: mo } = await sb.from("managed_owners").select("*").eq("listing_id", editId).maybeSingle();
  if (mo) O = { ...mo, ok: true };
}

function fieldHTML([k, label, type, opts], val) {
  const id = "x_" + k, v = val ?? "";
  if (type === "select") return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" data-x="${k}"><option value="">Choose</option>${opts.map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  if (type === "textarea") return `<div class="field" style="grid-column:1/-1"><label for="${id}">${esc(label)}</label><textarea id="${id}" data-x="${k}" maxlength="2000">${esc(v)}</textarea></div>`;
  if (type === "yesno") return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" data-x="${k}" data-yesno="1"><option value="">Choose</option><option value="1"${v === true ? " selected" : ""}>Yes</option><option value="0"${v === false ? " selected" : ""}>No</option></select></div>`;
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" data-x="${k}" ${type === "number" ? 'type="number" step="any" min="0" inputmode="decimal"' : 'maxlength="200"'} value="${esc(v)}"></div>`;
}

async function ensureBusiness() {
  if (m.business) return true;
  main.innerHTML = `<div class="panel" style="max-width:560px;margin:0 auto"><h1>First, your business</h1><p class="muted">Listings are posted by a business. You can add more details later in your dashboard.</p>
    <form id="bf" novalidate>
      <div class="field"><label for="bn">Business name</label><input id="bn" required maxlength="160" value="${esc(m.profile?.full_name ? "" : "")}"></div>
      <div class="row2"><div class="field"><label for="bc">City</label><input id="bc" maxlength="80"></div><div class="field"><label for="bk">Country</label><input id="bk" value="India" maxlength="60"></div></div>
      <p class="err" id="bmsg" role="alert"></p><button class="btn btn-primary">Continue</button></form></div>`;
  return new Promise((res) => {
    $("#bf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#bn").value.trim(), btn = $("#bf button");
      if (name.length < 2) { $("#bmsg").textContent = "Add your business name."; return; }
      busy(btn, true);
      const { data, error } = await sb.from("businesses").insert({ owner_id: m.user.id, name, city: $("#bc").value.trim() || null, country: $("#bk").value.trim() || "India" }).select().single();
      if (error) { $("#bmsg").textContent = errMsg(error); busy(btn, false); return; }
      m.business = data; L.city = L.city || data.city || ""; L.country = data.country; res(true);
    });
  });
}

function render() {
  const v = vertical(L.vertical);
  const fields = v ? [...v.fields, ...(L.vertical === "commodity" && isOil(L.subcategory) ? v.oilFields : [])] : [];
  const proof = L.kind === "offer" && NEEDS_PROOF.includes(L.vertical) && !forOwner;
  main.innerHTML = `
  ${forOwner
    ? pagehead({ crumb: `<a href="admin.html#owners">Admin</a>`, title: editId ? "Edit a listing for an owner" : L.kind === "offer" ? "List an offer for an owner" : "Post a need for an owner",
        lead: "It goes live straight away, marked \"Listed by DASKIES on the owner's behalf\". Enquiries come to you; the owner's details below stay private to DASKIES admins." })
    : pagehead({ crumb: `<a href="dashboard.html">Dashboard</a>`, title: editId ? "Edit listing" : L.kind === "offer" ? "List what you have" : "Post what you need",
        lead: "Every listing is checked by the DASKIES team before it goes live. Contact details are never shown; members reach you through messages." })}
  <form id="pf" class="grid" novalidate>
    ${forOwner ? `<div class="panel ownerbox">
      <h2>The owner</h2>
      <p class="hint" style="margin-top:-6px">Only DASKIES admins see this. Get the owner's OK before you list.</p>
      <div class="row2">
        <div class="field"><label for="mo_name">Owner's business or name <span class="req">*</span></label><input id="mo_name" maxlength="160" value="${esc(O.owner_name || "")}"></div>
        <div class="field"><label for="mo_contact">Contact person</label><input id="mo_contact" maxlength="120" value="${esc(O.contact_name || "")}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="mo_phone">Phone or WhatsApp</label><input id="mo_phone" type="tel" maxlength="30" value="${esc(O.phone || "")}" placeholder="+91"></div>
        <div class="field"><label for="mo_email">Email</label><input id="mo_email" type="email" maxlength="200" value="${esc(O.email || "")}"><span class="hint">Used to hand the listing over when they join.</span></div>
      </div>
      <div class="field"><label for="mo_how">How and when they agreed <span class="req">*</span></label><input id="mo_how" maxlength="500" value="${esc(O.consent || "")}" placeholder="e.g. WhatsApp from Ramesh Patel, 17 Nov 2026"></div>
      <label class="small" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="mo_ok" style="margin-top:4px;accent-color:var(--accent)"${O.ok ? " checked" : ""}> The owner agreed to DASKIES listing this, at this price, on their behalf.</label>
    </div>` : ""}
    <div class="panel">
      <h2>Describe it</h2>
      <div class="field"><span class="flabel">I want to</span><div class="seg" id="kind"><button type="button" data-k="offer" aria-pressed="${L.kind === "offer"}">Offer what I have</button><button type="button" data-k="need" aria-pressed="${L.kind === "need"}">Find what I need</button></div></div>
      <div class="row2">
        <div class="field"><label for="vert">Vertical</label><select id="vert" required><option value="">Choose a vertical</option>${VERTICALS.map((x) => `<option value="${x.id}"${x.id === L.vertical ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>${v ? `<span class="hint">${esc(v.blurb)}</span>` : ""}</div>
        <div class="field"><label for="sub">Category</label><select id="sub" required ${v ? "" : "disabled"}><option value="">Choose a category</option>${subcats(L.vertical).map(([g, items]) => `<optgroup label="${esc(g)}">${items.map((i) => `<option${i === L.subcategory ? " selected" : ""}>${esc(i)}</option>`).join("")}</optgroup>`).join("")}</select></div>
      </div>
      <div class="field"><label for="title">Title</label><input id="title" required minlength="4" maxlength="140" value="${esc(L.title || "")}" placeholder="${L.kind === "offer" ? "e.g. CNC vertical machining centre, 2019, Ahmedabad" : "e.g. Need 5,000 MT soybean degummed oil at Kandla"}"></div>
      <div class="field"><label for="desc">Description</label><textarea id="desc" maxlength="5000" placeholder="Condition, specifications, terms, timeline, anything a serious buyer or seller needs to know">${esc(L.description || "")}</textarea></div>
      <div class="field"><span class="flabel">Deal types</span><div class="checks">${DEAL_TYPES.map((d) => `<label><input type="checkbox" name="deal" value="${d}"${(L.deal_types || []).includes(d) ? " checked" : ""}> ${d}</label>`).join("")}</div></div>
    </div>
    <div class="panel">
      <h2>Price, quantity and place</h2>
      <div class="row3">
        <div class="field"><label for="price">${L.kind === "offer" ? "Price" : "Budget"} (leave empty for "on request")</label><input id="price" type="number" min="0" step="any" inputmode="decimal" value="${esc(L.price ?? "")}"></div>
        <div class="field"><label for="cur">Currency</label><select id="cur">${CURRENCIES.map((c) => `<option${c === L.currency ? " selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label for="pu">Price is</label><input id="pu" maxlength="40" value="${esc(L.price_unit || "")}" placeholder="total, per month, per MT…"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="qty">Quantity</label><input id="qty" type="number" min="0" step="any" value="${esc(L.quantity ?? "")}"></div>
        <div class="field"><label for="qu">Unit</label><input id="qu" maxlength="30" value="${esc(L.quantity_unit || "")}" placeholder="MT, KL, units, sq ft…"></div>
      </div>
      <div class="row3">
        <div class="field"><label for="city">City</label><input id="city" maxlength="80" value="${esc(L.city || "")}"></div>
        <div class="field"><label for="state">State / region</label><input id="state" maxlength="60" value="${esc(L.state || "")}"></div>
        <div class="field"><label for="country">Country</label><input id="country" maxlength="60" value="${esc(L.country || "India")}"></div>
      </div>
      ${L.kind === "need" ? `<div class="field"><label for="exp">Open until</label><input id="exp" type="date" value="${esc(L.expires_at || new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10))}"></div>` : ""}
    </div>
    <div class="panel">
      <h2>Barter</h2>
      <p class="hint" style="margin-top:-6px">Tell us what you'd take in exchange. DASKIES uses this to find two-, three- and four-party swaps.</p>
      <div class="row2">
        <div class="field"><label for="wv">Would accept from</label><select id="wv"><option value="">Not open to barter</option>${VERTICALS.map((x) => `<option value="${x.id}"${x.id === L.wants_vertical ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="wx">What exactly</label><input id="wx" maxlength="500" value="${esc(L.wants_in_exchange || "")}" placeholder="e.g. edible oil, warehouse space, a CNC lathe"></div>
      </div>
    </div>
    ${fields.length ? `<div class="panel"><h2>${esc(v.short)} details</h2><div class="row2">${fields.map((f) => fieldHTML(f, L.details?.[f[0]])).join("")}</div></div>` : ""}
    ${L.kind === "offer" ? `<div class="panel">
      <h2>Photos${proof ? " and valuation report" : ""}</h2>
      <p class="hint" style="margin-top:-6px">${proof ? "Required: 3 recent photos (front, side or detail, nameplate or site) and a valuation report from a valuer or your own costing." : forOwner ? "Ask the owner to WhatsApp you 3 clear photos, one of them the nameplate. Listings with photos get far more replies." : "Add up to 6 photos. Clear photos get more replies."}</p>
      <div class="cards" id="phs" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))"></div>
      <div class="field" style="margin-top:12px"><label for="pin">Add photos (JPG or PNG)</label><input id="pin" type="file" accept="image/*" multiple></div>
      ${proof ? `<div class="field"><label for="rep">Valuation report (PDF or photo, up to 10 MB)</label><input id="rep" type="file" accept=".pdf,image/*">${editId ? '<span class="hint">Already sent one? Only add a file to replace it.</span>' : ""}</div>` : ""}
    </div>` : ""}
    <p class="err" id="msg" role="alert"></p>
    <label class="legal-opt"><input type="checkbox" id="legalHelp" ${L.details && L.details.legal_help ? "checked" : ""}><span><b>I'd like help with the legal and tax paperwork</b> <span class="muted">Optional. Advocates and chartered accountants on the DASKIES panel quote per deal.</span></span></label>
    <div class="formbar"><button class="btn btn-primary" id="go">${forOwner ? (editId ? "Save changes" : "Publish listing") : editId ? "Save and send for review" : "Send for review"}</button><a class="btn btn-ghost" href="${forOwner ? "admin.html#owners" : "dashboard.html"}">Cancel</a></div>
  </form>`;

  drawPhotos();
  $("#kind").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) { keep(); L.kind = b.dataset.k; render(); } });
  $("#vert").addEventListener("change", (e) => { keep(); L.vertical = e.target.value; L.subcategory = ""; render(); });
  $("#sub").addEventListener("change", (e) => { keep(); L.subcategory = e.target.value; render(); });
  const pin = $("#pin");
  if (pin) pin.addEventListener("change", () => {
    for (const f of pin.files) { if (/^image\//.test(f.type) && newPhotos.length + existingPhotos.length < 6) newPhotos.push(f); }
    pin.value = ""; drawPhotos();
  });
  const rep = $("#rep");
  if (rep) rep.addEventListener("change", () => { const f = rep.files[0]; if (f && f.size > 10 * 1024 * 1024) { toast("That file is over 10 MB.", true); rep.value = ""; report = null; } else report = f || null; });
  $("#pf").addEventListener("submit", save);
}

function drawPhotos() {
  const box = $("#phs"); if (!box) return;
  box.innerHTML = existingPhotos.map((p, i) => `<div class="card"><div class="ph"><img src="${esc(photoUrl(p.path))}" alt="Photo ${i + 1}"></div><button class="btn btn-quiet btn-sm" type="button" data-del="${p.id}">Remove</button></div>`).join("") +
    newPhotos.map((f, i) => `<div class="card"><div class="ph"><img src="${URL.createObjectURL(f)}" alt="New photo ${i + 1}"></div><button class="btn btn-quiet btn-sm" type="button" data-rm="${i}">Remove</button></div>`).join("");
  box.onclick = async (e) => {
    const rm = e.target.closest("[data-rm]"), del = e.target.closest("[data-del]");
    if (rm) { newPhotos.splice(+rm.dataset.rm, 1); drawPhotos(); }
    if (del) {
      const p = existingPhotos.find((x) => x.id === del.dataset.del);
      const { error } = await sb.from("listing_photos").delete().eq("id", p.id);
      if (error) return toast(errMsg(error), true);
      await sb.storage.from("listing-photos").remove([p.path]);
      existingPhotos = existingPhotos.filter((x) => x !== p); drawPhotos();
    }
  };
}

function keep() {
  const g = (id) => { const e = $("#" + id); return e ? e.value.trim() : undefined; };
  if (forOwner) Object.assign(O, { owner_name: g("mo_name") ?? O.owner_name, contact_name: g("mo_contact") ?? O.contact_name, phone: g("mo_phone") ?? O.phone, email: g("mo_email") ?? O.email, consent: g("mo_how") ?? O.consent, ok: $("#mo_ok") ? $("#mo_ok").checked : O.ok });
  Object.assign(L, { title: g("title") ?? L.title, description: g("desc") ?? L.description, price: g("price") ?? L.price, currency: g("cur") ?? L.currency, price_unit: g("pu") ?? L.price_unit,
    quantity: g("qty") ?? L.quantity, quantity_unit: g("qu") ?? L.quantity_unit, city: g("city") ?? L.city, state: g("state") ?? L.state, country: g("country") ?? L.country,
    wants_vertical: g("wv") ?? L.wants_vertical, wants_in_exchange: g("wx") ?? L.wants_in_exchange, expires_at: g("exp") ?? L.expires_at,
    deal_types: $$("input[name=deal]").length ? $$("input[name=deal]:checked").map((c) => c.value) : L.deal_types });
  const d = { ...(L.details || {}) };
  $$("[data-x]").forEach((el) => { const k = el.dataset.x; if (el.value === "") delete d[k]; else d[k] = el.dataset.yesno ? el.value === "1" : el.type === "number" ? Number(el.value) : el.value.trim(); });
  L.details = d;
}

function shrink(file, n) {
  return new Promise((res) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((b) => res(b && b.size < file.size ? new File([b], `photo-${n}.jpg`, { type: "image/jpeg" }) : file), "image/jpeg", 0.82);
    };
    im.onerror = () => { URL.revokeObjectURL(url); res(file); };
    im.src = url;
  });
}

async function save(e) {
  e.preventDefault(); keep();
  const msg = $("#msg"), btn = $("#go"); msg.textContent = "";
  const probs = [];
  if (!L.vertical) probs.push("a vertical"); if (!L.subcategory) probs.push("a category");
  if (!L.title || L.title.length < 4) probs.push("a title (4+ characters)");
  if (L.kind === "offer" && (L.description || "").length < 40) probs.push("a description (40+ characters)");
  const proof = L.kind === "offer" && NEEDS_PROOF.includes(L.vertical) && !forOwner;
  if (proof && existingPhotos.length + newPhotos.length < 3) probs.push(`${3 - existingPhotos.length - newPhotos.length} more photo(s)`);
  if (proof && !editId && !report) probs.push("a valuation report");
  if (forOwner) {
    if ((O.owner_name || "").length < 2) probs.push("the owner's business or name");
    if ((O.consent || "").length < 3) probs.push("how and when the owner agreed");
    if (!O.ok) probs.push("a tick to confirm the owner agreed");
    if ((L.city || "").length < 2) probs.push("the city where it is");
  }
  if (L.vertical === "projects" && !(L.details.risks || "").trim()) probs.push("the main risks");
  if (probs.length) { msg.textContent = "Please add " + probs.join(", ") + "."; return; }
  busy(btn, true, "Saving…");
  const row = { kind: L.kind, vertical: L.vertical, subcategory: L.subcategory, title: L.title, description: L.description || "", deal_types: L.deal_types,
    price: L.price === "" || L.price == null ? null : Number(L.price), currency: L.currency || "INR", price_unit: L.price_unit || null,
    quantity: L.quantity === "" || L.quantity == null ? null : Number(L.quantity), quantity_unit: L.quantity_unit || null,
    city: L.city || null, state: L.state || null, country: L.country || "India", wants_vertical: L.wants_vertical || null, wants_in_exchange: L.wants_in_exchange || null,
    expires_at: L.kind === "need" ? (L.expires_at || null) : null, details: Object.assign({}, L.details || {}, { legal_help: $("#legalHelp") && $("#legalHelp").checked ? true : undefined }), status: "pending" };
  if (forOwner) Object.assign(row, { managed: true, status: "approved", approved_at: L.approved_at || new Date().toISOString() });
  try {
    let id = editId;
    if (editId) { const { error } = await sb.from("listings").update(row).eq("id", editId); if (error) throw error; }
    else { const { data, error } = await sb.from("listings").insert({ ...row, owner_id: m.user.id, business_id: m.business.id }).select("id").single(); if (error) throw error; id = data.id; }
    if (forOwner) {
      const mo = { owner_name: O.owner_name, contact_name: O.contact_name || null, phone: O.phone || null, email: O.email || null, consent: O.consent, updated_at: new Date().toISOString() };
      const { data: had } = await sb.from("managed_owners").select("listing_id").eq("listing_id", id).maybeSingle();
      const { error: oe } = had ? await sb.from("managed_owners").update(mo).eq("listing_id", id) : await sb.from("managed_owners").insert({ ...mo, listing_id: id });
      if (oe) throw oe;
    }
    let n = existingPhotos.length;
    for (const f of newPhotos) {
      btn.textContent = `Uploading photo ${n + 1}…`;
      const file = await shrink(f, n + 1);
      const path = `${m.user.id}/${id}/${Date.now()}-${n + 1}.jpg`;
      const { error: ue } = await sb.storage.from("listing-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
      if (ue) throw ue;
      const { error: pe } = await sb.from("listing_photos").insert({ listing_id: id, owner_id: m.user.id, path, sort: n });
      if (pe) throw pe;
      n++;
    }
    if (report) {
      btn.textContent = "Uploading report…";
      const ext = (report.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${m.user.id}/${id}/valuation-${Date.now()}.${ext}`;
      const { error: ue } = await sb.storage.from("documents").upload(path, report, { contentType: report.type || "application/pdf" });
      if (ue) throw ue;
      const { error: de } = await sb.from("documents").insert({ owner_id: m.user.id, business_id: m.business.id, listing_id: id, kind: "valuation_report", path, file_name: report.name.slice(0, 200) });
      if (de) throw de;
    }
    location.href = forOwner ? "listing.html?id=" + id : "dashboard.html?posted=" + id + "#listings";
  } catch (err) { msg.textContent = errMsg(err); busy(btn, false); }
}

if (await ensureBusiness()) render();
