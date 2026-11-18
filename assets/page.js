// Plain content pages (pricing, terms, privacy, refunds): shared header and footer only.
import { header } from "./core.js?v=41d281e4";
header(location.pathname.replace(/^\//, "") || "index.html");   // draws at once; nothing below waits for it
// Inline WhatsApp buttons (Contact page): same chat as the floating button.
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-wa]")) return;
  const url = "https://wa.me/" + ["91", "98252", "12448"].join("") + "?text=" + encodeURIComponent("Hello DASKIES, I have a general enquiry.");
  const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url;
});
