// Generatore del menu settimanale. Regole di casa:
// - pranzi per persona: Alessandro pasta/tortellini, Giulia zuppa pronta o insalata di riso (recipe.people)
// - cena = proteine. Di solito "componibile": una proteina + un contorno (role "proteina" / "contorno")
//   oppure un piatto completo facile (tacos, hamburger nel panino).
// - una cena speciale a settimana (ricetta vera: HelloFresh o nuova); ogni N settimane è una sorpresa da provare
// - pizza surgelata nel giorno scelto
// - lun-ven sforzo massimo configurabile; niente ripetizioni ravvicinate; niente stessa proteina due sere di fila
import { weekDays, addDays, daysBetween, isWeekend, dayIndex } from "./util.js";
import { plan as getPlan } from "./store.js";

/** Chiave di uno slot: "data|cena" oppure "data|pranzo|Persona". */
export const key = (date, meal, person) => (meal === "pranzo" ? `${date}|pranzo|${person}` : `${date}|${meal}`);
export const splitKey = (k) => { const [date, meal, person] = k.split("|"); return { date, meal, person: person || null }; };
/** Righe di un giorno, nell'ordine in cui si mostrano. */
export const dayRows = (settings) => [...settings.people.map((p) => ["pranzo", p]), ["cena", null]];

const isPizza = (r) => (r.tags || []).includes("pizza");
const forPerson = (r, person) => !r.people?.length || r.people.includes(person);
const slotsOf = (slots, pred) => Object.entries(slots).filter(([k, v]) => pred(splitKey(k), v));

/** Date in cui una ricetta è stata fatta o pianificata in altre settimane. */
function usageDates(state, recipeId, excludeWeek) {
  const out = [];
  for (const [wk, p] of Object.entries(state.plans)) {
    if (wk === excludeWeek) continue;
    for (const [k, s] of Object.entries(p.slots || {})) if (s.recipeId === recipeId && s.status !== "fuori") out.push(splitKey(k).date);
  }
  const r = state.recipes.find((x) => x.id === recipeId);
  if (r?.history) out.push(...r.history);
  return out;
}
function recency(state, r, date, wk, weight = 4) {
  const gaps = usageDates(state, r.id, wk).map((d) => Math.abs(daysBetween(d, date)));
  if (!gaps.length) return 0;
  const g = Math.min(...gaps), n = state.settings.noRepeatDays;
  return g < n ? -((n - g) / n) * weight : 0;
}
const ratingScore = (r) => (r.ratings || []).reduce((a, x) => a + (x.v > 0 ? 0.4 : -1.5), 0);

/** Contiene un ingrediente da evitare (impostazione "avoid", match sul nome)? */
export function hasAvoided(settings, ingredients) {
  const terms = (settings.avoid || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  return terms.length > 0 && (ingredients || []).some((i) => terms.some((t) => i.name.toLowerCase().includes(t)));
}
let AVOID = null; // impostazioni correnti, per pickVariant
const avoidedRecipe = (state, r) => hasAvoided(state.settings, r.ingredients);

function pickVariant(r, slots, rng) {
  if (!r.variants?.length) return null;
  const used = Object.values(slots).filter((s) => s.recipeId === r.id).map((s) => s.variant);
  const allowed = r.variants.map((_, i) => i).filter((i) => !AVOID || !hasAvoided(AVOID, r.variants[i].ingredients));
  const all = allowed.length ? allowed : r.variants.map((_, i) => i);
  const fresh = all.filter((i) => !used.includes(i));
  const opts = fresh.length ? fresh : all;
  return opts[Math.floor(rng() * opts.length)];
}
const best = (cands) => cands.sort((a, b) => b.s - a.s)[0];

// ------------------------------------------------------------------ pranzi
function pickLunch(state, wk, date, person, { pool, exclude, rng, slots }) {
  const mine = slotsOf(slots, (s) => s.meal === "pranzo" && s.person === person);
  const statusOf = (id) => state.recipes.find((x) => x.id === id)?.status;
  const hasNovelty = mine.some(([k, v]) => splitKey(k).date !== date && statusOf(v.recipeId) === "da provare");
  // in settimana il pranzo dev'essere veloce (sforzo 1); al massimo una novità facile a settimana a testa
  const cands = state.recipes.filter((r) => r.meal === "pranzo" && forPerson(r, person) && !exclude.includes(r.id) && !avoidedRecipe(state, r) &&
    (pool === "surprise" ? r.status === "da provare"
      : r.status === "rotazione" || (r.status === "da provare" && r.effort <= 1 && !hasNovelty)) &&
    (pool === "surprise" || isWeekend(date) || r.effort <= 1));
  if (!cands.length) return null;
  const scored = cands.map((r) => {
    const nv = r.variants?.length || 1;
    let s = rng() * 3 + ratingScore(r) + recency(state, r, date, wk) / nv;
    if (r.status === "da provare" && pool !== "surprise") s -= 2.5;
    for (const [k, v] of mine) {
      if (v.recipeId !== r.id || splitKey(k).date === date) continue;
      s -= 2.5 / nv;
      if (Math.abs(daysBetween(splitKey(k).date, date)) <= 1) s -= nv > 1 ? 1 : 20; // stessa cosa due giorni di fila
    }
    if (r.effort === 1 && !isWeekend(date)) s += 0.5;
    return { r, s };
  });
  const r = best(scored).r;
  return { recipeId: r.id, variant: pickVariant(r, Object.fromEntries(mine), rng), status: "planned", surprise: pool === "surprise", locked: false };
}

// ------------------------------------------------------------------ cene
function dinnerContext(state, slots, date) {
  const R = (id) => state.recipes.find((x) => x.id === id);
  const others = slotsOf(slots, (s) => s.meal === "cena" && s.date !== date).map(([k, v]) => ({ date: splitKey(k).date, v, r: R(v.recipeId) }));
  const near = others.filter((o) => Math.abs(daysBetween(o.date, date)) === 1);
  return { others, near };
}

function scoreDish(state, r, date, wk, rng, ctx) {
  let s = rng() * 3 + ratingScore(r) + recency(state, r, date, wk);
  s -= ctx.others.filter((o) => o.v.recipeId === r.id).length * 10;
  if (r.protein && ctx.near.some((o) => o.r?.protein === r.protein)) s -= 2;
  return s;
}

function pickSpecial(state, wk, date, { surprise, exclude, rng, slots }) {
  const ctx = dinnerContext(state, slots, date);
  const pool = (status) => state.recipes.filter((r) => r.meal === "cena" && r.special && r.status === status && !exclude.includes(r.id) && !avoidedRecipe(state, r));
  let cands = surprise ? pool("da provare") : [];
  const isSurprise = cands.length > 0;
  if (!cands.length) cands = pool("rotazione");
  if (!cands.length) return null;
  const r = best(cands.map((r) => ({ r, s: scoreDish(state, r, date, wk, rng, ctx) }))).r;
  return { recipeId: r.id, variant: pickVariant(r, slots, rng), status: "planned", surprise: isSurprise, special: true, locked: false };
}

let DISH_BONUS = 1.4; // taratura: ~1 piatto completo (tacos, hamburger nel panino) a settimana
export const _tune = (v) => { DISH_BONUS = v; };
/** Cena normale: proteina + contorno, oppure un piatto completo facile. */
function pickEveryday(state, wk, date, { exclude, rng, slots, keepProtein = null, keepSide = null }) {
  const st = state.settings;
  const ctx = dinnerContext(state, slots, date);
  const ok = (r) => r.meal === "cena" && r.status === "rotazione" && !r.special && !isPizza(r) && !exclude.includes(r.id) && !avoidedRecipe(state, r) &&
    (isWeekend(date) || r.effort <= st.maxEffortWeekday);
  const proteins = keepProtein ? [keepProtein] : state.recipes.filter((r) => r.role === "proteina" && ok(r));
  const sides = keepSide ? [keepSide] : state.recipes.filter((r) => r.role === "contorno" && ok(r));
  const dishes = keepProtein || keepSide ? [] : state.recipes.filter((r) => r.role === "piatto" && ok(r));

  const sideUse = (id) => ctx.others.filter((o) => o.v.sideId === id).length;
  const sideNear = (id) => ctx.near.some((o) => o.v.sideId === id);
  const cands = [];
  const pScore = Object.fromEntries(proteins.map((p) => [p.id, scoreDish(state, p, date, wk, rng, ctx) - 0.0]));
  for (const p of proteins) {
    for (const c of sides) {
      let s = pScore[p.id] + rng() * 1.5 - sideUse(c.id) * 3 - (sideNear(c.id) ? 4 : 0);
      if (!isWeekend(date) && c.time > 30) s -= 1; // forno lungo meglio nel weekend
      if (p.title.toLowerCase().includes(c.title.toLowerCase())) s -= 4; // niente "burger agli spinaci + spinaci"
      cands.push({ s, slot: { recipeId: p.id, sideId: c.id, variant: null } });
    }
  }
  // i piatti completi competono con il miglior abbinamento: circa uno a settimana
  for (const d of dishes) cands.push({ s: scoreDish(state, d, date, wk, rng, ctx) + DISH_BONUS, slot: { recipeId: d.id, variant: pickVariant(d, slots, rng) } });
  if (!cands.length) return null;
  return { ...best(cands).slot, status: "planned", surprise: false, locked: false };
}

function pickPizza(state, exclude) {
  const r = state.recipes.find((x) => x.meal === "cena" && isPizza(x) && x.status !== "scartata" && !exclude.includes(x.id) && !avoidedRecipe(state, x));
  return r ? { recipeId: r.id, variant: null, status: "planned", surprise: false, locked: false } : null;
}

/** Settimana con sorpresa? Con surpriseEvery = 2 si alternano: una settimana ricetta nuova, una un classico. */
export function isSurpriseWeek(wk, settings) {
  const n = settings.surpriseEvery;
  if (!n) return false;
  const weekNo = Math.round((Date.UTC(...wk.split("-").map((x, i) => (i === 1 ? x - 1 : +x))) / 864e5 + 3) / 7);
  return weekNo % n === 0;
}

/**
 * Sceglie cosa mettere in uno slot.
 * mode: "auto" (dipende dal giorno), "surprise" (ricetta da provare), "everyday" (cena normale)
 */
export function pickForSlot(state, wk, k, { mode = "auto", exclude = [], rng = Math.random, slots } = {}) {
  const { date, meal, person } = splitKey(k);
  slots = slots || getPlan(state, wk).slots;
  AVOID = state.settings;
  if (meal === "pranzo") return pickLunch(state, wk, date, person, { pool: mode === "surprise" ? "surprise" : "rotazione", exclude, rng, slots });
  const st = state.settings, di = dayIndex(date);
  if (mode === "surprise") return pickSpecial(state, wk, date, { surprise: true, exclude, rng, slots });
  if (mode === "auto" && di === st.specialDay) return pickSpecial(state, wk, date, { surprise: isSurpriseWeek(wk, st), exclude, rng, slots });
  if (mode === "auto" && di === st.pizzaDay) return pickPizza(state, exclude) || pickEveryday(state, wk, date, { exclude, rng, slots });
  return pickEveryday(state, wk, date, { exclude, rng, slots });
}

/** Cambia solo il contorno (o solo la proteina) di una cena componibile. */
export function swapPart(state, wk, k, part, rng = Math.random) {
  const p = getPlan(state, wk), cur = p.slots[k];
  if (!cur?.sideId) return null;
  const R = (id) => state.recipes.find((x) => x.id === id);
  const slots = { ...p.slots }; delete slots[k];
  const { date } = splitKey(k);
  const next = part === "side"
    ? pickEveryday(state, wk, date, { exclude: [cur.sideId], rng, slots, keepProtein: R(cur.recipeId) })
    : pickEveryday(state, wk, date, { exclude: [cur.recipeId], rng, slots, keepSide: R(cur.sideId) });
  if (next) p.slots[k] = { ...cur, recipeId: next.recipeId, sideId: next.sideId };
  return next;
}

/** Completa una cena componibile scelta a mano: data la proteina trova il contorno (o viceversa). */
export function pickPart(state, wk, k, { keepProtein = null, keepSide = null, rng = Math.random } = {}) {
  const p = getPlan(state, wk);
  const slots = { ...p.slots }; delete slots[k];
  return pickEveryday(state, wk, splitKey(k).date, { exclude: [], rng, slots, keepProtein, keepSide });
}

/** (Ri)genera la settimana. Gli slot bloccati, fatti o "fuori casa" restano com'erano. */
export function generateWeek(state, wk, rng = Math.random) {
  const p = getPlan(state, wk);
  const slots = Object.fromEntries(Object.entries(p.slots).filter(([, s]) => s.locked || s.status === "done" || s.status === "fuori"));
  const days = weekDays(wk), st = state.settings;
  const order = [];
  // prima speciale e pizza (giorni fissi), poi le altre cene, poi i pranzi
  for (const d of days) if (dayIndex(d) === st.specialDay || dayIndex(d) === st.pizzaDay) order.push(key(d, "cena"));
  for (const d of days) order.push(key(d, "cena"));
  for (const person of st.people) for (const d of days) order.push(key(d, "pranzo", person));
  for (const k of order) {
    if (slots[k]) continue;
    const s = pickForSlot(state, wk, k, { rng, slots });
    if (s) slots[k] = s;
  }
  p.slots = slots;
  return p;
}

/** Valutazione dopo il pasto. Una ricetta "da provare": 👎 di uno dei due → scartata, altrimenti 👍 → in rotazione. */
export function rate(state, recipeId, date, who, v) {
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return null;
  r.ratings = (r.ratings || []).filter((x) => !(x.date === date && x.who === who));
  if (v) r.ratings.push({ date, who, v });
  // si decide solo per le ricette nuove; _autoFrom permette di correggere il voto lo stesso giorno
  if (r.status !== "da provare" && r._autoFrom !== date) return null;
  const votes = r.ratings.filter((x) => x.date === date);
  const prev = r.status;
  r.status = votes.some((x) => x.v < 0) ? "scartata" : votes.some((x) => x.v > 0) ? "rotazione" : "da provare";
  r._autoFrom = r.status === "da provare" ? undefined : date;
  return r.status !== prev ? r.status : null;
}

export function markDone(state, wk, k, done = true) {
  const p = getPlan(state, wk);
  const s = p.slots[k];
  if (!s) return;
  const { date } = splitKey(k);
  s.status = done ? "done" : "planned";
  for (const id of [s.recipeId, s.sideId]) {
    const r = id && state.recipes.find((x) => x.id === id);
    if (!r) continue;
    r.history = (r.history || []).filter((d) => d !== date);
    if (done) r.history.push(date);
  }
}

export { dayIndex };
