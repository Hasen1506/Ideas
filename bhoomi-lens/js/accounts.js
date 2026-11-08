/* Bhoomi Lens accounts: email magic-link sign-in (Supabase) and sync of watchlist, watched spots, compare list and budget.
   Without config the app stays device-only. Table: bl_state(user_id uuid primary key references auth.users, data jsonb, updated_at timestamptz). */
(function () {
  const BL = (window.BL = window.BL || {});
  const C = window.BL_CONFIG || {};
  const KEYS = ["bl_watch", "bl_spots", "bl_sl", "bl_compare", "bl_budget"];
  const on = !!(C.supabaseUrl && C.supabaseAnonKey);
  let sb = null, user = null, last = "", status = on ? "Not signed in" : "Saved on this device", backupStatus = "";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const read = () => { const o = {}; KEYS.forEach((k) => { try { const v = localStorage.getItem(k); if (v != null) o[k] = JSON.parse(v); } catch (e) {} }); return o; };
  function write(o) {
    const previous = {};
    for (const k of KEYS) if (o[k] !== undefined) previous[k] = localStorage.getItem(k);
    try { for (const k of Object.keys(previous)) localStorage.setItem(k, JSON.stringify(o[k])); }
    catch (error) { for (const [k, value] of Object.entries(previous)) { try { if (value === null) localStorage.removeItem(k); else localStorage.setItem(k, value); } catch (_) {} } throw error; }
  }
  function merge(a, b) { // union arrays, otherwise prefer local (a)
    const out = Object.assign({}, b, a);
    KEYS.forEach((k) => { if (Array.isArray(a[k]) && Array.isArray(b[k])) { const seen = new Set(), r = []; a[k].concat(b[k]).forEach((x) => { const s = k === "bl_spots" && x && Number.isFinite(x.lat) && Number.isFinite(x.lon) ? `${x.lat.toFixed(4)},${x.lon.toFixed(4)}` : JSON.stringify(x); if (!seen.has(s)) { seen.add(s); r.push(x); } }); out[k] = r; } });
    return out;
  }
  BL.Accounts = { merge, enabled: () => on, user: () => user, status: () => status };
  function validateBackup(doc) {
    if (!doc || doc.format !== "bhoomi-lens-backup" || doc.version !== 1 || !doc.data || typeof doc.data !== "object" || Array.isArray(doc.data)) throw new Error("This is not a supported Bhoomi Lens backup.");
    const d = doc.data, clean = {};
    for (const k of ["bl_watch", "bl_compare"]) if (d[k] !== undefined) {
      if (!Array.isArray(d[k]) || d[k].length > 10000 || d[k].some((v) => !Number.isSafeInteger(v) || v < 0)) throw new Error("The saved district list is invalid.");
      clean[k] = d[k];
    }
    if (d.bl_spots !== undefined) {
      if (!Array.isArray(d.bl_spots) || d.bl_spots.length > 10000 || d.bl_spots.some((s) => !s || !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || Math.abs(s.lat) > 90 || Math.abs(s.lon) > 180 || (s.projects !== undefined && (!Array.isArray(s.projects) || s.projects.length > 100 || s.projects.some((p) => !p || typeof p.id !== "string"))))) throw new Error("The saved locations are invalid.");
      clean.bl_spots = d.bl_spots;
    }
    if (d.bl_budget !== undefined) { if (!Number.isFinite(d.bl_budget) || d.bl_budget <= 0) throw new Error("The saved budget is invalid."); clean.bl_budget = d.bl_budget; }
    if (d.bl_sl !== undefined) { if (!d.bl_sl || typeof d.bl_sl !== "object" || Array.isArray(d.bl_sl) || !Number.isFinite(d.bl_sl.budget) || d.bl_sl.budget <= 0 || typeof d.bl_sl.state !== "string" || d.bl_sl.state.length > 100) throw new Error("The saved shortlist is invalid."); clean.bl_sl = d.bl_sl; }
    return clean;
  }
  function backup() {
    const blob = new Blob([JSON.stringify({ format: "bhoomi-lens-backup", version: 1, exportedAt: new Date().toISOString(), data: read() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "bhoomi-lens-saved-data.json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restore(file) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("The backup is too large.");
      const imported = validateBackup(JSON.parse(await file.text()));
      const merged = merge(read(), imported);
      if (merged.bl_compare) merged.bl_compare = merged.bl_compare.slice(0, 3);
      write(merged); if (BL.Accounts.onChange) BL.Accounts.onChange();
      backupStatus = "Saved places and settings merged on this device.";
    } catch (e) { backupStatus = e instanceof SyntaxError ? "The file is not valid JSON." : e.message || "Could not import this backup."; }
    render();
  }
  function load(cb) { if (window.supabase) return cb(); const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"; s.onload = cb; s.onerror = () => { status = "Could not load the sign-in service"; render(); }; document.head.appendChild(s); }
  async function pull() {
    const { data, error } = await sb.from("bl_state").select("data").eq("user_id", user.id).maybeSingle();
    if (error) { status = "Sync error: " + error.message; return render(); }
    try {
      const m = merge(read(), (data && data.data) || {}); write(m); if (BL.Accounts.onChange) BL.Accounts.onChange();
      if (await push(true)) status = "Signed in as " + user.email + ". Synced.";
    } catch (e) { status = "Could not save synced data on this device."; }
    render();
  }
  async function push(force) {
    if (!sb || !user) return false; const cur = JSON.stringify(read()); if (!force && cur === last) return true;
    const { error } = await sb.from("bl_state").upsert({ user_id: user.id, data: JSON.parse(cur), updated_at: new Date().toISOString() });
    if (error) { status = "Sync error: " + error.message; render(); return false; }
    last = cur; return true;
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
    const backups = `<div class="btn-row" style="margin-top:10px"><button class="btn sm" id="accExport">Export backup</button><label class="btn sm" for="accImport">Import backup</label><input id="accImport" type="file" accept="application/json,.json" hidden></div><p class="small muted">Backups include saved locations and are stored only where you choose. Import merges them with this device's data.</p>${backupStatus ? `<p class="small" role="status">${esc(backupStatus)}</p>` : ""}`;
    if (!on) return `<p><b>Saved on this device</b></p><p class="muted">Watchlists, watched spots, comparisons and budgets stay in this browser. Export a backup to move them or restore them later.</p>${backups}`;
    if (user) return `<p>${esc(status)}</p><p class="muted">Synced: watchlist, watched spots, compare list, budget.</p><button class="btn sm" id="accOut">Sign out</button>${backups}`;
    return `<p class="muted">${esc(status)}. Sign in with your email to sync saved data across devices.</p><input id="accEmail" type="email" placeholder="you@example.com" style="width:100%;margin:6px 0"><button class="btn sm primary" id="accGo">Email me a sign-in link</button>${backups}`;
  }
  function render() {
    const b = document.getElementById("btnAcct"); if (b) b.textContent = user ? "Account: signed in" : "Saved data";
    const p = document.getElementById("acctPop"); if (!p) return; p.innerHTML = panel();
    const go = document.getElementById("accGo"); if (go) go.onclick = async () => { const em = (document.getElementById("accEmail").value || "").trim(); if (!/^\S+@\S+\.\S+$/.test(em)) { status = "Enter a valid email"; return render(); } if (!sb) { status = "Sign-in service is still loading"; return render(); } const { error } = await sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.href.split("#")[0] } }); status = error ? "Could not send: " + error.message : "Check " + em + " for the sign-in link"; render(); };
    const out = document.getElementById("accOut"); if (out) out.onclick = async () => { await sb.auth.signOut(); };
    const exp = document.getElementById("accExport"); if (exp) exp.onclick = backup;
    const imp = document.getElementById("accImport"); if (imp) imp.onchange = () => restore(imp.files[0]);
  }
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("btnAcct"), p = document.getElementById("acctPop");
    if (b && p) b.addEventListener("click", () => { p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden)); render(); });
    init();
  });
})();
