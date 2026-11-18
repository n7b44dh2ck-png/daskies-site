// Pricing page: shared header, plus paying for full membership when online payment is on.
import { header, me, toast, busy, day } from "./core.js?v=a9109389";
import { paymentsOn, pay } from "./pay.js?v=a9109389";

const m = await header("pricing.html");
const btn = document.getElementById("upgrade"), line = document.getElementById("memberLine"), note = document.getElementById("payNote");
const until = m.profile && m.profile.member_until && new Date(m.profile.member_until) > new Date() ? m.profile.member_until : null;

if (paymentsOn()) {
  note.textContent = "Pay by UPI, card or net banking. Membership starts as soon as the payment goes through.";
  if (m.user) {
    btn.textContent = until ? "Renew for 90 more days" : "Upgrade now: ₹17,700";
    btn.setAttribute("href", "#");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!m.complete && !(m.profile && m.profile.is_admin)) { location.href = "account.html?mode=complete&next=pricing.html"; return; }
      busy(btn, true, "Opening payment…");
      try {
        await pay("membership");
        toast("Payment received. Your full membership is active.");
        setTimeout(() => location.replace("dashboard.html"), 900);
      } catch (err) { busy(btn, false); if (!err.cancelled) toast(err.message, true); else toast(err.message); }
    });
  }
}
if (until) { line.textContent = "Your full membership runs until " + day(until) + "."; line.hidden = false; }
