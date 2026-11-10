// Regole del menu su molte settimane generate a caso.
import { app, ok, done } from "./helpers.mjs";
const { load } = await app("js/store.js");
const { generateWeek, key } = await app("js/planner.js");
const { weekDays, addDays } = await app("js/util.js");
let piatti = 0, viol = [], protRep = 0; const n = 300;
for (let i = 0; i < n; i++) {
  const s = load(null), w = addDays("2026-11-02", 7 * (i % 10)), p = generateWeek(s, w);
  const R = (id) => s.recipes.find((x) => x.id === id);
  const cene = weekDays(w).map((d) => p.slots[key(d, "cena")]);
  cene.forEach((c, j) => {
    const r = R(c.recipeId);
    if (j === 5 && !r.special) viol.push("sabato senza speciale");
    if (j === 4 && !(r.tags || []).includes("pizza")) viol.push("venerdì senza pizza");
    if (j < 5 && r.special) viol.push("speciale in settimana");
    if (r.role === "piatto" && !r.special && !(r.tags || []).includes("pizza")) piatti++;
    if (j > 0 && R(cene[j - 1].recipeId).protein && R(cene[j - 1].recipeId).protein === r.protein) protRep++;
    if (r.meal !== "cena") viol.push("pranzo a cena");
    if (r.role === "proteina" && !c.sideId) viol.push("proteina senza contorno");
  });
  for (const who of s.settings.people) for (const d of weekDays(w)) {
    const sl = p.slots[key(d, "pranzo", who)]; if (!sl) { viol.push("pranzo mancante"); continue; }
    const r = R(sl.recipeId); if (r.people && !r.people.includes(who)) viol.push("pranzo della persona sbagliata");
    if (/ceci/i.test(JSON.stringify(r.ingredients))) viol.push("ceci");
  }
}
ok(viol.length === 0, `nessuna regola violata in ${n} settimane ${viol.length ? JSON.stringify([...new Set(viol)]) : ""}`);
ok(piatti / n > 0.5 && piatti / n < 1.6, `circa un piatto completo a settimana (${(piatti / n).toFixed(2)})`);
ok(protRep / n < 0.1, `stessa proteina due sere di fila quasi mai (${(protRep / n).toFixed(2)})`);
done("menu");
