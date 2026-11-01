# Cosa mangiamo

PWA per il menu settimanale di casa (Alessandro e Giulia) e la lista della spesa che ne deriva.
Vanilla JS, nessuna build, nessuna dipendenza.

Stile "da cucina": carta crema, titoli in Fraunces (font incluso in `fonts/`, licenza OFL), pomodoro come unico
accento forte, icone Lucide inline (`js/icons.js`, licenza ISC). Tema chiaro e scuro automatici.

## Avvio in locale

```bash
cd ~/Developer/Personal/food-app
python3 -m http.server 8080
# apri http://localhost:8080
```

Serve un server HTTP: aprendo `index.html` da file i moduli JS non partono.
Per provarla sull'iPhone nella stessa rete: `http://<ip-del-mac>:8080`. L'installazione come PWA
(Condividi → Aggiungi alla schermata Home) funziona davvero solo in HTTPS, quindi dopo la pubblicazione.

## Come funziona

- **Menu**: "Genera" riempie la settimana. Regole in `js/planner.js`:
  - **Pranzi per persona**: Alessandro pasta/tortellini, Giulia zuppa pronta o insalata di riso (campo `people`);
    in settimana solo piatti a sforzo 1, al massimo una novità facile a settimana a testa.
  - **Cene componibili**: una proteina + un contorno (`role: "proteina" | "contorno"`), con i prodotti della spesa
    Iperal; ogni tanto un piatto completo facile (tacos, hamburger nel panino). Niente stessa proteina due sere di fila.
  - **Cena speciale** (sabato): una ricetta vera, HelloFresh o nuova. Una settimana sì e una no è una sorpresa
    presa dalle ricette *da provare*. **Pizza surgelata** il venerdì. Giorni e frequenze in ⚙︎.
  - Da ogni slot: blocca, cambia (↻), altra proteina / altro contorno, sorprendimi, scegli a mano, fuori casa.
- **Voti**: dopo "Fatto" ognuno dà 👍/👎. Un piatto nuovo con un 👍 entra in rotazione, con un 👎 viene scartato.
- **Spesa**: somma gli ingredienti della settimana (scalati per porzioni: i pranzi sono per una persona, `serves`
  dice per quante porzioni sono le quantità), toglie dispensa e spesa fissa, aggiunge la **spesa fissa**
  (Dispensa → Spesa fissa: yogurt, Coca Zero, affettati…) e la dispensa finita. Un fisso si salta per una settimana con ×.
  Ogni articolo si può etichettare Esselunga/Iperal (l'etichetta resta per le settimane successive).
  "Condividi" manda la lista come testo, comodo per la spesa online.
- **Dispensa**: le cose date per scontate (olio, pasta, spezie, salse…). Se una finisce, la segni e va in lista.

## Dati

- Copia locale in `localStorage` (l'app si apre subito e funziona offline), sincronizzata con Supabase
  se `js/config.js` contiene la chiave publishable. Senza chiave l'app resta solo locale.
- Supabase: una tabella `kv` (chiave → JSON) con righe `recipe:<id>`, `plan:<settimana>`, `pantry`, `settings`,
  `storeOf`, `meta`. `js/sync.js` invia solo le righe cambiate, riceve quelle dell'altro telefono in realtime e,
  per ogni riga, fa vincere l'ultima scrittura senza mai sovrascrivere una modifica locale non ancora inviata.
- Accesso con email e password (una volta per dispositivo), solo per i due utenti creati in Supabase con le
  registrazioni chiuse; le policy RLS limitano la tabella alle due email. Niente magic link: su iPhone la PWA
  installata non condivide il login con Safari.
- `.github/workflows/supabase-keepalive.yml` fa una lettura al giorno per evitare la pausa del piano gratuito.
- Backup ed export/import da ⚙︎.
- `js/seed.js` è generato da `tools/build_seed.py` (ricette di casa + 16 HelloFresh estratte in
  `tools/recipes_hellofresh.json` + sorprese da provare + dispensa). Le quantità sono per 2 persone,
  in unità da supermercato.
- Nuove ricette: dalla sezione Ricette (+ Nuova, una riga per ingrediente tipo "400 g petto di pollo")
  oppure "Importa ricette (JSON)" incollando quelle preparate da Claude.

## Dopo una modifica ai file

Aumenta `VERSION` in `sw.js`, altrimenti il service worker può servire la versione in cache.
