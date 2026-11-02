#!/usr/bin/env python3
"""Fabrique le classeur de tri du catalogue professionnel.

   Pourquoi un script et non un fichier écrit une fois : le tri se fera
   en plusieurs passes. Elle rend le classeur, on applique, le catalogue
   bouge, et il faut pouvoir en refabriquer un à jour sans tout refaire
   à la main. Le classeur est donc toujours un produit du catalogue, et
   jamais l'inverse.

   Les propositions de famille ci-dessous sont des SUGGESTIONS. Elles
   sont pré-remplies pour qu'elle n'ait qu'à confirmer au lieu de
   remplir 181 lignes, et chacune porte sa mention dans la colonne
   « Remarque ». Aucune n'est appliquée au catalogue par ce script :
   il ne fait que lire.

        python3 outils/tri-catalogue.py
"""

import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trier import ORDRE_FAMILLES  # noqa: E402

from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side  # noqa: E402
from openpyxl.worksheet.datavalidation import DataValidation  # noqa: E402

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(RACINE, "assets", "data", "products.json")
SORTIE = os.path.join(RACINE, "outils", "tri-catalogue-pro.xlsx")

# --- Les familles proposées -------------------------------------------------
#
# Clé : un fragment du nom du produit, en majuscules. Valeur : la famille
# proposée. Le premier fragment qui correspond gagne, donc l'ordre compte :
# les cas particuliers d'abord.
PROPOSITIONS = [
    ("AQUA SPIDER WAX",        "Spider"),
    ("CREAM + COLOGNE 2IN1",   "Cream Cologne"),
    ("HAIR STYLING BRILLIANTINE", "Pommades & Brillantine"),
    ("FIBRE CREAM POMADE",     "Pommades & Brillantine"),
    ("FIBRE PASTE POMADE",     "Pommades & Brillantine"),
    ("HAIR STYLING CREAM NO",  "Crèmes coiffantes"),
    ("HAIR COLORING WAX",      "Coloration"),
    ("SHAVING FOAM SMOOTHING", "Rasage"),
]

# Les cas où je ne tranche pas : la question est posée, la colonne reste vide.
QUESTIONS = {
    "AQUA HAIR STYLING MATTE WAX M10":
        "Aqua ou mat ? Le nom dit les deux, le numéro M10 dit Mat Wax.",
    "LOTION N.1 (ALCOHOL FREE)":
        "Seule référence de Cream Cologne. Sa place est-elle là, ou dans les colognes ?",
    "CURL CREAM 400 ML":
        "Crème de coiffage plutôt que soin du visage ?",
    "HAIR&BEARD MILK MOUSSE CONDITIONER 200 ML":
        "C'est un après-shampoing : à ranger avec les shampoings ?",
    "HAIR BUILDING FIBER APPLICATOR":
        "Accessoire de la gamme fibres : coloration, ou peignes et brosses ?",
    "HAIR TONIC":
        "Tonique capillaire rangé dans les gels et mousses : c'est voulu ?",
}

POLICE = "Arial"
ENTETE = Font(name=POLICE, bold=True, color="FFFFFF", size=10)
FOND_ENTETE = PatternFill("solid", fgColor="1F1F1F")
NORMAL = Font(name=POLICE, size=10)
GRIS = Font(name=POLICE, size=10, color="808080")
PROPOSE = Font(name=POLICE, size=10, color="0000FF")
TITRE = Font(name=POLICE, bold=True, size=13)
JAUNE = PatternFill("solid", fgColor="FFF2CC")
FOND_FAMILLE = PatternFill("solid", fgColor="F2F2F2")
BORD = Border(bottom=Side("thin", color="D9D9D9"))


def proposition(nom):
    majuscules = nom.upper()
    for fragment, famille in PROPOSITIONS:
        if fragment in majuscules:
            return famille
    return None


def construire():
    produits = json.load(open(SOURCE, encoding="utf-8"))
    rang = {f: i for i, f in enumerate(ORDRE_FAMILLES)}

    def cle(p):
        return (rang.get(p.get("category", ""), 99), p.get("name", ""))

    visibles = sorted(
        [p for p in produits
         if not p.get("hidden") and not p.get("retire") and not p.get("mcb")],
        key=cle)
    sortis = sorted(
        [p for p in produits if p.get("retire") or p.get("hidden")], key=cle)

    wb = Workbook()

    # ---- Feuille 1 : le tri ------------------------------------------------
    ws = wb.active
    ws.title = "Tri du catalogue"
    ws["A1"] = "Tri du catalogue professionnel"
    ws["A1"].font = TITRE
    ws["A2"] = (
        "Deux colonnes à remplir, en jaune.   "
        "•  GARDER : laissez « oui », mettez « non » sur ce que vous ne voulez plus voir.   "
        "•  FAMILLE CORRIGÉE : ce qui est écrit en bleu est une proposition de ma part — "
        "effacez-la si elle vous paraît fausse, elle ne sera appliquée que si elle reste là. "
        "Les autres cases sont vides : la famille actuelle me semblait juste.   "
        "•  Les lignes sont rangées par famille, dans l'ordre d'affichage du site.")
    ws["A2"].font = GRIS
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A2:G2")
    ws.row_dimensions[2].height = 56

    entetes = ["EAN", "Nom du produit", "Contenance", "Famille actuelle",
               "GARDER ?", "FAMILLE CORRIGÉE", "Remarque"]
    for i, h in enumerate(entetes, start=1):
        c = ws.cell(row=4, column=i, value=h)
        c.font = ENTETE
        c.fill = FOND_ENTETE
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[4].height = 28

    ligne = 5
    famille_vue = None
    proposees = 0
    for p in visibles:
        famille = p.get("category", "")
        if famille != famille_vue:
            famille_vue = famille
            c = ws.cell(row=ligne, column=1, value=famille.upper())
            c.font = Font(name=POLICE, bold=True, size=10)
            for col in range(1, 8):
                ws.cell(row=ligne, column=col).fill = FOND_FAMILLE
            ligne += 1

        ws.cell(row=ligne, column=1, value=str(p["ean"])).font = NORMAL
        ws.cell(row=ligne, column=1).number_format = "@"
        nom = p["name"]
        ws.cell(row=ligne, column=2,
                value=nom + (" — bientôt disponible" if p.get("soon") else "")).font = NORMAL
        ws.cell(row=ligne, column=3, value=p.get("volume", "")).font = NORMAL
        ws.cell(row=ligne, column=4, value=famille).font = NORMAL

        g = ws.cell(row=ligne, column=5, value="oui")
        g.font = NORMAL
        g.fill = JAUNE
        g.alignment = Alignment(horizontal="center")

        f = ws.cell(row=ligne, column=6)
        f.fill = JAUNE
        f.font = PROPOSE
        suggestion = proposition(nom)
        remarque = ""
        if suggestion and suggestion != famille:
            f.value = suggestion
            remarque = "proposition — effacez si vous n'êtes pas d'accord"
            proposees += 1
        elif nom in QUESTIONS:
            remarque = QUESTIONS[nom]

        r = ws.cell(row=ligne, column=7, value=remarque)
        r.font = GRIS
        r.alignment = Alignment(wrap_text=True, vertical="center")

        for col in range(1, 8):
            ws.cell(row=ligne, column=col).border = BORD
        ligne += 1
    derniere = ligne - 1

    dv = DataValidation(type="list", formula1='"oui,non"', allow_blank=False)
    dv.errorTitle, dv.error = "Valeur attendue", "Écrivez oui ou non."
    ws.add_data_validation(dv)
    dv.add("E5:E%d" % derniere)

    # La liste des familles vient de la feuille « Familles » plutôt que d'être
    # écrite en dur : Excel plafonne une liste en dur à 255 caractères, et les
    # dix-sept familles en font 239 — une de plus et la liste cassait sans rien
    # dire. Le renvoi lève la limite, et une famille ajoutée là-bas apparaît
    # aussitôt ici.
    fin_familles = 4 + len(ORDRE_FAMILLES) + 6
    dvf = DataValidation(type="list",
                         formula1="=Familles!$B$5:$B$%d" % fin_familles,
                         allow_blank=True)
    dvf.errorTitle = "Famille inconnue"
    dvf.error = "Choisissez une famille dans la liste, ou ajoutez-la sur la feuille « Familles »."
    ws.add_data_validation(dvf)
    dvf.add("F5:F%d" % derniere)

    for col, largeur in zip("ABCDEFG", (16, 54, 13, 28, 11, 28, 40)):
        ws.column_dimensions[col].width = largeur
    ws.freeze_panes = "A5"
    ws.auto_filter.ref = "A4:G%d" % derniere

    # ---- Feuille 2 : déjà sorties ------------------------------------------
    ws2 = wb.create_sheet("Déjà sorties")
    ws2["A1"] = "Références déjà sorties du catalogue"
    ws2["A1"].font = TITRE
    ws2["A2"] = (
        "Elles n'apparaissent plus côté pro. « Retiré » est une décision commerciale, "
        "« rupture » un état de stock — les deux sont séparés pour qu'un réassort ne "
        "remette pas en ligne une référence qu'on avait choisi de sortir. "
        "Mettez « oui » en dernière colonne pour en faire revenir une.")
    ws2["A2"].font = GRIS
    ws2["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws2.merge_cells("A2:F2")
    ws2.row_dimensions[2].height = 42

    for i, h in enumerate(["EAN", "Nom du produit", "Contenance", "Famille",
                           "Pourquoi", "REMETTRE ?"], start=1):
        c = ws2.cell(row=4, column=i, value=h)
        c.font = ENTETE
        c.fill = FOND_ENTETE
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws2.row_dimensions[4].height = 28

    l = 5
    for p in sortis:
        ws2.cell(row=l, column=1, value=str(p["ean"])).font = NORMAL
        ws2.cell(row=l, column=1).number_format = "@"
        ws2.cell(row=l, column=2, value=p["name"]).font = NORMAL
        ws2.cell(row=l, column=3, value=p.get("volume", "")).font = NORMAL
        ws2.cell(row=l, column=4, value=p.get("category", "")).font = NORMAL
        ws2.cell(row=l, column=5,
                 value="retiré" if p.get("retire") else "rupture de stock").font = NORMAL
        c = ws2.cell(row=l, column=6)
        c.fill = JAUNE
        c.alignment = Alignment(horizontal="center")
        for col in range(1, 7):
            ws2.cell(row=l, column=col).border = BORD
        l += 1

    dv2 = DataValidation(type="list", formula1='"oui"', allow_blank=True)
    ws2.add_data_validation(dv2)
    dv2.add("F5:F%d" % (l - 1))
    for col, largeur in zip("ABCDEF", (16, 54, 13, 28, 18, 14)):
        ws2.column_dimensions[col].width = largeur
    ws2.freeze_panes = "A5"
    ws2.auto_filter.ref = "A4:F%d" % (l - 1)

    # ---- Feuille 3 : les familles ------------------------------------------
    ws3 = wb.create_sheet("Familles")
    ws3["A1"] = "Les familles, dans l'ordre d'affichage du site"
    ws3["A1"].font = TITRE
    ws3["A2"] = ("C'est cette liste qui alimente la colonne « famille corrigée ». "
                 "Si une famille vous manque, écrivez-la à la suite et je l'ajoute au site.")
    ws3["A2"].font = GRIS
    ws3.merge_cells("A2:C2")
    for i, h in enumerate(["Ordre", "Famille", "Références visibles au pro"], start=1):
        c = ws3.cell(row=4, column=i, value=h)
        c.font = ENTETE
        c.fill = FOND_ENTETE
        c.alignment = Alignment(horizontal="center")
    compte = collections.Counter(p.get("category", "") for p in visibles)
    for i, f in enumerate(ORDRE_FAMILLES, start=1):
        ws3.cell(row=4 + i, column=1, value=i).font = NORMAL
        ws3.cell(row=4 + i, column=2, value=f).font = NORMAL
        c = ws3.cell(row=4 + i, column=3, value=compte.get(f, 0))
        c.font = NORMAL if compte.get(f, 0) else GRIS
        c.alignment = Alignment(horizontal="center")
    for col, largeur in zip("ABC", (9, 34, 26)):
        ws3.column_dimensions[col].width = largeur

    wb.save(SORTIE)
    return len(visibles), len(sortis), proposees


if __name__ == "__main__":
    nb, nb_sortis, nb_prop = construire()
    print("écrit : %s" % SORTIE)
    print("%d références à trier, %d propositions de famille, %d déjà sorties"
          % (nb, nb_prop, nb_sortis))
