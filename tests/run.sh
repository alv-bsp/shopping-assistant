#!/usr/bin/env bash
# Test dell'app. Uso: bash tests/run.sh   (serve node 20+ e python3; la prima volta installa jsdom ed esbuild in tests/)
set -e
cd "$(dirname "$0")"; T=.tmp; rm -rf "$T"; mkdir -p "$T"
# dipendenze dei test (ricrea se mancano o sono di un altro sistema, es. installate su Linux e usate su Mac)
if [ ! -d node_modules/jsdom ] || ! node_modules/.bin/esbuild --version >/dev/null 2>&1; then
  rm -rf node_modules; npm i --silent --no-save --prefix . jsdom@24 esbuild@0.20.2 >/dev/null
fi
# versioni precedenti dell'app, per provare la conversione dei dati salvati
for pair in v1:bc4de56 v3:c531dbc; do v=${pair%%:*}; c=${pair##*:}; mkdir -p "$T/old-$v"; git -C .. -c safe.directory='*' archive "$c" js | tar -x -C "$T/old-$v"; done
# seed di prova con una ricetta importata da link e un link scartato
mkdir -p "$T/imp/js" "$T/imp/tools"; cp ../js/*.js "$T/imp/js/"; cp ../tools/build_seed.py ../tools/recipes_hellofresh.json "$T/imp/tools/"
cat > "$T/imp/tools/imported_recipes.json" <<'J'
{ "recipes": [ { "inboxId": "abc", "id": "link-pollo-limone", "title": "Pollo al limone di prova", "meal": "cena", "role": "piatto", "special": true, "effort": 2, "time": 25, "protein": "pollo", "serves": 2,
  "ingredients": [ {"name": "Petto di pollo a fette", "qty": 400, "unit": "g", "cat": "carne"}, "2 pz Limone", "Olio evo" ], "steps": ["Uno.", "Due."], "url": "https://example.com/pollo" } ],
  "skipped": [ { "inboxId": "def", "url": "https://instagram.com/p/x", "reason": "Post Instagram senza ricetta" } ] }
J
python3 - "$T/imp/tools/build_seed.py" <<'P'
import re, sys; p = sys.argv[1]; s = open(p).read()
s = re.sub(r"^SEED_VERSION = (\d+)", lambda m: f"SEED_VERSION = {int(m.group(1)) + 1}", s, flags=re.M); open(p, "w").write(s)
P
python3 "$T/imp/tools/build_seed.py" "$T/imp/tools/recipes_hellofresh.json" "$T/imp/js/seed.js" >/dev/null
node_modules/.bin/esbuild ../js/app.js --bundle --format=iife --outfile="$T/bundle.js" --log-level=warning --external:https://*
status=0
for t in plan presence migrate import sync ui; do node "$t.test.mjs" || status=1; done
exit $status
