#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Range les deux catalogues : par famille, puis par numéro.

Pourquoi trier le FICHIER et non l'affichage. Les deux portails, les
pages de famille, l'index du catalogue et le flux Google lisent tous le
même fichier et en respectent l'ordre — c'est écrit noir sur blanc dans
catalog.js : « sans requête, l'ordre du catalogue reste celui que vous
avez choisi ». Trier à l'affichage aurait donc voulu dire écrire le même
tri à quatre endroits, en JavaScript côté client, en JavaScript côté
serveur, en Python, et une fois de plus pour le flux — avec la certitude
qu'un jour trois seraient corrigés et pas le quatrième. Trier la source
règle les quatre d'un coup, et ne rajoute pas une ligne de code dans le
site.

La règle. Les familles gardent l'ordre qu'elles ont aujourd'hui : c'est
un ordre choisi, pas un hasard, et le menu des deux portails le suit.
À l'intérieur d'une famille, on range sur le premier nombre trouvé dans
le nom — « COLOGNE NO:00 » avant « NO:1 », « NO:2 » avant « NO:10 », ce
que l'ordre alphabétique ne fait pas. À nombre égal, ou sans nombre, on
retombe sur l'ordre alphabétique, et les références sans nombre passent
en fin de famille.

Usage :
    python3 outils/trier.py              range les deux fichiers
    python3 outils/trier.py --montrer    affiche l'ordre sans rien écrire

À relancer après tout ajout de références, puis régénérer l'index :
    python3 outils/index-catalogue.py
"""
import io
import json
import re
import sys

RACINE = "/home/claude/nishman-site"
SOURCES = [
    ("Boutique (particuliers)", RACINE + "/assets/data/boutique.json", "famille", "nom"),
    ("Catalogue pro (salons)", RACINE + "/assets/data/products.json", "category", "name"),
]

SANS_NOMBRE = 10 ** 6

# Un nombre, et ce qui le suit immédiatement. Le second groupe sert à
# reconnaître ce qui n'est PAS un numéro de référence.
NOMBRE = re.compile(r"(\d+)\s*([A-Za-zÀ-ÿ%]*)")

# Les unités de contenance et de conditionnement. Sans ce filtre, « CURL
# CREAM 400 ML » se range sur 400 et « HAIR REMOVAL SPATULA (100 PCS) »
# sur 100 — autrement dit sur leur volume, ce qui ne range rien.
UNITES = {"ml", "l", "cl", "g", "gr", "kg", "cm", "mm", "pcs", "pc",
          "pieces", "adet", "%"}

# « 2in1 », « 5 en 1 » : le chiffre dit combien de produits en un, pas
# lequel. On efface la formule entière avant de chercher — sauter le
# seul premier chiffre laisserait le « 1 » de « 2in1 » se faire passer
# pour un numéro de référence.
FORMULE = re.compile(r"\d+\s*(?:in|en)\s*\d+", re.I)

# Les dimensions : « (130X150) » est la taille d'une cape, pas son
# numéro. Effacée pour la même raison que la formule.
DIMENSION = re.compile(r"\d+\s*x\s*\d+", re.I)


def numero(nom):
    """Le numéro de référence porté par le nom, s'il y en a un.

    « 13 - COLOGNE CEDARWOOD » donne 13, « COLOGNE NO:00 NORTHERN
    LIGHTS » donne 0, « MATTE PASTE ARGAN M1 100 ML » donne 1.

    Sont ignorés les nombres qui ne numérotent rien : ceux suivis d'une
    unité (400 ML, 100 PCS, 450 GR), ceux des formules « 2in1 », où le
    chiffre dit combien de produits en un et non lequel, et ceux des
    dimensions « 130X150 ». Un nom sans numéro passe en fin de famille,
    rangé alphabétiquement.
    """
    propre = DIMENSION.sub(" ", FORMULE.sub(" ", nom or ""))
    for m in NOMBRE.finditer(propre):
        if m.group(2).lower() in UNITES:
            continue
        return int(m.group(1))
    return SANS_NOMBRE


def ranger(produits, champ_famille, champ_nom):
    # L'ordre des familles est celui de leur première apparition : on le
    # relève avant de toucher à quoi que ce soit, pour le rendre intact.
    familles = []
    for p in produits:
        f = p.get(champ_famille) or ""
        if f not in familles:
            familles.append(f)
    rang = {f: i for i, f in enumerate(familles)}

    def cle(p):
        nom = p.get(champ_nom) or ""
        # « rang » permet d'épingler une référence là où la règle se
        # trompe. Les numéros de deux gammes peuvent entrer en
        # collision dans une même famille : la LOTION N.1 porte le
        # numéro 1, comme la CREAM + COLOGNE 2in1 01, et se glissait
        # entre la 01 et la 02 en coupant la série en deux. Aucune règle
        # automatique ne devinait ça ; un champ facultatif, si.
        pointe = p.get("rang")
        return (rang[p.get(champ_famille) or ""],
                numero(nom) if pointe is None else int(pointe),
                nom.casefold())

    return sorted(produits, key=cle)


def main(montrer):
    for titre, chemin, champ_famille, champ_nom in SOURCES:
        produits = json.load(io.open(chemin, encoding="utf-8"))
        range_ = ranger(produits, champ_famille, champ_nom)
        bouge = sum(1 for a, b in zip(produits, range_) if a is not b)

        if montrer:
            print("==", titre)
            famille = None
            for p in range_:
                f = p.get(champ_famille)
                if f != famille:
                    famille = f
                    print("  --", f)
                print("     %-5s %s" % (
                    "" if numero(p.get(champ_nom)) == SANS_NOMBRE else numero(p.get(champ_nom)),
                    p.get(champ_nom)))
            continue

        with io.open(chemin, "w", encoding="utf-8") as f:
            json.dump(range_, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("%-26s %d référence(s), %d déplacée(s)" % (titre, len(range_), bouge))


if __name__ == "__main__":
    main("--montrer" in sys.argv[1:])
