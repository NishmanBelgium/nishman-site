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
