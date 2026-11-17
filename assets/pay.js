// Online payments with Razorpay Checkout. Amounts come from the server (Edge Function pay-order);
// the result is confirmed on the server (pay-verify) before anything is marked paid.
import CONFIG from "./config.js?v=bfd62387";
import { sb } from "./core.js?v=bfd62387";

export const paymentsOn = () => !!CONFIG.payments;
export const MEMBERSHIP_TOTAL = 17700; // ₹15,000 + 18% GST

function loadCheckout() {
  return new Promise((res, rej) => {
    if (window.Razorpay) return res();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("The payment window couldn't load. Check your connection and try again."));
    document.head.appendChild(s);
  });
}
async function call(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (!error && data && !data.error) return data;
  let msg = data && data.error;
  if (!msg && error && error.context && typeof error.context.json === "function") { try { msg = (await error.context.json()).error; } catch {} }
  throw new Error(msg || "The payment couldn't start. Try again in a minute.");
}

// kind: "membership" or "fee" (with { fee_id }). Resolves when the payment is confirmed.
export async function pay(kind, extra = {}) {
  await loadCheckout();
  const o = await call("pay-order", { kind, ...extra });
  return new Promise((resolve, reject) => {
    const rz = new window.Razorpay({
      key: o.key, order_id: o.order_id, amount: o.amount, currency: o.currency,
      name: "DASKIES", description: o.description, prefill: o.prefill,
      theme: { color: "#0E6F68" },
      handler: (r) => call("pay-verify", r).then(resolve, reject),
      modal: { ondismiss: () => reject(Object.assign(new Error("Payment cancelled. Nothing was charged."), { cancelled: true })) },
    });
    rz.on("payment.failed", (e) => reject(new Error((e && e.error && e.error.description) || "The payment failed. Nothing was charged; try again or use another method.")));
    rz.open();
  });
}
