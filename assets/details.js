// Mandatory member details: one form used by sign-up, the completion step and the dashboard.
// The database enforces the same rules; this only gives early, specific feedback.
import { sb, $, $$, esc, TERMS_VERSION } from "./core.js?v=cefb177f";
import { ROLES } from "./taxonomy.js?v=cefb177f";

export const IN_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];

const R = '<span class="req" aria-hidden="true">*</span>';
const isIndia = (c) => /^\s*india\s*$/i.test(c || "");

// p = { full_name, phone, name, roles, city, state, country, address, postal_code, gstin }
export function detailsFields(p = {}, { you = true, terms = false } = {}) {
  return `${you ? `<fieldset class="fs"><legend>You</legend>
      <div class="row2"><div class="field"><label for="d_name">Full name ${R}</label><input id="d_name" autocomplete="name" maxlength="120" required value="${esc(p.full_name || "")}"></div>
      <div class="field"><label for="d_phone">Mobile number ${R}</label><input id="d_phone" type="tel" autocomplete="tel" maxlength="30" required placeholder="+91 98250 12345" value="${esc(p.phone || "")}"><span class="hint">Private. Used by the DASKIES team only.</span></div></div></fieldset>` : ""}
    <fieldset class="fs"><legend>Your business</legend>
      <div class="field"><label for="d_biz">Business name ${R}</label><input id="d_biz" autocomplete="organization" maxlength="160" required value="${esc(p.name || "")}"></div>
      <div class="field" id="d_roles_f"><span class="flabel" id="d_roles_l">What does your business do? ${R} <span class="muted">(pick all that fit)</span></span>
        <div class="checks" role="group" aria-labelledby="d_roles_l">${ROLES.map((r) => `<label><input type="checkbox" name="d_role" value="${esc(r)}"${(p.roles || []).includes(r) ? " checked" : ""}> ${esc(r)}</label>`).join("")}</div></div>
      <div class="field"><label for="d_addr">Registered address ${R}</label><textarea id="d_addr" autocomplete="street-address" maxlength="300" rows="2" required placeholder="Building, street, area or industrial estate">${esc(p.address || "")}</textarea></div>
      <div class="field"><label for="d_about">About your business <span class="muted">(optional)</span></label><textarea id="d_about" maxlength="3000" rows="3" placeholder="What you make, trade or offer, your capacity and the industries you serve">${esc(p.about || "")}</textarea><span class="hint">Shown on your business profile and listings.</span></div>
      <div class="row2"><div class="field"><label for="d_city">City ${R}</label><input id="d_city" autocomplete="address-level2" maxlength="80" required value="${esc(p.city || "")}"></div>
        <div class="field"><label for="d_state">State ${R}</label><input id="d_state" autocomplete="address-level1" maxlength="60" required list="d_states" value="${esc(p.state || "")}"><datalist id="d_states">${IN_STATES.map((s) => `<option value="${s}">`).join("")}</datalist></div></div>
      <div class="row2"><div class="field"><label for="d_pin">PIN / postal code ${R}</label><input id="d_pin" autocomplete="postal-code" inputmode="numeric" maxlength="10" required value="${esc(p.postal_code || "")}"></div>
        <div class="field"><label for="d_country">Country ${R}</label><input id="d_country" autocomplete="country-name" maxlength="60" required value="${esc(p.country || "India")}"></div></div>
      <div class="field"><label for="d_gst">GSTIN <span class="muted">(optional, Indian businesses)</span></label><input id="d_gst" maxlength="15" autocapitalize="characters" placeholder="24AAACB1234C1Z5" value="${esc(p.gstin || "")}"></div>
      <p class="hint">Your address, PIN, GSTIN and mobile are seen only by you and the DASKIES team. Other members see your business name, city and verification level.</p>
    </fieldset>${terms ? termsBox() : ""}`;
}

export const termsBox = () => `
    <div class="fs"><div class="field termsbox" id="d_terms_f"><label><input type="checkbox" id="d_terms"> <span>I agree to the DASKIES <a href="terms.html" target="_blank" rel="noopener">Terms</a>, including the success fee on signed deals, and the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>. ${R}</span></label></div></div>`;

export function readDetails() {
  const v = (id) => ($("#" + id) ? $("#" + id).value.trim() : undefined);
  return { full_name: v("d_name"), phone: v("d_phone"), name: v("d_biz"), roles: $$("input[name=d_role]:checked").map((c) => c.value),
    address: v("d_addr"), city: v("d_city"), state: v("d_state"), postal_code: (v("d_pin") || "").toUpperCase(), country: v("d_country") || "India", gstin: (v("d_gst") || "").toUpperCase().replace(/\s/g, ""),
    terms: $("#d_terms") ? $("#d_terms").checked : null, about: v("d_about") };
}

// Returns [[fieldId, message], ...]; empty when everything is fine.
export function checkDetails(d, { you = true } = {}) {
  const e = [];
  if (you) {
    if ((d.full_name || "").length < 2) e.push(["d_name", "Add your full name."]);
    const digits = (d.phone || "").replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) e.push(["d_phone", "Add a mobile number with 10 to 15 digits."]);
  }
  if ((d.name || "").length < 2) e.push(["d_biz", "Add your business name."]);
  if (!d.roles.length) e.push(["d_roles_f", "Pick at least one thing your business does."]);
  if ((d.address || "").length < 8) e.push(["d_addr", "Add the full registered address (building, street, area)."]);
  if ((d.city || "").length < 2) e.push(["d_city", "Add the city."]);
  if ((d.state || "").length < 2) e.push(["d_state", "Add the state."]);
  if (isIndia(d.country) ? !/^[1-9][0-9]{5}$/.test(d.postal_code) : !/^[A-Z0-9][A-Z0-9 -]{2,9}$/.test(d.postal_code)) e.push(["d_pin", isIndia(d.country) ? "Add a 6-digit PIN code." : "Add the postal code."]);
  if ((d.country || "").length < 2) e.push(["d_country", "Add the country."]);
  if (d.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(d.gstin)) e.push(["d_gst", "That GSTIN doesn't look right (15 characters, like 24AAACB1234C1Z5). Leave it empty if you don't have one."]);
  if (d.terms === false) e.push(["d_terms_f", "Tick the box to accept the Terms and Privacy Policy."]);
  return e;
}

// Marks the fields, puts a short message under each, focuses the first. Returns true when there were problems.
export function showProblems(problems) {
  $$(".fs .field").forEach((f) => { f.classList.remove("bad"); const m = f.querySelector(".ferr"); if (m) m.remove(); });
  $$(".fs [aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
  problems.forEach(([id, msg]) => {
    const el = $("#" + id); if (!el) return;
    const f = el.classList.contains("field") ? el : el.closest(".field");
    f.classList.add("bad"); f.insertAdjacentHTML("beforeend", `<span class="ferr" id="${id}_err">${esc(msg)}</span>`);
    const input = el.matches("input,textarea,select") ? el : f.querySelector("input");
    if (input) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", id + "_err"); }
  });
  if (problems.length) { const first = $("#" + problems[0][0]); const i = first.matches("input,textarea") ? first : first.querySelector("input"); if (i) i.focus(); }
  return problems.length > 0;
}

// Saves profile, business and private details for the signed-in member. Throws on failure.
export async function saveDetails(m, d, extra = {}, { you = true } = {}) {
  const uid = m.user.id;
  if (you) {
    const { error } = await sb.from("profiles").update({ full_name: d.full_name, phone: d.phone }).eq("id", uid);
    if (error) throw error;
  }
  const brow = { name: d.name, roles: d.roles, city: d.city, state: d.state, country: d.country, ...(d.about !== undefined ? { description: d.about || null } : {}), ...extra };
  let business = m.business;
  if (business) {
    const { error } = await sb.from("businesses").update(brow).eq("id", business.id); if (error) throw error;
  } else {
    const { data, error } = await sb.from("businesses").insert({ ...brow, owner_id: uid }).select().single(); if (error) throw error;
    business = data;
  }
  const prow = { address: d.address, postal_code: d.postal_code, gstin: d.gstin || null };
  const { data: existing } = await sb.from("business_private").select("business_id").eq("owner_id", uid).maybeSingle();
  const { error: pe } = existing
    ? await sb.from("business_private").update(prow).eq("owner_id", uid)
    : await sb.from("business_private").insert({ ...prow, business_id: business.id, owner_id: uid });
  if (pe) throw pe;
  if (d.terms === true) {
    const { error: te } = await sb.rpc("accept_terms", { p_version: TERMS_VERSION });
    if (te) throw te;
  }
}

// Flattens what we know about a member into the form's shape.
export function detailsOf(m) {
  const md = (m.user && m.user.user_metadata && m.user.user_metadata.details) || {};
  const p = m.profile || {}, b = m.business || {}, x = m.private || {};
  return { full_name: p.full_name || md.full_name || "", phone: p.phone || md.phone || "", name: b.name || md.name || "", roles: (b.roles && b.roles.length ? b.roles : md.roles) || [],
    address: x.address || md.address || "", city: b.city || md.city || "", state: b.state || md.state || "", postal_code: x.postal_code || md.postal_code || "", country: b.country || md.country || "India", gstin: x.gstin || md.gstin || "", about: b.description || md.about || "" };
}
