// Stato dell'app. Copia locale in localStorage (load/save); la sincronizzazione con Supabase sta in sync.js.
import seed from "./seed.js";

const KEY = "food-app-v1";

export const DEFAULT_SETTINGS = {
  people: ["Alessandro", "Giulia"],
  specialDay: 5,         // giorno della cena "speciale" (ricetta vera). 0 = lunedì ... 6 = domenica, -1 = nessuna
  surpriseEvery: 2,      // la speciale è una ricetta nuova ogni N settimane (1 = sempre, 0 = mai)
  pizzaDay: 4,           // giorno della pizza surgelata, -1 = nessuno
  maxEffortWeekday: 2,   // sforzo massimo lun-ven
  noRepeatDays: 10,      // giorni prima di riproporre lo stesso piatto
  avoid: ["ceci"],       // ingredienti da evitare: le ricette che li contengono non vengono proposte
};
// ricette del seed riscritte in una certa versione (oltre alla riscrittura completa della v2)
const REFRESHED = { 3: ["new-insalata-quinoa"] };

function fresh() {
  const s = structuredClone(seed);
  return {
    seedVersion: seed.version,
    recipes: s.recipes,
    pantry: s.pantry,
    recurring: s.recurring,  // spesa fissa: entra in lista ogni settimana
    plans: {},        // { [weekKey]: { slots: {"YYYY-MM-DD|cena" | "YYYY-MM-DD|pranzo|Giulia": slot}, checked, extras, boughtPantry, skipRecurring } }
    storeOf: {},      // { [nome ingrediente minuscolo]: "Esselunga" | "Iperal" }
    inbox: [],        // link o testi di ricette da importare: { id, url, text, at, status: "nuovo"|"importato"|"scartato", recipeId, reason }
    deleted: [],      // id di ricette del seed eliminate a mano: non vanno ripristinate dai seed successivi
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Segna come importati/scartati i link dell'inbox che il seed ha trasformato in ricette (vedi tools/IMPORT.md). */
function applyImports(s) {
  const done = Object.fromEntries((seed.imports?.done || []).map((x) => [x.inboxId, x]));
  const skipped = Object.fromEntries((seed.imports?.skipped || []).map((x) => [x.inboxId, x]));
  for (const it of s.inbox) {
    if (it.status !== "nuovo") continue;
    if (done[it.id]) { it.status = "importato"; it.recipeId = done[it.id].recipeId; }
    else if (skipped[it.id]) { it.status = "scartato"; it.reason = skipped[it.id].reason; }
  }
}

// campi "strutturali" che arrivano dal seed; stato, storia e voti restano quelli dell'utente
const SEED_FIELDS = ["title", "meal", "role", "special", "people", "serves", "effort", "time", "protein", "ingredients", "variants", "steps", "tags", "url", "note", "source"];

export function migrate(s) {
  const v = s.seedVersion || 0;
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.plans ||= {}; s.storeOf ||= {}; s.pantry ||= []; s.inbox ||= []; s.deleted ||= [];
  if (v < seed.version) {
    const byId = Object.fromEntries(s.recipes.map((r) => [r.id, r]));
    for (const sr of seed.recipes) {
      const r = byId[sr.id];
      if (!r) { if (!s.deleted.includes(sr.id)) s.recipes.push(structuredClone(sr)); continue; }
      const refresh = v < 2 || Object.entries(REFRESHED).some(([ver, ids]) => v < Number(ver) && ids.includes(sr.id));
      if (refresh) { // v2: nuovo modello (cene componibili, pranzi per persona): aggiorna le ricette di base
        for (const f of SEED_FIELDS) { if (sr[f] === undefined) delete r[f]; else r[f] = structuredClone(sr[f]); }
      }
    }
    const have = new Set(s.pantry.map((x) => x.name.toLowerCase()));
    for (const x of seed.pantry) if (!have.has(x.name.toLowerCase())) s.pantry.push({ ...x });
    if (v >= 2 && v < 5) {
      // v5: alcune cose passano dalla spesa fissa alla dispensa (c'è / quasi finito / manca, senza quantità), altre si tolgono
      const move = new Set(["coca cola zero (10 lattine)", "cornetti tre marie", "fonzies multipack", "pan bauletto bianco", "sottilette light", "philadelphia light"]);
      const drop = new Set(["kinder pinguì", "mozzarella light"]);
      s.recurring = (s.recurring || []).filter((x) => !move.has(x.name.toLowerCase()) && !drop.has(x.name.toLowerCase()));
      for (const x of s.pantry) { delete x.qty; delete x.unit; }
    }
    if (v < 2) {
      s.recurring ||= structuredClone(seed.recurring);
      if ("surpriseDay" in s.settings) s.settings.specialDay = s.settings.surpriseDay;
      delete s.settings.surpriseDay; delete s.settings.surprisesPerWeek;
      // i vecchi pranzi erano unici: diventano di Alessandro; le vecchie varianti delle spinacine non esistono più
      for (const p of Object.values(s.plans)) {
        for (const [k, slot] of Object.entries(p.slots || {})) {
          const [date, meal, who] = k.split("|");
          if (meal === "pranzo" && !who) { delete p.slots[k]; p.slots[`${date}|pranzo|${s.settings.people[0]}`] = slot; }
          if (slot.recipeId === "spinacine-contorno") slot.variant = null;
        }
      }
    }
    s.seedVersion = seed.version;
  }
  s.recurring ||= [];
  applyImports(s);
  return s;
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.recipes)) return migrate(s); }
  } catch (e) { console.warn("Stato non leggibile, riparto dal seed", e); }
  return fresh();
}

export function save(state, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { console.error("Salvataggio fallito", e); return false; }
}

export const reset = () => fresh();

export function importBackup(json) {
  const s = typeof json === "string" ? JSON.parse(json) : json;
  if (!s || !Array.isArray(s.recipes)) throw new Error("File non valido: mancano le ricette");
  return migrate(s);
}

/**
 * Chi è a casa in un giorno. Il piano della settimana ha `people` (chi c'è di solito quella settimana)
 * e `dayPeople` (eccezioni per singolo giorno). Senza indicazioni: tutti.
 */
export function presentOn(state, wk, date) {
  const p = state.plans[wk], all = state.settings.people;
  const who = p?.dayPeople?.[date] ?? p?.people ?? all;
  return all.filter((x) => who.includes(x));
}

export function plan(state, wk) {
  return (state.plans[wk] ||= { slots: {}, checked: {}, extras: [], boughtPantry: {}, skipRecurring: {} });
}
