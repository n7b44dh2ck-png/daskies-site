import { sb, $, esc, qs, header, errMsg, busy, toast, me, TERMS_VERSION } from "./core.js?v=267b52c1";
import { detailsFields, termsBox, readDetails, checkDetails, showProblems, saveDetails, detailsOf } from "./details.js?v=267b52c1";

const main = $("#main");
const next = qs("next") || "dashboard.html";
const safeNext = /^[a-z0-9_\-]+\.html(\?[^#]*)?(#[a-z]+)?$/i.test(next) ? next : "dashboard.html";
let mode = qs("mode") || "signin";

let m = await header("account.html");
if (m.user && mode !== "reset") {
  // Already signed in on this device: say so plainly instead of jumping ahead, unless a page sent them here to continue.
  if (m.complete || (m.profile && m.profile.is_admin)) { if (qs("next")) location.replace(safeNext); else mode = "already"; } else { mode = "complete"; }
}
if (!m.user && mode === "complete") mode = "signin";
// A confirmation or reset link that failed (expired, already used) comes back with the reason in the address.
const hp = new URLSearchParams(location.hash.replace(/^#/, ""));
const linkErr = hp.get("error_description") || qs("error_description");
if (linkErr) { history.replaceState(null, "", location.pathname + "?mode=" + (m.user ? mode : "signin")); if (!m.user) mode = "signin"; }
const redirectTo = location.origin + "/account.html?mode=complete";
const afterIn = async () => { const mm = await me(true); location.replace(mm.complete || (mm.profile && mm.profile.is_admin) ? safeNext : "account.html?mode=complete&next=" + encodeURIComponent(safeNext)); };

sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") { mode = "reset"; render(); } });

// Just confirmed their email: the details they gave when joining are kept with the sign-up, so save them now
// instead of asking again. Anything that doesn't pass the checks falls through to the normal form.
const joined = m.user && m.user.user_metadata && m.user.user_metadata.details;
let settingUp = false;
if (m.user && mode === "complete" && !m.business && joined && joined.terms === true) {
  const d = { ...joined, roles: joined.roles || [], country: joined.country || "India" };
  if (!checkDetails(d).length) {
    settingUp = true;
    main.innerHTML = `<div class="panel" style="max-width:460px;margin:24px auto"><h1>Email confirmed</h1><p class="muted">Setting up your business profile…</p></div>`;
    try { await saveDetails(m, d); location.replace(safeNext === "dashboard.html" ? "dashboard.html?welcome=1" : safeNext); }
    catch (err) { settingUp = false; m = await me(true); }
  }
}

function checkEmail(email) {
  main.innerHTML = `<div class="panel" style="max-width:480px;margin:24px auto"><h1>Check your email</h1>
    <p>We sent a confirmation link to <b>${esc(email)}</b> from <b>info@daskies.com</b>. Open it to finish joining. Your business details are saved with your sign-up, so you won't need to type them again.</p>
    <p class="small muted">Nothing after 5 minutes? Look in Spam or Promotions, then send it again.</p>
    <p class="err" id="msg" role="alert"></p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-ghost" type="button" id="again">Send the link again</button><a class="btn btn-primary" href="?mode=signin&next=${encodeURIComponent(safeNext)}">Go to sign in</a></div></div>`;
  const again = $("#again");
  again.addEventListener("click", async () => {
    busy(again, true, "Sending…");
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
    busy(again, false);
    if (error) $("#msg").textContent = errMsg(error); else toast("Sent again. Check your inbox.");
  });
}

// Sign-in refused because the email isn't confirmed yet: offer a fresh link right there.
function offerResend(email, msg) {
  if ($("#again")) return;
  msg.insertAdjacentHTML("afterend", `<p class="small" style="margin:-4px 0 12px"><button class="btn btn-ghost" type="button" id="again">Send the confirmation link again</button></p>`);
  const again = $("#again");
  again.addEventListener("click", async () => {
    busy(again, true, "Sending…");
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
    busy(again, false);
    if (error) msg.textContent = errMsg(error); else { msg.textContent = ""; again.replaceWith(Object.assign(document.createElement("span"), { className: "muted", textContent: "Sent. Open the link in the email, then sign in." })); }
  });
}

function render() {
  const forms = {
    already: m.user ? `<h1>You're signed in</h1><p>Signed in as <b>${esc(m.user.email)}</b> on this device. DASKIES keeps you signed in until you sign out.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-primary" href="${esc(safeNext)}">${safeNext.startsWith("dashboard.html") ? "Go to dashboard" : "Continue"}</a><button class="btn btn-ghost" type="button" id="out2">Sign out</button></div>
      <p class="small muted" style="margin-top:14px">On a shared phone or computer, sign out when you're done. To use a different account, sign out first.</p>` : "",
    signin: `<h1>Sign in</h1><p class="muted">Welcome back to DASKIES.</p>
      <form id="f" novalidate>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email" required></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Sign in</button>
      </form>
      <p class="small"><a href="?mode=forgot">Forgot password?</a> · New here? <a href="?mode=signup&next=${encodeURIComponent(safeNext)}">Create a free account</a></p>`,
    signup: `<h1>Join DASKIES</h1><p class="muted">DASKIES is a network for businesses. Every member gives their full business details, so you know who you're dealing with. Joining is free; see <a href="pricing.html" target="_blank" rel="noopener">Pricing</a> for full membership.</p>
      <form id="f" novalidate>
        ${detailsFields(detailsOf({}))}
        <fieldset class="fs"><legend>Sign-in</legend>
          <div class="row2"><div class="field"><label for="em">Email <span class="req" aria-hidden="true">*</span></label><input id="em" type="email" autocomplete="email" required></div>
          <div class="field"><label for="pw">Password <span class="req" aria-hidden="true">*</span></label><input id="pw" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></div></div></fieldset>
        <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px"><input type="checkbox" id="ok" style="margin-top:4px;accent-color:var(--accent)"> I confirm these details are true, and I will list only what I own or am authorised to represent.</label>
        ${termsBox()}
        <p class="hint" style="margin-top:-6px">Fields marked <span class="req">*</span> are required.</p>
        <p class="err" id="msg" role="alert"></p>
        <button class="btn btn-primary" style="width:100%">Create account</button>
      </form>
      <p class="small">Already a member? <a href="?mode=signin&next=${encodeURIComponent(safeNext)}">Sign in</a></p>`,
    complete: `<h1>Complete your business profile</h1><p class="muted">DASKIES is a network for businesses. These details are required before you can post, enquire, message or start deals.${m.user ? ` Signed in as <b>${esc(m.user.email)}</b>.` : ""}</p>
      <form id="f" novalidate>
        ${m.user ? detailsFields(detailsOf(m), { terms: m.profile?.terms_version !== TERMS_VERSION }) : ""}
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
  const notice = linkErr && (mode === "signin" || mode === "forgot") ? `<p class="err" role="alert" style="margin-bottom:14px">${esc(errMsg({ message: linkErr }))}</p>` : "";
  main.innerHTML = `<div class="panel" style="max-width:${wide ? 720 : 460}px;margin:24px auto">${notice}${forms[mode] || forms.signin}</div>`;
  const f = $("#f"); if (f) f.addEventListener("submit", submit);
  const out = $("#out"); if (out) out.addEventListener("click", async (e) => { e.preventDefault(); await sb.auth.signOut(); location.href = "index.html"; });
  const out2 = $("#out2"); if (out2) out2.addEventListener("click", async () => { busy(out2, true); await sb.auth.signOut(); location.replace("account.html"); });
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
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { full_name: d.full_name, phone: d.phone, details: d }, emailRedirectTo: redirectTo } });
      if (error) throw error;
      if (data.session) {
        m = await me(true);
        try { await saveDetails(m, d); }
        catch (err) { location.replace("account.html?mode=complete&next=" + encodeURIComponent(safeNext)); return; }
        location.replace(safeNext === "dashboard.html" ? "dashboard.html?welcome=1" : safeNext);
      } else checkEmail(email);
    } else if (mode === "forgot") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/account.html?mode=reset" });
      if (error) throw error;
      main.innerHTML = `<div class="panel" style="max-width:460px;margin:24px auto"><h1>Check your email</h1><p>If an account exists for <b>${esc(email)}</b>, a reset link is on its way from <b>info@daskies.com</b>.</p><p class="small muted">Nothing after 10 minutes? Look in Spam or Promotions, or write to info@daskies.com.</p></div>`;
    } else if (mode === "reset") {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      toast("Password saved.");
      location.replace("dashboard.html");
    }
  } catch (err) {
    msg.textContent = errMsg(err); busy(btn, false);
    if (mode === "signin" && /Email not confirmed/i.test((err && err.message) || "")) offerResend(email, msg);
  }
}

if (!settingUp) render();
