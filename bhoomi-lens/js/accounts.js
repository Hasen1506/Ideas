/* Bhoomi Lens accounts: email magic-link sign-in (Supabase) and sync of watchlist, watched spots, compare list and budget.
   Without config the app stays device-only. Table: bl_state(user_id uuid primary key references auth.users, data jsonb, updated_at timestamptz). */
(function () {
  const BL = (window.BL = window.BL || {});
  const C = window.BL_CONFIG || {};
  const KEYS = ["bl_watch", "bl_spots", "bl_sl", "bl_compare", "bl_budget"];
  const on = !!(C.supabaseUrl && C.supabaseAnonKey);
  let sb = null, user = null, last = "", status = on ? "Not signed in" : "Accounts not set up yet";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const read = () => { const o = {}; KEYS.forEach((k) => { try { const v = localStorage.getItem(k); if (v != null) o[k] = JSON.parse(v); } catch (e) {} }); return o; };
  const write = (o) => KEYS.forEach((k) => { if (o[k] !== undefined) try { localStorage.setItem(k, JSON.stringify(o[k])); } catch (e) {} });
  function merge(a, b) { // union arrays, otherwise prefer local (a)
    const out = Object.assign({}, b, a);
    KEYS.forEach((k) => { if (Array.isArray(a[k]) && Array.isArray(b[k])) { const seen = new Set(), r = []; a[k].concat(b[k]).forEach((x) => { const s = JSON.stringify(x); if (!seen.has(s)) { seen.add(s); r.push(x); } }); out[k] = r; } });
    return out;
  }
  BL.Accounts = { merge, enabled: () => on, user: () => user, status: () => status };
  function load(cb) { if (window.supabase) return cb(); const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"; s.onload = cb; s.onerror = () => { status = "Could not load the sign-in service"; render(); }; document.head.appendChild(s); }
  async function pull() {
    const { data, error } = await sb.from("bl_state").select("data").eq("user_id", user.id).maybeSingle();
    if (error) { status = "Sync error: " + error.message; return render(); }
    const m = merge(read(), (data && data.data) || {}); write(m); await push(true);
    status = "Signed in as " + user.email + ". Synced."; render();
  }
  async function push(force) {
    if (!sb || !user) return; const cur = JSON.stringify(read()); if (!force && cur === last) return; last = cur;
    const { error } = await sb.from("bl_state").upsert({ user_id: user.id, data: JSON.parse(cur), updated_at: new Date().toISOString() });
    if (error) status = "Sync error: " + error.message;
  }
  function init() {
    if (!on) return render();
    load(async () => {
      sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
      const { data } = await sb.auth.getSession(); user = data.session && data.session.user;
      sb.auth.onAuthStateChange((_e, s) => { const was = user; user = s && s.user; if (user && !was) pull(); if (!user) { status = "Not signed in"; render(); } });
      if (user) pull(); else render();
      setInterval(() => push(false), 5000);
    });
  }
  function panel() {
    if (!on) return `<p><b>Accounts are built but not switched on.</b></p><p class="muted">Right now your watchlist and watched spots are saved on this device only. Once the owner adds a free Supabase project key, you can sign in with your email and they will follow you to any device.</p>`;
    if (user) return `<p>${esc(status)}</p><p class="muted">Synced: watchlist, watched spots, compare list, budget.</p><button class="btn sm" id="accOut">Sign out</button>`;
    return `<p class="muted">${esc(status)}. Sign in with your email to keep your watchlist and watched spots on every device. No password: we email you a link.</p><input id="accEmail" type="email" placeholder="you@example.com" style="width:100%;margin:6px 0"><button class="btn sm primary" id="accGo">Email me a sign-in link</button>`;
  }
  function render() {
    const b = document.getElementById("btnAcct"); if (b) b.textContent = user ? "Account: signed in" : "Account";
    const p = document.getElementById("acctPop"); if (!p) return; p.innerHTML = panel();
    const go = document.getElementById("accGo"); if (go) go.onclick = async () => { const em = (document.getElementById("accEmail").value || "").trim(); if (!/^\S+@\S+\.\S+$/.test(em)) { status = "Enter a valid email"; return render(); } const { error } = await sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.href.split("#")[0] } }); status = error ? "Could not send: " + error.message : "Check " + em + " for the sign-in link"; render(); };
    const out = document.getElementById("accOut"); if (out) out.onclick = async () => { await sb.auth.signOut(); };
  }
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("btnAcct"), p = document.getElementById("acctPop");
    if (b && p) b.addEventListener("click", () => { p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden)); render(); });
    init();
  });
})();
