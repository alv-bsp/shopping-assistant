// UI: rendering con template string + event delegation (data-a = azione al click).
import { load, save, reset, importBackup, plan, migrate, presentOn } from "./store.js";
import * as sync from "./sync.js";
import { generateWeek, pickForSlot, key, splitKey, rate, markDone, swapPart, pickPart, hasAvoided, syncPresence } from "./planner.js";
import { buildList, groupBy, asText, fmtQty, CAT_LABEL, ingredientsOf, parseIngredientLine } from "./shopping.js";
import { weekKey, weekDays, addDays, today, fmtWeek, fmtDay, dayIndex, parseIso, DAY_SHORT, DAY_LONG, norm, uid, slug, esc } from "./util.js";
import { icon } from "./icons.js";

let state = load();
// nel weekend, se la settimana in corso è vuota, si parte già dalla prossima (è lì che si pianifica)
const startWeek = dayIndex(today()) >= 5 && !Object.keys(state.plans[weekKey()]?.slots || {}).length ? addDays(weekKey(), 7) : weekKey();
const ui = { tab: "menu", wk: startWeek, day: null, hideChecked: false, meal: "cena", kind: "proteina", person: null, status: "rotazione", q: "", pantryView: "dispensa", pantryEdit: false, flash: null };
const $ = (s) => document.querySelector(s);
const R = (id) => state.recipes.find((r) => r.id === id);
const commit = () => { save(state); sync.schedule(); render(); };
const SYNC_LABEL = { synced: "Sincronizzato", syncing: "Sincronizzo…", offline: "Offline: le modifiche partono quando torna la rete", error: "Errore di sincronizzazione", starting: "Avvio…" };

// ---------------------------------------------------------------- helpers
const EFFORT = { 1: "Facile", 2: "Media", 3: "Impegnativa" };
const MEAL_LABEL = { pranzo: "Pranzo", cena: "Cena" };
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const fmtLong = (d) => { const x = parseIso(d); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };
const variantName = (r, v) => (r?.variants && v != null ? r.variants[v]?.name : "");
const KIND = [["proteina", "Proteine"], ["contorno", "Contorni"], ["piatto", "Piatti"], ["special", "Speciali"]];
const KIND_ONE = { proteina: "Proteina", contorno: "Contorno", piatto: "Piatto completo", special: "Speciale (elaborata)" };
const kindOf = (r) => (r.special ? "special" : r.role || "piatto");
const forPerson = (r, person) => !r.people?.length || r.people.includes(person);
const SOURCE = { hellofresh: "HelloFresh", casa: "Di casa", claude: "Nuova", mia: "Aggiunta" };
const CAT_ICON = { verdura: "carrot", carne: "drumstick", pesce: "fish", frigo: "milk", pane: "croissant", dispensa: "package", snack: "cookie", surgelati: "snowflake", bevande: "cup-soda", altro: "shopping-basket" };

/** Icona e tinta di un piatto, dal tipo e dalla proteina. */
function look(r) {
  if (!r) return ["utensils", "plain"];
  const t = norm(r.title), p = norm(r.protein);
  if ((r.tags || []).includes("pizza")) return ["pizza", "tomato"];
  if (r.role === "contorno") return /spinaci|broccoli|insalata|valeriana|piselli/.test(t) ? ["leafy-green", "olive"] : ["carrot", "saffron"];
  if (r.meal === "pranzo") {
    if (/zupp|minestr|crema/.test(t)) return ["soup", "saffron"];
    if (/insalat/.test(t)) return ["salad", "olive"];
    return ["wheat", "wheat"];
  }
  if (r.role === "piatto" && !r.special && /burger|hamburger|panino|tacos/.test(t)) return ["sandwich", "tomato"];
  if (/pollo|tacchino/.test(p)) return ["drumstick", "saffron"];
  if (/manzo|vitello/.test(p)) return ["beef", "tomato"];
  if (/maiale/.test(p)) return ["ham", "rose"];
  if (/pesce|salmone|trota|orata|branzino|gamber/.test(p)) return ["fish", "sea"];
  if (/vegetal/.test(p)) return ["sprout", "olive"];
  if (/uova/.test(p)) return ["egg", "yolk"];
  return ["chef-hat", "plain"];
}
const ICO_SIZE = { lg: 28, md: 22, sm: 17 };
const dishIco = (r, size = "md") => { const [n, t] = look(r); return `<span class="dish-ico ${size}" data-tint="${t}">${icon(n, ICO_SIZE[size])}</span>`; };

/** Titolo e dati di uno slot: una ricetta, oppure proteina + contorno. */
function slotInfo(s) {
  const r = R(s.recipeId), side = s.sideId ? R(s.sideId) : null;
  if (!r) return null;
  const vn = variantName(r, s.variant);
  return { r, side, vn, title: r.title, sub: side ? `con ${side.title.toLowerCase()}` : vn,
    full: side ? `${r.title} + ${side.title.toLowerCase()}` : r.title,
    effort: Math.max(r.effort || 1, side?.effort || 1), time: Math.max(r.time || 0, side?.time || 0) };
}
const metaBits = (time, effort) => `${time ? `<span>${icon("clock", 14)}${time}′</span>` : ""}<span>${EFFORT[effort] || ""}</span>`;
function weekLabel(wk) {
  const d = Math.round((new Date(wk) - new Date(weekKey())) / 6048e5);
  return { 0: "questa settimana", 1: "prossima settimana", [-1]: "settimana scorsa" }[d] || "";
}
function selDay() {
  const days = weekDays(ui.wk);
  if (ui.day && days.includes(ui.day)) return ui.day;
  return days.includes(today()) ? today() : days[0];
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}
function lastCooked(r) {
  const h = [...(r.history || [])].sort();
  return h.length ? `Fatta ${h.length} ${h.length === 1 ? "volta" : "volte"}, l'ultima il ${fmtDay(h.at(-1))}` : "Mai fatta";
}
function likes(r) {
  const up = (r.ratings || []).filter((x) => x.v > 0).length, down = (r.ratings || []).filter((x) => x.v < 0).length;
  return `${up ? `<span>${icon("thumbs-up", 13)}${up}</span>` : ""}${down ? `<span>${icon("thumbs-down", 13)}${down}</span>` : ""}`;
}
const flashCls = (k) => (ui.flash === k ? "enter" : "");

// ---------------------------------------------------------------- render
function render() {
  const needLogin = sync.enabled && sync.getStatus() === "signed-out";
  document.body.classList.toggle("logged-out", needLogin);
  if (needLogin) { $("#view").innerHTML = viewLogin(); return; }
  const v = { menu: viewMenu, spesa: viewSpesa, ricette: viewRicette, dispensa: viewDispensa }[ui.tab]();
  $("#view").innerHTML = v;
  renderTop(); renderTabs();
  if (ui.tab === "ricette") renderRecipeList();
  ui.flash = null; ui.dayFx = false;
}

function renderTop() {
  let eyebrow = "", title = "", extra = "";
  if (ui.tab === "menu") {
    const d = selDay();
    eyebrow = d === today() ? `${DAY_LONG[dayIndex(d)]} ${fmtLong(d)}` : fmtLong(d);
    title = d === today() ? "Oggi" : DAY_LONG[dayIndex(d)];
  } else if (ui.tab === "spesa") {
    eyebrow = `Settimana ${fmtWeek(ui.wk)}`; title = "Spesa";
    extra = `<button class="icon-btn" data-a="share-list" aria-label="Condividi la lista">${icon("share", 20)}</button>`;
  } else if (ui.tab === "ricette") {
    eyebrow = `${state.recipes.filter((r) => r.status !== "scartata").length} ricette`; title = "Ricette";
    extra = `<button class="icon-btn" data-a="add-recipe" aria-label="Aggiungi una ricetta">${icon("plus", 22)}</button>`;
  } else {
    const n = state.pantry.filter((x) => x.state !== "ok").length;
    eyebrow = n ? `${n} da comprare` : "Tutto in casa"; title = "Dispensa";
  }
  $("#topbar").innerHTML = `<div class="topbar-inner">
    <div class="title-block"><div class="eyebrow">${esc(eyebrow)}</div><h1 class="page-title">${esc(title)}</h1></div>
    <div class="top-actions"><span id="sync-dot" class="sync-dot" hidden></span>${extra}
      <button class="icon-btn" data-a="settings" aria-label="Impostazioni">${icon("settings-2", 20)}</button></div></div>`;
  updateSyncDot(sync.getStatus());
}

function renderTabs() {
  const todo = buildList(state, ui.wk).items.filter((i) => !i.checked).length;
  const tabs = [["menu", "utensils", "Menu"], ["spesa", "shopping-basket", "Spesa"], ["ricette", "book-open", "Ricette"], ["dispensa", "refrigerator", "Dispensa"]];
  $("#tabbar").innerHTML = tabs.map(([t, ic, l]) => `<button data-tab="${t}" aria-current="${ui.tab === t ? "page" : "false"}">
    <span class="badge-dot" ${t === "spesa" && todo ? `data-count="${todo}"` : ""}>${icon(ic, 23)}</span>${l}</button>`).join("");
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
  d.hidden = !sync.enabled || st === "local" || st === "signed-out";
  d.dataset.state = st || ""; d.title = (SYNC_LABEL[st] || "") + (detail ? `: ${detail}` : "");
}

// ---- Login (solo se Supabase è configurato)
function viewLogin() {
  return `<div class="login">
    <span class="dish-ico lg" data-tint="tomato">${icon("chef-hat", 28)}</span>
    <h1>Cosa mangiamo</h1>
    <p>Entra una volta su questo telefono: menu, spesa e dispensa restano uguali per tutti e due.</p>
    <form class="form" data-form="login">
      <input name="email" type="email" autocomplete="username" required placeholder="Email" aria-label="Email">
      <input name="password" type="password" autocomplete="current-password" required placeholder="Password" aria-label="Password">
      <button class="btn primary block">Entra</button>
    </form></div>`;
}

// ---------------------------------------------------------------- Menu
function viewMenu() {
  const p = plan(state, ui.wk), days = weekDays(ui.wk), sel = selDay(), t = today();
  const label = weekLabel(ui.wk);
  const nav = `<div class="week-nav">
      <button class="icon-btn small" data-a="wk" data-d="-7" aria-label="Settimana precedente">${icon("chevron-left", 18)}</button>
      <div class="label"><b>${fmtWeek(ui.wk)}</b>${label ? ` · ${label}` : ""}</div>
      <button class="icon-btn small" data-a="wk" data-d="7" aria-label="Settimana successiva">${icon("chevron-right", 18)}</button></div>
    <div class="days-strip">${days.map((d) => {
      const c = p.slots[key(d, "cena")];
      return `<button class="day-pill ${d === t ? "is-today" : ""} ${c?.status === "done" ? "has-done" : ""} ${!c ? "is-empty" : ""}" data-a="day" data-d="${d}" aria-pressed="${d === sel}">
        <span class="dn">${DAY_SHORT[dayIndex(d)].slice(0, 3)}</span><span class="dd">${parseIso(d).getDate()}</span><span class="mark"></span></button>`;
    }).join("")}</div>`;

  if (!Object.keys(p.slots).length) {
    return nav + `<div class="empty-card">
      <span class="dish-ico lg" data-tint="olive">${icon("chef-hat", 28)}</span>
      <h3>La settimana è ancora da scrivere</h3>
      <p>Chi è a casa questa settimana? La spesa si calcola per chi c'è. I singoli giorni li cambi dopo.</p>
      ${weekPresence(p)}
      <button class="btn primary block" data-a="generate">Prepara il menu</button></div>`;
  }

  const home = presentOn(state, ui.wk, sel);
  const lunches = home.map((who) => lunchCard(p, sel, who)).join("");
  const rows = days.map((d) => weekRow(p, d, d === sel)).join("");
  return nav + dayPresence(p, sel, home) + heroCard(p, sel, home) + `
    ${home.length ? `<div class="section-head"><h2>${home.length > 1 ? "Pranzi" : "Pranzo"}</h2></div>
    <div class="lunches ${home.length === 1 ? "one" : ""}">${lunches}</div>` : ""}
    <div class="section-head"><h2>La settimana</h2><button class="link" data-a="generate">Rigenera</button></div>
    <div class="week-who"><span>A casa questa settimana</span>${weekPresence(p, true)}</div>
    <div class="week-list">${rows}</div>
    <p class="hint center">Rigenera cambia solo i piatti non bloccati e non ancora fatti.</p>`;
}

/** Chi c'è questa settimana (prima di generare, e sopra la lista della settimana). */
function weekPresence(p, compact = false) {
  const cur = p.people || state.settings.people;
  return `<div class="who-row ${compact ? "compact" : ""}">${state.settings.people.map((x) =>
    `<button class="who-chip ${cur.includes(x) ? "on" : ""}" data-a="week-person" data-p="${esc(x)}" aria-pressed="${cur.includes(x)}">
      <span class="av">${esc(x.slice(0, 1))}</span><span class="nm">${esc(x)}</span></button>`).join("")}</div>`;
}
/** Chi c'è nel giorno selezionato, più "cena fuori". */
function dayPresence(p, d, home) {
  const s = p.slots[key(d, "cena")], out = s?.status === "fuori";
  return `<div class="presence">
    ${state.settings.people.map((x) => `<button class="who-chip ${home.includes(x) ? "on" : ""}" data-a="day-person" data-d="${d}" data-p="${esc(x)}" aria-pressed="${home.includes(x)}" aria-label="${esc(x)} ${home.includes(x) ? "a casa" : "non c'è"}">
      <span class="av">${esc(x.slice(0, 1))}</span><span class="nm">${esc(x)}</span></button>`).join("")}
    ${home.length ? `<button class="who-chip out ${out ? "on" : ""}" data-a="dinner-out" data-d="${d}" aria-pressed="${out}">${icon("utensils-crossed", 15)} Cena fuori</button>` : ""}
  </div>`;
}

function heroCard(p, d, home) {
  const k = key(d, "cena"), s = p.slots[k], isToday = d === today();
  const eyebrowWord = isToday ? "Stasera" : "Cena";
  if (!home.length) {
    return `<section class="hero is-out ${ui.dayFx ? "fade-in" : ""}"><div class="eyebrow">${DAY_LONG[dayIndex(d)]}</div>
      <h3>Nessuno a casa</h3><p class="hint" style="margin:6px 0 0">Niente pasti e niente spesa per questo giorno. Tocca un nome qui sopra se cambia qualcosa.</p></section>`;
  }
  if (!s || s.status === "fuori") {
    return `<section class="hero ${s ? "is-out" : ""} ${ui.dayFx ? "fade-in" : ""}">
      <div class="eyebrow">${eyebrowWord}</div>
      <h3>${s ? "Cena fuori" : "Da decidere"}</h3>
      ${s ? `<p class="hint" style="margin:6px 0 0">Niente spesa per questa cena.</p>` : ""}
      <div class="hero-actions">
        ${s ? `<button class="btn soft" data-a="dinner-out" data-d="${d}">${icon("rotate-ccw", 17)} Si cena a casa</button>`
          : `<button class="btn primary" data-a="reroll" data-k="${esc(k)}">${icon("refresh-cw", 17)} Proponimi qualcosa</button>
             <button class="btn soft" data-a="pick" data-k="${esc(k)}">${icon("book-open", 17)} Scegli</button>`}
      </div></section>`;
  }
  const info = slotInfo(s); if (!info) return "";
  const [, tint] = look(info.r);
  const done = s.status === "done";
  const tags = [s.surprise ? `<span class="tag new">Ricetta nuova</span>` : "", s.special && !s.surprise ? `<span class="tag special">Speciale</span>` : "",
    s.locked ? `<span class="tag">${icon("lock", 11)} Bloccato</span>` : ""].join("");
  return `<section class="hero ${done ? "is-done" : ""} ${ui.dayFx ? "fade-in" : ""}" data-tint="${tint}">
    ${dishIco(info.r, "lg")}
    <div class="eyebrow">${eyebrowWord}${tags}</div>
    <h3 class="${flashCls(k)}">${esc(info.title)}</h3>
    ${info.sub ? `<p class="side ${ui.flash === k ? "enter-2" : ""}">${esc(info.sub)}</p>` : ""}
    <div class="meta">${metaBits(info.time, info.effort)}<button class="link meta-link" data-a="recipe" data-id="${info.r.id}">${info.side ? "Come si fa" : "Ricetta"} ${icon("chevron-right", 14)}</button></div>
    <div class="hero-actions">
      <button class="btn primary" data-a="done" data-k="${esc(k)}">${icon("check", 18)} Fatto</button>
      ${done ? "" : `<button class="btn soft" data-a="reroll" data-k="${esc(k)}">${icon("refresh-cw", 17)} Cambia</button>`}
      <button class="btn soft icon-only" data-a="slot" data-k="${esc(k)}" aria-label="Altre azioni">${icon("ellipsis", 18)}</button>
    </div>
    ${done ? rateRow(k, info.r, d) : ""}
  </section>`;
}

function rateRow(k, r, date) {
  const people = state.settings.people.map((who) => {
    const cur = (r.ratings || []).find((x) => x.date === date && x.who === who)?.v || 0;
    return `<div class="who"><span>${esc(who)}</span><div class="thumbs">
      <button class="thumb up ${cur > 0 ? "on" : ""}" data-a="rate" data-k="${esc(k)}" data-who="${esc(who)}" data-v="1" aria-label="Buono">${icon("thumbs-up", 18)}</button>
      <button class="thumb down ${cur < 0 ? "on" : ""}" data-a="rate" data-k="${esc(k)}" data-who="${esc(who)}" data-v="-1" aria-label="Non ci è piaciuto">${icon("thumbs-down", 18)}</button></div></div>`;
  }).join("");
  const isNew = r.status === "da provare" || r._autoFrom === date;
  return `<div class="rate-row"><div class="eyebrow">Com'era?</div>${people}
    ${isNew ? `<p class="hint" style="margin:2px 0 0">Ricetta nuova: con un pollice su entra nei classici, con uno giù non torna più.</p>` : ""}</div>`;
}

function lunchCard(p, d, who) {
  const k = key(d, "pranzo", who), s = p.slots[k];
  if (!s || s.status === "fuori") {
    return `<button class="lunch is-empty" data-a="slot" data-k="${esc(k)}"><div class="who">${esc(who)}</div>
      <div class="t">${s ? "Fuori casa" : "Da decidere"}</div></button>`;
  }
  const info = slotInfo(s); if (!info) return "";
  return `<button class="lunch ${s.status === "done" ? "is-done" : ""}" data-a="slot" data-k="${esc(k)}">
    <div class="who">${esc(who)}${s.status === "done" ? `<span style="color:var(--ok)">${icon("check", 16)}</span>` : dishIco(info.r, "sm")}</div>
    <div class="t ${flashCls(k)}">${esc(info.title)}</div>${info.vn ? `<div class="v">${esc(info.vn)}</div>` : ""}</button>`;
}

function weekRow(p, d, isSel) {
  const home = presentOn(state, ui.wk, d), all = state.settings.people;
  const c = p.slots[key(d, "cena")], ci = c && c.status !== "fuori" ? slotInfo(c) : null;
  const dinner = !home.length ? "Nessuno a casa" : ci ? ci.full : c?.status === "fuori" ? "Cena fuori" : "Da decidere";
  const lunchBits = home.map((who) => {
    const s = p.slots[key(d, "pranzo", who)], li = s && s.status !== "fuori" ? slotInfo(s) : null;
    return `${who.slice(0, 1)}. ${li ? li.title : s ? "fuori" : "—"}`;
  });
  const lunches = (home.length && home.length < all.length ? `Solo ${home.join(" e ")} · ` : "") + lunchBits.join(" · ");
  const st = c?.status === "done" ? `<span class="ok">${icon("circle-check", 18)}</span>` : c?.locked ? icon("lock", 15) : "";
  return `<button class="wrow ${isSel ? "is-sel" : ""}" data-a="day" data-d="${d}">
    <span class="wd"><b>${parseIso(d).getDate()}</b><small>${DAY_SHORT[dayIndex(d)]}</small></span>
    <span class="wt"><span class="d ${ci ? "" : "muted"}">${esc(dinner)}</span><span class="l">${esc(lunches)}</span></span>
    <span class="st">${st}</span></button>`;
}

// ---------------------------------------------------------------- Spesa
function viewSpesa() {
  const { items, pantryNeeded } = buildList(state, ui.wk);
  const p = plan(state, ui.wk);
  if (!Object.keys(p.slots).length && !items.length) {
    return `<div class="empty-card"><span class="dish-ico lg" data-tint="olive">${icon("shopping-basket", 28)}</span>
      <h3>La lista si scrive da sola</h3><p>Prepara il menu della settimana e qui trovi tutto quello che serve, diviso per reparto.</p>
      <button class="btn primary block" data-a="tab" data-tab-to="menu">Vai al menu</button></div>`;
  }
  const done = items.filter((i) => i.checked).length, total = items.length;
  const visible = ui.hideChecked ? items.filter((i) => !i.checked) : items;
  const groups = groupBy(visible, "cat").map((g) => `
    <section class="cat"><div class="cat-head">${icon(CAT_ICON[g.key] || "shopping-basket", 15)}${esc(g.label)}<span class="n">${g.items.length}</span></div>
      <div class="list-card">${g.items.map(itemRow).join("")}</div></section>`).join("");
  const skipped = (state.recurring || []).filter((x) => x.on && p.skipRecurring?.[x.id]).length;
  const pantry = pantryNeeded.length ? `
    <details class="pantry-check">
      <summary><span>Controlla in dispensa · ${pantryNeeded.length}</span>${icon("chevron-down", 18)}</summary>
      <p>Il menu le usa e le dai per presenti. Tocca quelle che mancano: finiscono in lista.</p>
      <div class="chips-wrap">${pantryNeeded.map((x) => `<button class="chip" data-a="pantry-missing" data-name="${esc(x.name)}" title="${esc(x.for.join(", "))}">${esc(x.name)}</button>`).join("")}</div>
    </details>` : "";
  return `<div class="progress">
      <div class="line"><div class="fill" style="width:${total ? Math.round((done / total) * 100) : 0}%"></div></div>
      <div class="txt"><span><b>${done}</b> di <b>${total}</b> nel carrello</span>
        ${done ? `<button class="link" data-a="hide-checked">${ui.hideChecked ? "Mostra presi" : "Nascondi presi"}</button>` : ""}</div></div>
    <form class="add-field" data-form="extra">${icon("plus", 18)}<input name="name" placeholder="Aggiungi qualcosa…" autocomplete="off" aria-label="Aggiungi alla lista"><button class="btn small primary">Aggiungi</button></form>
    ${pantry}${groups || '<p class="hint center" style="margin-top:28px">Tutto nel carrello.</p>'}
    ${skipped ? `<p class="hint center" style="margin-top:18px">${skipped} ${skipped === 1 ? "articolo fisso saltato" : "articoli fissi saltati"} questa settimana · <button class="link" data-a="rec-restore">ripristina</button></p>` : ""}`;
}

function itemRow(i) {
  const qty = i.qty != null ? fmtQty(i.qty, i.unit) : "";
  const sub = i.for.length ? i.for.join(", ") : i.extra ? "aggiunto a mano" : i.recurring ? "spesa fissa"
    : i.fromPantry ? (i.pantryState === "poco" ? "dispensa · quasi finito" : "dispensa · manca") : "";
  const remove = i.extra ? `<button class="icon-btn small" data-a="extra-del" data-id="${i.id}" aria-label="Togli">${icon("x", 16)}</button>`
    : i.recurring ? `<button class="icon-btn small" data-a="rec-skip" data-id="${i.id}" aria-label="Non questa settimana">${icon("x", 16)}</button>` : `<span class="icon-pad"></span>`;
  return `<div class="item ${i.checked ? "is-checked" : ""}">
    <label class="check"><input type="checkbox" data-a="check" data-key="${esc(i.key)}" ${i.checked ? "checked" : ""}><span class="box">${icon("check", 14)}</span>
      <span class="item-text"><span class="item-name">${esc(i.name)}</span>${sub ? `<span class="item-sub">${esc(sub)}</span>` : ""}</span></label>
    ${qty ? `<span class="item-qty">${esc(qty)}</span>` : ""}
    <button class="icon-btn small" data-a="copy" data-name="${esc(i.name)}" aria-label="Copia il nome per cercarlo" ${i.checked ? 'style="visibility:hidden" tabindex="-1"' : ""}>${icon("copy", 16)}</button>
    ${remove}
  </div>`;
}

// ---------------------------------------------------------------- Ricette
function inGroup(r) {
  if (r.meal !== ui.meal) return false;
  return ui.meal === "cena" ? kindOf(r) === ui.kind : forPerson(r, ui.person || state.settings.people[0]);
}
function viewRicette() {
  const counts = (st) => state.recipes.filter((r) => inGroup(r) && r.status === st).length;
  const person = ui.person || state.settings.people[0];
  const nIn = (pred) => state.recipes.filter((r) => pred(r) && r.status === ui.status).length;
  const groups = ui.meal === "cena"
    ? KIND.map(([k, l]) => `<button class="chip ${ui.kind === k ? "on" : ""}" data-a="kind" data-v="${k}">${l}<span class="count">${nIn((r) => r.meal === "cena" && kindOf(r) === k)}</span></button>`).join("")
    : state.settings.people.map((pp) => `<button class="chip ${person === pp ? "on" : ""}" data-a="person" data-v="${esc(pp)}">${esc(pp)}<span class="count">${nIn((r) => r.meal === "pranzo" && forPerson(r, pp))}</span></button>`).join("");
  const pending = (state.inbox || []).filter((x) => x.status === "nuovo").length;
  return `${pending ? `<button class="inbox-banner" data-a="inbox">${icon("arrow-up-right", 18)}<span><b>${pending} ${pending === 1 ? "link" : "link"} da importare</b><small>Diventano ricette quando chiedi a Claude di importarli</small></span>${icon("chevron-right", 18)}</button>` : ""}
    <div class="rtools">
      <label class="search">${icon("search", 18)}<input class="field" type="search" placeholder="Cerca un piatto o un ingrediente" value="${esc(ui.q)}" data-input="q" aria-label="Cerca"></label>
      <div class="seg full" role="group"><button data-a="meal" data-m="cena" aria-pressed="${ui.meal === "cena"}">Cene</button><button data-a="meal" data-m="pranzo" aria-pressed="${ui.meal === "pranzo"}">Pranzi</button></div>
      <div class="scroller">${groups}</div>
      <div class="seg full" role="group">${[["rotazione", "Classici"], ["da provare", "Da provare"], ["scartata", "Scartate"]].map(([s, l]) =>
        `<button data-a="status" data-s="${s}" aria-pressed="${ui.status === s}">${l} · ${counts(s)}</button>`).join("")}</div>
    </div>
    <div id="recipe-list"></div>
    <p class="hint center" style="margin-top:18px"><button class="link" data-a="add-recipe">Aggiungi una ricetta</button></p>`;
}
function renderRecipeList() {
  const q = norm(ui.q);
  const list = state.recipes.filter((r) => inGroup(r) && r.status === ui.status &&
    (!q || norm(r.title).includes(q) || ingredientsOf(r).some((i) => norm(i.name).includes(q))))
    .sort((a, b) => a.effort - b.effort || a.title.localeCompare(b.title, "it"));
  const el = $("#recipe-list"); if (!el) return;
  el.innerHTML = list.length ? `<div class="rlist">${list.map((r) => recipeRow(r, "recipe")).join("")}</div>`
    : `<p class="hint center" style="margin-top:28px">Niente qui.</p>`;
}
const recipeRow = (r, action) => `<button class="rrow" data-a="${action}" data-id="${r.id}">${dishIco(r, "md")}
  <span class="t"><b>${esc(r.title)}</b><span class="meta">${metaBits(r.time, r.effort)}${r.source === "hellofresh" ? "<span>HelloFresh</span>" : ""}${likes(r)}
  ${r.status === "da provare" && action !== "recipe" ? '<span class="tag new">Nuova</span>' : ""}${hasAvoided(state.settings, ingredientsOf(r)) ? '<span class="tag warn">Da evitare</span>' : ""}</span></span>
  ${icon("chevron-right", 18)}</button>`;

// ---------------------------------------------------------------- Dispensa
function viewDispensa() {
  const seg = `<div class="seg full" role="group" style="margin-top:4px">
      <button data-a="pantry-view" data-v="dispensa" aria-pressed="${ui.pantryView === "dispensa"}">In casa</button>
      <button data-a="pantry-view" data-v="fissa" aria-pressed="${ui.pantryView === "fissa"}">Spesa fissa</button></div>`;
  return seg + (ui.pantryView === "fissa" ? viewRecurring() : viewPantry());
}
function pchip(x) {
  if (ui.pantryEdit) return `<span class="pchip">${esc(x.name)}<button class="icon-btn small x" data-a="pantry-del" data-name="${esc(x.name)}" aria-label="Togli ${esc(x.name)}">${icon("x", 15)}</button></span>`;
  const st = x.state === "poco" ? "quasi finito" : x.state === "finito" ? "manca" : "";
  return `<button class="pchip ${x.state}" data-a="pantry-cycle" data-name="${esc(x.name)}">${esc(x.name)}${st ? `<span class="st">${st}</span>` : ""}</button>`;
}
function viewPantry() {
  const sorted = state.pantry.slice().sort((a, b) => a.name.localeCompare(b.name, "it"));
  const buy = sorted.filter((x) => x.state !== "ok"), ok = sorted.filter((x) => x.state === "ok");
  return `<div class="pantry-sum"><span class="hint">Tocca per cambiare: c'è, quasi finito, manca.</span>
      <button class="link" data-a="pantry-edit">${ui.pantryEdit ? "Fine" : "Modifica"}</button></div>
    ${ui.pantryEdit ? `<form class="add-field" data-form="pantry-add" style="margin-bottom:16px">${icon("plus", 18)}<input name="name" placeholder="Aggiungi alla dispensa…" autocomplete="off" aria-label="Aggiungi alla dispensa"><button class="btn small primary">Aggiungi</button></form>` : ""}
    ${buy.length ? `<div class="pgroup"><h4>Da comprare · ${buy.length}</h4><div class="pchips">${buy.map(pchip).join("")}</div></div>` : ""}
    <div class="pgroup"><h4>${buy.length ? "In casa" : "Tutto in casa"} · ${ok.length}</h4><div class="pchips">${ok.map(pchip).join("")}</div></div>`;
}
function viewRecurring() {
  const list = (state.recurring || []).slice().sort((a, b) => a.name.localeCompare(b.name, "it"));
  return `<p class="hint" style="margin:16px 2px 12px">Entra in lista ogni settimana. Dalla lista la salti per una settimana sola.</p>
    <form class="add-field" data-form="rec-add" style="margin-bottom:14px">${icon("plus", 18)}<input name="name" placeholder="Es. 3 pz yogurt Fage" autocomplete="off" aria-label="Aggiungi alla spesa fissa"><button class="btn small primary">Aggiungi</button></form>
    <div class="list-card">${list.map((x) => `
      <div class="rec-row ${x.on ? "" : "off"}">
        <span class="t"><b>${esc(x.name)}</b><small>${esc(fmtQty(x.qty, x.unit))}${x.on ? "" : " · in pausa"}</small></span>
        <button class="switch" role="switch" aria-checked="${!!x.on}" data-a="rec-toggle" data-id="${x.id}" aria-label="Ogni settimana"></button>
        <button class="icon-btn small" data-a="rec-del" data-id="${x.id}" aria-label="Togli">${icon("trash-2", 16)}</button>
      </div>`).join("") || '<p class="hint center">Vuota.</p>'}</div>`;
}

// ---------------------------------------------------------------- sheets
function openSheet(html) {
  const s = $("#sheet");
  s.querySelector(".sheet-body").innerHTML = html;
  delete s.dataset.closing;
  if (s.hidden) { s.hidden = false; s.querySelector(".sheet-panel").scrollTop = 0; requestAnimationFrame(() => s.classList.add("open")); }
  else s.classList.add("open");
}
function closeSheet() {
  const s = $("#sheet"); s.classList.remove("open"); s.dataset.closing = "1";
  setTimeout(() => { if (s.dataset.closing) { s.hidden = true; delete s.dataset.closing; } }, 260);
}
const sheetOpen = () => !$("#sheet").hidden && !$("#sheet").dataset.closing;
const action = (a, k, ic, label, small = "", cls = "") => `<button class="${cls}" data-a="${a}" data-k="${esc(k)}">${icon(ic, 19)}<span>${label}</span>${small ? `<small>${small}</small>` : ""}</button>`;

function sheetSlot(k) {
  const { date, meal, person } = splitKey(k);
  const p = plan(state, ui.wk), s = p.slots[k];
  const where = `${DAY_LONG[dayIndex(date)]} ${fmtDay(date)} · ${MEAL_LABEL[meal]}${person ? ` · ${esc(person)}` : ""}`;
  if (!s || s.status === "fuori") {
    return openSheet(`<div class="sheet-head"><div><div class="eyebrow">${where}</div><h2>${s ? "Fuori casa" : "Da decidere"}</h2></div></div>
      <div class="action-list">
        ${action("reroll", k, "refresh-cw", "Proponimi qualcosa")}
        ${action("surprise", k, "dices", "Sorprendimi", "una ricetta nuova")}
        ${action("pick", k, "book-open", "Scegli dal catalogo")}
        ${s ? (meal === "cena" ? `<button data-a="dinner-out" data-d="${date}">${icon("rotate-ccw", 19)}<span>Si cena a casa</span></button>` : action("clear", k, "rotate-ccw", "Si pranza a casa"))
          : action("fuori", k, "utensils-crossed", meal === "cena" ? "Cena fuori" : "Pranzo fuori o salta")}
      </div>`);
  }
  const info = slotInfo(s); if (!info) return;
  const { r, side } = info;
  const done = s.status === "done";
  const variants = r.variants ? `<div class="variants">${r.variants.map((v, i) =>
    `<button class="chip ${s.variant === i ? "on" : ""}" data-a="variant" data-k="${esc(k)}" data-i="${i}">${esc(v.name)}</button>`).join("")}</div>` : "";
  openSheet(`<div class="sheet-head">${dishIco(r, "lg")}<div><div class="eyebrow">${where}</div>
      <h2 class="${flashCls(k)}">${esc(info.title)}</h2>${side ? `<div class="side">con ${esc(side.title.toLowerCase())}</div>` : ""}</div></div>
    <div class="meta" style="margin-top:12px">${metaBits(info.time, info.effort)}${s.surprise ? '<span class="tag new">Ricetta nuova</span>' : ""}${s.locked ? `<span class="tag">${icon("lock", 11)} Bloccato</span>` : ""}</div>
    ${variants}
    <div class="sheet-row">
      <button class="btn ${done ? "soft" : "primary"}" data-a="done" data-k="${esc(k)}">${icon("check", 18)} ${done ? "Annulla «fatto»" : "Fatto"}</button>
      <button class="btn soft" data-a="recipe" data-id="${r.id}">${icon("book-open", 17)} ${side ? "Come si fa" : "Ricetta"}</button>
    </div>
    ${done ? `<div style="background:var(--surface);border-radius:var(--r-md);padding:2px 14px 14px;margin-top:14px;box-shadow:var(--shadow)">${rateRow(k, r, date)}</div>` : ""}
    <div class="action-list">
      ${side ? action("swap-protein", k, "refresh-cw", "Altra proteina", esc(r.title)) + action("swap-side", k, "refresh-cw", "Altro contorno", esc(side.title)) : action("reroll", k, "refresh-cw", "Cambia piatto")}
      ${side ? action("reroll", k, "shuffle", "Cambia tutto") : ""}
      ${action("surprise", k, "dices", "Sorprendimi", "una ricetta nuova")}
      ${action("pick", k, "book-open", "Scegli dal catalogo")}
      ${action("lock", k, s.locked ? "lock-open" : "lock", s.locked ? "Sblocca" : "Blocca", s.locked ? "" : "Rigenera non lo cambia")}
      ${action("fuori", k, "utensils-crossed", meal === "cena" ? "Cena fuori" : "Pranzo fuori o salta")}
      ${action("clear", k, "trash-2", "Svuota", "", "danger")}
    </div>`);
}

function sheetPick(k) {
  const { meal, person } = splitKey(k);
  ui.pickKey = k; ui.pickQ = "";
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">${MEAL_LABEL[meal]}${person ? ` · ${esc(person)}` : ""}</div><h2>Scegli</h2></div></div>
    ${meal === "cena" ? '<p class="hint" style="margin:6px 0 14px">Una proteina (il contorno lo abbino io), un contorno per la proteina che c\'è già, o un piatto completo.</p>' : '<div style="height:14px"></div>'}
    <label class="search">${icon("search", 18)}<input class="field" type="search" placeholder="Cerca" data-input="pickQ" aria-label="Cerca"></label>
    <div id="pick-list"></div>`);
  renderPickList();
}
function renderPickList() {
  const { meal, person } = splitKey(ui.pickKey); const q = norm(ui.pickQ);
  const list = state.recipes.filter((r) => r.meal === meal && r.status !== "scartata" && (meal !== "pranzo" || forPerson(r, person)) && (!q || norm(r.title).includes(q)))
    .sort((a, b) => (a.status === b.status ? a.title.localeCompare(b.title, "it") : a.status === "rotazione" ? -1 : 1));
  $("#pick-list").innerHTML = meal === "cena"
    ? KIND.map(([kd, l]) => { const g = list.filter((r) => kindOf(r) === kd); return g.length ? `<h3>${l}</h3><div class="rlist" style="margin-top:0">${g.map((r) => recipeRow(r, "pick-one")).join("")}</div>` : ""; }).join("")
    : `<div class="rlist">${list.map((r) => recipeRow(r, "pick-one")).join("")}</div>`;
}

function sheetRecipe(id) {
  const r = R(id); if (!r) return;
  const pantry = new Set(state.pantry.map((x) => norm(x.name)));
  // da comprare in lista, la dispensa riassunta in una riga
  const ingList = (arr) => {
    const buy = arr.filter((i) => !pantry.has(norm(i.name))), have = arr.filter((i) => pantry.has(norm(i.name)));
    return (buy.length ? `<ul class="ings">${buy.map((i) => `<li><span>${esc(i.name)}</span><span class="q">${i.qty != null ? esc(fmtQty(i.qty, i.unit)) : "q.b."}</span></li>`).join("")}</ul>` : "")
      + (have.length ? `<p class="hint" style="margin:10px 4px 0">Dalla dispensa: ${esc(have.map((i) => i.name.toLowerCase()).join(", "))}.</p>` : "");
  };
  const sel = (field, opts, cur) => `<select data-change="recipe-field" data-id="${r.id}" data-field="${field}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const wkDays = weekDays(ui.wk), serves = r.serves || 2;
  openSheet(`<div class="sheet-head">${dishIco(r, "lg")}<div>
      <div class="eyebrow">${SOURCE[r.source] || ""}${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">originale</a>` : ""}</div>
      <h2>${esc(r.title)}</h2></div></div>
    <div class="meta" style="margin-top:12px">${metaBits(r.time, r.effort)}<span>${icon("users", 14)}${serves} ${serves === 1 ? "porzione" : "porzioni"}</span>${likes(r)}
      <button class="link meta-link" data-a="edit-recipe" data-id="${r.id}">${icon("pencil", 14)} Modifica</button></div>
    <p class="hint" style="margin:6px 0 0">${lastCooked(r)}</p>
    ${r.note ? `<p style="margin:12px 0 0">${esc(r.note)}</p>` : ""}
    ${(r.ingredients || []).length ? `<h3>Ingredienti</h3>${ingList(r.ingredients)}` : ""}
    ${r.variants ? r.variants.map((v) => `<h3>Variante · ${esc(v.name)}</h3>${ingList(v.ingredients)}`).join("") : ""}
    ${r.steps?.length ? `<h3>Come si fa</h3><ol class="steps">${r.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join("")}</ol>` : ""}
    ${r.role === "contorno" ? "" : `<h3>Mettila nel menu</h3>
    <form class="inline-form" data-form="to-menu" data-id="${r.id}">
      <select name="date" aria-label="Giorno">${wkDays.map((d) => `<option value="${d}" ${d === selDay() ? "selected" : ""}>${DAY_SHORT[dayIndex(d)]} ${fmtDay(d)}</option>`).join("")}</select>
      ${r.meal === "pranzo" ? `<select name="person" aria-label="Per chi">${state.settings.people.filter((pp) => forPerson(r, pp)).map((pp) => `<option>${esc(pp)}</option>`).join("")}</select>` : ""}
      <button class="btn primary">Aggiungi</button>
    </form>`}
    <details class="settings"><summary>${icon("chevron-down", 16)} Impostazioni della ricetta</summary>
      <div class="form-grid">
        <label>Stato ${sel("status", [["rotazione", "Classico"], ["da provare", "Da provare"], ["scartata", "Scartata"]], r.status)}</label>
        <label>Pasto ${sel("meal", [["pranzo", "Pranzo"], ["cena", "Cena"]], r.meal)}</label>
        ${r.meal === "cena" ? `<label>Tipo ${sel("kind", KIND.map(([v]) => [v, KIND_ONE[v]]), kindOf(r))}</label>`
          : `<label>Per ${sel("people", [["", "Entrambi"], ...state.settings.people.map((pp) => [pp, pp])], r.people?.[0] || "")}</label>`}
        <label>Sforzo ${sel("effort", [[1, "Facile"], [2, "Media"], [3, "Impegnativa"]], r.effort)}</label>
      </div>
      <div class="action-list"><button class="danger" data-a="recipe-del" data-id="${r.id}">${icon("trash-2", 19)}<span>Elimina ricetta</span></button></div>
    </details>`);
}

const ingLine = (i) => (i.qty != null ? `${String(i.qty).replace(".", ",")} ${i.unit || "pz"} ${i.name}` : i.name);
/** Modulo ricetta: vuoto per una nuova, precompilato per modificarne una esistente. */
function sheetNewRecipe(r = null) {
  const meal = r?.meal || ui.meal, kind = r ? kindOf(r) : (ui.meal === "cena" ? ui.kind : "special");
  const person = r ? r.people?.[0] || "" : ui.person || "", eff = r?.effort || 2, st = r?.status || "da provare";
  const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${l}</option>`;
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Ricette</div><h2>${r ? "Modifica ricetta" : "Nuova ricetta"}</h2></div></div>
    <form class="form" data-form="${r ? "edit-recipe" : "new-recipe"}" ${r ? `data-id="${r.id}"` : ""} style="margin-top:16px">
      <label>Nome<input name="title" required placeholder="Es. Pollo al limone" value="${esc(r?.title || "")}"></label>
      <div class="form-grid">
        <label>Pasto<select name="meal">${opt("cena", "Cena", meal)}${opt("pranzo", "Pranzo", meal)}</select></label>
        <label>Sforzo<select name="effort">${opt(1, "Facile", eff)}${opt(2, "Media", eff)}${opt(3, "Impegnativa", eff)}</select></label>
        <label>Tipo (cena)<select name="kind">${KIND.map(([v]) => opt(v, KIND_ONE[v], kind)).join("")}</select></label>
        <label>Per (pranzo)<select name="person">${opt("", "Entrambi", person)}${state.settings.people.map((pp) => opt(esc(pp), esc(pp), person)).join("")}</select></label>
        <label>Minuti<input name="time" type="number" min="0" inputmode="numeric" placeholder="30" value="${r?.time ?? ""}"></label>
        <label>Porzioni<input name="serves" type="number" min="1" value="${r?.serves || (meal === "pranzo" ? 1 : 2)}" inputmode="numeric"></label>
      </div>
      <label>Proteina<input name="protein" placeholder="pollo, manzo, pesce…" value="${esc(r?.protein || "")}"></label>
      <label>Ingredienti, uno per riga<textarea name="ings" rows="7" placeholder="400 g petto di pollo&#10;2 limoni&#10;1 busta insalata&#10;sale">${esc((r?.ingredients || []).map(ingLine).join("\n"))}</textarea></label>
      ${r?.variants ? `<p class="hint" style="margin:-4px 2px 0">Le varianti (${esc(r.variants.map((v) => v.name).join(", "))}) restano come sono.</p>` : ""}
      <label>Come si fa, un passo per riga<textarea name="steps" rows="5">${esc((r?.steps || []).join("\n"))}</textarea></label>
      <label>Link (facoltativo)<input name="url" type="url" placeholder="https://…" value="${esc(r?.url || "")}"></label>
      <label>Stato<select name="status">${opt("da provare", "Da provare: esce come ricetta nuova", st)}${opt("rotazione", "Classico", st)}${r ? opt("scartata", "Scartata", st) : ""}</select></label>
      <button class="btn primary block">${r ? "Salva le modifiche" : "Salva ricetta"}</button>
    </form>`);
}

/** "+" delle ricette: incolla un link (o un testo) da importare dopo, oppure scrivi la ricetta adesso. */
function sheetAddRecipe() {
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Ricette</div><h2>Aggiungi una ricetta</h2></div></div>
    <form class="form" data-form="inbox-add" style="margin-top:16px">
      <label>Link o testo della ricetta<textarea name="v" rows="3" required placeholder="https://www.giallozafferano.it/…&#10;oppure incolla il testo, anche con una nota"></textarea></label>
      <button class="btn primary block">${icon("arrow-up-right", 18)} Metti da parte per l'import</button>
    </form>
    <p class="hint" style="margin:10px 2px 0">I link messi da parte diventano ricette quando chiedi a Claude di importarli. Entrano come «da provare».</p>
    <div class="action-list">
      <button data-a="new-recipe">${icon("pencil", 19)}<span>Scrivila tu, adesso</span></button>
      <button data-a="inbox">${icon("list-checks", 19)}<span>Link da importare</span><small>${(state.inbox || []).filter((x) => x.status === "nuovo").length}</small></button>
      <button data-a="import">${icon("package", 19)}<span>Importa da JSON</span></button>
    </div>`);
}

function inboxTitle(x) {
  if (x.url) { try { const u = new URL(x.url); return { t: u.hostname.replace(/^www\./, ""), s: decodeURIComponent(u.pathname).replace(/[-_/]+/g, " ").trim() }; } catch { return { t: x.url, s: "" }; } }
  return { t: (x.text || "").split("\n")[0].slice(0, 60), s: "testo incollato" };
}
function sheetInbox() {
  const all = state.inbox || [];
  const pending = all.filter((x) => x.status === "nuovo"), done = all.filter((x) => x.status === "importato"), skipped = all.filter((x) => x.status === "scartato");
  const row = (x) => { const { t, s } = inboxTitle(x);
    return `<div class="rec-row"><span class="t"><b>${esc(t)}</b><small>${esc([s, x.url && x.text ? x.text : "", fmtDay(x.at.slice(0, 10))].filter(Boolean).join(" · "))}</small></span>
      ${x.url ? `<a class="icon-btn small" href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="Apri">${icon("arrow-up-right", 16)}</a>` : ""}
      <button class="icon-btn small" data-a="inbox-del" data-id="${x.id}" aria-label="Togli">${icon("trash-2", 16)}</button></div>`; };
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Ricette</div><h2>Link da importare</h2></div></div>
    <form class="add-field" data-form="inbox-add" style="margin-top:16px">${icon("plus", 18)}<input name="v" placeholder="Incolla un link…" autocomplete="off" aria-label="Link"><button class="btn small primary">Aggiungi</button></form>
    <h3>In attesa · ${pending.length}</h3>
    ${pending.length ? `<div class="list-card">${pending.map(row).join("")}</div>
      <p class="hint" style="margin:10px 2px 0">Per importarli scrivi a Claude: «importa i link della lista ricette».</p>` : '<p class="hint">Nessun link in attesa.</p>'}
    ${skipped.length ? `<h3>Non importati · ${skipped.length}</h3><div class="list-card">${skipped.map((x) => { const { t } = inboxTitle(x);
      return `<div class="rec-row"><span class="t"><b>${esc(t)}</b><small>${esc(x.reason || "")}</small></span><button class="icon-btn small" data-a="inbox-del" data-id="${x.id}" aria-label="Togli">${icon("trash-2", 16)}</button></div>`; }).join("")}</div>` : ""}
    ${done.length ? `<p class="hint" style="margin-top:16px">${done.length} già ${done.length === 1 ? "importato" : "importati"}: li trovi tra le ricette «da provare».</p>` : ""}`);
}

function sheetImport() {
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Ricette</div><h2>Importa ricette</h2></div></div>
    <p class="hint">Incolla un array JSON, per esempio quello che ti prepara Claude. Campi: <code>title</code>, <code>meal</code> (pranzo/cena), <code>effort</code> (1-3), <code>time</code>, <code>protein</code>, <code>ingredients</code> (righe tipo "400 g petto di pollo"), <code>steps</code>, <code>url</code>, <code>serves</code>, <code>role</code> (proteina/contorno/piatto), <code>special</code>, <code>people</code>. Entrano come «da provare».</p>
    <form class="form" data-form="import"><textarea name="json" rows="10" placeholder='[{"title": "…", "meal": "cena", "effort": 2, "ingredients": ["400 g petto di pollo"], "steps": ["…"]}]'></textarea>
    <button class="btn primary block">Importa</button></form>`);
}

function sheetSettings() {
  const st = state.settings;
  const daySel = (k) => `<select data-change="setting" data-k="${k}"><option value="-1" ${st[k] < 0 ? "selected" : ""}>Nessuna</option>${DAY_LONG.map((d, i) => `<option value="${i}" ${st[k] === i ? "selected" : ""}>${d}</option>`).join("")}</select>`;
  const num = (k, min, max) => `<input type="number" min="${min}" max="${max}" value="${st[k]}" data-change="setting" data-k="${esc(k)}" inputmode="numeric">`;
  const user = sync.getUser();
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Cosa mangiamo</div><h2>Impostazioni</h2></div></div>
    <h3>Il menu</h3>
    <div class="form">
      <div class="form-grid">
        <label>Cena speciale ${daySel("specialDay")}</label>
        <label>Pizza ${daySel("pizzaDay")}</label>
      </div>
      <label>La speciale è una ricetta nuova <select data-change="setting" data-k="surpriseEvery">${[[1, "Ogni settimana"], [2, "Una settimana sì e una no"], [0, "Mai, solo classici"]].map(([v, l]) => `<option value="${v}" ${st.surpriseEvery === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="form-grid">
        <label>Sforzo max lun–ven <select data-change="setting" data-k="maxEffortWeekday">${[1, 2, 3].map((v) => `<option value="${v}" ${st.maxEffortWeekday === v ? "selected" : ""}>${EFFORT[v]}</option>`).join("")}</select></label>
        <label>Giorni senza ripetere ${num("noRepeatDays", 0, 60)}</label>
      </div>
      <label>Ingredienti da evitare, separati da virgola <input type="text" value="${esc((st.avoid || []).join(", "))}" data-change="setting-list" data-k="avoid" placeholder="ceci, funghi…"></label>
    </div>
    <h3>Account</h3>
    ${sync.enabled ? (user ? `<div class="action-list" style="margin-top:0"><button data-a="logout">${icon("users", 19)}<span>${esc(user.email)}</span><small>Esci</small></button></div>
      <p class="hint" style="margin:8px 2px 0">${SYNC_LABEL[sync.getStatus()] || ""}</p>`
      : '<p class="hint">Non connesso.</p>') : '<p class="hint">Sincronizzazione non configurata: i dati vivono solo in questo browser.</p>'}
    <h3>Dati</h3>
    <div class="action-list" style="margin-top:0">
      <button data-a="export">${icon("arrow-up-right", 19)}<span>Esporta un backup</span></button>
      <label style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-top:1px solid var(--line);font-weight:550;cursor:pointer">${icon("package", 19)}<span>Importa un backup</span><input type="file" accept="application/json" data-change="import-file" hidden></label>
      <button class="danger" data-a="reset">${icon("rotate-ccw", 19)}<span>Ripristina i dati iniziali</span></button>
    </div>`);
}

// ---------------------------------------------------------------- azioni
function setSlot(k, s) { plan(state, ui.wk).slots[k] = s; }
function reroll(k, mode = "auto") {
  const p = plan(state, ui.wk), cur = p.slots[k];
  const slots = { ...p.slots }; delete slots[k];
  const useMode = mode === "surprise" || cur?.surprise ? "surprise" : mode;
  const exclude = cur?.recipeId ? [cur.recipeId] : [];
  let s = pickForSlot(state, ui.wk, k, { mode: useMode, exclude, slots });
  if (!s && useMode === "surprise") {
    toast("Non ci sono ricette nuove per questo pasto: ti propongo un classico");
    s = pickForSlot(state, ui.wk, k, { exclude, slots });
  }
  if (s) setSlot(k, s);
  return s;
}
/** Dopo un'azione su uno slot: aggiorna la pagina e, se aperto, il foglio. Il piatto nuovo entra con un'animazione. */
function afterSlot(k, flash = false) {
  const wasOpen = sheetOpen();
  if (flash) ui.flash = k;
  const f = ui.flash;
  commit();
  if (wasOpen) { ui.flash = f; sheetSlot(k); ui.flash = null; }
}

const actions = {
  tab: (d) => { ui.tab = d.tabTo || d.tab; render(); window.scrollTo(0, 0); },
  wk: (d) => { const n = Number(d.d); ui.day = addDays(selDay(), n); ui.wk = addDays(ui.wk, n); render(); },
  "week-person": (d) => {
    const p = plan(state, ui.wk), cur = p.people || state.settings.people;
    const next = cur.includes(d.p) ? cur.filter((x) => x !== d.p) : [...cur, d.p];
    if (!next.length) { toast("Almeno una persona a casa: per i giorni vuoti usa i singoli giorni"); return; }
    p.people = state.settings.people.filter((x) => next.includes(x));
    if (p.people.length === state.settings.people.length) delete p.people;
    syncPresence(state, ui.wk); commit();
  },
  "day-person": (d) => {
    const p = plan(state, ui.wk), cur = presentOn(state, ui.wk, d.d);
    const next = state.settings.people.filter((x) => (x === d.p ? !cur.includes(x) : cur.includes(x)));
    const weekDefault = p.people || state.settings.people;
    p.dayPeople ||= {};
    if (next.length === weekDefault.length && next.every((x) => weekDefault.includes(x))) delete p.dayPeople[d.d];
    else p.dayPeople[d.d] = next;
    if (!Object.keys(p.dayPeople).length) delete p.dayPeople;
    syncPresence(state, ui.wk, [d.d]); commit();
  },
  "dinner-out": (d) => {
    const p = plan(state, ui.wk), k = key(d.d, "cena"), s = p.slots[k];
    // si torna al piatto che c'era prima di "cena fuori"; se non c'era, se ne sceglie uno
    if (s?.status === "fuori") { delete p.slots[k]; const n = s.prev || pickForSlot(state, ui.wk, k); if (n) p.slots[k] = n; ui.flash = k; }
    else setSlot(k, { status: "fuori", locked: true, ...(s ? { prev: s } : {}) });
    commit(); closeSheet();
  },
  day: (d) => { ui.day = d.d; ui.dayFx = true; render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
  generate: () => {
    const had = Object.keys(plan(state, ui.wk).slots).length;
    generateWeek(state, ui.wk); commit();
    toast(had ? "Menu rigenerato: i piatti bloccati e già fatti sono rimasti" : "Menu pronto. Tocca un piatto per cambiarlo");
  },
  slot: (d) => sheetSlot(d.k),
  reroll: (d) => { reroll(d.k); afterSlot(d.k, true); },
  surprise: (d) => { const s = reroll(d.k, "surprise"); afterSlot(d.k, true); if (s?.surprise) toast("Ricetta nuova in tavola"); },
  lock: (d) => { const s = plan(state, ui.wk).slots[d.k]; s.locked = !s.locked; afterSlot(d.k); },
  done: (d) => { const s = plan(state, ui.wk).slots[d.k]; markDone(state, ui.wk, d.k, s.status !== "done"); afterSlot(d.k); },
  rate: (d) => {
    const { date } = splitKey(d.k); const s = plan(state, ui.wk).slots[d.k];
    const r = R(s.recipeId); const cur = (r.ratings || []).find((x) => x.date === date && x.who === d.who)?.v || 0;
    const v = Number(d.v) === cur ? 0 : Number(d.v);
    const changed = rate(state, s.recipeId, date, d.who, v);
    afterSlot(d.k);
    if (changed === "rotazione") toast("Promossa: ora è tra i classici");
    if (changed === "scartata") toast("Scartata: non ve la propongo più");
  },
  variant: (d) => { plan(state, ui.wk).slots[d.k].variant = Number(d.i); afterSlot(d.k, true); },
  fuori: (d) => { const cur = plan(state, ui.wk).slots[d.k]; setSlot(d.k, { status: "fuori", locked: true, ...(cur && cur.status !== "fuori" ? { prev: cur } : {}) }); commit(); closeSheet(); },
  clear: (d) => { const p = plan(state, ui.wk), cur = p.slots[d.k]; if (cur?.status === "fuori" && cur.prev) p.slots[d.k] = cur.prev; else delete p.slots[d.k]; commit(); closeSheet(); },
  pick: (d) => sheetPick(d.k),
  "pick-one": (d) => {
    const r = R(d.id), k = ui.pickKey, cur = plan(state, ui.wk).slots[k];
    let slot = { recipeId: r.id, variant: r.variants ? 0 : null, status: "planned", surprise: r.status === "da provare", special: !!r.special, locked: true };
    if (r.role === "proteina") slot.sideId = (cur?.sideId) || pickPart(state, ui.wk, k, { keepProtein: r })?.sideId;
    if (r.role === "contorno") {
      const prot = cur?.sideId ? R(cur.recipeId) : null;
      const s2 = prot ? { recipeId: prot.id } : pickPart(state, ui.wk, k, { keepSide: r });
      if (!s2) { toast("Nessuna proteina da abbinare"); return; }
      slot = { ...slot, recipeId: s2.recipeId, sideId: r.id, variant: null, surprise: false, special: false };
    }
    setSlot(k, slot); ui.flash = k; commit(); ui.flash = k; sheetSlot(k); ui.flash = null;
  },
  "swap-protein": (d) => { if (!swapPart(state, ui.wk, d.k, "protein")) toast("Non ho alternative"); afterSlot(d.k, true); },
  "swap-side": (d) => { if (!swapPart(state, ui.wk, d.k, "side")) toast("Non ho alternative"); afterSlot(d.k, true); },
  kind: (d) => { ui.kind = d.v; render(); },
  person: (d) => { ui.person = d.v; render(); },
  "pantry-view": (d) => { ui.pantryView = d.v; render(); },
  "pantry-edit": () => { ui.pantryEdit = !ui.pantryEdit; render(); },
  "rec-skip": (d) => { const p = plan(state, ui.wk); (p.skipRecurring ||= {})[d.id] = true; commit(); toast("Saltato per questa settimana"); },
  "rec-restore": () => { plan(state, ui.wk).skipRecurring = {}; commit(); },
  "rec-toggle": (d) => { const x = state.recurring.find((y) => y.id === d.id); x.on = !x.on; commit(); },
  "rec-del": (d) => { state.recurring = state.recurring.filter((y) => y.id !== d.id); commit(); },
  recipe: (d) => sheetRecipe(d.id),
  "recipe-del": (d) => {
    if (!confirm("Eliminare questa ricetta?")) return;
    state.recipes = state.recipes.filter((r) => r.id !== d.id);
    (state.deleted ||= []).includes(d.id) || state.deleted.push(d.id); // non farla ricomparire con il prossimo seed
    for (const p of Object.values(state.plans)) for (const [k, s] of Object.entries(p.slots)) if (s.recipeId === d.id) delete p.slots[k];
    commit(); closeSheet();
  },
  "new-recipe": () => sheetNewRecipe(),
  "edit-recipe": (d) => sheetNewRecipe(R(d.id)),
  "add-recipe": () => sheetAddRecipe(),
  inbox: () => sheetInbox(),
  "inbox-del": (d) => { state.inbox = (state.inbox || []).filter((x) => x.id !== d.id); commit(); sheetInbox(); },
  import: () => sheetImport(),
  meal: (d) => { ui.meal = d.m; render(); },
  status: (d) => { ui.status = d.s; render(); },
  "hide-checked": () => { ui.hideChecked = !ui.hideChecked; render(); },
  check: (d, el) => {
    const p = plan(state, ui.wk); p.checked[d.key] = el.checked;
    const it = buildList(state, ui.wk).items.find((i) => i.key === d.key);
    if (it?.fromPantry) {
      const x = state.pantry.find((y) => norm(y.name) === norm(it.name));
      p.boughtPantry ||= {};
      if (x) { x.state = el.checked ? "ok" : "finito"; p.boughtPantry[norm(it.name)] = true; }
    }
    // lascia vedere la spunta prima di ridisegnare
    save(state); sync.schedule(); setTimeout(render, 180);
  },
  copy: async (d) => {
    try { await navigator.clipboard.writeText(d.name); toast(`«${d.name}» copiato: incollalo nella ricerca`); }
    catch { toast(d.name); }
  },
  "extra-del": (d) => { const p = plan(state, ui.wk); p.extras = p.extras.filter((x) => x.id !== d.id); commit(); },
  "share-list": async () => {
    const text = `Spesa ${fmtWeek(ui.wk)}\n\n` + asText(buildList(state, ui.wk).items, "cat");
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "Lista della spesa", text }); return; }
      await navigator.clipboard.writeText(text); toast("Lista copiata");
    } catch (e) {
      if (e?.name === "AbortError") return;
      openSheet(`<div class="sheet-head"><div><h2>Lista della spesa</h2></div></div><textarea rows="16" readonly style="margin-top:14px">${esc(text)}</textarea>`);
    }
  },
  "pantry-missing": (d) => { const x = state.pantry.find((y) => y.name === d.name); if (x) x.state = "finito"; commit(); toast(`${d.name}: in lista`); },
  "pantry-cycle": (d) => {
    const x = state.pantry.find((y) => y.name === d.name);
    x.state = { ok: "poco", poco: "finito", finito: "ok" }[x.state]; commit();
  },
  "pantry-del": (d) => { state.pantry = state.pantry.filter((y) => y.name !== d.name); commit(); },
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
  extra: (f) => {
    const name = f.get("name").trim(); if (!name) return;
    const p = plan(state, ui.wk); p.extras ||= [];
    const parsed = parseIngredientLine(name, knownCats());
    p.extras.push({ id: uid(), name, cat: parsed?.cat || "altro" });
    commit(); setTimeout(() => $("[data-form=extra] input")?.focus(), 0);
  },
  "rec-add": (f) => {
    const line = f.get("name").trim(); if (!line) return;
    const x = parseIngredientLine(line, knownCats()); if (!x) return;
    state.recurring.push({ ...x, qty: x.qty ?? 1, unit: x.qty == null ? "pz" : x.unit, id: "r-" + uid(), on: true });
    commit(); setTimeout(() => $("[data-form=rec-add] input")?.focus(), 0);
  },
  "pantry-add": (f) => {
    const name = f.get("name").trim(); if (!name) return;
    if (!state.pantry.some((y) => norm(y.name) === norm(name))) {
      const c = parseIngredientLine(name, knownCats())?.cat;
      state.pantry.push({ name: name[0].toUpperCase() + name.slice(1), state: "ok", cat: c && c !== "altro" ? c : "dispensa" });
    }
    commit(); setTimeout(() => $("[data-form=pantry-add] input")?.focus(), 0);
  },
  "inbox-add": (f) => {
    const v = String(f.get("v") || "").trim(); if (!v) return;
    const m = v.match(/https?:\/\/\S+/);
    const url = m ? m[0].replace(/[).,;]+$/, "") : null, text = (m ? v.replace(m[0], " ") : v).replace(/[ \t]+/g, " ").trim();
    if (url && (state.inbox || []).some((x) => x.url === url && x.status === "nuovo")) { toast("Questo link è già in lista"); return; }
    (state.inbox ||= []).push({ id: uid(), ...(url ? { url } : {}), ...(text ? { text } : {}), at: new Date().toISOString(), status: "nuovo" });
    commit(); sheetInbox(); toast("Messo da parte per l'import");
  },
  "edit-recipe": (f, form) => {
    const r = R(form.dataset.id); if (!r) return;
    const known = knownCats(), meal = f.get("meal"), kind = f.get("kind"), person = f.get("person");
    Object.assign(r, { title: f.get("title").trim(), meal, effort: Number(f.get("effort")), time: Number(f.get("time")) || null,
      protein: f.get("protein").trim() || null, serves: Number(f.get("serves")) || r.serves || 2, status: f.get("status"),
      ingredients: f.get("ings").split("\n").map((l) => parseIngredientLine(l, known)).filter(Boolean),
      steps: f.get("steps").split("\n").map((s) => s.trim()).filter(Boolean), url: f.get("url").trim() || null });
    if (meal === "cena") { r.role = kind === "special" ? "piatto" : kind; r.special = kind === "special"; delete r.people; }
    else { delete r.role; delete r.special; if (person) r.people = [person]; else delete r.people; }
    commit(); sheetRecipe(r.id); toast("Ricetta aggiornata");
  },
  "new-recipe": (f) => {
    const known = knownCats();
    const title = f.get("title").trim();
    let id = slug(title) || uid(); if (R(id)) id += "-" + uid();
    const meal = f.get("meal"), kind = f.get("kind"), person = f.get("person");
    state.recipes.push({
      ...(meal === "cena" ? { role: kind === "special" ? "piatto" : kind, special: kind === "special" } : person ? { people: [person] } : {}),
      serves: Number(f.get("serves")) || 2,
      id, title, meal, effort: Number(f.get("effort")), time: Number(f.get("time")) || null,
      protein: f.get("protein").trim() || null,
      ingredients: f.get("ings").split("\n").map((l) => parseIngredientLine(l, known)).filter(Boolean),
      steps: f.get("steps").split("\n").map((s) => s.trim()).filter(Boolean),
      status: f.get("status"), tags: [], source: "mia", url: f.get("url").trim() || null, history: [], ratings: [],
    });
    ui.meal = meal; ui.status = f.get("status"); if (meal === "cena") ui.kind = kind; else if (person) ui.person = person;
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
        const meal = x.meal === "pranzo" ? "pranzo" : "cena";
        state.recipes.push({ id, title: x.title, meal, effort: Number(x.effort) || 2, serves: Number(x.serves) || 2,
          ...(meal === "cena" ? { role: x.role || "piatto", special: x.special ?? (x.role || "piatto") === "piatto" } : x.people ? { people: [].concat(x.people) } : {}),
          time: Number(x.time) || null, protein: x.protein || null, ingredients: ings,
          steps: Array.isArray(x.steps) ? x.steps : String(x.steps || "").split("\n").filter(Boolean),
          status: x.status || "da provare", tags: x.tags || [], source: x.source || "claude", url: x.url || null, note: x.note || null, history: [], ratings: [] });
        n++;
      }
      commit(); closeSheet(); toast(`${n} ${n === 1 ? "ricetta importata" : "ricette importate"}`);
    } catch (e) { alert("JSON non valido: " + e.message); }
  },
  "to-menu": (f, form) => {
    const r = R(form.dataset.id); const k = key(f.get("date"), r.meal, f.get("person"));
    const slot = { recipeId: r.id, variant: r.variants ? 0 : null, status: "planned", surprise: r.status === "da provare", special: !!r.special, locked: true };
    if (r.role === "proteina") slot.sideId = pickPart(state, ui.wk, k, { keepProtein: r })?.sideId;
    setSlot(k, slot); ui.day = f.get("date"); ui.flash = k;
    commit(); closeSheet(); toast(`Nel menu di ${DAY_LONG[dayIndex(f.get("date"))].toLowerCase()}`);
  },
};
function knownCats() {
  const m = {}; for (const r of state.recipes) for (const i of ingredientsOf(r)) m[norm(i.name)] = i.cat;
  for (const v of state.recipes.flatMap((r) => r.variants || [])) for (const i of v.ingredients) m[norm(i.name)] = i.cat;
  for (const x of state.recurring || []) m[norm(x.name)] = x.cat;
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
    const r = R(el.dataset.id), f = el.dataset.field, v = el.value;
    if (f === "kind") { r.role = v === "special" ? "piatto" : v; r.special = v === "special"; }
    else if (f === "people") { if (v) r.people = [v]; else delete r.people; }
    else if (f === "meal") { r.meal = v; if (v === "cena") { r.role ||= "piatto"; r.special ??= false; } else { delete r.role; delete r.special; } }
    else r[f] = f === "effort" ? Number(v) : v;
    commit(); sheetRecipe(r.id);
  } else if (t === "setting-list") {
    state.settings[el.dataset.k] = el.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean); commit();
  } else if (t === "setting") {
    state.settings[el.dataset.k] = Number(el.value); commit();
  } else if (t === "import-file") {
    try { state = importBackup(await el.files[0].text()); commit(); closeSheet(); toast("Backup importato"); }
    catch (err) { alert(err.message); }
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

$(".sheet-close").innerHTML = icon("x", 16);
render();
sync.init({
  getState: () => state,
  normalize: migrate,
  onRemote: (s) => { state = s; save(state); safeRender(); },
  onStatus: (st, detail) => { updateSyncDot(st, detail); if (st === "signed-out" || document.body.classList.contains("logged-out")) render(); },
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
