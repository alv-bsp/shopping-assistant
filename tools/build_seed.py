"""Genera js/seed.js: ricette di casa + HelloFresh (estratte) + sorprese da provare + dispensa.
Uso: python3 tools/build_seed.py tools/recipes_hellofresh.json js/seed.js
"""
import json, sys

HF_JSON, OUT = sys.argv[1], sys.argv[2]
hf = {r["id"]: r for r in json.load(open(HF_JSON))}

# --- categorie ingredienti -------------------------------------------------
CAT = {
 "verdura": "Valeriana|Pomodoro ciliegino|Patate americane|Mirtilli|More|Minestrone fresco con cavolo Iperal|Crema di zucca e castagne|Zuppa legumi e cereali Iperal|Zuppa patate, riso integrale e porri Iperal|Zuppa gourmet porcini e cavolfiore Locomeal|Insalata mista|Songino|Rucola|Pomodori|Pomodorini datterini|Limone|Lime|Arancia|Prezzemolo|Basilico|Salvia|Timo|Erba cipollina|Aneto|Cipolla|Cipolla rossa|Cipollotto|Scalogno|Zucchine|Patate|Patate novelle|Patata dolce|Bietole|Broccoli|Funghi champignon|Funghi cardoncelli|Carote|Cavolo cappuccio|Cavolfiore|Finocchi|Radicchio|Avocado|Zenzero fresco|Spinaci novelli|Cetriolo|Peperoni",
 "carne": "Hamburger di tacchino Maggioni|Petto di pollo a fette Amadori|Cotolette di pollo agli spinaci|Macinato di pollo|Würstel di pollo e tacchino|Fesa di tacchino Amadori|Prosciutto cotto Beretta|Prosciutto crudo Citterio|Petto di pollo a fette|Cosce di pollo disossate|Lonza di maiale|Fettine di scamone|Salsiccia|Tagliata di manzo|Macinato misto|Pancetta|Guanciale|Prosciutto crudo|Fettine di vitello|Filetto di maiale|Straccetti di manzo|Hamburger di manzo|Burger di pollo",
 "pesce": "Filetti di salmone|Filetti di trota|Filetti di orata",
 "frigo": "Mozzarella light|Sottilette light|Feta greca|Philadelphia light|Yogurt colato Fage 0%|Kinder Pinguì|Rana Sfogliagrezza prosciutto crudo|Mini burger vegetali con spinaci Primia|Mozzarella|Burrata|Ricotta|Pecorino romano|Yogurt greco|Yogurt bianco|Cheddar a fette|Panna da cucina|Stracchino|Gnocchi di patate|Tortellini Rana prosciutto crudo|Tortellini Rana carne|Spinacine Aia",
 "pane": "Pan bauletto bianco|Pane per hamburger|Pane integrale|Pane pita|Pane naan|Wrap / tortillas",
 "dispensa": "Udon noodles|Chips di pane|Olive|Noci|Latte di cocco|Tonno al naturale Rio Mare|Quinoa|Pesto alla genovese Barilla|Pesto rosso Barilla|Pesto ricotta e noci Barilla|Sugo pronto (a scelta)",
 "surgelati": "Burger di salmone Mittico|Filetti di branzino Primia|Filetti di salmone surgelati|Patatine McCain Forno Express|Tris grigliato Orogel|Contorno ortolano Frosta|Spinaci in cubetti|Broccoli a rosette|Pizza Italpizza Salamino|Pizza Italpizza Bufala|Cornetti Tre Marie|Edamame surgelati|Gamberi sgusciati surgelati|Spinaci surgelati|Piselli surgelati|Patate al forno surgelate|Verdure grigliate surgelate",
 "snack": "Crackers Schär|Fonzies multipack",
 "bevande": "Coca Cola Zero (10 lattine)",
}
PANTRY = ["Ketchup","Crema al pistacchio","Olio evo","Sale","Pepe","Aceto","Aceto balsamico","Zucchero","Farina","Uova","Burro","Aglio",
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

def R(id, title, meal, effort, time, protein, ings, steps, status="rotazione", tags=(), variants=None, url=None, source="casa", note=None,
      role=None, special=False, people=None, serves=2):
    """role (solo cena): "piatto" | "proteina" | "contorno". special: cena elaborata, una a settimana.
    people (solo pranzo): per chi è. serves: per quante porzioni sono le quantità."""
    r = {"id": id, "title": title, "meal": meal, "effort": effort, "time": time, "protein": protein,
         "ingredients": [ing(s) for s in ings], "steps": steps, "status": status, "tags": list(tags),
         "source": source, "url": url, "note": note, "history": [], "ratings": [], "serves": serves}
    if meal == "cena": r["role"] = role or "piatto"; r["special"] = special
    if people: r["people"] = people
    if variants:
        r["variants"] = [{"name": n, "ingredients": [ing(s) for s in v]} for n, v in variants]
    return r

recipes = []
# ---------------- CASA: pranzi (per persona) ---------------------------------
A, G = ["Alessandro"], ["Giulia"]
recipes += [
 R("tortellini-rana-burro","Tortellini Rana al burro","pranzo",1,10,None,
   ["Burro","Grana Padano"],
   ["Porta a bollore l'acqua salata.","Cuoci i tortellini per il tempo indicato sulla confezione.","Sciogli il burro in padella, salta i tortellini 1 minuto.","Servi con Grana a piacere."],
   variants=[("Sfogliagrezza crudo",["1 conf Rana Sfogliagrezza prosciutto crudo"]),("Tortellini crudo",["1 conf Tortellini Rana prosciutto crudo"]),("Tortellini carne",["1 conf Tortellini Rana carne"])],
   tags=["veloce"], people=A, serves=1),
 R("pasta-sugo-pronto","Pasta Rummo con sugo pronto","pranzo",1,15,None,
   ["Pasta (Rummo)","Grana Padano"],
   ["Cuoci la pasta in acqua salata.","Scola tenendo un mestolo d'acqua di cottura.","Manteca col sugo e un goccio d'acqua di cottura."],
   variants=[("Pesto rosso",["0.35 vasetto Pesto rosso Barilla"]),("Pesto alla genovese",["0.35 vasetto Pesto alla genovese Barilla"]),
             ("Ricotta e noci",["0.35 vasetto Pesto ricotta e noci Barilla"]),("Sugo a sorpresa",["0.35 vasetto Sugo pronto (a scelta)"])],
   tags=["veloce"], people=A, serves=1),
 R("zuppa-pronta","Zuppa pronta","pranzo",1,5,None, [],
   ["Scalda in microonde o in pentolino come da confezione."],
   variants=[("Minestrone con cavolo",["1 pz Minestrone fresco con cavolo Iperal"]),("Crema di zucca e castagne",["1 pz Crema di zucca e castagne"]),
             ("Legumi e cereali",["1 pz Zuppa legumi e cereali Iperal"]),("Patate, riso e porri",["1 pz Zuppa patate, riso integrale e porri Iperal"]),
             ("Porcini e cavolfiore",["1 pz Zuppa gourmet porcini e cavolfiore Locomeal"])],
   tags=["veloce"], people=G, serves=1, note="Controlla in etichetta il glutine: alcune zuppe con cereali ne contengono."),
 R("insalata-di-riso","Insalata di riso","pranzo",1,20,None,
   ["Riso","1 pz Tonno al naturale Rio Mare","0.5 pz Mozzarella light","0.2 conf Pomodoro ciliegino","0.25 vasetto Olive","Olio evo","Sale"],
   ["Cuoci 80 g di riso, scolalo e raffreddalo sotto l'acqua fredda.","Taglia mozzarella e pomodorini a cubetti.","Unisci tonno sgocciolato, olive, olio e sale.","Si conserva in frigo: puoi farne due porzioni e tenerne una per il giorno dopo."],
   people=G, serves=1),
]
# ---------------- CASA: cene ------------------------------------------------
# Cene "componibili": una proteina + un contorno, abbinati dal menu.
P = dict(role="proteina")
C = dict(role="contorno")
recipes += [
 R("hamburger-tacchino","Hamburger di tacchino","cena",1,12,"tacchino",["2 pz Hamburger di tacchino Maggioni","Olio evo","Sale"],
   ["Piastra o padella ben calda con un filo d'olio.","4-5 minuti per lato, sala alla fine."], **P),
 R("pollo-piastra","Petto di pollo alla piastra","cena",1,10,"pollo",["300 g Petto di pollo a fette Amadori","Olio evo","Sale","Rosmarino"],
   ["Piastra ben calda.","2-3 minuti per lato, poi sale, rosmarino e un filo d'olio."], **P),
 R("spinacine-contorno","Cotolette di pollo agli spinaci","cena",1,15,"pollo",["1 conf Cotolette di pollo agli spinaci"],
   ["In padella o forno come da confezione."], note="Vanno bene anche le Spinacine Aia.", **P),
 R("polpette-pollo","Polpette di pollo","cena",1,20,"pollo",["300 g Macinato di pollo","Uova","Grana Padano","Pangrattato","Sale","Olio evo"],
   ["Impasta macinato, 1 uovo, 2 cucchiai di Grana, 2 di pangrattato e sale.","Forma le polpette.","Padella con un filo d'olio, 10-12 minuti girandole spesso."], **P),
 R("wurstel","Würstel di pollo e tacchino","cena",1,8,"pollo",["1 conf Würstel di pollo e tacchino"],
   ["Piastra o padella 5-6 minuti, oppure 3 minuti in acqua bollente."], **P),
 R("burger-salmone","Burger di salmone","cena",1,12,"pesce",["1 conf Burger di salmone Mittico","Olio evo"],
   ["Padella antiaderente con poco olio, dal congelato, 5-6 minuti per lato."], **P),
 R("branzino","Filetti di branzino al forno","cena",1,20,"pesce",["1 conf Filetti di branzino Primia","Olio evo","Sale","Origano"],
   ["Forno a 200°.","Filetti in teglia con olio, sale e origano, 15-18 minuti (anche dal congelato)."], **P),
 R("mini-burger-vegetali","Mini burger vegetali agli spinaci","cena",1,10,"vegetale",["1 conf Mini burger vegetali con spinaci Primia"],
   ["Padella con un filo d'olio, 3-4 minuti per lato."], **P),
 R("frittata","Frittata","cena",1,15,"uova",["Uova","Grana Padano","Sale","Olio evo"],
   ["Sbatti 5 uova con 2 cucchiai di Grana e sale.","Padella antiaderente con un filo d'olio, fuoco medio-basso, coperchio, 6-8 minuti.","Girala con un piatto e altri 2 minuti."], source="claude", **P),
 R("salmone-forno","Filetti di salmone al forno","cena",1,20,"pesce",["2 pz Filetti di salmone surgelati","Olio evo","Sale"],
   ["Forno a 200°.","Salmone in teglia con olio e sale, 15-20 minuti dal congelato."], source="claude", **P),

 R("patatine-forno","Patatine al forno","cena",1,20,None,["0.5 conf Patatine McCain Forno Express"],["Forno come da confezione."], **C),
 R("tris-grigliato","Verdure grigliate","cena",1,8,None,["1 conf Tris grigliato Orogel"],["Padella o microonde come da confezione."], **C),
 R("contorno-ortolano","Contorno ortolano","cena",1,15,None,["1 conf Contorno ortolano Frosta"],["In padella come da confezione."], **C),
 R("spinaci","Spinaci","cena",1,10,None,["0.3 conf Spinaci in cubetti","Olio evo","Sale"],["Padella con un filo d'olio, 8-10 minuti dal congelato, sale alla fine."], **C),
 R("broccoli","Broccoli","cena",1,10,None,["1 conf Broccoli a rosette","Olio evo","Sale"],["Microonde o vapore 8 minuti, poi olio e sale."], **C),
 R("patate-americane","Patate americane al forno","cena",1,35,None,["500 g Patate americane","Olio evo","Sale","Rosmarino"],
   ["Forno a 210°.","Spicchi con buccia, olio, sale e rosmarino, 30-35 minuti."], **C),
 R("insalata-pomodorini","Valeriana e pomodorini","cena",1,5,None,["1 busta Valeriana","0.5 conf Pomodoro ciliegino","Olio evo","Sale"],["Lava, taglia i pomodorini, condisci."], **C),
 R("piselli","Piselli","cena",1,10,None,["1 conf Piselli surgelati","Olio evo","Sale"],["In padella con un filo d'olio, 10 minuti."], **C),

 R("pizza-surgelata","Pizza surgelata","cena",1,15,None,["1 pz Pizza Italpizza Salamino","1 pz Pizza Italpizza Bufala"],
   ["Forno come da confezione."], tags=["pizza"]),
 R("hamburger-casa","Hamburger nel panino","cena",1,20,"tacchino",
   ["2 pz Pane per hamburger","Ketchup","Maionese"],
   ["Cuoci la carne in padella o piastra ben calda, 3-4 minuti per lato.","Tosta i panini.","Componi con la farcitura."],
   variants=[("Tacchino",["2 pz Hamburger di tacchino Maggioni","2 fette Sottilette light"]),
             ("Manzo semplice",["2 pz Hamburger di manzo","2 fette Sottilette light"]),
             ("Manzo completo",["2 pz Hamburger di manzo","2 fette Sottilette light","80 g Pancetta","1 pz Cipolla rossa","Salsa barbecue"])], tags=["burger"]),
 R("tacos-pollo","Tacos di pollo con guacamole","cena",2,30,"pollo",
   ["400 g Petto di pollo a fette Amadori","1 pz Cipolla","2 pz Pomodori","2 pz Avocado","1 pz Lime","4 fette Sottilette light","1 conf Wrap / tortillas","Paprika","Sale","Olio evo"],
   ["Taglia il pollo a striscioline e cuocilo in padella con paprika, sale e olio.","Salsa: cipolla e pomodori a cubetti, sale, olio.","Guacamole: schiaccia l'avocado con lime e sale.","Scalda le tortillas e componi con pollo, salsa, guacamole e sottilette."], tags=["messicano"]),
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
 "tagliata-di-manzo-e-burrata-pugliese": ("cena",2,"manzo",["400 g Tagliata di manzo","1 mazzetto Salvia","Burro","Olio al tartufo","Latte","1 busta Rucola","1 mazzetto Basilico","0.5 conf Pomodoro ciliegino","1 pz Burrata","200 g Pane integrale","Zucchero","Olio evo","Sale","Pepe"]),
 "pulled-chicken-burger": ("cena",2,"pollo",["2 pz Pane per hamburger","400 g Cosce di pollo disossate","2 pz Scalogno","80 g Pancetta","1 busta Insalata mista","Brodo granulare","4 fette Cheddar a fette","Maionese","Salsa barbecue","Olio al tartufo","500 g Patate","1 mazzetto Erba cipollina","Zucchero","Aceto","Olio evo","Sale"]),
 "trota-glassata-allasiatica-e-patatine-tartufate": ("cena",2,"trota",["2 pz Filetti di trota","300 g Patate","1 pz Patata dolce","Olio al tartufo","Grana Padano","1 pz Radicchio","1 mazzetto Aneto","1 pz Limone","Miele","Salsa di soia","Senape","Semi di sesamo","Maionese","Olio evo","Sale"]),
 "hamburger-di-carne-con-bacon-e-burrata": ("cena",2,"manzo",["Olio al tartufo","300 g Macinato misto","1 mazzetto Prezzemolo","2 pz Pane per hamburger","1 pz Radicchio","Aceto balsamico","30 g Noci","1 pz Burrata","100 g Pancetta","Grana Padano","Zucchero","Olio evo","Sale"]),
 "salmone-con-insalata-di-finocchi-e-arance": ("cena",2,"salmone",["2 pz Filetti di salmone","1 vasetto Yogurt bianco","400 g Patate novelle","2 pz Finocchi","1 pz Arancia","Rosmarino","Aceto","Olio evo","Sale","Pepe"]),
 "tagliata-di-manzo-e-salsa-zhough": ("cena",2,"manzo",["400 g Tagliata di manzo","1 pz Cavolfiore","1 vasetto Yogurt greco","1 pz Cipolla","1 pz Limone","Aglio","Cumino","Olio evo","Sale","Pepe"]),
}
for hid, (meal, eff, prot, ings) in HF.items():
    h = hf[hid]
    recipes.append(R("hf-"+hid.split("-con-")[0][:40].rstrip("-"), h["title"], meal, eff, h["total_time_min"], prot, ings,
                     h["steps_short"], tags=[t for t in h.get("tags", []) if len(t) < 16][:3], url=h["url"], source="hellofresh",
                     special=(meal == "cena"), people=(A if meal == "pranzo" else None)))

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
   ["4 pz Filetti di orata","0.5 conf Pomodoro ciliegino","1 vasetto Olive","400 g Patate","1 mazzetto Prezzemolo","Olio evo","Sale"],
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
   ["350 g Straccetti di manzo","1 busta Rucola","0.5 conf Pomodoro ciliegino","Grana Padano","Aceto balsamico","Olio evo","Sale"],
   ["Padella rovente con un filo d'olio, straccetti 2-3 minuti.","Sala a fine cottura.","Servi su rucola e pomodorini, con scaglie di Grana e balsamico."], status=NEW, tags=["veloce"], source="claude"),
]
# ---------------- DA PROVARE: pranzi ---------------------------------------
recipes += [
 R("new-pasta-tonno-limone","Pasta tonno, pomodorini e limone","pranzo",1,15,None,
   ["Pasta (Rummo)","1 pz Tonno al naturale Rio Mare","0.5 conf Pomodoro ciliegino","1 pz Limone","Olio evo","Sale"],
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

recipes += [
 R("new-insalata-quinoa","Insalata di quinoa, feta e pomodorini","pranzo",1,20,None,
   ["60 g Quinoa","0.4 conf Feta greca","0.2 conf Pomodoro ciliegino","0.5 pz Cetriolo","0.15 vasetto Olive","Olio evo","Sale"],
   ["Sciacqua la quinoa e cuocila 12-15 minuti in acqua salata, poi raffreddala.","Unisci feta a cubetti, pomodorini, cetriolo e olive.","Olio e sale. Senza glutine, e si tiene in frigo per il giorno dopo."],
   status=NEW, people=G, serves=1, source="claude"),
]
for r in recipes:
    if r["source"] == "claude" and r["meal"] == "cena" and r.get("role") == "piatto": r["special"] = True
    if r["meal"] == "pranzo" and not r.get("people"): r["people"] = A
    if r["meal"] == "pranzo" and r["source"] == "claude" and r["id"] != "new-insalata-quinoa": r["serves"] = 2

# Spesa fissa: quello che entra in lista ogni settimana, indipendente dal menu (dalla spesa Iperal tipica)
RECURRING = ["3 pz Yogurt colato Fage 0%","1 conf Mirtilli","1 conf More","1 conf Crackers Schär","2 conf Fesa di tacchino Amadori",
  "1 conf Prosciutto cotto Beretta","1 conf Prosciutto crudo Citterio","1 conf Feta greca"]
# Dispensa "da spesa": si segnano c'è / quasi finito / manca, e quando mancano entrano in lista (nel loro reparto)
PANTRY_SHOP = ["Coca Cola Zero (10 lattine)","Cornetti Tre Marie","Fonzies multipack","Pan bauletto bianco","Sottilette light","Philadelphia light"]
recurring = [dict(ing(x), id="r-" + str(i), on=True) for i, x in enumerate(RECURRING)]

# ---------------- IMPORTATE DA LINK (vedi tools/IMPORT.md) ------------------
# tools/imported_recipes.json: { "recipes": [...], "skipped": [{ "inboxId", "url", "reason" }] }
# Le ricette usano lo schema dell'app; ingredienti come oggetti {name, qty, unit, cat} o stringhe "400 g Nome" (nome noto).
import os
IMPORTED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "imported_recipes.json")
imported = json.load(open(IMPORTED)) if os.path.exists(IMPORTED) else {"recipes": [], "skipped": []}
done = []
for x in imported.get("recipes", []):
    ings = [ing(i) if isinstance(i, str) else {"name": i["name"], "qty": i.get("qty"), "unit": i.get("unit", ""), "cat": i.get("cat") or CATOF.get(i["name"], "altro")}
            for i in x["ingredients"]]
    r = {"id": x["id"], "title": x["title"], "meal": x["meal"], "effort": x.get("effort", 2), "time": x.get("time"), "protein": x.get("protein"),
         "ingredients": ings, "steps": x.get("steps", []), "status": x.get("status", "da provare"), "tags": x.get("tags", []),
         "source": "link", "url": x.get("url"), "note": x.get("note"), "history": [], "ratings": [], "serves": x.get("serves", 2)}
    if x["meal"] == "cena": r["role"] = x.get("role", "piatto"); r["special"] = x.get("special", r["role"] == "piatto")
    if x.get("people"): r["people"] = x["people"]
    recipes.append(r)
    if x.get("inboxId"): done.append({"inboxId": x["inboxId"], "recipeId": x["id"]})

ids = [r["id"] for r in recipes]
assert len(ids) == len(set(ids)), "id duplicati"
pantry = [{"name": p, "state": "ok"} for p in PANTRY] + [{"name": p, "state": "ok", "cat": CATOF[p]} for p in PANTRY_SHOP]
SEED_VERSION = 5  # aumentalo a ogni import, altrimenti le app non aggiungono le ricette nuove
seed = {"version": SEED_VERSION, "recipes": recipes, "pantry": pantry, "recurring": recurring,
        "imports": {"done": done, "skipped": [{"inboxId": s["inboxId"], "reason": s.get("reason", "")} for s in imported.get("skipped", []) if s.get("inboxId")]}}
with open(OUT, "w") as f:
    f.write("// Generato da tools/build_seed.py: ricette di casa, HelloFresh, sorprese da provare, dispensa\n")
    f.write("export default " + json.dumps(seed, ensure_ascii=False, indent=1) + ";\n")
print(len(recurring), "fissi;", len(recipes), "ricette;", sum(r["meal"]=="pranzo" for r in recipes), "pranzi;", sum(r["status"]=="da provare" for r in recipes), "da provare")
