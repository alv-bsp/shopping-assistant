// Stato dell'app. Per ora vive in localStorage: tutta la persistenza passa da load()/save(),
// così passare a un backend condiviso (es. Supabase) tocca solo questo file.
import seed from "./seed.js";

const KEY = "food-app-v1";

export const DEFAULT_SETTINGS = {
  surprisesPerWeek: 1,   // cene "da provare" inserite in automatico
  surpriseDay: 5,        // 0 = lunedì ... 5 = sabato
  maxEffortWeekday: 2,   // sforzo massimo lun-ven
  noRepeatDays: 10,      // giorni prima di riproporre lo stesso piatto
  people: ["Alessandro", "Giulia"],
};

function fresh() {
  const s = structuredClone(seed);
  return {
    seedVersion: seed.version,
    recipes: s.recipes,
    pantry: s.pantry,
    plans: {},        // { [weekKey]: { slots: {"YYYY-MM-DD|pranzo": slot}, checked: {}, extras: [], boughtPantry: {} } }
    storeOf: {},      // { [nome ingrediente minuscolo]: "Esselunga" | "Iperal" }
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function migrate(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.plans ||= {}; s.storeOf ||= {}; s.pantry ||= [];
  // nuove ricette aggiunte al seed in versioni successive vengono unite senza toccare quelle esistenti
  if ((s.seedVersion || 0) < seed.version) {
    const have = new Set(s.recipes.map((r) => r.id));
    for (const r of seed.recipes) if (!have.has(r.id)) s.recipes.push(structuredClone(r));
    s.seedVersion = seed.version;
  }
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

export function plan(state, wk) {
  return (state.plans[wk] ||= { slots: {}, checked: {}, extras: [], boughtPantry: {} });
}
