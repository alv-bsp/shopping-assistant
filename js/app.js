// UI: rendering con template string + event delegation (data-a = azione al click).
import { load, save, reset, importBackup, plan, migrate } from "./store.js";
import * as sync from "./sync.js";
import { generateWeek, pickForSlot, key, splitKey, rate, markDone, MEALS } from "./planner.js";
import { buildList, groupBy, asText, fmtQty, CATS, CAT_LABEL, STORES, ingredientsOf, parseIngredientLine } from "./shopping.js";
import { weekKey, weekDays, addDays, today, fmtWeek, fmtDay, dayIndex, DAY_SHORT, DAY_LONG, norm, uid, slug, esc } from "./util.js";

let state = load();
// nel weekend, se la settimana in corso è vuota, si parte già dalla prossima (è lì che si pianifica)
const startWeek = dayIndex(today()) >= 5 && !Object.keys(state.plans[weekKey()]?.slots || {}).length ? addDays(weekKey(), 7) : weekKey();
const ui = { tab: "menu", wk: startWeek,listMode: "cat", hideChecked: false, meal: "cena", status: "rotazione", q: "", pantryFilter: "all" };
const $ = (s) => document.querySelector(s);
const R = (id) => state.recipes.find((r) => r.id === id);
const commit = () => { save(state); sync.schedule(); render(); };
const SYNC_LABEL = { synced: "Sincronizzato", syncing: "Sincronizzo…", offline: "Offline: le modifiche partono quando torna la rete", error: "Errore di sincronizzazione", starting: "Avvio…" };

// ---------------------------------------------------------------- helpers
const EFFORT = { 1: "Facile", 2: "Medio", 3: "Impegnativo" };
const dots = (n) => `<span class="dots" title="${EFFORT[n] || ""}">${"●".repeat(n)}${"○".repeat(3 - n)}</span>`;
const MEAL_LABEL = { pranzo: "Pranzo", cena: "Cena" };
const variantName = (r, v) => (r?.variants && v != null ? r.variants[v]?.name : "");
function weekLabel(wk) {
  const d = Math.round((new Date(wk) - new Date(weekKey())) / 6048e5);
  return { 0: "Questa settimana", 1: "Prossima settimana", [-1]: "Settimana scorsa" }[d] || "";
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}
function lastCooked(r) {
  const h = [...(r.history || [])].sort();
  return h.length ? `fatta ${h.length} ${h.length === 1 ? "volta" : "volte"}, ultima ${fmtDay(h.at(-1))}` : "mai fatta";
}
function likes(r) {
  const up = (r.ratings || []).filter((x) => x.v > 0).length, down = (r.ratings || []).filter((x) => x.v < 0).length;
  return up || down ? `<span class="likes">${up ? "👍 " + up : ""}${up && down ? " · " : ""}${down ? "👎 " + down : ""}</span>` : "";
}
const SOURCE = { hellofresh: "HelloFresh", casa: "Di casa", claude: "Nuova", mia: "Aggiunta" };

// ---------------------------------------------------------------- render
function render() {
  const needLogin = sync.enabled && sync.getStatus() === "signed-out";
  document.body.classList.toggle("logged-out", needLogin);
  if (needLogin) { $("#view").innerHTML = viewLogin(); return; }
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === ui.tab ? "page" : "false"));
  const v = { menu: viewMenu, spesa: viewSpesa, ricette: viewRicette, dispensa: viewDispensa }[ui.tab]();
  $("#view").innerHTML = v;
  if (ui.tab === "ricette") renderRecipeList();
}

// un aggiornamento arrivato dall'altro telefono non deve far perdere il focus a chi sta scrivendo
function safeRender() {
  const a = document.activeElement;
  if (a && a.closest("#view") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
    a.addEventListener("blur", () => setTimeout(render, 0), { once: true });
  } else render();
}
function updateSyncDot(st, detail) {
  const d = $("#sync-dot"); if (!d) return;
  d.hidden = st === "local" || st === "signed-out";
  d.dataset.state = st; d.title = SYNC_LABEL[st] + (detail ? `: ${detail}` : "");
}

// ---- Login (solo se Supabase è configurato)
function viewLogin() {
  return `<div class="empty login"><div class="empty-art">🍽️</div><h2>Accedi</h2>
    <p>Una volta per dispositivo. Menu e lista restano sincronizzati fra i vostri telefoni.</p>
    <form class="form" data-form="login">
      <input name="email" type="email" autocomplete="username" required placeholder="Email" aria-label="Email">
      <input name="password" type="password" autocomplete="current-password" required placeholder="Password" aria-label="Password">
      <button class="btn primary big">Entra</button>
    </form></div>`;
}

function weekBar() {
  return `<div class="weekbar">
    <button class="icon-btn" data-a="wk" data-d="-7" aria-label="Settimana precedente">‹</button>
    <div class="weekbar-label"><strong>${fmtWeek(ui.wk)}</strong><small>${weekLabel(ui.wk)}</small></div>
    <button class="icon-btn" data-a="wk" data-d="7" aria-label="Settimana successiva">›</button>
  </div>`;
}

// ---- Menu
function viewMenu() {
  const p = plan(state, ui.wk);
  if (!Object.keys(p.slots).length) {
    return weekBar() + `<div class="empty">
      <div class="empty-art">🍽️</div>
      <h2>Settimana ancora vuota</h2>
      <p>Pranzi con i carboidrati, cene con le proteine, ${state.settings.surprisesPerWeek ? `${state.settings.surprisesPerWeek} sorpresa per Giulia` : "nessuna sorpresa"}. Poi cambi quello che non ti va.</p>
      <button class="btn primary big" data-a="generate">Genera il menu</button>
    </div>`;
  }
  const t = today();
  const days = weekDays(ui.wk).map((d) => `
    <section class="day ${d === t ? "is-today" : ""}" ${d === t ? 'id="today"' : ""}>
      <header><span class="day-name">${DAY_LONG[dayIndex(d)]}</span><span class="day-date">${fmtDay(d)}</span>${d === t ? '<span class="pill accent">Oggi</span>' : ""}</header>
      ${MEALS.map((m) => slotRow(p, d, m)).join("")}
    </section>`).join("");
  return weekBar() + `<div class="days">${days}</div>
    <div class="footer-actions">
      <button class="btn" data-a="generate">↻ Rigenera i non bloccati</button>
      <p class="hint">Tocca un piatto per bloccarlo, cambiarlo, segnarlo come fatto o votarlo.</p>
    </div>`;
}

function slotRow(p, d, m) {
  const k = key(d, m), s = p.slots[k];
  if (!s) return `<div class="slot empty-slot" data-a="pick" data-k="${k}"><div class="slot-meal">${MEAL_LABEL[m]}</div><div class="slot-body"><div class="slot-title muted">+ Scegli un piatto</div></div></div>`;
  if (s.status === "fuori") return `<div class="slot is-out" data-a="slot" data-k="${k}"><div class="slot-meal">${MEAL_LABEL[m]}</div><div class="slot-body"><div class="slot-title">Fuori casa</div></div></div>`;
  const r = R(s.recipeId);
  if (!r) return "";
  const vn = variantName(r, s.variant);
  const badges = [s.surprise ? '<span class="pill surprise">✨ Sorpresa</span>' : "", r.status === "da provare" && !s.surprise ? '<span class="pill surprise">Nuova</span>' : ""].join("");
  const right = s.status === "done" ? '<span class="state done" aria-label="Fatto">✓</span>'
    : s.locked ? '<span class="state" aria-label="Bloccato">🔒</span>'
    : `<button class="icon-btn reroll" data-a="reroll" data-k="${k}" aria-label="Cambia piatto">↻</button>`;
  return `<div class="slot ${s.status === "done" ? "is-done" : ""}" data-a="slot" data-k="${k}">
    <div class="slot-meal">${MEAL_LABEL[m]}</div>
    <div class="slot-body">
      <div class="slot-title">${esc(r.title)}</div>
      <div class="slot-meta">${vn ? `<span>${esc(vn)}</span>` : ""}${dots(r.effort)}${r.time ? `<span>${r.time}′</span>` : ""}${badges}</div>
    </div>${right}
  </div>`;
}

// ---- Spesa
function viewSpesa() {
  const { items, pantryNeeded } = buildList(state, ui.wk);
  const p = plan(state, ui.wk);
  if (!Object.keys(p.slots).length && !items.length) {
    return weekBar() + `<div class="empty"><div class="empty-art">🛒</div><h2>Niente in lista</h2><p>La lista si compila da sola dal menu della settimana.</p><button class="btn primary" data-a="tab" data-tab-to="menu">Vai al menu</button></div>`;
  }
  const visible = ui.hideChecked ? items.filter((i) => !i.checked) : items;
  const todo = items.filter((i) => !i.checked).length;
  const groups = groupBy(visible, ui.listMode === "store" ? "store" : "cat").map((g) => `
    <section class="group"><h3>${esc(g.label)} <span>${g.items.length}</span></h3>
      ${g.items.map(itemRow).join("")}
    </section>`).join("");
  const pantry = pantryNeeded.length ? `
    <details class="pantry-check">
      <summary>Da controllare in dispensa <span class="pill">${pantryNeeded.length}</span></summary>
      <p class="hint">Le dai per presenti. Se una manca, toccala e finisce in lista.</p>
      ${pantryNeeded.map((x) => `<div class="row"><div><div>${esc(x.name)}</div><small class="muted">${esc(x.for.join(", "))}</small></div><button class="btn small" data-a="pantry-missing" data-name="${esc(x.name)}">Manca</button></div>`).join("")}
    </details>` : "";
  return weekBar() + `
    <div class="list-head">
      <div class="list-count"><strong>${todo}</strong> da prendere${items.length - todo ? ` · ${items.length - todo} presi` : ""}</div>
      <div class="list-tools">
        <div class="seg" role="group" aria-label="Raggruppa">
          <button data-a="list-mode" data-m="cat" aria-pressed="${ui.listMode === "cat"}">Reparto</button>
          <button data-a="list-mode" data-m="store" aria-pressed="${ui.listMode === "store"}">Negozio</button>
        </div>
        <button class="btn small" data-a="hide-checked">${ui.hideChecked ? "Mostra presi" : "Nascondi presi"}</button>
        <button class="btn small primary" data-a="share-list">Condividi</button>
      </div>
    </div>
    <form class="add-row" data-form="extra"><input name="name" placeholder="Aggiungi qualcosa (es. detersivo, caffè)…" autocomplete="off"><button class="btn primary" aria-label="Aggiungi">+</button></form>
    ${pantry}${groups || '<p class="muted center">Tutto preso.</p>'}`;
}

function itemRow(i) {
  const qty = i.qty != null ? fmtQty(i.qty, i.unit) : i.fromPantry ? (i.pantryState === "poco" ? "quasi finito" : "finito") : "";
  const sub = i.for.length ? esc(i.for.join(", ")) : i.extra ? "aggiunto a mano" : "";
  return `<div class="item ${i.checked ? "is-checked" : ""}">
    <label class="check"><input type="checkbox" data-a="check" data-key="${esc(i.key)}" ${i.checked ? "checked" : ""}><span class="box"></span>
      <span class="item-text"><span class="item-name">${esc(i.name)}</span>${qty ? `<span class="item-qty">${esc(qty)}</span>` : ""}${sub ? `<small>${sub}</small>` : ""}</span></label>
    <button class="chip store-${norm(i.store)}" data-a="store" data-name="${esc(i.name)}" title="Dove si trova">${esc(i.store)}</button>
    ${i.extra ? `<button class="icon-btn small" data-a="extra-del" data-id="${i.id}" aria-label="Rimuovi">×</button>` : ""}
  </div>`;
}

// ---- Ricette
function viewRicette() {
  const counts = (st) => state.recipes.filter((r) => r.meal === ui.meal && r.status === st).length;
  return `<div class="toolbar">
      <div class="seg" role="group"><button data-a="meal" data-m="cena" aria-pressed="${ui.meal === "cena"}">Cene</button><button data-a="meal" data-m="pranzo" aria-pressed="${ui.meal === "pranzo"}">Pranzi</button></div>
      <button class="btn small primary" data-a="new-recipe">+ Nuova</button>
    </div>
    <div class="chips">
      ${[["rotazione", "In rotazione"], ["da provare", "Da provare"], ["scartata", "Scartate"]].map(([s, l]) =>
        `<button class="chip ${ui.status === s ? "on" : ""}" data-a="status" data-s="${s}">${l} <b>${counts(s)}</b></button>`).join("")}
    </div>
    <input class="search" type="search" placeholder="Cerca una ricetta o un ingrediente…" value="${esc(ui.q)}" data-input="q">
    <div id="recipe-list"></div>
    <p class="hint center"><button class="link" data-a="import">Importa ricette (JSON)</button></p>`;
}
function renderRecipeList() {
  const q = norm(ui.q);
  const list = state.recipes.filter((r) => r.meal === ui.meal && r.status === ui.status &&
    (!q || norm(r.title).includes(q) || ingredientsOf(r).some((i) => norm(i.name).includes(q))))
    .sort((a, b) => a.effort - b.effort || a.title.localeCompare(b.title, "it"));
  const el = $("#recipe-list"); if (!el) return;
  el.innerHTML = list.length ? list.map((r) => `
    <button class="card" data-a="recipe" data-id="${r.id}">
      <div class="card-title">${esc(r.title)}</div>
      <div class="slot-meta">${dots(r.effort)}${r.time ? `<span>${r.time}′</span>` : ""}${r.protein ? `<span>${esc(r.protein)}</span>` : ""}<span class="pill">${SOURCE[r.source] || ""}</span>${likes(r)}</div>
      <small class="muted">${lastCooked(r)}${r.variants ? ` · ${r.variants.length} varianti` : ""}</small>
    </button>`).join("") : `<p class="muted center">Nessuna ricetta qui.</p>`;
}

// ---- Dispensa
function viewDispensa() {
  const toBuy = state.pantry.filter((x) => x.state !== "ok").length;
  const list = (ui.pantryFilter === "buy" ? state.pantry.filter((x) => x.state !== "ok") : state.pantry)
    .slice().sort((a, b) => a.name.localeCompare(b.name, "it"));
  return `<p class="intro">Le cose che date per scontate. Quando una finisce, segnala qui e va in lista da sola.</p>
    <div class="chips">
      <button class="chip ${ui.pantryFilter === "all" ? "on" : ""}" data-a="pantry-filter" data-f="all">Tutto <b>${state.pantry.length}</b></button>
      <button class="chip ${ui.pantryFilter === "buy" ? "on" : ""}" data-a="pantry-filter" data-f="buy">Da comprare <b>${toBuy}</b></button>
    </div>
    <form class="add-row" data-form="pantry-add"><input name="name" placeholder="Aggiungi alla dispensa…" autocomplete="off"><button class="btn primary" aria-label="Aggiungi">+</button></form>
    <div class="pantry">${list.map((x) => `
      <div class="row">
        <span>${esc(x.name)}</span>
        <span class="row-actions">
          <button class="chip state-${x.state}" data-a="pantry-cycle" data-name="${esc(x.name)}">${{ ok: "C'è", poco: "Quasi finito", finito: "Finito" }[x.state]}</button>
          <button class="icon-btn small" data-a="pantry-del" data-name="${esc(x.name)}" aria-label="Rimuovi">×</button>
        </span>
      </div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- sheets
function openSheet(html) {
  const s = $("#sheet");
  s.querySelector(".sheet-body").innerHTML = html;
  s.hidden = false; requestAnimationFrame(() => s.classList.add("open"));
}
function closeSheet() {
  const s = $("#sheet"); s.classList.remove("open");
  setTimeout(() => { s.hidden = true; }, 200);
}

function sheetSlot(k) {
  const { date, meal } = splitKey(k);
  const p = plan(state, ui.wk), s = p.slots[k];
  const head = `<div class="sheet-eyebrow">${DAY_LONG[dayIndex(date)]} ${fmtDay(date)} · ${MEAL_LABEL[meal]}</div>`;
  if (!s || s.status === "fuori") {
    return openSheet(head + `<h2>${s ? "Fuori casa" : "Da decidere"}</h2>
      <div class="actions">
        <button class="btn primary" data-a="reroll" data-k="${k}">↻ Proponimi qualcosa</button>
        <button class="btn" data-a="surprise" data-k="${k}">✨ Sorprendimi</button>
        <button class="btn" data-a="pick" data-k="${k}">Scegli dal catalogo</button>
        ${s ? `<button class="btn" data-a="clear" data-k="${k}">Svuota</button>` : `<button class="btn" data-a="fuori" data-k="${k}">Fuori casa / salta</button>`}
      </div>`);
  }
  const r = R(s.recipeId);
  const rating = s.status === "done" ? `<div class="rating"><div class="sheet-eyebrow">Com'era?</div>${state.settings.people.map((who) => {
    const cur = (r.ratings || []).find((x) => x.date === date && x.who === who)?.v || 0;
    return `<div class="row"><span>${esc(who)}</span><span class="row-actions">
      <button class="chip ${cur > 0 ? "on" : ""}" data-a="rate" data-k="${k}" data-who="${esc(who)}" data-v="1">👍</button>
      <button class="chip ${cur < 0 ? "on" : ""}" data-a="rate" data-k="${k}" data-who="${esc(who)}" data-v="-1">👎</button></span></div>`;
  }).join("")}${r.status === "da provare" || r._autoFrom === date ? '<p class="hint">Piatto nuovo: con un 👍 entra in rotazione, con un 👎 viene scartato.</p>' : ""}</div>` : "";
  const variants = r.variants ? `<div class="sheet-eyebrow">Variante</div><div class="chips">${r.variants.map((v, i) =>
    `<button class="chip ${s.variant === i ? "on" : ""}" data-a="variant" data-k="${k}" data-i="${i}">${esc(v.name)}</button>`).join("")}</div>` : "";
  openSheet(head + `<h2>${esc(r.title)}</h2>
    <div class="slot-meta">${dots(r.effort)}${r.time ? `<span>${r.time}′</span>` : ""}${s.surprise ? '<span class="pill surprise">✨ Sorpresa</span>' : ""}</div>
    ${variants}
    <div class="actions">
      <button class="btn ${s.status === "done" ? "" : "primary"}" data-a="done" data-k="${k}">${s.status === "done" ? "Annulla «fatto»" : "✓ Fatto"}</button>
      <button class="btn" data-a="recipe" data-id="${r.id}">Ricetta</button>
    </div>
    ${rating}
    <div class="actions">
      <button class="btn" data-a="lock" data-k="${k}">${s.locked ? "Sblocca" : "🔒 Blocca"}</button>
      <button class="btn" data-a="reroll" data-k="${k}">↻ Cambia</button>
      <button class="btn" data-a="surprise" data-k="${k}">✨ Sorprendimi</button>
      <button class="btn" data-a="pick" data-k="${k}">Scegli…</button>
      <button class="btn" data-a="fuori" data-k="${k}">Fuori casa</button>
      <button class="btn ghost" data-a="clear" data-k="${k}">Svuota</button>
    </div>`);
}

function sheetPick(k) {
  const { meal } = splitKey(k);
  ui.pickKey = k; ui.pickQ = "";
  openSheet(`<div class="sheet-eyebrow">${MEAL_LABEL[meal]}</div><h2>Scegli un piatto</h2>
    <input class="search" type="search" placeholder="Cerca…" data-input="pickQ">
    <div id="pick-list"></div>`);
  renderPickList();
}
function renderPickList() {
  const { meal } = splitKey(ui.pickKey); const q = norm(ui.pickQ);
  const list = state.recipes.filter((r) => r.meal === meal && r.status !== "scartata" && (!q || norm(r.title).includes(q)))
    .sort((a, b) => (a.status === b.status ? a.title.localeCompare(b.title, "it") : a.status === "rotazione" ? -1 : 1));
  $("#pick-list").innerHTML = list.map((r) => `<button class="card" data-a="pick-one" data-id="${r.id}">
    <div class="card-title">${esc(r.title)}</div><div class="slot-meta">${dots(r.effort)}${r.time ? `<span>${r.time}′</span>` : ""}${r.status === "da provare" ? '<span class="pill surprise">Nuova</span>' : ""}</div></button>`).join("");
}

function sheetRecipe(id) {
  const r = R(id); if (!r) return;
  const pantry = new Set(state.pantry.map((x) => norm(x.name)));
  const ingList = (arr) => arr.map((i) => `<li class="${pantry.has(norm(i.name)) ? "muted" : ""}">${esc(i.name)}${i.qty != null ? ` <span class="item-qty">${esc(fmtQty(i.qty, i.unit))}</span>` : ""}${pantry.has(norm(i.name)) ? " <small>(dispensa)</small>" : ""}</li>`).join("");
  const sel = (field, opts, cur) => `<select data-change="recipe-field" data-id="${r.id}" data-field="${field}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const wkDays = weekDays(ui.wk);
  openSheet(`<div class="sheet-eyebrow">${SOURCE[r.source] || ""}${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">fonte</a>` : ""}</div>
    <h2>${esc(r.title)}</h2>
    <div class="slot-meta">${dots(r.effort)}${r.time ? `<span>${r.time}′</span>` : ""}${r.protein ? `<span>${esc(r.protein)}</span>` : ""}${likes(r)}</div>
    <small class="muted">${lastCooked(r)} · ingredienti per 2</small>
    ${r.note ? `<p>${esc(r.note)}</p>` : ""}
    <h3>Ingredienti</h3><ul class="ings">${ingList(r.ingredients || [])}</ul>
    ${r.variants ? r.variants.map((v) => `<h4>Variante: ${esc(v.name)}</h4><ul class="ings">${ingList(v.ingredients)}</ul>`).join("") : ""}
    ${r.steps?.length ? `<h3>Procedimento</h3><ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
    <h3>Impostazioni</h3>
    <div class="form-grid">
      <label>Stato ${sel("status", [["rotazione", "In rotazione"], ["da provare", "Da provare"], ["scartata", "Scartata"]], r.status)}</label>
      <label>Pasto ${sel("meal", [["pranzo", "Pranzo"], ["cena", "Cena"]], r.meal)}</label>
      <label>Sforzo ${sel("effort", [[1, "1 · Facile"], [2, "2 · Medio"], [3, "3 · Impegnativo"]], r.effort)}</label>
    </div>
    <h3>Mettila nel menu</h3>
    <form class="add-row" data-form="to-menu" data-id="${r.id}">
      <select name="date">${wkDays.map((d) => `<option value="${d}" ${d === today() ? "selected" : ""}>${DAY_SHORT[dayIndex(d)]} ${fmtDay(d)}</option>`).join("")}</select>
      <button class="btn primary">Aggiungi a ${MEAL_LABEL[r.meal].toLowerCase()}</button>
    </form>
    <div class="actions"><button class="btn ghost danger" data-a="recipe-del" data-id="${r.id}">Elimina ricetta</button></div>`);
}

function sheetNewRecipe() {
  openSheet(`<h2>Nuova ricetta</h2>
    <form class="form" data-form="new-recipe">
      <label>Nome<input name="title" required placeholder="Es. Pollo al limone"></label>
      <div class="form-grid">
        <label>Pasto<select name="meal"><option value="cena" ${ui.meal === "cena" ? "selected" : ""}>Cena</option><option value="pranzo" ${ui.meal === "pranzo" ? "selected" : ""}>Pranzo</option></select></label>
        <label>Sforzo<select name="effort"><option value="1">1 · Facile</option><option value="2" selected>2 · Medio</option><option value="3">3 · Impegnativo</option></select></label>
        <label>Minuti<input name="time" type="number" min="0" inputmode="numeric" placeholder="30"></label>
        <label>Proteina<input name="protein" placeholder="pollo, manzo…"></label>
      </div>
      <label>Ingredienti per 2, uno per riga<textarea name="ings" rows="6" placeholder="400 g petto di pollo&#10;2 limoni&#10;1 busta insalata&#10;sale"></textarea></label>
      <label>Procedimento, un passo per riga<textarea name="steps" rows="4"></textarea></label>
      <label>Link (facoltativo)<input name="url" type="url" placeholder="https://…"></label>
      <label>Stato<select name="status"><option value="da provare">Da provare (entra come sorpresa)</option><option value="rotazione">In rotazione</option></select></label>
      <button class="btn primary big">Salva ricetta</button>
    </form>`);
}

function sheetImport() {
  openSheet(`<h2>Importa ricette</h2>
    <p class="hint">Incolla un array JSON di ricette, ad esempio quelle che ti prepara Claude. Campi: <code>title</code>, <code>meal</code> (pranzo/cena), <code>effort</code> (1-3), <code>time</code>, <code>protein</code>, <code>ingredients</code> (righe tipo "400 g petto di pollo" oppure oggetti {name, qty, unit, cat}), <code>steps</code>, <code>url</code>. Entrano come «da provare».</p>
    <form class="form" data-form="import"><textarea name="json" rows="10" placeholder='[{"title": "…", "meal": "cena", "effort": 2, "ingredients": ["400 g petto di pollo"], "steps": ["…"]}]'></textarea>
    <button class="btn primary big">Importa</button></form>`);
}

function sheetSettings() {
  const st = state.settings;
  const num = (k, min, max) => `<input type="number" min="${min}" max="${max}" value="${st[k]}" data-change="setting" data-k="${k}" inputmode="numeric">`;
  openSheet(`<h2>Impostazioni</h2>
    <div class="form">
      <label>Sorprese automatiche a settimana ${num("surprisesPerWeek", 0, 3)}</label>
      <label>Giorno della sorpresa <select data-change="setting" data-k="surpriseDay">${DAY_LONG.map((d, i) => `<option value="${i}" ${st.surpriseDay === i ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label>Sforzo massimo lun–ven <select data-change="setting" data-k="maxEffortWeekday">${[1, 2, 3].map((v) => `<option value="${v}" ${st.maxEffortWeekday === v ? "selected" : ""}>${v} · ${EFFORT[v]}</option>`).join("")}</select></label>
      <label>Giorni prima di riproporre un piatto ${num("noRepeatDays", 0, 60)}</label>
    </div>
    <h3>Account</h3>
    ${sync.enabled ? (sync.getUser() ? `<div class="row"><div><div>${esc(sync.getUser().email)}</div><small class="muted">${SYNC_LABEL[sync.getStatus()] || ""}</small></div><button class="btn small" data-a="logout">Esci</button></div>`
      : '<p class="hint">Non connesso.</p>') : '<p class="hint">Sincronizzazione non configurata: i dati vivono solo in questo browser.</p>'}
    <h3>Dati</h3>
    <p class="hint">Esporta un backup per sicurezza o per spostare i dati.</p>
    <div class="actions">
      <button class="btn" data-a="export">Esporta backup</button>
      <label class="btn">Importa backup<input type="file" accept="application/json" data-change="import-file" hidden></label>
      <button class="btn ghost danger" data-a="reset">Ripristina dati iniziali</button>
    </div>`);
}

// ---------------------------------------------------------------- azioni
function setSlot(k, s) { plan(state, ui.wk).slots[k] = s; }
function reroll(k, pool = "rotazione") {
  const { date, meal } = splitKey(k);
  const p = plan(state, ui.wk), cur = p.slots[k];
  const slots = { ...p.slots }; delete slots[k];
  const usePool = pool === "surprise" || cur?.surprise ? "surprise" : "rotazione";
  let s = pickForSlot(state, ui.wk, date, meal, { pool: usePool, exclude: cur?.recipeId ? [cur.recipeId] : [], slots });
  if (!s && usePool === "surprise") {
    toast("Niente di nuovo da provare per questo pasto: ti propongo un classico");
    s = pickForSlot(state, ui.wk, date, meal, { exclude: cur?.recipeId ? [cur.recipeId] : [], slots });
  }
  if (s) setSlot(k, s);
  return s;
}

const actions = {
  tab: (d) => { ui.tab = d.tabTo || d.tab; render(); window.scrollTo(0, 0); },
  wk: (d) => { ui.wk = addDays(ui.wk, Number(d.d)); render(); },
  generate: () => {
    generateWeek(state, ui.wk); commit();
    toast("Menu pronto. Tocca ↻ per cambiare un piatto.");
  },
  slot: (d) => sheetSlot(d.k),
  reroll: (d) => { reroll(d.k); commit(); if (!$("#sheet").hidden) sheetSlot(d.k); },
  surprise: (d) => { const s = reroll(d.k, "surprise"); commit(); if (s?.surprise) toast("✨ Sorpresa!"); sheetSlot(d.k); },
  lock: (d) => { const s = plan(state, ui.wk).slots[d.k]; s.locked = !s.locked; commit(); sheetSlot(d.k); },
  done: (d) => { const s = plan(state, ui.wk).slots[d.k]; markDone(state, ui.wk, d.k, s.status !== "done"); commit(); sheetSlot(d.k); },
  rate: (d) => {
    const { date } = splitKey(d.k); const s = plan(state, ui.wk).slots[d.k];
    const r = R(s.recipeId); const cur = (r.ratings || []).find((x) => x.date === date && x.who === d.who)?.v || 0;
    const v = Number(d.v) === cur ? 0 : Number(d.v);
    const changed = rate(state, s.recipeId, date, d.who, v);
    commit(); sheetSlot(d.k);
    if (changed === "rotazione") toast("Promossa: entra in rotazione");
    if (changed === "scartata") toast("Scartata: non verrà più proposta");
  },
  variant: (d) => { plan(state, ui.wk).slots[d.k].variant = Number(d.i); commit(); sheetSlot(d.k); },
  fuori: (d) => { setSlot(d.k, { status: "fuori", locked: true }); commit(); closeSheet(); },
  clear: (d) => { delete plan(state, ui.wk).slots[d.k]; commit(); closeSheet(); },
  pick: (d) => sheetPick(d.k),
  "pick-one": (d) => {
    const r = R(d.id);
    setSlot(ui.pickKey, { recipeId: r.id, variant: r.variants ? 0 : null, status: "planned", surprise: r.status === "da provare", locked: true });
    commit(); sheetSlot(ui.pickKey);
  },
  recipe: (d) => sheetRecipe(d.id),
  "recipe-del": (d) => {
    if (!confirm("Eliminare questa ricetta?")) return;
    state.recipes = state.recipes.filter((r) => r.id !== d.id);
    for (const p of Object.values(state.plans)) for (const [k, s] of Object.entries(p.slots)) if (s.recipeId === d.id) delete p.slots[k];
    commit(); closeSheet();
  },
  "new-recipe": () => sheetNewRecipe(),
  import: () => sheetImport(),
  meal: (d) => { ui.meal = d.m; render(); },
  status: (d) => { ui.status = d.s; render(); },
  "list-mode": (d) => { ui.listMode = d.m; render(); },
  "hide-checked": () => { ui.hideChecked = !ui.hideChecked; render(); },
  check: (d, el) => {
    const p = plan(state, ui.wk); p.checked[d.key] = el.checked;
    const it = buildList(state, ui.wk).items.find((i) => i.key === d.key);
    if (it?.fromPantry) {
      const x = state.pantry.find((y) => norm(y.name) === norm(it.name));
      p.boughtPantry ||= {};
      if (x) { x.state = el.checked ? "ok" : "finito"; p.boughtPantry[norm(it.name)] = true; }
    }
    commit();
  },
  store: (d) => {
    const n = norm(d.name), cur = state.storeOf[n] || "Ovunque";
    const next = STORES[(STORES.indexOf(cur) + 1) % STORES.length];
    if (next === "Ovunque") delete state.storeOf[n]; else state.storeOf[n] = next;
    commit();
  },
  "extra-del": (d) => { const p = plan(state, ui.wk); p.extras = p.extras.filter((x) => x.id !== d.id); commit(); },
  "share-list": async () => {
    const text = `Spesa ${fmtWeek(ui.wk)}\n\n` + asText(buildList(state, ui.wk).items, ui.listMode === "store" ? "store" : "cat");
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "Lista della spesa", text }); return; }
      await navigator.clipboard.writeText(text); toast("Lista copiata");
    } catch (e) {
      if (e?.name === "AbortError") return;
      openSheet(`<h2>Lista della spesa</h2><textarea rows="16" readonly>${esc(text)}</textarea>`);
    }
  },
  "pantry-missing": (d) => { const x = state.pantry.find((y) => y.name === d.name); if (x) x.state = "finito"; commit(); toast(`${d.name} aggiunto alla lista`); },
  "pantry-cycle": (d) => {
    const x = state.pantry.find((y) => y.name === d.name);
    x.state = { ok: "poco", poco: "finito", finito: "ok" }[x.state]; commit();
  },
  "pantry-del": (d) => { state.pantry = state.pantry.filter((y) => y.name !== d.name); commit(); },
  "pantry-filter": (d) => { ui.pantryFilter = d.f; render(); },
  settings: () => sheetSettings(),
  logout: async () => { await sync.signOut(); closeSheet(); render(); },
  export: () => {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `cosa-mangiamo-${today()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  },
  reset: () => { if (confirm("Cancello menu, voti e modifiche e riparto dalle ricette iniziali?")) { state = reset(); commit(); closeSheet(); } },
  "close-sheet": () => closeSheet(),
};

const forms = {
  login: async (f, form) => {
    const btn = form.querySelector("button"); btn.disabled = true; btn.textContent = "Entro…";
    try { await sync.signIn(f.get("email").trim().toLowerCase(), f.get("password")); }
    catch (e) { btn.disabled = false; btn.textContent = "Entra"; toast(/invalid/i.test(e.message) ? "Email o password sbagliate" : e.message); }
  },
  extra: (f, form) => {
    const name = f.get("name").trim(); if (!name) return;
    const p = plan(state, ui.wk); p.extras ||= [];
    const parsed = parseIngredientLine(name);
    p.extras.push({ id: uid(), name, cat: parsed?.cat || "altro" });
    commit(); setTimeout(() => $("[data-form=extra] input")?.focus(), 0);
  },
  "pantry-add": (f) => {
    const name = f.get("name").trim(); if (!name) return;
    if (!state.pantry.some((x) => norm(x.name) === norm(name))) state.pantry.push({ name: name[0].toUpperCase() + name.slice(1), state: "ok" });
    commit(); setTimeout(() => $("[data-form=pantry-add] input")?.focus(), 0);
  },
  "new-recipe": (f) => {
    const known = knownCats();
    const title = f.get("title").trim();
    let id = slug(title) || uid(); if (R(id)) id += "-" + uid();
    state.recipes.push({
      id, title, meal: f.get("meal"), effort: Number(f.get("effort")), time: Number(f.get("time")) || null,
      protein: f.get("protein").trim() || null,
      ingredients: f.get("ings").split("\n").map((l) => parseIngredientLine(l, known)).filter(Boolean),
      steps: f.get("steps").split("\n").map((s) => s.trim()).filter(Boolean),
      status: f.get("status"), tags: [], source: "mia", url: f.get("url").trim() || null, history: [], ratings: [],
    });
    ui.meal = f.get("meal"); ui.status = f.get("status");
    commit(); closeSheet(); toast("Ricetta salvata");
  },
  import: (f) => {
    try {
      let data = JSON.parse(f.get("json")); if (!Array.isArray(data)) data = data.recipes || [data];
      const known = knownCats(); let n = 0;
      for (const x of data) {
        if (!x?.title) continue;
        let id = x.id || slug(x.title); if (R(id)) id += "-" + uid();
        const ings = (x.ingredients || []).map((i) => typeof i === "string" ? parseIngredientLine(i, known)
          : { name: i.name, qty: i.qty ?? null, unit: i.unit || "", cat: i.cat || parseIngredientLine(i.name, known)?.cat || "altro" }).filter(Boolean);
        state.recipes.push({ id, title: x.title, meal: x.meal === "pranzo" ? "pranzo" : "cena", effort: Number(x.effort) || 2,
          time: Number(x.time) || null, protein: x.protein || null, ingredients: ings,
          steps: Array.isArray(x.steps) ? x.steps : String(x.steps || "").split("\n").filter(Boolean),
          status: x.status || "da provare", tags: x.tags || [], source: x.source || "claude", url: x.url || null, note: x.note || null, history: [], ratings: [] });
        n++;
      }
      commit(); closeSheet(); toast(`${n} ricette importate`);
    } catch (e) { alert("JSON non valido: " + e.message); }
  },
  "to-menu": (f, form) => {
    const r = R(form.dataset.id); const k = key(f.get("date"), r.meal);
    setSlot(k, { recipeId: r.id, variant: r.variants ? 0 : null, status: "planned", surprise: r.status === "da provare", locked: true });
    commit(); closeSheet(); toast(`Aggiunta a ${DAY_LONG[dayIndex(f.get("date"))].toLowerCase()}`);
  },
};
function knownCats() {
  const m = {}; for (const r of state.recipes) for (const i of ingredientsOf(r)) m[norm(i.name)] = i.cat;
  for (const v of state.recipes.flatMap((r) => r.variants || [])) for (const i of v.ingredients) m[norm(i.name)] = i.cat;
  return m;
}

// ---------------------------------------------------------------- eventi
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-a], [data-tab]");
  if (!el) { if (e.target.id === "sheet") closeSheet(); return; }
  if (el.matches("[data-tab]") && !el.dataset.a) { actions.tab(el.dataset); return; }
  const fn = actions[el.dataset.a]; if (!fn) return;
  if (el.type !== "checkbox") e.preventDefault();
  e.stopPropagation();
  fn(el.dataset, el, e);
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]"); if (!form) return;
  e.preventDefault(); forms[form.dataset.form]?.(new FormData(form), form);
});
document.addEventListener("input", (e) => {
  const k = e.target.dataset.input; if (!k) return;
  ui[k] = e.target.value; k === "q" ? renderRecipeList() : renderPickList();
});
document.addEventListener("change", async (e) => {
  const el = e.target, t = el.dataset.change; if (!t) return;
  if (t === "recipe-field") {
    const r = R(el.dataset.id); r[el.dataset.field] = el.dataset.field === "effort" ? Number(el.value) : el.value; commit();
  } else if (t === "setting") {
    state.settings[el.dataset.k] = Number(el.value); commit();
  } else if (t === "import-file") {
    try { state = importBackup(await el.files[0].text()); commit(); closeSheet(); toast("Backup importato"); }
    catch (err) { alert(err.message); }
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

render();
sync.init({
  getState: () => state,
  normalize: migrate,
  onRemote: (s) => { state = s; save(state); safeRender(); },
  onStatus: (st, detail) => { updateSyncDot(st, detail); if (st === "signed-out" || document.body.classList.contains("logged-out")) render(); },
});
if (ui.tab === "menu") setTimeout(() => document.getElementById("today")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
