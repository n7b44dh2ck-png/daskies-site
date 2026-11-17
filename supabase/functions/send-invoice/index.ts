// @ts-nocheck: the invoice layout is shared plain JavaScript (assets/invoice-render.js)
// DASKIES: email a tax invoice to the buyer (Edge Function "send-invoice").
// Called by pay-verify and pay-webhook right after a payment is recorded (with the server key),
// and by admins from Admin > Invoices to send one again (with their own sign-in).
// Mail goes out from info@daskies.com through GoDaddy's mail server, with a copy to info@daskies.com.
// Secrets (Supabase > Edge Functions > Secrets): SMTP_PASS (the info@daskies.com mailbox password).
// Optional: SMTP_HOST (default smtpout.secureserver.net), SMTP_PORT (default 465), SMTP_USER (default info@daskies.com), SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

function supaKey(kind: "secret" | "publishable") {
  try { const j = JSON.parse(Deno.env.get(kind === "secret" ? "SUPABASE_SECRET_KEYS" : "SUPABASE_PUBLISHABLE_KEYS") || "{}"); if (j.default) return j.default as string; } catch { /* fall back */ }
  return Deno.env.get(kind === "secret" ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY") || "";
}
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// The invoice layout below is copied from assets/invoice-render.js by tools/sync_invoice.py. Edit it there.
// ---- invoice render start ----
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function twoDigits(x) { return x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? "-" + ONES[x % 10] : ""); }
function threeDigits(x) { return x >= 100 ? ONES[Math.floor(x / 100)] + " hundred" + (x % 100 ? " " + twoDigits(x % 100) : "") : twoDigits(x); }
// Whole numbers in words, Indian style (thousand, lakh, crore).
function inWords(n) {
  n = Math.floor(Number(n) || 0);
  if (n === 0) return "zero";
  const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thousand = Math.floor((n % 1e5) / 1000), rest = n % 1000;
  const parts = [];
  if (crore) parts.push((crore >= 100 ? inWords(crore) : twoDigits(crore)) + " crore");
  if (lakh) parts.push(twoDigits(lakh) + " lakh");
  if (thousand) parts.push(twoDigits(thousand) + " thousand");
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}
function amountInWords(paise) {
  const r = Math.floor(paise / 100), p = Math.round(paise % 100);
  return "Rupees " + inWords(r) + (p ? " and " + inWords(p) + " paise" : "") + " only";
}
function rupees(paise) {
  return "₹" + (Number(paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function day(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}
function lines(...xs) { return xs.filter((x) => x && String(x).trim()).map(esc).join("<br>"); }

function invoiceSubject(inv) { return `DASKIES tax invoice ${inv.number}`; }

// The invoice itself, as an HTML fragment (a 680px-wide table).
function invoiceHtml(inv) {
  const s = inv.supplier || {}, b = inv.buyer || {};
  const ink = "#142A2E", muted = "#5B6B69", line = "#D5DDDB", teal = "#0E6F68", soft = "#F2F4F3";
  const cell = `padding:8px 10px;border-bottom:1px solid ${line};vertical-align:top;font-size:13px;color:${ink}`;
  const head = `padding:8px 10px;border-bottom:2px solid ${ink};text-align:left;font-size:12px;color:${muted};font-weight:600`;
  const num = "text-align:right;white-space:nowrap";
  const intra = inv.cgst_paise > 0 || inv.sgst_paise > 0;
  const taxCols = inv.zero_rated ? [["IGST 0%", 0]] : intra ? [["CGST 9%", inv.cgst_paise], ["SGST 9%", inv.sgst_paise]] : [["IGST 18%", inv.igst_paise]];
  const supplierName = s.legal_name || s.trade_name || "DASKIES";
  const tradeLine = s.trade_name && s.legal_name && s.trade_name !== s.legal_name ? `Trade name: ${s.trade_name}` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;margin:0 auto;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:${ink};background:#fff">
<tr><td style="padding:22px 24px 10px;border-top:6px solid ${teal}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:top"><div style="font-size:24px;font-weight:800;letter-spacing:.04em;color:${ink}">DASKIES</div>
      <div style="font-size:12px;color:${muted};margin-top:2px">The business network for Indian industry</div></td>
    <td style="vertical-align:top;text-align:right"><div style="font-size:20px;font-weight:700;color:${ink}">Tax invoice</div>
      <div style="font-size:13px;color:${muted};margin-top:4px">Invoice no. <b style="color:${ink}">${esc(inv.number)}</b><br>Date <b style="color:${ink}">${esc(day(inv.issued_at))}</b></div></td>
  </tr></table>
</td></tr>
<tr><td style="padding:10px 24px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="vertical-align:top;padding:12px 12px 12px 0;font-size:13px;line-height:1.5">
      <div style="font-size:12px;color:${muted};margin-bottom:4px">From</div>
      <b>${esc(supplierName)}</b><br>${lines(tradeLine, s.address, [s.city, s.postal_code].filter(Boolean).join(" "), s.state ? `${s.state} (state code ${s.state_code || ""})` : "")}
      <br>GSTIN <b>${esc(s.gstin)}</b><br>${esc(s.email)}</td>
    <td width="50%" style="vertical-align:top;padding:12px 0 12px 12px;font-size:13px;line-height:1.5;border-left:1px solid ${line}">
      <div style="font-size:12px;color:${muted};margin-bottom:4px">Bill to</div>
      <b>${esc(b.business || b.name)}</b><br>${lines(b.business && b.name ? `Attn: ${b.name}` : "", b.address, [b.city, b.postal_code].filter(Boolean).join(" "),
        b.state ? `${b.state}${b.state_code ? ` (state code ${b.state_code})` : ""}` : "", b.country && !/^india$/i.test(b.country) ? b.country : "")}
      ${b.gstin ? `<br>GSTIN <b>${esc(b.gstin)}</b>` : b.country && !/^(india|in|bharat)$/i.test(String(b.country).trim()) ? "" : `<br><span style="color:${muted}">Unregistered under GST</span>`}</td>
  </tr></table>
  <div style="font-size:13px;color:${ink};padding:4px 0 12px;border-bottom:1px solid ${line}">Place of supply: <b>${esc(inv.place_of_supply)}</b> &nbsp;·&nbsp; Tax payable on reverse charge: <b>No</b></div>
</td></tr>
<tr><td style="padding:12px 24px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><th style="${head}">Description</th><th style="${head}">SAC</th><th style="${head};${num}">Taxable value</th>${taxCols.map(([n]) => `<th style="${head};${num}">${n}</th>`).join("")}<th style="${head};${num}">Amount</th></tr>
    <tr><td style="${cell}">${esc(inv.description)}</td><td style="${cell}">${esc(inv.sac)}</td><td style="${cell};${num}">${rupees(inv.taxable_paise)}</td>${taxCols.map(([, v]) => `<td style="${cell};${num}">${rupees(v)}</td>`).join("")}<td style="${cell};${num}">${rupees(inv.total_paise)}</td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">
    <tr><td style="font-size:13px;color:${muted};padding:3px 10px;text-align:right">Taxable value</td><td style="font-size:13px;padding:3px 10px;text-align:right;width:130px">${rupees(inv.taxable_paise)}</td></tr>
    ${taxCols.map(([n, v]) => `<tr><td style="font-size:13px;color:${muted};padding:3px 10px;text-align:right">${n}</td><td style="font-size:13px;padding:3px 10px;text-align:right">${rupees(v)}</td></tr>`).join("")}
    <tr><td style="font-size:15px;font-weight:700;padding:8px 10px;text-align:right;border-top:2px solid ${ink}">Total</td><td style="font-size:15px;font-weight:700;padding:8px 10px;text-align:right;border-top:2px solid ${ink}">${rupees(inv.total_paise)}</td></tr>
  </table>
  <div style="font-size:13px;padding:6px 10px 0">Amount in words: <b>${esc(amountInWords(inv.total_paise))}</b></div>
  ${inv.zero_rated ? `<div style="font-size:13px;padding:10px;margin-top:10px;background:${soft}">Supply meant for export of services under LUT${s.lut_number ? ` no. ${esc(s.lut_number)}` : ""}, without payment of integrated tax.</div>` : ""}
</td></tr>
<tr><td style="padding:16px 24px 22px;font-size:12px;color:${muted};line-height:1.6">
  Paid online${inv.paid_at ? ` on ${esc(day(inv.paid_at))}` : ""}${inv.payment_ref ? `, payment reference ${esc(inv.payment_ref)}` : ""}. Nothing is due.<br>
  This is a computer-generated invoice. For ${esc(supplierName)}, authorised signatory.
</td></tr>
</table>`;
}

// The email around the invoice.
function invoiceEmail(inv, siteUrl) {
  const b = inv.buyer || {};
  const hello = b.name ? `Dear ${esc(String(b.name).split(" ")[0])},` : "Hello,";
  const link = `${siteUrl || "https://daskies.com"}/invoice.html?id=${encodeURIComponent(inv.id)}`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px 12px;background:#F2F4F3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>
<div style="max-width:680px;margin:0 auto 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#142A2E">
  <p style="margin:0 0 10px">${hello}</p>
  <p style="margin:0 0 10px">Thank you for your payment. Your tax invoice ${esc(inv.number)} for ${esc(rupees(inv.total_paise))} is below.</p>
  <p style="margin:0">You can also <a href="${esc(link)}" style="color:#0E6F68">open it on DASKIES</a> to print it or save it as a PDF.</p>
</div>
${invoiceHtml(inv)}
<div style="max-width:680px;margin:16px auto 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#5B6B69">Questions about this invoice? Reply to this email or write to info@daskies.com.</div>
</td></tr></table></body></html>`;
  const text = `${b.name ? `Dear ${String(b.name).split(" ")[0]},` : "Hello,"}

Thank you for your payment. Your DASKIES tax invoice ${inv.number} for ${rupees(inv.total_paise)} is in this email.
Open it on DASKIES to print or save it as a PDF: ${link}

Invoice no. ${inv.number}, ${day(inv.issued_at)}
${inv.description}: ${rupees(inv.total_paise)} (taxable value ${rupees(inv.taxable_paise)}${inv.zero_rated ? ", export under LUT, no GST" : inv.cgst_paise ? `, CGST ${rupees(inv.cgst_paise)}, SGST ${rupees(inv.sgst_paise)}` : `, IGST ${rupees(inv.igst_paise)}`})

Questions? Write to info@daskies.com.`;
  return { subject: invoiceSubject(inv), html, text };
}
// ---- invoice render end ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, supaKey("secret"));
  try {
    // Who is asking: the server itself (pay-verify, pay-webhook) or a signed-in admin.
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let allowed = !!bearer && bearer === supaKey("secret");
    if (!allowed && bearer) {
      const asUser = createClient(url, supaKey("publishable"), { global: { headers: { Authorization: "Bearer " + bearer } } });
      const { data: { user } } = await asUser.auth.getUser();
      if (user) { const { data: p } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(); allowed = !!p?.is_admin; }
    }
    if (!allowed) return json({ error: "Not allowed." }, 403);

    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    let q = admin.from("invoices").select("*");
    q = body.invoice_id ? q.eq("id", String(body.invoice_id)) : q.eq("payment_id", String(body.payment_id || ""));
    const { data: inv } = await q.maybeSingle();
    if (!inv) return json({ ok: false, reason: "no invoice" }, 404);
    if (inv.emailed_at && !force) return json({ ok: true, already: true, number: inv.number });

    const pass = Deno.env.get("SMTP_PASS");
    if (!pass) {
      await admin.from("invoices").update({ email_error: "Email isn't set up yet (SMTP_PASS secret missing)." }).eq("id", inv.id);
      return json({ error: "Invoice email isn't set up yet." }, 503);
    }
    const to = String(inv.buyer?.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      await admin.from("invoices").update({ email_error: "The buyer has no valid email address." }).eq("id", inv.id);
      return json({ error: "The buyer has no valid email address." }, 422);
    }
    const { data: claimed } = await admin.rpc("claim_invoice_email", { p_invoice: inv.id, p_force: force });
    if (!claimed) return json({ ok: true, busy: true, number: inv.number });

    const user = Deno.env.get("SMTP_USER") || "info@daskies.com";
    const mail = invoiceEmail(inv, Deno.env.get("SITE_URL") || "https://daskies.com");
    const client = new SMTPClient({
      connection: { hostname: Deno.env.get("SMTP_HOST") || "smtpout.secureserver.net", port: Number(Deno.env.get("SMTP_PORT") || 465), tls: true, auth: { username: user, password: pass } },
    });
    try {
      await client.send({ from: `DASKIES <${user}>`, to, bcc: user === to ? undefined : user, replyTo: user, subject: mail.subject, content: mail.text, html: mail.html });
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 300);
      console.error("smtp", msg);
      await admin.from("invoices").update({ email_error: msg, email_claimed_at: null }).eq("id", inv.id);
      return json({ error: "The invoice email couldn't be sent. Try again from Admin > Invoices." }, 502);
    } finally {
      try { await client.close(); } catch { /* already closed */ }
    }
    await admin.from("invoices").update({ emailed_at: new Date().toISOString(), email_to: to, email_error: null }).eq("id", inv.id);
    return json({ ok: true, sent: true, number: inv.number, to });
  } catch (e) {
    console.error("send-invoice", e);
    return json({ error: "The invoice email couldn't be sent." }, 500);
  }
});
