// Lista della spesa: somma gli ingredienti del menu della settimana, toglie la dispensa,
// aggiunge le cose di dispensa finite e gli extra a mano.
import { norm } from "./util.js";
import { plan as getPlan } from "./store.js";

export const CATS = [
  ["verdura", "Frutta e verdura"], ["carne", "Carne e salumi"], ["pesce", "Pesce"],
  ["frigo", "Latticini e frigo"], ["pane", "Pane"], ["dispensa", "Dispensa"],
  ["surgelati", "Surgelati"], ["altro", "Altro"],
];
export const CAT_LABEL = Object.fromEntries(CATS);
export const STORES = ["Ovunque", "Esselunga", "Iperal"];

const PLURAL = { busta: "buste", vasetto: "vasetti", mazzetto: "mazzetti", lattina: "lattine", fetta: "fette" };

export function fmtQty(qty, unit) {
  if (qty == null) return "";
  let q = qty, u = unit;
  if (u === "g" && q >= 1000) { q = q / 1000; u = "kg"; }
  if (u === "ml" && q >= 1000) { q = q / 1000; u = "l"; }
  const n = Number.isInteger(q) ? String(q) : q.toFixed(1).replace(".", ",").replace(",0", "");
  if (q > 1 && PLURAL[u]) u = PLURAL[u];
  return `${n} ${u}`.trim();
}

export const ingredientsOf = (r, variant) =>
  [...(r.ingredients || []), ...((variant != null && r.variants?.[variant]?.ingredients) || [])];

export function buildList(state, wk) {
  const p = getPlan(state, wk);
  const pantryByName = Object.fromEntries(state.pantry.map((x) => [norm(x.name), x]));
  const recipes = Object.fromEntries(state.recipes.map((r) => [r.id, r]));
  const items = new Map();
  const pantryNeeded = new Map();

  for (const s of Object.values(p.slots)) {
    if (s.status === "fuori" || !s.recipeId) continue;
    const r = recipes[s.recipeId];
    if (!r) continue;
    const label = r.variants && s.variant != null ? `${r.title} (${r.variants[s.variant]?.name})` : r.title;
    for (const ing of ingredientsOf(r, s.variant)) {
      const n = norm(ing.name);
      if (pantryByName[n]) {
        const e = pantryNeeded.get(n) || { name: pantryByName[n].name, state: pantryByName[n].state, for: new Set() };
        e.for.add(label); pantryNeeded.set(n, e);
        continue;
      }
      const k = `${n}|${ing.unit || ""}`;
      const e = items.get(k) || { key: k, name: ing.name, unit: ing.unit, qty: null, cat: ing.cat || "altro", for: new Set() };
      if (ing.qty != null) e.qty = (e.qty || 0) + ing.qty;
      e.for.add(label); items.set(k, e);
    }
  }

  // dispensa finita / quasi finita (o appena ricomprata in questa settimana)
  for (const x of state.pantry) {
    const n = norm(x.name);
    if (x.state === "ok" && !p.boughtPantry?.[n]) continue;
    const k = `${n}|`;
    if (items.has(k)) continue;
    items.set(k, { key: k, name: x.name, unit: "", qty: null, cat: "dispensa", fromPantry: true, pantryState: x.state,
      for: new Set(pantryNeeded.get(n) ? [...pantryNeeded.get(n).for] : []) });
  }
  for (const x of p.extras || []) {
    const k = `extra|${x.id}`;
    items.set(k, { key: k, name: x.name, unit: "", qty: null, cat: x.cat || "altro", extra: true, id: x.id, for: new Set() });
  }

  const list = [...items.values()].map((e) => ({
    ...e, for: [...e.for], store: state.storeOf[norm(e.name)] || "Ovunque", checked: !!p.checked?.[e.key],
  }));
  const order = Object.fromEntries(CATS.map(([c], i) => [c, i]));
  list.sort((a, b) => (order[a.cat] ?? 99) - (order[b.cat] ?? 99) || a.name.localeCompare(b.name, "it"));
  return {
    items: list,
    pantryNeeded: [...pantryNeeded.values()].map((e) => ({ ...e, for: [...e.for] }))
      .filter((e) => e.state === "ok").sort((a, b) => a.name.localeCompare(b.name, "it")),
  };
}

export function groupBy(items, mode) {
  const groups = new Map();
  const keyOf = mode === "store" ? (i) => i.store : (i) => i.cat;
  for (const i of items) { const k = keyOf(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  const order = mode === "store" ? STORES : CATS.map(([c]) => c);
  return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([k, v]) => ({ key: k, label: mode === "store" ? k : CAT_LABEL[k] || k, items: v }));
}

export function asText(items, mode = "cat") {
  return groupBy(items.filter((i) => !i.checked), mode)
    .map((g) => `${g.label}\n` + g.items.map((i) => `- ${i.name}${i.qty != null ? " " + fmtQty(i.qty, i.unit) : ""}`).join("\n"))
    .join("\n\n");
}

// --- parsing di ingredienti scritti a mano: "500 g petto di pollo", "2 limoni", "sale"
const UNITS = "kg|g|ml|l|pz|conf|busta|buste|vasetto|vasetti|mazzetto|mazzetti|fette|fetta|lattina|lattine";
const KEYWORDS = [
  ["carne", /pollo|manzo|maiale|vitello|tacchino|salsiccia|macinato|pancetta|guanciale|prosciutto|speck|bresaola|hamburger|bistecca|tagliata|lonza|wurstel/],
  ["pesce", /salmone|tonno fresco|merluzzo|orata|branzino|trota|pesce|gamber|calamar|cozze|vongole|polpo/],
  ["surgelati", /surgelat/],
  ["frigo", /latte|yogurt|mozzarella|burrata|ricotta|formaggio|stracchino|panna|cheddar|pecorino|grana|parmigiano|feta|gnocchi|tortellini|uova/],
  ["pane", /pane|piadin|tortill|wrap|pita|naan|focaccia/],
  ["dispensa", /pasta|riso|farina|olio|aceto|sugo|pesto|passata|tonno|legumi|ceci|fagioli|lenticchie|spezie|salsa|biscott|cracker/],
  ["verdura", /insalata|pomodor|patat|zucchin|carot|cipoll|aglio|limon|lime|aranc|mela|banan|funghi|spinaci|broccol|cavol|peperon|melanzan|finocch|rucola|basilico|prezzemolo|avocado|cetriol|zenzero|frutta|verdur/],
];
export function guessCat(name, knownCats = {}) {
  const n = norm(name);
  if (knownCats[n]) return knownCats[n];
  for (const [c, re] of KEYWORDS) if (re.test(n)) return c;
  return "altro";
}
export function parseIngredientLine(line, knownCats = {}) {
  const t = line.trim().replace(/^[-•*]\s*/, "");
  if (!t) return null;
  const m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})?\\.?\\s+(.+)$`, "i"));
  let qty = null, unit = "", name = t;
  if (m) {
    qty = parseFloat(m[1].replace(",", "."));
    unit = (m[2] || "pz").toLowerCase();
    name = m[3];
    if (unit === "kg") { qty *= 1000; unit = "g"; }
    if (unit === "l") { qty *= 1000; unit = "ml"; }
    unit = { buste: "busta", vasetti: "vasetto", mazzetti: "mazzetto", fetta: "fette", lattine: "lattina" }[unit] || unit;
  }
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return { name, qty, unit, cat: guessCat(name, knownCats) };
}
