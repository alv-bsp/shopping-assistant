"""Genera js/seed.js: ricette di casa + HelloFresh (estratte) + sorprese da provare + dispensa.
Uso: python3 tools/build_seed.py tools/recipes_hellofresh.json js/seed.js
"""
import json, sys

HF_JSON, OUT = sys.argv[1], sys.argv[2]
hf = {r["id"]: r for r in json.load(open(HF_JSON))}

# --- categorie ingredienti -------------------------------------------------
CAT = {
 "verdura": "Insalata mista|Songino|Rucola|Pomodori|Pomodorini datterini|Limone|Lime|Arancia|Prezzemolo|Basilico|Salvia|Timo|Erba cipollina|Aneto|Cipolla|Cipolla rossa|Cipollotto|Scalogno|Zucchine|Patate|Patate novelle|Patata dolce|Bietole|Broccoli|Funghi champignon|Funghi cardoncelli|Carote|Cavolo cappuccio|Cavolfiore|Finocchi|Radicchio|Avocado|Zenzero fresco|Spinaci novelli|Cetriolo|Peperoni",
 "carne": "Petto di pollo a fette|Cosce di pollo disossate|Lonza di maiale|Fettine di scamone|Salsiccia|Tagliata di manzo|Macinato misto|Pancetta|Guanciale|Prosciutto crudo|Fettine di vitello|Filetto di maiale|Straccetti di manzo|Hamburger di manzo|Burger di pollo",
 "pesce": "Filetti di salmone|Filetti di trota|Filetti di orata",
 "frigo": "Mozzarella|Burrata|Ricotta|Pecorino romano|Yogurt greco|Yogurt bianco|Cheddar a fette|Panna da cucina|Stracchino|Gnocchi di patate|Tortellini Rana prosciutto crudo|Tortellini Rana carne|Spinacine Aia",
 "pane": "Pane per hamburger|Pane integrale|Pane pita|Pane naan|Wrap / tortillas",
 "dispensa": "Udon noodles|Chips di pane|Olive|Noci|Latte di cocco|Tonno in scatola|Pesto alla genovese Barilla|Pesto rosso Barilla|Pesto ricotta e noci Barilla|Sugo pronto (a scelta)",
 "surgelati": "Edamame surgelati|Gamberi sgusciati surgelati|Spinaci surgelati|Piselli surgelati|Patate al forno surgelate|Verdure grigliate surgelate",
}
PANTRY = ["Olio evo","Sale","Pepe","Aceto","Aceto balsamico","Zucchero","Farina","Uova","Burro","Aglio",
 "Pangrattato","Maionese","Senape","Miele","Salsa di soia","Mirin","Salsa hoisin","Salsa teriyaki",
 "Salsa barbecue","Olio al tartufo","Olio di sesamo","Semi di sesamo","Brodo granulare","Origano",
 "Rosmarino","Peperoncino","Cumino","Paprika","Curry","Garam masala","Amido di mais","Vino bianco",
 "Passata di pomodoro","Latte","Grana Padano","Pasta (Rummo)","Riso"]
CATOF = {n: c for c, s in CAT.items() for n in s.split("|")}
for p in PANTRY: CATOF[p] = "dispensa"

def ing(spec):
    """'500 g Petto di pollo a fette' | '2 pz Limone' | 'Sale' (q.b.)"""
    parts = spec.split(" ", 2)
    try:
        q = float(parts[0]); q = int(q) if q == int(q) else q
        unit, name = parts[1], parts[2]
    except ValueError:
        q, unit, name = None, "", spec
    if name not in CATOF: raise SystemExit(f"categoria mancante: {name}")
    return {"name": name, "qty": q, "unit": unit, "cat": CATOF[name]}

def R(id, title, meal, effort, time, protein, ings, steps, status="rotazione", tags=(), variants=None, url=None, source="casa", note=None):
    r = {"id": id, "title": title, "meal": meal, "effort": effort, "time": time, "protein": protein,
         "ingredients": [ing(s) for s in ings], "steps": steps, "status": status, "tags": list(tags),
         "source": source, "url": url, "note": note, "history": [], "ratings": []}
    if variants:
        r["variants"] = [{"name": n, "ingredients": [ing(s) for s in v]} for n, v in variants]
    return r

recipes = []
# ---------------- CASA: pranzi --------------------------------------------
recipes += [
 R("tortellini-rana-burro","Tortellini Rana al burro","pranzo",1,10,None,
   ["Burro","Grana Padano"],
   ["Porta a bollore l'acqua salata.","Cuoci i tortellini per il tempo indicato sulla confezione.","Sciogli il burro in padella, salta i tortellini 1 minuto.","Servi con Grana a piacere."],
   variants=[("Prosciutto crudo",["2 conf Tortellini Rana prosciutto crudo"]),("Carne",["2 conf Tortellini Rana carne"])], tags=["veloce"]),
 R("pasta-sugo-pronto","Pasta Rummo con sugo pronto","pranzo",1,15,None,
   ["Pasta (Rummo)","Grana Padano"],
   ["Cuoci la pasta in acqua salata.","Scola tenendo un mestolo d'acqua di cottura.","Manteca col sugo e un goccio d'acqua di cottura."],
   variants=[("Pesto alla genovese",["1 vasetto Pesto alla genovese Barilla"]),("Pesto rosso",["1 vasetto Pesto rosso Barilla"]),
             ("Ricotta e noci",["1 vasetto Pesto ricotta e noci Barilla"]),("Sugo a sorpresa",["1 vasetto Sugo pronto (a scelta)"])], tags=["veloce"]),
]
# ---------------- CASA: cene ----------------------------------------------
recipes += [
 R("spinacine-contorno","Spinacine con contorno surgelato","cena",1,15,"pollo",
   ["1 conf Spinacine Aia"],
   ["Cuoci le spinacine in padella o forno come da confezione.","Prepara il contorno surgelato.","Servi."],
   variants=[("Spinaci",["1 conf Spinaci surgelati"]),("Piselli",["1 conf Piselli surgelati"]),
             ("Patate al forno",["1 conf Patate al forno surgelate"]),("Verdure grigliate",["1 conf Verdure grigliate surgelate"])], tags=["veloce"]),
 R("hamburger-casa","Hamburger","cena",2,25,"manzo",
   ["2 pz Pane per hamburger","1 busta Insalata mista","1 pz Pomodori"],
   ["Cuoci la carne in padella o piastra ben calda, 3-4 minuti per lato.","Tosta i panini.","Componi il burger con insalata, pomodoro e il resto della farcitura."],
   variants=[("Manzo semplice",["2 pz Hamburger di manzo","2 fette Cheddar a fette"]),
             ("Pollo",["2 pz Burger di pollo","Maionese"]),
             ("Manzo completo",["2 pz Hamburger di manzo","4 fette Cheddar a fette","80 g Pancetta","1 pz Cipolla rossa","Salsa barbecue"])], tags=["burger"]),
 R("tacos-pollo","Tacos di pollo con guacamole","cena",2,30,"pollo",
   ["400 g Petto di pollo a fette","1 pz Cipolla","2 pz Pomodori","2 pz Avocado","1 pz Lime","4 fette Cheddar a fette","1 conf Wrap / tortillas","Paprika","Sale","Olio evo"],
   ["Taglia il pollo a striscioline e cuocilo in padella con paprika, sale e olio.","Salsa: cipolla e pomodori a cubetti, sale, olio.","Guacamole: schiaccia l'avocado con lime e sale.","Scalda le tortillas e componi con pollo, salsa, guacamole e cheddar."], tags=["messicano"]),
]
# ---------------- HELLOFRESH (quantità da supermercato, 2 persone) ----------
HF = {
 "cotoletta-express-al-profumo-di-rosmarino": ("cena",2,"pollo",["500 g Petto di pollo a fette","Pangrattato","Rosmarino","1 busta Songino","1 pz Pomodori","1 conf Chips di pane","1 pz Limone","Maionese","Olio evo","Sale","Pepe","Aceto"]),
 "udon-noodles-express-con-boccocini-di-lonza-e-cavolo": ("pranzo",2,"maiale",["1 pz Cipollotto","300 g Lonza di maiale","Peperoncino","150 g Cavolo cappuccio","Salsa di soia","Mirin","400 g Udon noodles","Olio evo","Sale"]),
 "cotoletta-di-manzo-con-caprese": ("cena",2,"manzo",["300 g Fettine di scamone","2 pz Pomodori","1 pz Mozzarella","Origano","Pangrattato","1 busta Insalata mista","Uova","Olio evo","Aceto","Sale","Pepe"]),
 "cotoletta-di-pollo-alla-palermitana": ("cena",2,"pollo",["300 g Petto di pollo a fette","1 pz Limone","1 mazzetto Prezzemolo","40 g Pecorino romano","Pangrattato","2 pz Zucchine","400 g Patate","1 mazzetto Basilico","Uova","Aceto","Zucchero","Olio evo","Sale","Pepe"]),
 "tortiglioni-alla-norcina-salsiccia-e-tartufo": ("pranzo",2,"maiale",["1 pz Cipolla","250 g Ricotta","Grana Padano","Pasta (Rummo)","250 g Salsiccia","Olio al tartufo","1 mazzetto Prezzemolo","Olio evo","Sale","Pepe"]),
 "pollo-in-crosta-di-timo-e-rosmarino": ("cena",2,"pollo",["400 g Patate","1 pz Limone","Aglio","1 mazzetto Timo","Rosmarino","300 g Petto di pollo a fette","Pangrattato","Senape","Maionese","300 g Bietole","Grana Padano","Uova","Farina","Olio evo","Sale","Pepe"]),
 "scaloppine-di-pollo-ai-funghi-e-mirin": ("cena",2,"pollo",["400 g Patate","1 pz Scalogno","300 g Petto di pollo a fette","1 pz Broccoli","Burro","200 g Funghi champignon","1 mazzetto Prezzemolo","Grana Padano","Mirin","Farina","Olio evo","Sale","Pepe"]),
 "salmone-in-salsa-hoisin": ("cena",2,"salmone",["2 pz Filetti di salmone","Riso","2 pz Zucchine","Salsa hoisin","Salsa di soia","Semi di sesamo","1 pz Lime","Zucchero","Olio evo","Sale"]),
 "bistecca-di-manzo-e-cardoncelli-prezzemolati": ("cena",2,"manzo",["400 g Tagliata di manzo","500 g Patate","Olio al tartufo","Burro","Brodo granulare","200 g Funghi cardoncelli","1 mazzetto Prezzemolo","Grana Padano","Aglio","1 busta Insalata mista","Olio evo","Sale","Pepe"]),
 "polpette-allascolana-con-frecando": ("cena",2,"manzo",["300 g Macinato misto","400 g Patate","1 vasetto Olive","Pangrattato","Olio al tartufo","1 pz Carote","1 pz Cipolla","300 g Bietole","Maionese","Olio evo","Sale"]),
 "tagliata-di-manzo-e-burrata-pugliese": ("cena",2,"manzo",["400 g Tagliata di manzo","1 mazzetto Salvia","Burro","Olio al tartufo","Latte","1 busta Rucola","1 mazzetto Basilico","250 g Pomodorini datterini","1 pz Burrata","200 g Pane integrale","Zucchero","Olio evo","Sale","Pepe"]),
 "pulled-chicken-burger": ("cena",2,"pollo",["2 pz Pane per hamburger","400 g Cosce di pollo disossate","2 pz Scalogno","80 g Pancetta","1 busta Insalata mista","Brodo granulare","4 fette Cheddar a fette","Maionese","Salsa barbecue","Olio al tartufo","500 g Patate","1 mazzetto Erba cipollina","Zucchero","Aceto","Olio evo","Sale"]),
 "trota-glassata-allasiatica-e-patatine-tartufate": ("cena",2,"trota",["2 pz Filetti di trota","300 g Patate","1 pz Patata dolce","Olio al tartufo","Grana Padano","1 pz Radicchio","1 mazzetto Aneto","1 pz Limone","Miele","Salsa di soia","Senape","Semi di sesamo","Maionese","Olio evo","Sale"]),
 "hamburger-di-carne-con-bacon-e-burrata": ("cena",2,"manzo",["Olio al tartufo","300 g Macinato misto","1 mazzetto Prezzemolo","2 pz Pane per hamburger","1 pz Radicchio","Aceto balsamico","30 g Noci","1 pz Burrata","100 g Pancetta","Grana Padano","Zucchero","Olio evo","Sale"]),
 "salmone-con-insalata-di-finocchi-e-arance": ("cena",2,"salmone",["2 pz Filetti di salmone","1 vasetto Yogurt bianco","400 g Patate novelle","2 pz Finocchi","1 pz Arancia","Rosmarino","Aceto","Olio evo","Sale","Pepe"]),
 "tagliata-di-manzo-e-salsa-zhough": ("cena",2,"manzo",["400 g Tagliata di manzo","1 pz Cavolfiore","1 vasetto Yogurt greco","1 pz Cipolla","1 pz Limone","Aglio","Cumino","Olio evo","Sale","Pepe"]),
}
for hid, (meal, eff, prot, ings) in HF.items():
    h = hf[hid]
    recipes.append(R("hf-"+hid.split("-con-")[0][:40].rstrip("-"), h["title"], meal, eff, h["total_time_min"], prot, ings,
                     h["steps_short"], tags=[t for t in h.get("tags", []) if len(t) < 16][:3], url=h["url"], source="hellofresh"))

# ---------------- DA PROVARE: cene (sorprese) -------------------------------
NEW = "da provare"
recipes += [
 R("new-pollo-curry-cocco","Pollo al curry e cocco con riso basmati","cena",2,30,"pollo",
   ["400 g Petto di pollo a fette","1 lattina Latte di cocco","Curry","1 pz Cipolla","1 pz Zenzero fresco","1 busta Spinaci novelli","Riso","1 pz Lime","Olio evo","Sale"],
   ["Cuoci il riso.","Rosola cipolla e zenzero tritati, aggiungi il pollo a cubetti e il curry.","Versa il latte di cocco e cuoci 10 minuti.","Unisci gli spinaci finché appassiscono, chiudi con succo di lime.","Servi con il riso."], status=NEW, tags=["indiano"], source="claude"),
 R("new-salmone-teriyaki","Salmone teriyaki con edamame e riso","cena",2,25,"salmone",
   ["2 pz Filetti di salmone","Salsa teriyaki","200 g Edamame surgelati","Riso","1 pz Cipollotto","Semi di sesamo","Olio evo"],
   ["Cuoci il riso.","Scotta il salmone dal lato della pelle 4 minuti, giralo 2 minuti.","Glassa con la teriyaki a fuoco basso 1 minuto.","Salta gli edamame in padella.","Servi con cipollotto e sesamo."], status=NEW, tags=["asiatico"], source="claude"),
 R("new-saltimbocca","Saltimbocca alla romana con patate al forno","cena",2,35,"vitello",
   ["300 g Fettine di vitello","80 g Prosciutto crudo","1 mazzetto Salvia","Burro","Vino bianco","Farina","500 g Patate","Rosmarino","Olio evo","Sale"],
   ["Patate a spicchi in forno a 220° con olio, sale e rosmarino per 30 minuti.","Copri ogni fettina con prosciutto e una foglia di salvia, fissa con uno stuzzicadenti.","Infarina leggermente il lato della carne.","Cuoci nel burro 2 minuti per lato, sfuma col vino.","Servi con il fondo di cottura."], status=NEW, tags=["italiano"], source="claude"),
 R("new-maiale-senape-miele","Filetto di maiale senape e miele con carote glassate","cena",2,40,"maiale",
   ["400 g Filetto di maiale","Senape","Miele","400 g Carote","Burro","Rosmarino","Olio evo","Sale","Pepe"],
   ["Rosola il filetto su tutti i lati in padella.","Spennella con senape e miele, finisci in forno a 200° per 15-18 minuti.","Carote a rondelle in padella con burro, un cucchiaino di miele e un goccio d'acqua, 12 minuti.","Fai riposare la carne 5 minuti e affettala."], status=NEW, tags=["forno"], source="claude"),
 R("new-bulgogi-bowl","Bowl di manzo alla coreana (bulgogi)","cena",2,25,"manzo",
   ["350 g Straccetti di manzo","Salsa di soia","Zucchero","Aglio","1 pz Zenzero fresco","Olio di sesamo","Riso","1 pz Cetriolo","1 pz Carote","1 pz Cipollotto","Semi di sesamo"],
   ["Marina il manzo 10 minuti con soia, zucchero, aglio, zenzero e olio di sesamo.","Cuoci il riso.","Cetriolo e carota a julienne.","Salta il manzo in padella rovente 3-4 minuti.","Componi la bowl e guarnisci con cipollotto e sesamo."], status=NEW, tags=["asiatico"], source="claude"),
 R("new-pollo-limone-cinese","Pollo al limone con broccoli e riso","cena",2,25,"pollo",
   ["400 g Petto di pollo a fette","2 pz Limone","Amido di mais","Salsa di soia","Miele","1 pz Broccoli","Riso","Olio evo"],
   ["Cuoci il riso e i broccoli a cimette al vapore.","Pollo a bocconcini passato nell'amido, rosolato in padella.","Salsa: succo di limone, miele, soia e un cucchiaino d'amido sciolto in acqua.","Versa sul pollo e fai addensare 1-2 minuti."], status=NEW, tags=["asiatico"], source="claude"),
 R("new-orata-forno","Orata al forno con pomodorini, olive e patate","cena",2,40,"orata",
   ["4 pz Filetti di orata","250 g Pomodorini datterini","1 vasetto Olive","400 g Patate","1 mazzetto Prezzemolo","Olio evo","Sale"],
   ["Patate a fette sottili in teglia con olio e sale, forno a 200° per 20 minuti.","Aggiungi orata, pomodorini tagliati e olive.","Altri 12-15 minuti.","Finisci con prezzemolo e olio crudo."], status=NEW, tags=["pesce","forno"], source="claude"),
 R("new-kebab-pollo","Kebab di pollo con salsa yogurt e pita","cena",2,30,"pollo",
   ["400 g Cosce di pollo disossate","1 vasetto Yogurt greco","4 pz Pane pita","2 pz Pomodori","1 pz Cetriolo","1 pz Cipolla rossa","Paprika","Cumino","Aglio","1 pz Limone","Olio evo","Sale"],
   ["Pollo a straccetti marinato con paprika, cumino, olio e limone.","Cuocilo in padella ben calda finché è dorato.","Salsa: yogurt, aglio grattugiato, cetriolo grattugiato, sale.","Scalda le pita e farciscile con pollo, pomodori, cipolla e salsa."], status=NEW, tags=["street food"], source="claude"),
 R("new-gamberi-zucchine","Gamberi aglio e zucchine con riso","cena",2,20,"gamberi",
   ["300 g Gamberi sgusciati surgelati","2 pz Zucchine","Aglio","Peperoncino","1 mazzetto Prezzemolo","1 pz Limone","Riso","Olio evo","Sale"],
   ["Cuoci il riso.","Zucchine a cubetti saltate in padella 5 minuti.","Aggiungi aglio, peperoncino e gamberi: 3 minuti.","Chiudi con limone e prezzemolo."], status=NEW, tags=["pesce","veloce"], source="claude"),
 R("new-pollo-tandoori","Pollo tandoori con raita e naan","cena",2,35,"pollo",
   ["400 g Cosce di pollo disossate","2 vasetto Yogurt greco","Garam masala","Paprika","1 pz Cetriolo","2 pz Pane naan","1 busta Insalata mista","1 pz Limone","Sale","Olio evo"],
   ["Marina il pollo con metà yogurt, garam masala, paprika, limone e sale (anche 15 minuti bastano).","Forno a 230° per 20-25 minuti, o padella.","Raita: yogurt rimasto con cetriolo grattugiato e sale.","Scalda i naan e servi con insalata."], status=NEW, tags=["indiano"], source="claude"),
 R("new-straccetti-rucola","Straccetti di manzo, rucola e grana","cena",1,15,"manzo",
   ["350 g Straccetti di manzo","1 busta Rucola","250 g Pomodorini datterini","Grana Padano","Aceto balsamico","Olio evo","Sale"],
   ["Padella rovente con un filo d'olio, straccetti 2-3 minuti.","Sala a fine cottura.","Servi su rucola e pomodorini, con scaglie di Grana e balsamico."], status=NEW, tags=["veloce"], source="claude"),
]
# ---------------- DA PROVARE: pranzi ---------------------------------------
recipes += [
 R("new-pasta-tonno-limone","Pasta tonno, pomodorini e limone","pranzo",1,15,None,
   ["Pasta (Rummo)","2 pz Tonno in scatola","250 g Pomodorini datterini","1 pz Limone","Olio evo","Sale"],
   ["Cuoci la pasta.","In padella pomodorini tagliati con olio 5 minuti.","Spegni, unisci tonno sgocciolato e scorza di limone.","Manteca con la pasta."], status=NEW, tags=["veloce"], source="claude"),
 R("new-gnocchi-sorrentina","Gnocchi alla sorrentina","pranzo",1,20,None,
   ["500 g Gnocchi di patate","Passata di pomodoro","1 pz Mozzarella","1 mazzetto Basilico","Grana Padano","Olio evo","Sale"],
   ["Sugo veloce: passata, olio e sale, 10 minuti.","Lessa gli gnocchi finché salgono a galla.","Condiscili col sugo, aggiungi mozzarella a cubetti e Grana.","Gratina 5 minuti in forno o copri in padella finché fila."], status=NEW, tags=["veloce"], source="claude"),
 R("new-pasta-salsiccia-funghi","Pasta salsiccia e funghi","pranzo",2,25,None,
   ["Pasta (Rummo)","250 g Salsiccia","200 g Funghi champignon","1 conf Panna da cucina","1 pz Scalogno","1 mazzetto Prezzemolo","Olio evo","Sale"],
   ["Rosola lo scalogno e la salsiccia sbriciolata.","Aggiungi i funghi affettati, 8 minuti.","Unisci la panna e fai ridurre.","Manteca con la pasta e prezzemolo."], status=NEW, source="claude"),
 R("new-carbonara","Carbonara","pranzo",2,20,None,
   ["Pasta (Rummo)","120 g Guanciale","Uova","60 g Pecorino romano","Pepe","Sale"],
   ["Guanciale a listarelle in padella senza olio finché è croccante.","Sbatti 3 tuorli e 1 uovo intero con pecorino e pepe.","Scola la pasta al dente e saltala col guanciale, fuori dal fuoco.","Aggiungi le uova e un po' d'acqua di cottura, mescola fino a crema."], status=NEW, tags=["italiano"], source="claude"),
 R("new-orecchiette-broccoli","Pasta broccoli e salsiccia","pranzo",2,30,None,
   ["Pasta (Rummo)","1 pz Broccoli","250 g Salsiccia","Aglio","Peperoncino","Olio evo","Sale"],
   ["Cuoci le cimette di broccolo nell'acqua della pasta 5 minuti, poi butta la pasta.","In padella aglio, peperoncino e salsiccia sbriciolata.","Scola pasta e broccoli, salta tutto insieme con un mestolo d'acqua."], status=NEW, source="claude"),
 R("new-pasta-zucchine-stracchino","Pasta zucchine e stracchino","pranzo",1,15,None,
   ["Pasta (Rummo)","2 pz Zucchine","150 g Stracchino","Grana Padano","Olio evo","Sale"],
   ["Zucchine a cubetti in padella con olio 8 minuti.","Cuoci la pasta.","Manteca con zucchine, stracchino e un po' d'acqua di cottura.","Grana a piacere."], status=NEW, tags=["veloce"], source="claude"),
]

ids = [r["id"] for r in recipes]
assert len(ids) == len(set(ids)), "id duplicati"
pantry = [{"name": p, "state": "ok"} for p in PANTRY]
seed = {"version": 1, "recipes": recipes, "pantry": pantry}
with open(OUT, "w") as f:
    f.write("// Generato da tools/build_seed.py: ricette di casa, HelloFresh, sorprese da provare, dispensa\n")
    f.write("export default " + json.dumps(seed, ensure_ascii=False, indent=1) + ";\n")
print(len(recipes), "ricette;", sum(r["meal"]=="pranzo" for r in recipes), "pranzi;", sum(r["status"]=="da provare" for r in recipes), "da provare")
