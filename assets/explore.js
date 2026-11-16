import { sb, $, $$, esc, qs, header, card, errMsg } from "./core.js?v=238cf24f";
import { VERTICALS, DEAL_TYPES, subcats, vertical } from "./taxonomy.js?v=238cf24f";

await header("explore.html");
const main = $("#main");
const PAGE = 24;
const st = { q: qs("q") || "", v: qs("v") || "", k: qs("k") || "", s: qs("s") || "", d: qs("d") || "", c: qs("c") || "", sort: qs("sort") || "new", page: 0 };

const INTENT = [
  ["commodity", /\b(oil|soy|soybean|palm|sunflower|mustard|groundnut|cumin|grain|pulse|wheat|rice|doc|meal|steel|aluminium|copper|zinc|mt\b|tonne)/i],
  ["storage", /\b(warehouse|godown|cold storage|tank|terminal|port|transport|truck|tanker|logistic|storage)/i],
  ["industrial", /\b(machine|machinery|cnc|boiler|turbine|generator|press|lathe|factory|shed|job work|capacity|plant|equipment|lease)/i],
  ["real-assets", /\b(land|plot|office|shop|showroom|apartment|flat|villa|building|property|acre|jv|joint development)/i],
  ["barter-tech", /\b(patent|licen|software|technology|know-how|automation|school|college|education|donat|training)/i],
  ["projects", /\b(project|finance|investor|investment|funding|capital|expansion|partner)/i]
];
const guess = (q) => (INTENT.find(([, re]) => re.test(q)) || [])[0];

main.innerHTML = `
  <h1>Explore opportunities</h1>
  <p class="muted" style="margin:0 0 18px">What businesses have, and what they need. Contact details stay private; talk through DASKIES messages.</p>
  <form id="sf" class="panel" style="padding:14px;margin-bottom:18px;display:flex;gap:10px;flex-wrap:wrap" role="search">
    <label class="sr" for="q">Search</label>
    <input class="input" id="q" style="flex:1;min-width:220px" placeholder="Try: soybean degummed oil Kandla, 500 HP machine, warehouse near Mundra" value="${esc(st.q)}">
    <button class="btn btn-primary">Search</button>
  </form>
  <div id="intent"></div>
  <div class="split">
    <aside class="panel" style="padding:18px" aria-label="Filters">
      <div class="field"><span class="flabel">Show</span>
        <div class="seg" id="kind"><button type="button" data-k="">All</button><button type="button" data-k="offer">Available</button><button type="button" data-k="need">Wanted</button></div></div>
      <div class="field"><label for="v">Vertical</label><select id="v"><option value="">All six verticals</option>${VERTICALS.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="s">Category</label><select id="s"></select></div>
      <div class="field"><label for="d">Deal type</label><select id="d"><option value="">Any</option>${DEAL_TYPES.map((x) => `<option>${x}</option>`).join("")}</select></div>
      <div class="field"><label for="c">City or country</label><input id="c" value="${esc(st.c)}" placeholder="e.g. Rajkot, Dubai"></div>
      <div class="field"><label for="sort">Sort</label><select id="sort"><option value="new">Newest first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div>
      <button class="btn btn-ghost btn-sm" type="button" id="clear">Clear filters</button>
    </aside>
    <section aria-live="polite">
      <p class="small muted" id="count"></p>
      <div class="cards" id="res"></div>
      <div style="text-align:center;margin-top:18px"><button class="btn btn-ghost" id="more" type="button" hidden>Show more</button></div>
    </section>
  </div>`;

function fillSubcats() {
  const groups = st.v ? subcats(st.v) : [];
  $("#s").innerHTML = `<option value="">${st.v ? "All categories" : "Pick a vertical first"}</option>` +
    groups.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map((i) => `<option${i === st.s ? " selected" : ""}>${esc(i)}</option>`).join("")}</optgroup>`).join("");
  $("#s").disabled = !st.v;
}
function syncUI() {
  $("#v").value = st.v; $("#d").value = st.d; $("#sort").value = st.sort; fillSubcats();
  $$("#kind button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === st.k));
  const g = st.q && !st.v ? guess(st.q) : null;
  $("#intent").innerHTML = g ? `<p class="note" style="margin:0 0 16px">Looks like <b>${esc(vertical(g).name)}</b>. <button class="btn btn-quiet btn-sm" type="button" id="useIntent">Show only ${esc(vertical(g).short)}</button></p>` : "";
  if (g) $("#useIntent").addEventListener("click", () => { st.v = g; st.s = ""; run(); });
}
function syncURL() {
  const p = new URLSearchParams();
  for (const k of ["q", "v", "k", "s", "d", "c"]) if (st[k]) p.set(k, st[k]);
  if (st.sort !== "new") p.set("sort", st.sort);
  history.replaceState(null, "", "explore.html" + (p.toString() ? "?" + p : ""));
}

async function run(append = false) {
  if (!append) st.page = 0;
  syncUI(); syncURL();
  let q = sb.from("listings").select("id,kind,vertical,subcategory,title,price,price_unit,currency,quantity,quantity_unit,city,country,status,created_at,listing_photos(path,sort)", { count: "exact" }).eq("status", "approved");
  if (st.k) q = q.eq("kind", st.k);
  if (st.v) q = q.eq("vertical", st.v);
  if (st.s) q = q.eq("subcategory", st.s);
  if (st.d) q = q.contains("deal_types", [st.d]);
  if (st.c) q = q.or(`city.ilike.%${st.c.replace(/[%,()]/g, "")}%,country.ilike.%${st.c.replace(/[%,()]/g, "")}%`);
  if (st.q) q = q.textSearch("search", st.q, { type: "websearch", config: "simple" });
  q = st.sort === "low" ? q.order("price", { ascending: true, nullsFirst: false }) : st.sort === "high" ? q.order("price", { ascending: false, nullsFirst: false }) : q.order("created_at", { ascending: false });
  q = q.range(st.page * PAGE, st.page * PAGE + PAGE - 1);
  $("#count").textContent = "Searching…";
  const { data, error, count } = await q;
  if (error) { $("#count").textContent = errMsg(error); return; }
  const html = (data || []).map(card).join("");
  $("#res").innerHTML = append ? $("#res").innerHTML + html : html;
  if (!append && !data.length) {
    $("#res").innerHTML = `<div class="empty panel" style="grid-column:1/-1"><h2>Nothing listed here yet</h2><p>Be the first: post what you ${st.k === "offer" ? "have" : "need"} and members who match will see it.</p><a class="btn btn-primary" href="post.html?kind=${st.k === "offer" ? "offer" : "need"}${st.v ? "&v=" + st.v : ""}">${st.k === "offer" ? "List an offer" : "Post a need"}</a></div>`;
  }
  $("#count").textContent = count ? `${count} ${count === 1 ? "opportunity" : "opportunities"}` : "";
  $("#more").hidden = (st.page + 1) * PAGE >= (count || 0);
}

$("#sf").addEventListener("submit", (e) => { e.preventDefault(); st.q = $("#q").value.trim(); run(); });
$("#kind").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) { st.k = b.dataset.k; run(); } });
$("#v").addEventListener("change", (e) => { st.v = e.target.value; st.s = ""; run(); });
$("#s").addEventListener("change", (e) => { st.s = e.target.value; run(); });
$("#d").addEventListener("change", (e) => { st.d = e.target.value; run(); });
$("#sort").addEventListener("change", (e) => { st.sort = e.target.value; run(); });
let t; $("#c").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { st.c = e.target.value.trim(); run(); }, 400); });
$("#clear").addEventListener("click", () => { Object.assign(st, { q: "", v: "", k: "", s: "", d: "", c: "", sort: "new" }); $("#q").value = ""; $("#c").value = ""; run(); });
$("#more").addEventListener("click", () => { st.page++; run(true); });
run();
