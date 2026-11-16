// Plain content pages (pricing, terms, privacy, refunds): shared header and footer only.
import { header } from "./core.js?v=ddcdfaa6";
await header(location.pathname.replace(/^\//, "") || "index.html");
