// DASKIES: Razorpay webhook (Edge Function "pay-webhook"), the backstop if a member closes the
// window before checkout finishes. Turn OFF "Verify JWT" for this function; Razorpay's own
// signature (X-Razorpay-Signature, made with RAZORPAY_WEBHOOK_SECRET) is checked instead.
// Razorpay Dashboard > Webhooks: URL .../functions/v1/pay-webhook, events payment.captured, order.paid, payment.failed.
import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return new Response("Webhook secret not set", { status: 503 });
  const raw = await req.text();
  const given = req.headers.get("x-razorpay-signature") || "";
  if (!same(await hmacHex(secret, raw), given)) return new Response("Bad signature", { status: 400 });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("Bad body", { status: 400 }); }
  const pay = evt?.payload?.payment?.entity;
  const order = pay?.order_id || evt?.payload?.order?.entity?.id;
  if (!order) return new Response("ignored", { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (evt.event === "payment.captured" || evt.event === "order.paid") {
    const { error } = await admin.rpc("apply_payment", { p_order: order, p_payment: pay?.id || "webhook" });
    if (error) { console.error("apply_payment", error.message); return new Response("retry", { status: 500 }); }
  } else if (evt.event === "payment.failed") {
    await admin.rpc("payment_failed", { p_order: order });
  }
  return new Response("ok", { status: 200 });
});
