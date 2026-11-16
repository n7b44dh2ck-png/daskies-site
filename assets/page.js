// Plain content pages (pricing, terms, privacy, refunds): shared header and footer only.
import { header } from "./core.js";
await header(location.pathname.replace(/^\//, "") || "index.html");
