import { sb, $, esc, qs, header, errMsg, busy, toast } from "./core.js";

const main = $("#main");
const next = qs("next") || "dashboard.html";
const safeNext = /^[a-z0-9_\-]+\.html(\?[^#]*)?(#[a-z]+)?$/i.test(next) ? next : "dashboard.html";
let mode = qs("mode") || "signin";

const m = await header("account.html");
if (m.user && mode !== "reset") { location.replace(safeNext); }

sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") { mode = "reset"; render(); } });

function render() {
  const forms = {
    signin: `<h1>Sign in</h1><p class="muted">Welcome back to DASKIES.</p>
      <form id="f" novalidate>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email" required></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Sign in</button>
      </form>
      <p class="small"><a href="?mode=forgot">Forgot password?</a> · New here? <a href="?mode=signup&next=${encodeURIComponent(safeNext)}">Create a free account</a></p>`,
    signup: `<h1>Join DASKIES free</h1><p class="muted">The first 2,000 businesses get a free founding membership.</p>
      <form id="f" novalidate>
        <div class="field"><label for="nm">Your name</label><input id="nm" autocomplete="name" required maxlength="120"></div>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email" required></div>
        <div class="field"><label for="ph">Phone or WhatsApp</label><input id="ph" type="tel" autocomplete="tel" placeholder="+91" maxlength="30"><span class="hint">Never shown in public. Members contact you through DASKIES messages.</span></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></div>
        <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:14px"><input type="checkbox" id="ok" style="margin-top:4px;accent-color:var(--accent)"> I agree to deal honestly and to list only what I own or am authorised to represent.</label>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Create account</button>
      </form>
      <p class="small">Already a member? <a href="?mode=signin&next=${encodeURIComponent(safeNext)}">Sign in</a></p>`,
    forgot: `<h1>Reset your password</h1><p class="muted">We'll email you a link to set a new password.</p>
      <form id="f" novalidate>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email" required></div>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Send reset link</button>
      </form>
      <p class="small"><a href="?mode=signin">Back to sign in</a></p>`,
    reset: `<h1>Set a new password</h1>
      <form id="f" novalidate>
        <div class="field"><label for="pw">New password</label><input id="pw" type="password" autocomplete="new-password" minlength="8" required></div>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Save password</button>
      </form>`
  };
  main.innerHTML = `<div class="panel" style="max-width:460px;margin:24px auto">${forms[mode] || forms.signin}</div>`;
  $("#f").addEventListener("submit", submit);
  const first = $("#f input"); if (first) first.focus();
}

async function submit(e) {
  e.preventDefault();
  const msg = $("#msg"), btn = $("#f button");
  msg.textContent = "";
  const email = ($("#em") || {}).value?.trim();
  const pw = ($("#pw") || {}).value;
  if ($("#em") && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = "Enter a valid email address."; return; }
  if ($("#pw") && (mode === "signup" || mode === "reset") && pw.length < 8) { msg.textContent = "Use a password of at least 8 characters."; return; }
  busy(btn, true, "Please wait…");
  try {
    if (mode === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      location.replace(safeNext);
    } else if (mode === "signup") {
      const name = $("#nm").value.trim();
      if (name.length < 2) throw new Error("Add your name.");
      if (!$("#ok").checked) throw new Error("Tick the box to agree.");
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { full_name: name, phone: $("#ph").value.trim() }, emailRedirectTo: location.origin + "/dashboard.html" } });
      if (error) throw error;
      if (data.session) { location.replace(safeNext === "dashboard.html" ? "dashboard.html?welcome=1" : safeNext); }
      else { main.innerHTML = `<div class="panel" style="max-width:460px;margin:24px auto"><h1>Check your email</h1><p>We sent a link to <b>${esc(email)}</b>. Open it to confirm your account, then sign in.</p></div>`; }
    } else if (mode === "forgot") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/account.html?mode=reset" });
      if (error) throw error;
      main.innerHTML = `<div class="panel" style="max-width:460px;margin:24px auto"><h1>Check your email</h1><p>If an account exists for <b>${esc(email)}</b>, a reset link is on its way. If nothing arrives in 10 minutes, WhatsApp us.</p></div>`;
    } else if (mode === "reset") {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      toast("Password saved.");
      location.replace("dashboard.html");
    }
  } catch (err) { msg.textContent = errMsg(err); busy(btn, false); }
}

render();
