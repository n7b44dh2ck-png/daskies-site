import { sb, $, esc, qs, header, errMsg, busy, toast, me } from "./core.js";
import { detailsFields, readDetails, checkDetails, showProblems, saveDetails, detailsOf } from "./details.js";

const main = $("#main");
const next = qs("next") || "dashboard.html";
const safeNext = /^[a-z0-9_\-]+\.html(\?[^#]*)?(#[a-z]+)?$/i.test(next) ? next : "dashboard.html";
let mode = qs("mode") || "signin";

let m = await header("account.html");
if (m.user && mode !== "reset") {
  if (m.complete) { location.replace(safeNext); } else { mode = "complete"; }
}
if (!m.user && mode === "complete") mode = "signin";
const afterIn = async () => { const mm = await me(true); location.replace(mm.complete || (mm.profile && mm.profile.is_admin) ? safeNext : "account.html?mode=complete&next=" + encodeURIComponent(safeNext)); };

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
    signup: `<h1>Join DASKIES free</h1><p class="muted">DASKIES is a network for businesses. Every member gives their full business details, so you know who you're dealing with. The first 2,000 businesses get a free founding membership.</p>
      <form id="f" novalidate>
        ${detailsFields(detailsOf({}))}
        <fieldset class="fs"><legend>Sign-in</legend>
          <div class="row2"><div class="field"><label for="em">Email <span class="req" aria-hidden="true">*</span></label><input id="em" type="email" autocomplete="email" required></div>
          <div class="field"><label for="pw">Password <span class="req" aria-hidden="true">*</span></label><input id="pw" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></div></div></fieldset>
        <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:14px"><input type="checkbox" id="ok" style="margin-top:4px;accent-color:var(--accent)"> I confirm these details are true, and I will list only what I own or am authorised to represent.</label>
        <p class="hint" style="margin-top:-6px">Fields marked <span class="req">*</span> are required.</p>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Create account</button>
      </form>
      <p class="small">Already a member? <a href="?mode=signin&next=${encodeURIComponent(safeNext)}">Sign in</a></p>`,
    complete: `<h1>Complete your business profile</h1><p class="muted">DASKIES is a network for businesses. These details are required before you can post, enquire, message or start deals.${m.user ? ` Signed in as <b>${esc(m.user.email)}</b>.` : ""}</p>
      <form id="f" novalidate>
        ${m.user ? detailsFields(detailsOf(m)) : ""}
        <p class="hint">Fields marked <span class="req">*</span> are required.</p>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Save and continue</button>
      </form>
      <p class="small"><a href="#" id="out">Sign out</a></p>`,
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
  const wide = mode === "signup" || mode === "complete";
  main.innerHTML = `<div class="panel" style="max-width:${wide ? 720 : 460}px;margin:24px auto">${forms[mode] || forms.signin}</div>`;
  $("#f").addEventListener("submit", submit);
  const out = $("#out"); if (out) out.addEventListener("click", async (e) => { e.preventDefault(); await sb.auth.signOut(); location.href = "index.html"; });
  const first = $("#f input"); if (first) first.focus();
}

async function submit(e) {
  e.preventDefault();
  const msg = $("#msg"), btn = $("#f button");
  msg.textContent = "";
  const email = ($("#em") || {}).value?.trim();
  const pw = ($("#pw") || {}).value;
  if (mode === "signup" && showProblems(checkDetails(readDetails()))) { msg.textContent = "Some details are missing or need fixing; see the marked fields."; return; }
  if ($("#em") && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = "Enter a valid email address."; return; }
  if ($("#pw") && (mode === "signup" || mode === "reset") && pw.length < 8) { msg.textContent = "Use a password of at least 8 characters."; return; }
  busy(btn, true, "Please wait…");
  try {
    if (mode === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      await afterIn();
    } else if (mode === "complete") {
      const d = readDetails();
      if (showProblems(checkDetails(d))) { busy(btn, false); msg.textContent = "Some details are missing or need fixing; see the marked fields."; return; }
      await saveDetails(m, d);
      toast("Profile complete. Welcome to DASKIES.");
      await afterIn();
    } else if (mode === "signup") {
      const d = readDetails();
      const bad = showProblems(checkDetails(d));
      if (bad) { busy(btn, false); msg.textContent = "Some details are missing or need fixing; see the marked fields."; return; }
      if (!$("#ok").checked) throw new Error("Tick the box to confirm your details.");
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { full_name: d.full_name, phone: d.phone, details: d }, emailRedirectTo: location.origin + "/account.html?mode=complete" } });
      if (error) throw error;
      if (data.session) {
        m = await me(true);
        try { await saveDetails(m, d); }
        catch (err) { location.replace("account.html?mode=complete&next=" + encodeURIComponent(safeNext)); return; }
        location.replace(safeNext === "dashboard.html" ? "dashboard.html?welcome=1" : safeNext);
      } else { main.innerHTML = `<div class="panel" style="max-width:460px;margin:24px auto"><h1>Check your email</h1><p>We sent a link to <b>${esc(email)}</b>. Open it to confirm your account, then sign in.</p></div>`; }
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
