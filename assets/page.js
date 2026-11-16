// Plain content pages (pricing, terms, privacy, refunds): shared header and footer only.
import { header } from "./core.js?v=8646d7e7";
await header(location.pathname.replace(/^\//, "") || "index.html");
