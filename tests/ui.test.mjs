// Interfaccia in un DOM simulato (jsdom), con l'app impacchettata da esbuild in .tmp/bundle.js.
import { ok, done, sleep, ROOT, TMP } from "./helpers.mjs";
import fs from "node:fs";
import { JSDOM } from "jsdom";
async function boot() {
  const html = fs.readFileSync(new URL("index.html", ROOT), "utf8").replace(/<script type="module".*?<\/script>/, "");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window; let copied = null;
  Object.assign(w, { matchMedia: () => ({ matches: false }), scrollTo: () => {}, confirm: () => true, alert: () => {}, structuredClone });
  w.navigator.clipboard = { writeText: async (t) => { copied = t; } };
  const errs = []; w.addEventListener("error", (e) => errs.push(e.message));
  w.eval(fs.readFileSync(new URL("bundle.js", TMP), "utf8")); await sleep(50);
  const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
  const click = (el) => { if (!el) throw new Error("elemento mancante"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const submit = (f) => f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  return { w, $, $$, click, submit, type, errs, copied: () => copied, badge: () => Number($("#tabbar [data-tab=spesa] .badge-dot")?.dataset.count || 0) };
}

// --- menu, fogli, spesa, ricette, dispensa
{
  const { w, $, $$, click, submit, type, errs, copied, badge } = await boot();
  ok(!!$(".empty-card [data-a=generate]") && $$(".empty-card [data-a=week-person]").length === 2, "settimana vuota: scelta di chi c'è e invito a preparare il menu");
  click($("[data-a=generate]"));
  ok($$(".day-pill").length === 7 && $(".hero") && $$(".lunch").length === 2 && $$(".wrow").length === 7, "menu: striscia dei giorni, cena in evidenza, 2 pranzi, settimana");
  const t0 = $(".hero h3").textContent; click($(".hero [data-a=reroll]"));
  ok($(".hero h3").classList.contains("enter"), `Cambia dalla card (${t0} → ${$(".hero h3").textContent})`);
  click($$(".wrow")[3]); ok($(".page-title").textContent === "Giovedì", "tocco un giorno della settimana");
  let combo = false; for (let i = 0; i < 7; i++) { click($$(".wrow")[i]); if ($(".hero .side")?.textContent.startsWith("con ")) { combo = true; break; } }
  ok(combo, "c'è almeno una cena proteina + contorno");
  click($(".hero [data-a=slot]")); const side0 = $(".sheet-body .side").textContent;
  click($(".sheet-body [data-a=swap-side]")); ok($(".sheet-body .side").textContent !== side0, "altro contorno dal foglio");
  click($(".sheet-body [data-a=done]")); click($(".sheet-body [data-a=rate][data-v='1']"));
  ok(!!$(".sheet-body .thumb.up.on"), "fatto e votato");
  click($("[data-a=close-sheet]")); ok($$(".hero [data-a=rate]").length === 4, "voti anche nella card");
  click($(".hero [data-a=slot]")); click($(".sheet-body [data-a=pick]"));
  ok($$("#pick-list h3").length >= 3, "catalogo raggruppato per tipo");
  click($$("#pick-list .rrow").find((c) => c.textContent.includes("Broccoli"))); ok($(".sheet-body .side").textContent === "con broccoli", "scelto un contorno");
  click($("[data-a=close-sheet]"));
  click($$(".lunch").find((l) => l.textContent.includes("Giulia"))); click($(".sheet-body [data-a=pick]"));
  ok($$("#pick-list .rrow").length > 0 && $$("#pick-list .rrow").every((c) => !/Tortellini|Pasta Rummo/.test(c.textContent)), "il catalogo del pranzo di Giulia non ha pasta");
  click($("[data-a=close-sheet]"));
  // presenze
  click($(".presence [data-a=day-person][data-p=Alessandro]")); ok($$(".lunch").length === 1, "tolgo Alessandro dal giorno: un pranzo");
  click($(".presence [data-a=day-person][data-p=Giulia]")); ok(/Nessuno a casa/.test($(".hero h3").textContent), "nessuno a casa");
  click($(".presence [data-a=day-person][data-p=Giulia]")); click($(".presence [data-a=day-person][data-p=Alessandro]"));
  const before = $(".hero h3").textContent;
  click($(".presence [data-a=dinner-out]")); ok($(".hero h3").textContent === "Cena fuori", "cena fuori");
  click($(".presence [data-a=dinner-out]")); ok($(".hero h3").textContent === before, "si cena a casa: torna il piatto di prima");
  const n2 = badge(); click($(".week-who [data-a=week-person][data-p=Giulia]"));
  ok($$(".wrow .l").every((l) => l.textContent.startsWith("Solo Alessandro")) && badge() < n2, `Giulia via tutta la settimana: lista da ${n2} a ${badge()} voci`);
  click($(".week-who [data-a=week-person][data-p=Giulia]"));
  // spesa
  click($("[data-tab=spesa]"));
  ok($$(".item").some((i) => i.textContent.includes("Fage")), "spesa fissa in lista");
  const n0 = $$(".item").length; click($("[data-a=rec-skip]")); ok($$(".item").length === n0 - 1, "salto un fisso"); click($("[data-a=rec-restore]"));
  ok(!$$(".item-qty").some((q) => /,\d/.test(q.textContent) && /pz|conf|vasett/.test(q.textContent)), "niente mezze confezioni");
  click($(".item [data-a=copy]")); await sleep(5); ok(copied()?.length > 1, "copia il nome per la ricerca");
  click($(".item input")); await sleep(250); ok($$(".item.is-checked").length === 1, "spunta");
  // ricette
  click($("[data-tab=ricette]")); ok($$("#recipe-list .rrow").length === 10, "proteine classiche");
  click($("[data-a=kind][data-v=special]")); ok($$("#recipe-list .rrow").length === 14, "speciali");
  type($(".search input"), "branzino"); click($("[data-a=kind][data-v=proteina]")); type($(".search input"), "branzino");
  ok($$("#recipe-list .rrow").length === 1, "ricerca");
  // modifica ricetta
  click($("#recipe-list .rrow")); click($(".sheet-body [data-a=edit-recipe]"));
  const ef = $("[data-form=edit-recipe]");
  ok(ef.elements.title.value === "Filetti di branzino al forno" && /1 conf Filetti di branzino Primia/.test(ef.elements.ings.value), "modulo di modifica precompilato");
  ef.elements.title.value = "Branzino al forno col limone"; ef.elements.ings.value += "\n1 pz Limone"; submit(ef);
  const st = JSON.parse(w.localStorage.getItem("food-app-v1")).recipes.find((r) => r.id === "branzino");
  ok(st.title === "Branzino al forno col limone" && st.ingredients.some((i) => i.name === "Limone" && i.cat === "verdura") && st.ingredients[0].qty === 1, "modifica salvata, ingredienti intatti");
  // link da importare
  click($("[data-a=close-sheet]")); click($("[data-a=add-recipe]"));
  const af = $("[data-form=inbox-add]"); af.elements.v.value = "Da provare https://www.giallozafferano.it/ricette/Pollo-al-limone.html stasera"; submit(af);
  const ib = JSON.parse(w.localStorage.getItem("food-app-v1")).inbox;
  ok(ib.length === 1 && ib[0].url === "https://www.giallozafferano.it/ricette/Pollo-al-limone.html" && ib[0].text === "Da provare stasera", "link messo da parte, con la nota");
  const f2 = $("[data-form=inbox-add]"); f2.elements.v.value = "https://www.giallozafferano.it/ricette/Pollo-al-limone.html"; submit(f2);
  ok(JSON.parse(w.localStorage.getItem("food-app-v1")).inbox.length === 1, "lo stesso link non entra due volte");
  click($("[data-a=close-sheet]")); ok(/1 link da importare/.test($(".inbox-banner")?.textContent || ""), "avviso dei link in attesa in Ricette");
  click($(".inbox-banner")); ok($$(".sheet-body .rec-row").length === 1 && /giallozafferano/.test($(".sheet-body .rec-row").textContent), "lista dei link in attesa");
  click($(".sheet-body [data-a=inbox-del]")); ok(!$(".inbox-banner"), "link tolto");
  // dispensa
  click($("[data-a=close-sheet]")); click($("[data-tab=dispensa]"));
  const chip = $$(".pchip").find((c) => !c.classList.contains("poco") && !c.classList.contains("finito")); const nm = chip.dataset.name;
  click(chip); click($$(".pchip").find((c) => c.dataset.name === nm));
  ok($$(".pchip.finito").some((c) => c.dataset.name === nm), "dispensa: c'è → quasi finito → manca");
  click($("[data-a=pantry-view][data-v=fissa]")); ok($$("[data-a=rec-toggle]").length === 8, "spesa fissa");
  click($("[data-a=settings]")); ok($$(".sheet-body [data-change=setting]").length === 5, "impostazioni");
  ok(errs.length === 0, "nessun errore JavaScript " + (errs.length ? JSON.stringify(errs) : ""));
}
done("interfaccia");
