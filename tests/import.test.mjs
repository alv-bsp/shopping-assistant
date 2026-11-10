// Link dell'inbox trasformati in ricette con il seed (tools/IMPORT.md). Usa un seed di prova in .tmp/imp.
import { app, ok, done, mem, TMP } from "./helpers.mjs";
const cur = await app("js/store.js");
const s0 = cur.load(null);
s0.inbox = [{ id: "abc", url: "https://example.com/pollo", status: "nuovo", at: "2026-11-10T10:00:00Z" },
  { id: "def", url: "https://instagram.com/p/x", status: "nuovo", at: "2026-11-10T10:00:00Z" },
  { id: "ghi", text: "zuppa della nonna", status: "nuovo", at: "2026-11-10T10:00:00Z" }];
s0.recipes = s0.recipes.filter((r) => r.id !== "frittata"); s0.deleted = ["frittata"];
const imp = await import(new URL("imp/js/store.js", TMP).href);
const s = imp.load(mem({ "food-app-v1": JSON.stringify(s0) }));
const r = s.recipes.find((x) => x.id === "link-pollo-limone");
ok(r && r.status === "da provare" && r.special && r.source === "link", "ricetta importata, «da provare»");
ok(r.ingredients.length === 3 && r.ingredients[1].cat === "verdura" && r.ingredients[0].qty === 400, "ingredienti con categorie e quantità");
const it = Object.fromEntries(s.inbox.map((x) => [x.id, x]));
ok(it.abc.status === "importato" && it.abc.recipeId === "link-pollo-limone", "link segnato come importato");
ok(it.def.status === "scartato" && /Instagram/.test(it.def.reason), "link scartato con il motivo");
ok(it.ghi.status === "nuovo", "gli altri restano in attesa");
ok(!s.recipes.some((x) => x.id === "frittata"), "una ricetta eliminata a mano non ricompare");
const sync = await app("js/sync.js", "?imp"); const back = sync.fromRows(JSON.parse(JSON.stringify(sync.toRows(s))));
ok(back.inbox.length === 3 && back.deleted.includes("frittata"), "inbox e ricette eliminate passano nella sincronizzazione");
done("import da link");
