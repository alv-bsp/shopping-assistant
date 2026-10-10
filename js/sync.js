// Sincronizzazione con Supabase. Lo stato viene spezzato in righe chiave → JSON nella tabella `kv`:
//   recipe:<id>, plan:<settimana>, pantry, settings, storeOf, meta
// Si inviano solo le righe cambiate rispetto all'ultima versione nota del server (lastSynced),
// quindi le modifiche fatte offline partono da sole quando torna la rete.
// Conflitti: per riga, vince l'ultima scrittura. Una modifica locale non ancora inviata non viene
// sovrascritta dal server. I voti sono per ricetta, quindi due persone che votano insieme non si pestano.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
const LS_SYNCED = "food-app-synced";
export const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

let sb = null, user = null, channel = null, started = false, timer = null, pushing = null;
let hooks = { getState: () => null, onRemote: () => {}, onStatus: () => {}, normalize: (s) => s };
let status = enabled ? "starting" : "local";
let storage = globalThis.localStorage;

// ------------------------------------------------------------------ stato ↔ righe
/** JSON con chiavi ordinate: jsonb di Postgres riordina le chiavi, quindi serve per confrontare. */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export function toRows(state) {
  const rows = { meta: { seedVersion: state.seedVersion }, settings: state.settings, pantry: state.pantry, storeOf: state.storeOf };
  for (const r of state.recipes) rows[`recipe:${r.id}`] = r;
  for (const [wk, p] of Object.entries(state.plans)) rows[`plan:${wk}`] = p;
  return rows;
}
export function fromRows(rows) {
  const s = { seedVersion: rows.meta?.seedVersion || 0, settings: rows.settings, pantry: rows.pantry || [], storeOf: rows.storeOf || {}, recipes: [], plans: {} };
  for (const [k, v] of Object.entries(rows)) {
    if (k.startsWith("recipe:")) s.recipes.push(v);
    else if (k.startsWith("plan:")) s.plans[k.slice(5)] = v;
  }
  return s;
}
/** Applica una riga (o la sua cancellazione, value = null) allo stato in memoria. */
export function applyRow(state, key, value) {
  if (key.startsWith("recipe:")) {
    const id = key.slice(7), i = state.recipes.findIndex((r) => r.id === id);
    if (value == null) { if (i >= 0) state.recipes.splice(i, 1); }
    else if (i >= 0) state.recipes[i] = value; else state.recipes.push(value);
  } else if (key.startsWith("plan:")) {
    if (value == null) delete state.plans[key.slice(5)]; else state.plans[key.slice(5)] = value;
  } else if (key === "meta") { if (value) state.seedVersion = value.seedVersion; }
  else if (value != null) state[key] = value;
}

// ------------------------------------------------------------------ memoria dell'ultima versione del server
let lastSynced = {};
const loadSynced = () => { try { lastSynced = JSON.parse(storage?.getItem(LS_SYNCED) || "{}"); } catch { lastSynced = {}; } };
const saveSynced = () => { try { storage?.setItem(LS_SYNCED, JSON.stringify(lastSynced)); } catch {} };

function setStatus(s, detail) { status = s; hooks.onStatus(s, detail); }
export const getStatus = () => status;
export const getUser = () => user;

// ------------------------------------------------------------------ pull / push
/**
 * Unisce le righe del server con lo stato locale. Regole per ogni chiave:
 * - non modificata in locale → vince il server (anche se l'ha cancellata)
 * - modificata in locale → resta la locale, verrà inviata
 * Primo accesso da un dispositivo (lastSynced vuoto) con server già pieno → prende tutto dal server.
 */
export function mergeRemote(state, remote) {
  const local = toRows(state);
  const firstTime = !Object.keys(lastSynced).length;
  if (firstTime && Object.keys(remote).length) {
    lastSynced = Object.fromEntries(Object.entries(remote).map(([k, v]) => [k, stable(v)]));
    return { state: hooks.normalize(fromRows(remote)), changed: true };
  }
  let changed = false;
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(lastSynced)]);
  for (const k of keys) {
    const l = k in local ? stable(local[k]) : undefined;
    const r = k in remote ? stable(remote[k]) : undefined;
    const base = lastSynced[k];
    const localChanged = l !== base;
    if (r === undefined) {
      // il server non ce l'ha: o è nuova in locale (resta) o è stata cancellata altrove
      if (base !== undefined && !localChanged) { applyRow(state, k, null); changed = true; }
      if (base !== undefined) delete lastSynced[k];
      continue;
    }
    lastSynced[k] = r;
    if (!localChanged && l !== r) { applyRow(state, k, remote[k]); changed = true; }
    if (base === undefined && l !== undefined && l !== r) { /* creata in entrambi: tiene la locale, la invia */ }
  }
  return { state, changed };
}

async function pull() {
  const { data, error } = await sb.from("kv").select("key,value");
  if (error) throw error;
  const remote = Object.fromEntries(data.map((r) => [r.key, r.value]));
  const res = mergeRemote(hooks.getState(), remote);
  saveSynced();
  if (res.changed) hooks.onRemote(res.state);
}

/** Calcola cosa inviare: righe nuove/cambiate e righe da cancellare. */
export function diff(state) {
  const rows = toRows(state), upserts = [], deletes = [];
  for (const [k, v] of Object.entries(rows)) { const s = stable(v); if (lastSynced[k] !== s) upserts.push({ key: k, value: v, json: s }); }
  for (const k of Object.keys(lastSynced)) if (!(k in rows)) deletes.push(k);
  return { upserts, deletes };
}

async function push() {
  if (!sb || !user) return;
  if (pushing) { await pushing; }
  const { upserts, deletes } = diff(hooks.getState());
  if (!upserts.length && !deletes.length) { if (navigator.onLine !== false) setStatus("synced"); return; }
  setStatus("syncing");
  pushing = (async () => {
    if (upserts.length) {
      const { error } = await sb.from("kv").upsert(upserts.map(({ key, value }) => ({ key, value, updated_at: new Date().toISOString(), updated_by: user.email })));
      if (error) throw error;
      for (const u of upserts) lastSynced[u.key] = u.json;
    }
    if (deletes.length) {
      const { error } = await sb.from("kv").delete().in("key", deletes);
      if (error) throw error;
      for (const k of deletes) delete lastSynced[k];
    }
    saveSynced();
  })();
  try { await pushing; setStatus("synced"); }
  catch (e) { setStatus(navigator.onLine === false ? "offline" : "error", e.message); }
  finally { pushing = null; }
}

/** Da chiamare dopo ogni modifica: invia dopo una breve pausa, raggruppando i tocchi ravvicinati. */
export function schedule(delay = 700) {
  if (!sb || !user) return;
  clearTimeout(timer); timer = setTimeout(push, delay);
}
export function flush() { if (sb && user) { clearTimeout(timer); return push(); } }

function onRealtime(payload) {
  const key = payload.new?.key || payload.old?.key;
  if (!key) return;
  const state = hooks.getState();
  const local = toRows(state)[key];
  const l = local === undefined ? undefined : stable(local);
  if (l !== lastSynced[key]) return; // ho una modifica locale in attesa: vince la mia
  if (payload.eventType === "DELETE") {
    delete lastSynced[key]; saveSynced();
    if (l !== undefined) { applyRow(state, key, null); hooks.onRemote(state); }
    return;
  }
  const r = stable(payload.new.value);
  lastSynced[key] = r; saveSynced();
  if (r !== l) { applyRow(state, key, payload.new.value); hooks.onRemote(state); }
}

async function start() {
  if (started) return;
  started = true;
  try {
    setStatus("syncing");
    await pull();
    channel = sb.channel("kv-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "kv" }, onRealtime)
      .subscribe();
    await push();
    setStatus("synced");
  } catch (e) {
    started = false;
    setStatus(navigator.onLine === false ? "offline" : "error", e.message);
  }
}
function stop() {
  started = false; clearTimeout(timer);
  if (channel) { sb.removeChannel(channel); channel = null; }
}

// ------------------------------------------------------------------ init e login
export async function init(h, opts = {}) {
  hooks = { ...hooks, ...h };
  if (opts.storage !== undefined) storage = opts.storage;
  loadSynced();
  if (!enabled && !opts.client) { setStatus("local"); return; }
  try {
    sb = opts.client || (await import(SUPABASE_JS)).createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (e) {
    setStatus("offline", "Libreria Supabase non raggiungibile"); return; // primo avvio senza rete: si lavora in locale
  }
  sb.auth.onAuthStateChange((_ev, session) => {
    const had = Boolean(user);
    user = session?.user || null;
    if (user && !had) setTimeout(start, 0);
    if (!user) { stop(); setStatus("signed-out"); }
  });
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  if (user) await start(); else setStatus("signed-out");

  globalThis.addEventListener?.("online", () => { if (user) { started ? pull().then(push).catch(() => {}) : start(); } });
  globalThis.addEventListener?.("offline", () => setStatus("offline"));
  globalThis.document?.addEventListener("visibilitychange", () => {
    if (!user) return;
    if (document.visibilityState === "hidden") flush();
    else if (started) pull().then(push).catch(() => {}); // al rientro nell'app riallinea
  });
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signOut() {
  await flush();
  await sb.auth.signOut();
  lastSynced = {}; saveSynced();
}
/** Solo per i test. */
export const _test = { reset: () => { lastSynced = {}; }, get lastSynced() { return lastSynced; }, set lastSynced(v) { lastSynced = v; } };
