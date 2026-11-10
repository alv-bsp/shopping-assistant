// Due telefoni su un server finto: primo accesso, realtime, conflitti, cancellazioni, offline.
import { app, old, ok, done, mem, sleep } from "./helpers.mjs";
const server = { rows: new Map(), subs: [] };
function fakeClient(email) {
  let authCb = null; const session = { user: { email } };
  const emit = (ev) => setTimeout(() => server.subs.forEach((s) => s.me !== email && s.cb(ev)), 5);
  const q = {
    select: async () => ({ data: [...server.rows.entries()].map(([key, v]) => ({ key, value: JSON.parse(v) })), error: null }),
    upsert: async (rows) => { for (const r of rows) { server.rows.set(r.key, JSON.stringify(r.value)); emit({ eventType: "UPDATE", new: { key: r.key, value: JSON.parse(JSON.stringify(r.value)) } }); } return { error: null }; },
    delete: () => ({ in: async (_c, keys) => { for (const k of keys) { server.rows.delete(k); emit({ eventType: "DELETE", old: { key: k } }); } return { error: null }; } }),
  };
  return { from: () => q,
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: (cb) => { authCb = cb; }, signOut: async () => authCb?.("SIGNED_OUT", null) },
    channel: () => { const ch = { on: (_e, _f, cb) => { server.subs.push({ me: email, cb }); return ch; }, subscribe: () => ch }; return ch; },
    removeChannel: () => {} };
}
const store = await app("js/store.js"), planner = await app("js/planner.js");
const SEEDV = (await app("js/seed.js")).default.version;
async function device(name, email) {
  const sync = await app("js/sync.js", `?${name}`);
  const dev = { sync, state: store.load(null) };
  await sync.init({ getState: () => dev.state, normalize: store.migrate, onRemote: (s) => { dev.state = s; }, onStatus: () => {} }, { client: fakeClient(email), storage: mem() });
  return dev;
}
// server con dati della v1
const o = await old("v1", "js/store.js"), op = await old("v1", "js/planner.js"), os = await old("v1", "js/sync.js");
const v1 = o.load(null); op.generateWeek(v1, "2026-11-02");
for (const [k, v] of Object.entries(os.toRows(v1))) server.rows.set(k, JSON.stringify(v));
const A = await device("A", "a@x"); await A.sync.flush(); await sleep(20);
ok(A.state.seedVersion === SEEDV && JSON.parse(server.rows.get("meta")).seedVersion === SEEDV, "primo accesso: prende i dati v1 dal server, li aggiorna e li rimanda");
const G = await device("G", "g@x");
ok(G.state.recurring.length === 8, "il secondo telefono riceve i dati aggiornati");
planner.generateWeek(A.state, "2026-11-09"); A.sync.schedule(0); await sleep(40);
ok(Object.keys(G.state.plans["2026-11-09"]?.slots || {}).length === 21, "menu nuovo arriva sull'altro telefono");
const [k, slot] = Object.entries(A.state.plans["2026-11-09"].slots).find(([x]) => x.endsWith("cena"));
planner.rate(A.state, slot.recipeId, k.split("|")[0], "Alessandro", 1); A.sync.schedule(0); await sleep(40);
planner.rate(G.state, slot.recipeId, k.split("|")[0], "Giulia", 1); G.sync.schedule(0); await sleep(40);
ok(A.state.recipes.find((r) => r.id === slot.recipeId).ratings.length === 2, "voti dati quasi insieme: restano tutti e due");
A.state.settings.noRepeatDays = 14; G.state.settings.noRepeatDays = 7; G.sync.schedule(0); await sleep(40);
ok(A.state.settings.noRepeatDays === 14, "una modifica non ancora inviata non viene sovrascritta");
G.state.inbox.push({ id: "x1", url: "https://example.com", status: "nuovo", at: "2026-11-10T00:00:00Z" }); G.sync.schedule(0); await sleep(40);
ok(A.state.inbox.some((x) => x.id === "x1"), "link da importare sincronizzato");
const del = G.state.recipes[0].id; G.state.recipes = G.state.recipes.filter((r) => r.id !== del); G.sync.schedule(0); await sleep(40);
ok(!A.state.recipes.some((r) => r.id === del), "cancellazione propagata");
done("sincronizzazione");
