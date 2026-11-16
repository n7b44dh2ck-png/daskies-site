// DASKIES: start a Razorpay payment (Edge Function "pay-order").
// The amount is decided here on the server, never by the browser.
// Secrets (Supabase > Edge Functions > Secrets): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MEMBERSHIP = { rupees: 15000, gstPercent: 18, days: 90 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID"), keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) return json({ error: "Online payment isn't switched on yet. Write to info@daskies.com to pay." }, 503);
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Sign in to pay." }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const kind = body.kind;
    let paise = 0, description = "", ref: string | null = null;
    if (kind === "membership") {
      paise = MEMBERSHIP.rupees * (100 + MEMBERSHIP.gstPercent); // rupees x 1.18, in paise
      description = `Full membership, ${MEMBERSHIP.days} days (₹15,000 + 18% GST)`;
    } else if (kind === "fee") {
      const { data: f } = await admin.from("deal_fees").select("id, user_id, fee, gst, currency, status").eq("id", String(body.fee_id || "")).maybeSingle();
      if (!f || f.user_id !== user.id) return json({ error: "We couldn't find that fee." }, 404);
      if (f.status !== "due") return json({ error: "This fee isn't due." }, 409);
      if (f.currency !== "INR") return json({ error: "Fees in other currencies are paid by bank transfer. Write to info@daskies.com." }, 409);
      paise = Math.round((Number(f.fee) + Number(f.gst)) * 100);
      description = "DASKIES success fee incl. 18% GST";
      ref = f.id;
    } else {
      return json({ error: "Unknown payment." }, 400);
    }
    if (!(paise >= 100)) return json({ error: "The amount is too small to pay online." }, 400);

    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(keyId + ":" + keySecret) },
      body: JSON.stringify({ amount: paise, currency: "INR", receipt: (kind + "-" + crypto.randomUUID()).slice(0, 40), notes: { kind, user_id: user.id, ref: ref || "" } }),
    });
    const order = await r.json().catch(() => ({}));
    if (!r.ok || !order.id) {
      console.error("razorpay order failed", r.status, order?.error?.description);
      return json({ error: "The payment couldn't start. Try again in a minute." }, 502);
    }
    const { error } = await admin.from("payments").insert({ user_id: user.id, kind, ref_id: ref, amount_paise: paise, currency: "INR", description, razorpay_order_id: order.id });
    if (error) { console.error("payments insert", error.message); return json({ error: "The payment couldn't start. Try again in a minute." }, 500); }

    const { data: p } = await admin.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
    return json({ key: keyId, order_id: order.id, amount: paise, currency: "INR", description,
      prefill: { name: p?.full_name || "", email: user.email || "", contact: p?.phone || "" } });
  } catch (e) {
    console.error("pay-order", e);
    return json({ error: "The payment couldn't start. Try again in a minute." }, 500);
  }
});
