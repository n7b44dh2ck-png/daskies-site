// Marketplace, Global buyers, Services and Partners pages: shared header and footer,
// live listings for the marketplace, and the buyer-group form on the construction page.
import { sb, $, esc, header, card } from "./core.js?v=c85204c3";

await header(location.pathname.replace(/^\//, "") || "index.html");

// Live listings in this marketplace (approved only; visitors see what everyone sees).
const box = $("#mkListings");
if (box) {
  const v = box.dataset.v, groups = (box.dataset.groups || "").split("|").filter(Boolean);
  const { data, error } = await sb.from("listings")
    .select("id,kind,vertical,subcategory,title,price,price_unit,currency,quantity,quantity_unit,city,country,status,managed,created_at,listing_photos(path,sort)")
    .eq("status", "approved").eq("vertical", v).order("created_at", { ascending: false }).limit(24);
  let rows = error ? [] : (data || []);
  if (groups.length) {
    const { subcats } = await import("./taxonomy.js?v=c85204c3");
    const allowed = new Set(subcats(v).filter(([g]) => groups.includes(g)).flatMap(([, items]) => items));
    rows = rows.filter((l) => allowed.has(l.subcategory));
  }
  box.innerHTML = rows.length
    ? `<div class="cards">${rows.slice(0, 6).map(card).join("")}</div>`
    : `<div class="panel empty"><p style="margin:0 0 12px">No live listings here yet. The first listings get the most attention.</p><a class="btn btn-primary" href="${esc(box.dataset.post)}">${esc(box.dataset.cta)}</a></div>`;
}

// Service and partner requests use the request form on the main page.
document.addEventListener("click", (e) => {
  const r = e.target.closest("[data-req]");
  if (r) { e.preventDefault(); location.href = "index.html?req=" + encodeURIComponent(r.dataset.req) + "#contact"; }
});

// Buyer-group interest (construction page). Netlify form "buyer-group-interest".
const bt = $("#btForm");
if (bt) {
  const FX = window.DSKFX || null;
  const usd = () => !!(FX && FX.eff() === "USD");
  const setBad = (key, bad) => { const el = bt.querySelector(`[data-f="${key}"]`); if (el) el.classList.toggle("bad", bad); return bad; };
  const applyCur = () => { const b = $("#btBudget"); if (b) b.placeholder = usd() ? "e.g. 100000" : "e.g. 80"; };
  if (FX) FX.on(applyCur); applyCur();
  bt.addEventListener("submit", async (e) => {
    e.preventDefault();
    let bad = false;
    bad = setBad("btType", !$("#btType").value) || bad;
    bad = setBad("btArea", $("#btArea").value.trim().length < 2) || bad;
    bad = setBad("btName", $("#btName").value.trim().length < 2) || bad;
    bad = setBad("btEmail", !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($("#btEmail").value.trim())) || bad;
    if (bad) { const f = bt.querySelector(".field.bad input, .field.bad select"); if (f) f.focus(); return; }
    const bIn = $("#btBudget"), typed = bIn.value, b = parseFloat(typed), dollars = usd() && b > 0;
    $("#btBudgetEntered").value = dollars ? "US$ " + typed : "";
    if (dollars) { const r = FX.conv(b, "USD", "INR"); bIn.value = r == null ? "" : String(Math.round(r / 1e5 * 100) / 100); }
    const body = new URLSearchParams(); new FormData(bt).forEach((val, k) => { if (typeof val === "string") body.append(k, val); });
    bIn.value = typed;
    const btn = bt.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
    try {
      const r = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      bt.hidden = true; const d = $("#btDone"); d.hidden = false; d.focus();
    } catch {
      btn.disabled = false; btn.textContent = "Register interest";
      $("#btErr").textContent = "Couldn't send. Check your connection and try again, or email info@daskies.com.";
    }
  });
}
