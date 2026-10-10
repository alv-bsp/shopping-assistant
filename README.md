# Cosa mangiamo

PWA per il menu settimanale di casa (Alessandro e Giulia) e la lista della spesa che ne deriva.
Vanilla JS, nessuna build, nessuna dipendenza.

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

- **Menu**: "Genera" riempie 7 pranzi (carboidrati) e 7 cene (proteine). Regole in `js/planner.js`:
  lun–ven sforzo massimo 2 con un piccolo bonus ai piatti facili, niente stesso piatto a meno di 10 giorni,
  niente stessa proteina due cene di fila, 1 cena "sorpresa" il sabato presa dalle ricette *da provare*.
  Da ogni piatto si può bloccarlo, cambiarlo (↻), chiedere una sorpresa, sceglierlo a mano o segnarlo come fuori casa.
- **Voti**: dopo "Fatto" ognuno dà 👍/👎. Un piatto nuovo con un 👍 entra in rotazione, con un 👎 viene scartato.
- **Spesa**: somma gli ingredienti della settimana, toglie quello che è in dispensa e aggiunge la dispensa finita.
  Ogni articolo si può etichettare Esselunga/Iperal (l'etichetta resta per le settimane successive).
  "Condividi" manda la lista come testo, comodo per la spesa online.
- **Dispensa**: le cose date per scontate (olio, pasta, spezie, salse…). Se una finisce, la segni e va in lista.

## Dati

- Per ora vivono in `localStorage` del browser: ogni dispositivo ha i suoi. Backup ed export/import da ⚙︎.
- Tutta la persistenza passa da `js/store.js` (`load`/`save`): per sincronizzare i due telefoni basta sostituire quel file
  (es. Supabase o un piccolo backend sul homelab).
- `js/seed.js` è generato da `tools/build_seed.py` (ricette di casa + 16 HelloFresh estratte in
  `tools/recipes_hellofresh.json` + sorprese da provare + dispensa). Le quantità sono per 2 persone,
  in unità da supermercato.
- Nuove ricette: dalla sezione Ricette (+ Nuova, una riga per ingrediente tipo "400 g petto di pollo")
  oppure "Importa ricette (JSON)" incollando quelle preparate da Claude.

## Dopo una modifica ai file

Aumenta `VERSION` in `sw.js`, altrimenti il service worker può servire la versione in cache.
