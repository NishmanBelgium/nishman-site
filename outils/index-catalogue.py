#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconstruit l'index du catalogue au bas de la boutique.

Pourquoi il existe. Le quadrillage de la boutique est rempli par le
script une fois la page chargée : dans le code source, c'est une case
vide. Un moteur qui ne joue pas le script — et la plupart ne le jouent
pas, ou avec des jours de retard — ne trouve donc aucun lien vers les
fiches. Elles n'étaient atteignables que par le plan du site, ce qui
les fait exister sans jamais leur donner de poids.

Cet index pose les 125 liens en dur, rangés par famille. Il sert aussi
le visiteur qui veut voir d'un coup tout ce qui existe.

Il se régénère : python3 outils/index-catalogue.py
Les repères HTML délimitent la zone réécrite ; tout le reste de la page
n'est jamais touché.
"""
import io
import json
import re

RACINE = "/home/claude/nishman-site"
PAGE = RACINE + "/boutique/index.html"
DONNEES = RACINE + "/assets/data/boutique.json"
DEBUT = "<!-- index-catalogue:début -->"
FIN = "<!-- index-catalogue:fin -->"

# L'ordre d'affichage : les familles les plus fournies d'abord, comme
# dans le quadrillage, pour que l'œil retrouve le même classement.
def echapper(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


# L'adresse de la page de famille, pour chaque famille du catalogue.
# Ces clés doivent rester identiques à celles de
# functions/boutique/famille/[nom].js : c'est la même liste, écrite deux
# fois parce que l'une est lue par Python et l'autre par le serveur.
# Une famille absente d'ici garde son bloc sans lien, sans rien casser.
FAMILLE_SLUG = {
    "Colognes": "colognes",
    "Crème & Bien-être": "creme-bien-etre",
    "Mat Wax": "mat-wax",
    "Aqua Wax": "aqua-wax",
    "Gels & Mousses": "gels-mousses",
    "Poudres coiffantes": "poudres-coiffantes",
    "Coloration": "coloration",
    "Shampoings & Après-shampoings": "shampoings-apres-shampoings",
    "Soins barbe": "soins-barbe",
    "Spider": "spider",
    "Consommables": "consommables",
    "Cream Cologne": "cream-cologne",
    "Coffrets": "coffrets",
    "Crèmes coiffantes": "cremes-coiffantes",
    "Pommades & Brillantine": "pommades-brillantine",
    "Rasage": "rasage",
}


produits = json.load(io.open(DONNEES, encoding="utf-8"))

familles = {}
for p in produits:
    familles.setdefault(p.get("famille") or "Autres", []).append(p)

ordre = sorted(familles.items(), key=lambda kv: (-len(kv[1]), kv[0]))

lignes = [DEBUT,
          '<section class="wrap index-cat" aria-labelledby="index-cat-titre">',
          '  <h2 id="index-cat-titre">Tout le catalogue</h2>',
          '  <p class="index-cat-lead">Les %d références NISHMAN, rangées par famille.</p>'
          % len(produits),
          '  <div class="index-cat-cols">']

for nom, liste in ordre:
    liste = sorted(liste, key=lambda p: (p.get("nom_court") or p.get("nom") or "").lower())
    lignes.append('    <details class="index-cat-fam">')
    lignes.append('      <summary>%s <span>%d</span></summary>'
                  % (echapper(nom), len(liste)))
    lignes.append('      <ul>')
    # Le premier lien de chaque bloc mène à la page de la famille. C'est
    # par là que Google descend : une famille bien placée fait découvrir
    # ses dix ou vingt fiches d'un coup.
    slug_fam = FAMILLE_SLUG.get(nom)
    if slug_fam:
        lignes.append('        <li class="index-cat-tout">'
                      '<a href="/boutique/famille/%s/">Voir toute la famille %s</a></li>'
                      % (slug_fam, echapper(nom)))
    for p in liste:
        etiquette = p.get("nom_court") or p.get("nom") or p["slug"]
        if p.get("volume"):
            etiquette += " — " + str(p["volume"])
        lignes.append('        <li><a href="/boutique/%s/">%s</a></li>'
                      % (echapper(p["slug"]), echapper(etiquette)))
    lignes.append('      </ul>')
    lignes.append('    </details>')

lignes += ['  </div>', '</section>', FIN]
bloc = "\n".join(lignes)

page = io.open(PAGE, encoding="utf-8").read()

if DEBUT in page and FIN in page:
    page = re.sub(re.escape(DEBUT) + r".*?" + re.escape(FIN), lambda _: bloc,
                  page, flags=re.S)
    action = "mis à jour"
else:
    ancre = '<footer class="pied">'
    if ancre not in page:
        raise SystemExit("pied de page introuvable : rien n'a été écrit")
    page = page.replace(ancre, bloc + "\n\n" + ancre, 1)
    action = "inséré"

io.open(PAGE, "w", encoding="utf-8").write(page)
print("Index %s : %d produits, %d familles." % (action, len(produits), len(ordre)))
