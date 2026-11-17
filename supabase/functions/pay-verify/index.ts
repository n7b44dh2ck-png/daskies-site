// DASKIES: confirm a Razorpay payment right after checkout (Edge Function "pay-verify").
// Razorpay signs order_id|payment_id with the key secret; only a matching signature marks it paid.
import { createClient } from "npm:@supabase/supabase-js@2";

// Supabase provides its keys under new names (SUPABASE_*_KEYS) and, on older projects, the legacy ones.
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
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// The database issues the invoice when the payment is recorded; send-invoice emails it to the buyer.
async function emailInvoice(admin: any, url: string, order: string) {
  try {
    const { data: pm } = await admin.from("payments").select("id").eq("razorpay_order_id", order).maybeSingle();
    if (!pm) return;
    const r = await fetch(url + "/functions/v1/send-invoice", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + supaKey("secret") }, body: JSON.stringify({ payment_id: pm.id }) });
    if (!r.ok) console.error("send-invoice", r.status, await r.text().catch(() => ""));
  } catch (e) { console.error("send-invoice call", e); }
}
// Runs after the reply has gone back, where the platform allows it.
function afterReply(job: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(job); return Promise.resolve(); }
  return job;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keySecret) return json({ error: "Online payment isn't switched on yet." }, 503);
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, supaKey("publishable"), { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Sign in again to finish." }, 401);

    const b = await req.json().catch(() => ({}));
    const order = String(b.razorpay_order_id || ""), payment = String(b.razorpay_payment_id || ""), signature = String(b.razorpay_signature || "");
    if (!order || !payment || !signature) return json({ error: "The payment details are incomplete." }, 400);
    if (!same(await hmacHex(keySecret, order + "|" + payment), signature)) return json({ error: "We couldn't confirm this payment. If money left your account, write to info@daskies.com with the payment reference." }, 400);

    const admin = createClient(url, supaKey("secret"));
    const { data: p } = await admin.from("payments").select("user_id, kind").eq("razorpay_order_id", order).maybeSingle();
    if (!p || p.user_id !== user.id) return json({ error: "We couldn't find this payment." }, 404);
    const { data: result, error } = await admin.rpc("apply_payment", { p_order: order, p_payment: payment });
    if (error) { console.error("apply_payment", error.message); return json({ error: "Your payment went through; we're still recording it. Refresh in a minute." }, 500); }
    await afterReply(emailInvoice(admin, url, order));
    return json({ ok: true, result, kind: p.kind });
  } catch (e) {
    console.error("pay-verify", e);
    return json({ error: "Your payment may have gone through; we're still recording it. Refresh in a minute." }, 500);
  }
});
