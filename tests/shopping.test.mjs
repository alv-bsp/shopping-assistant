// Lista della spesa: corrisponde sempre al menu che si vede, anche dopo rigenera, cambi e spunte.
import { app, ok, done } from "./helpers.mjs";
const store = await app("js/store.js"), pl = await app("js/planner.js"), sh = await app("js/shopping.js");
const { weekDays } = await app("js/util.js");
const wk = "2026-11-09", days = weekDays(wk), WED = days[2];
const R = (s, id) => s.recipes.find((r) => r.id === id);
const label = (r, v) => (r.variants && v != null ? `${r.title} (${r.variants[v]?.name})` : r.title);
/** Etichette dei piatti che la lista dovrebbe coprire: da oggi in poi, non fatti, non fuori, per chi c'è. */
function expected(s, now) {
  const p = store.plan(s, wk), out = new Set();
  for (const [k, sl] of Object.entries(p.slots)) {
    const [d, meal, who] = k.split("|");
    if (d < now || sl.status === "fuori" || sl.status === "done") continue;
    const home = store.presentOn(s, wk, d);
    if (meal === "pranzo" ? !home.includes(who) : !home.length) continue;
    out.add(label(R(s, sl.recipeId), sl.variant)); if (sl.sideId) out.add(R(s, sl.sideId).title);
  }
  return out;
}
function check(s, now, what) {
  const L = sh.buildList(s, wk, now).items.filter((i) => !i.recurring && !i.extra && !i.fromPantry);
  const exp = expected(s, now), stray = L.filter((i) => !i.for.some((f) => exp.has(f)));
  ok(stray.length === 0, `${what}: nessuna voce estranea al menu${stray.length ? " → " + stray.map((i) => `${i.name} (${i.for.join(", ")})`).join("; ") : ""}`);
}
// lunedì: menu nuovo, tutto da comprare
const s = store.load(null); pl.generateWeek(s, wk, Math.random, days[0]); check(s, days[0], "dopo Prepara il menu");
// mercoledì: rigenera → lunedì e martedì non cambiano
const p = store.plan(s, wk), past = JSON.stringify([days[0], days[1]].map((d) => p.slots[pl.key(d, "cena")]));
pl.generateWeek(s, wk, Math.random, WED);
ok(JSON.stringify([days[0], days[1]].map((d) => p.slots[pl.key(d, "cena")])) === past, "Rigenera di mercoledì non tocca lunedì e martedì");
check(s, WED, "dopo Rigenera a metà settimana");
// i pasti passati e quelli già fatti non sono in lista
const L = sh.buildList(s, wk, WED).items;
const monOnly = label(R(s, p.slots[pl.key(days[0], "cena")].recipeId)), wedK = pl.key(WED, "cena");
ok(!L.some((i) => i.for.length === 1 && i.for[0] === monOnly), "la cena di lunedì non è più in lista mercoledì");
pl.markDone(s, wk, wedK); check(s, WED, "dopo Fatto");
// cambi singoli, contorni, varianti, fuori, presenze
for (let i = 0; i < 40; i++) {
  const d = days[2 + (i % 5)], ks = [pl.key(d, "cena"), pl.key(d, "pranzo", "Alessandro"), pl.key(d, "pranzo", "Giulia")];
  const k = ks[i % 3], cur = p.slots[k];
  if (i % 7 === 0 && cur?.sideId) pl.swapPart(s, wk, k, "side");
  else if (i % 11 === 0) p.slots[k] = { status: "fuori", locked: true, ...(cur ? { prev: cur } : {}) };
  else if (i % 13 === 0) { p.dayPeople = { ...(p.dayPeople || {}), [d]: ["Giulia"] }; pl.syncPresence(s, wk, [d]); }
  else { const n = pl.pickForSlot(s, wk, k, { exclude: cur?.recipeId ? [cur.recipeId] : [] }); if (n) p.slots[k] = n; }
}
check(s, WED, "dopo 40 cambi a caso");
// spunte: se dopo un cambio serve di più, la voce torna da prendere
const s2 = store.load(null), p2 = store.plan(s2, wk); pl.generateWeek(s2, wk, Math.random, days[0]);
// una voce che viene da una cena, per poterla raddoppiare aggiungendo la stessa cena altre due sere
const kk = Object.keys(p2.slots).find((k) => k.endsWith("cena") && k >= days[0] && p2.slots[k].recipeId && !p2.slots[k].sideId &&
  R(s2, p2.slots[k].recipeId).ingredients.some((g) => g.qty != null && !s2.pantry.some((x) => x.name === g.name)));
const extra = { ...p2.slots[kk] }, dish = label(R(s2, extra.recipeId), extra.variant);
const it = sh.buildList(s2, wk, days[0]).items.find((i) => i.qty && i.for.includes(dish));
p2.checked[it.key] = it.qty;
ok(sh.buildList(s2, wk, days[0]).items.find((i) => i.key === it.key).checked, "spuntata: risulta presa");
p2.slots[pl.key(days[6], "cena")] = extra; p2.slots[pl.key(days[5], "cena")] = extra; // più cene con gli stessi ingredienti
const after = sh.buildList(s2, wk, days[0]).items.find((i) => i.key === it.key);
ok(after.qty > it.qty && !after.checked, `se ne serve di più (${it.qty} → ${after.qty} ${it.unit} di ${it.name}) torna da prendere`);
done("lista della spesa");
