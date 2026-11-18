// Invoice page: the signed-in buyer (or an admin) sees a tax invoice, ready to print or save as a PDF.
import { sb, $, esc, qs, header, requireAuth, errMsg } from "./core.js?v=c52a1ebb";
import { invoiceHtml } from "./invoice-render.js?v=c52a1ebb";

await header("invoice.html");
const m = await requireAuth();
if (!m) throw new Error("stop");
const main = $("#main");
const { data: inv, error } = await sb.from("invoices").select("*").eq("id", qs("id") || "").maybeSingle();
if (error || !inv) {
  main.innerHTML = `<div class="panel empty"><h1>Invoice not found</h1><p>${error ? esc(errMsg(error)) : "It may belong to another account. Your invoices are listed on your dashboard."}</p><a class="btn btn-primary" href="dashboard.html">Go to your dashboard</a></div>`;
  throw new Error("stop");
}
document.title = `Invoice ${inv.number} | DASKIES`;
main.innerHTML = `
  <div class="invbar noprint">
    <p class="crumbs" style="margin:0"><a href="${m.profile?.is_admin && inv.user_id !== m.user.id ? "admin.html#invoices" : "dashboard.html"}">${m.profile?.is_admin && inv.user_id !== m.user.id ? "Admin" : "Dashboard"}</a> › Invoice ${esc(inv.number)}</p>
    <button class="btn btn-primary" type="button" id="print">Print or save as PDF</button>
  </div>
  <div class="invsheet">${invoiceHtml(inv)}</div>`;
$("#print").addEventListener("click", () => window.print());
