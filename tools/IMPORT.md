# Importare le ricette messe da parte

Nell'app (Ricette → +) Alessandro e Giulia incollano link o testi di ricette. Finiscono nella riga `inbox`
della tabella `kv` su Supabase, con stato `nuovo`. Quando chiedono a Claude di importarli, la procedura è questa.

## 1. Leggere i link in attesa

La riga `inbox` è leggibile con la chiave publishable (policy `inbox leggibile con la chiave pubblica`);
il resto della tabella resta riservato a loro due.

```bash
URL=$(grep -oP 'SUPABASE_URL = "\K[^"]+' js/config.js)
KEY=$(grep -oP 'SUPABASE_KEY = "\K[^"]+' js/config.js)
curl -s "$URL/rest/v1/kv?key=eq.inbox&select=value" -H "apikey: $KEY"
```

Si importano solo gli elementi con `"status": "nuovo"`. Ognuno ha `id` e `url` e/o `text` (testo incollato o nota).

## 2. Trasformare ogni link in una ricetta

- Leggere la pagina (web fetch). Se c'è un blocco JSON-LD `schema.org/Recipe`, usarlo: nome, ingredienti, passi, tempi, porzioni.
- Scrivere la ricetta in `tools/imported_recipes.json`, nella lista `recipes`, con lo schema dell'app:

```json
{
  "inboxId": "id dell'elemento dell'inbox",
  "id": "link-nome-breve",
  "title": "Pollo al limone",
  "meal": "cena",
  "role": "piatto",
  "special": true,
  "effort": 2,
  "time": 30,
  "protein": "pollo",
  "serves": 2,
  "ingredients": [
    { "name": "Petto di pollo a fette", "qty": 400, "unit": "g", "cat": "carne" },
    { "name": "Limone", "qty": 2, "unit": "pz", "cat": "verdura" },
    "Olio evo",
    "Sale"
  ],
  "steps": ["Passi brevi, in italiano, al massimo 6."],
  "url": "il link originale"
}
```

Regole:

- **Pasto e tipo.** Le cene sono proteine: `role` è `piatto` (completo), `proteina` o `contorno`; `special: true` per le
  ricette elaborate, che escono una volta a settimana. I pranzi (`meal: "pranzo"`) sono carboidrati: pasta per
  Alessandro, zuppe o insalate di riso per Giulia (`people: ["Giulia"]`), con `serves: 1` per i piatti a porzione singola.
  Mai pasta a cena.
- **Ingredienti.** Usa i nomi che l'app conosce già: le voci di `PANTRY` in `build_seed.py` (Olio evo, Sale, Pepe,
  Pangrattato, Grana Padano, Pasta (Rummo), Riso…) contano come dispensa e non finiscono in lista. Le altre categorie
  (`verdura`, `carne`, `pesce`, `frigo`, `pane`, `dispensa`, `snack`, `surgelati`, `bevande`, `altro`) sono in `CAT`.
  Quantità da supermercato per `serves` porzioni (g, pz, conf, busta, vasetto, mazzetto).
- **Da evitare.** Niente ceci, e niente ingredienti in `settings.avoid`. Se una ricetta li richiede, va saltata.
- **Stato.** Entrano tutte come `da provare` (è il default): la prima volta escono come ricetta nuova.
- **Link non utilizzabili.** Instagram, pagine senza ricetta, ricette con ingredienti da evitare: aggiungili a `skipped`
  con un motivo breve, così l'app li mostra come «non importati»:

```json
{ "inboxId": "…", "url": "…", "reason": "Pagina senza ricetta" }
```

## 3. Pubblicare

1. Aumentare `SEED_VERSION` in `tools/build_seed.py` (le app aggiungono le ricette nuove solo se la versione sale).
2. `python3 tools/build_seed.py tools/recipes_hellofresh.json js/seed.js`
3. Aumentare `VERSION` in `sw.js`.
4. Commit; Alessandro fa `git push`.

Al primo avvio dopo il deploy, ogni telefono aggiunge le ricette nuove e segna i link dell'inbox come `importato`
(o `scartato` con il motivo). Le ricette eliminate a mano nell'app non ricompaiono.
