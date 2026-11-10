// Dati salvati dalle versioni precedenti (v1, v3) aperti con il codice attuale, e import dei link via seed.
import { app, old, ok, done, mem } from "./helpers.mjs";
const cur = await app("js/store.js");
const SEEDV = (await app("js/seed.js")).default.version;
const open = (s0) => { const m = mem({ "food-app-v1": JSON.stringify(s0) }); return cur.load(m); };

// v1: pranzo unico, spinacine con varianti, impostazioni vecchie
{
  const o = await old("v1", "js/store.js"), op = await old("v1", "js/planner.js");
  const s1 = o.load(null); op.generateWeek(s1, "2026-11-02");
  const k = Object.keys(s1.plans["2026-11-02"].slots).find((x) => x.endsWith("cena"));
  op.markDone(s1, "2026-11-02", k); op.rate(s1, s1.plans["2026-11-02"].slots[k].recipeId, k.split("|")[0], "Giulia", 1);
  s1.recipes.find((r) => r.id === "hf-salmone").status = "scartata";
  const s = open(s1), rid = s1.plans["2026-11-02"].slots[k].recipeId;
  ok(s.seedVersion === SEEDV, `v1 → v${SEEDV}`);
  ok(Object.keys(s.plans["2026-11-02"].slots).filter((x) => x.endsWith("|pranzo|Alessandro")).length === 7, "i vecchi pranzi diventano di Alessandro");
  ok(s.recipes.find((r) => r.id === "hf-salmone").status === "scartata" && s.recipes.find((r) => r.id === rid).ratings.length === 1, "stati, voti e storia restano");
  ok(s.recipes.find((r) => r.id === "spinacine-contorno").role === "proteina" && s.recipes.find((r) => r.id === "hf-cotoletta-di-manzo").special, "ricette di base aggiornate al nuovo modello");
  ok(!s.recipes.some((r) => /ceci/i.test(JSON.stringify(r.ingredients))), "niente ceci");
  ok(JSON.stringify(cur.migrate(JSON.parse(JSON.stringify(s)))) === JSON.stringify(s), "migrazione idempotente");
}
// v3: spesa fissa con prodotti poi spostati in dispensa
{
  const o = await old("v3", "js/store.js"); const s3 = o.load(null);
  s3.pantry.find((x) => x.name === "Burro").state = "finito";
  const s = open(s3);
  ok(s.recurring.length === 8 && !s.recurring.some((x) => /Coca|Pinguì|Mozzarella/.test(x.name)), "spesa fissa ripulita");
  ok(s.pantry.some((x) => x.name === "Coca Cola Zero (10 lattine)") && !s.pantry.some((x) => "qty" in x), "Coca Zero in dispensa, senza quantità");
  ok(s.pantry.find((x) => x.name === "Burro").state === "finito", "stati della dispensa restano");
}
done("migrazioni");
