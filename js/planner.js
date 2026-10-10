// Generatore del menu settimanale. Regole di casa:
// - pranzo = carboidrati (pasta & co.), cena = proteine: le ricette hanno meal "pranzo" | "cena"
// - lun-ven sforzo massimo configurabile; i piatti facili hanno un piccolo bonus (Alessandro)
// - N cene a settimana sono "sorprese" prese dalle ricette da provare (Giulia)
// - niente ripetizioni ravvicinate, niente stessa proteina due cene di fila
import { weekDays, addDays, daysBetween, isWeekend, dayIndex } from "./util.js";
import { plan as getPlan } from "./store.js";

export const MEALS = ["pranzo", "cena"];
export const key = (date, meal) => `${date}|${meal}`;
export const splitKey = (k) => { const [date, meal] = k.split("|"); return { date, meal }; };

const byId = (state) => Object.fromEntries(state.recipes.map((r) => [r.id, r]));

/** Date in cui una ricetta è stata fatta o pianificata (storia + piani di altre settimane). */
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

function score(state, r, ctx) {
  const { date, meal, slots, rng, settings, wk } = ctx;
  let s = rng() * 3;
  // già usata in questa settimana
  const usedDates = Object.entries(slots).filter(([k, v]) => v.recipeId === r.id && k !== key(date, meal)).map(([k]) => splitKey(k).date);
  s -= usedDates.length * (meal === "cena" ? 10 : 2.5);
  if (usedDates.some((d) => Math.abs(daysBetween(d, date)) <= 1)) s -= 20; // mai due giorni di fila
  // recenza rispetto alle altre settimane
  const gaps = usageDates(state, r.id, wk).map((d) => Math.abs(daysBetween(d, date)));
  if (gaps.length) {
    const g = Math.min(...gaps);
    if (g < settings.noRepeatDays) s -= ((settings.noRepeatDays - g) / settings.noRepeatDays) * 4;
  }
  // stessa proteina della cena del giorno prima / dopo
  if (meal === "cena" && r.protein) {
    for (const d of [addDays(date, -1), addDays(date, 1)]) {
      const o = slots[key(d, "cena")];
      const or = o && state.recipes.find((x) => x.id === o.recipeId);
      if (or?.protein === r.protein) s -= 2;
    }
  }
  // gradimento
  for (const rt of r.ratings || []) s += rt.v > 0 ? 0.4 : -1.5;
  // sforzo
  if (!isWeekend(date) && r.effort === 1) s += 0.8;
  if (isWeekend(date) && r.effort >= 2) s += 0.3;
  return s;
}

function eligible(r, meal, date, settings, pool) {
  if (r.meal !== meal) return false;
  if (pool === "surprise" ? r.status !== "da provare" : r.status !== "rotazione") return false;
  if (pool !== "surprise" && !isWeekend(date) && r.effort > settings.maxEffortWeekday) return false;
  return true;
}

function pickVariant(r, slots, rng) {
  if (!r.variants?.length) return null;
  const used = Object.values(slots).filter((s) => s.recipeId === r.id).map((s) => s.variant);
  const fresh = r.variants.map((_, i) => i).filter((i) => !used.includes(i));
  const opts = fresh.length ? fresh : r.variants.map((_, i) => i);
  return opts[Math.floor(rng() * opts.length)];
}

/**
 * Sceglie una ricetta per uno slot.
 * pool: "rotazione" | "surprise". exclude: id da evitare (es. quello attuale, per il "cambia").
 * Ritorna lo slot oppure null se non c'è niente di adatto.
 */
export function pickForSlot(state, wk, date, meal, { pool = "rotazione", exclude = [], rng = Math.random, slots } = {}) {
  const settings = state.settings;
  const p = getPlan(state, wk);
  slots = slots || p.slots;
  let cands = state.recipes.filter((r) => eligible(r, meal, date, settings, pool) && !exclude.includes(r.id));
  if (!cands.length && pool === "surprise") return null;
  if (!cands.length) cands = state.recipes.filter((r) => r.meal === meal && r.status === "rotazione" && !exclude.includes(r.id));
  if (!cands.length) return null;
  const ctx = { date, meal, slots, rng, settings, wk };
  const best = cands.map((r) => ({ r, s: score(state, r, ctx) })).sort((a, b) => b.s - a.s)[0].r;
  return { recipeId: best.id, variant: pickVariant(best, slots, rng), status: "planned", surprise: pool === "surprise", locked: false };
}

/** Giorni in cui cadono le sorprese automatiche (prima il giorno scelto, poi altri a scalare). */
export function surpriseDates(wk, settings) {
  const order = [settings.surpriseDay, 2, 6, 4, 0, 3, 1, 5].filter((v, i, a) => a.indexOf(v) === i);
  return order.slice(0, settings.surprisesPerWeek).map((i) => addDays(wk, i));
}

/** (Ri)genera la settimana. Gli slot bloccati, fatti o "fuori casa" restano com'erano. */
export function generateWeek(state, wk, rng = Math.random) {
  const p = getPlan(state, wk);
  const keep = Object.fromEntries(Object.entries(p.slots).filter(([, s]) => s.locked || s.status === "done" || s.status === "fuori"));
  const slots = { ...keep };
  const surprise = new Set(surpriseDates(wk, state.settings));
  const alreadySurprise = Object.values(keep).some((s) => s.surprise);
  // prima le sorprese (così il resto della settimana si adatta), poi le cene, poi i pranzi
  const order = [];
  for (const d of weekDays(wk)) if (surprise.has(d) && !alreadySurprise) order.push([d, "cena", "surprise"]);
  for (const meal of ["cena", "pranzo"]) for (const d of weekDays(wk)) order.push([d, meal, "rotazione"]);
  for (const [d, meal, pool] of order) {
    const k = key(d, meal);
    if (slots[k]) continue;
    const s = pickForSlot(state, wk, d, meal, { pool, rng, slots });
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
  const r = state.recipes.find((x) => x.id === s.recipeId);
  s.status = done ? "done" : "planned";
  if (r) {
    r.history = (r.history || []).filter((d) => d !== date);
    if (done) r.history.push(date);
  }
}

export { byId, dayIndex };
