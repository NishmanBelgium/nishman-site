#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Engendre assets/doc/CGV-NBD-Distribution.pdf depuis assets/js/cgv.js.

La page /cgv/ et le PDF téléchargeable disaient des choses différentes :
le PDF a gardé six mois une adresse de siège périmée que la page avait,
elle, finie par corriger. Les deux viennent désormais du même fichier.

    node outils/cgv-pdf.cjs > cgv.json && python3 outils/cgv-pdf.py cgv.json

Seule la version française fait foi (clause de prévalence, article 17) :
c'est donc elle, et elle seule, que le PDF reproduit.
"""

import io, json, sys, os

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, ListFlowable, ListItem, KeepTogether)

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "assets/doc/CGV-NBD-Distribution.pdf")
LANGUE = "fr"

# Le pied de page légal. Une seule définition : si le siège change, il ne
# change qu'ici (et dans cgv.js, d'où vient le corps du texte).
SOCIETE = "NBD Distribution SRL"
# Le siège social est à Mons ; Binche est le siège d'exploitation. La
# Banque-Carrefour fait foi, et le pied de page d'un contrat nomme le
# siège social.
SIEGE = "Rue de la Poire d'Or 26, 7033 Mons, Belgique"
TVA = "TVA BE 0817.750.283"
COURRIEL = "contact@nishman.be"

NOIR = HexColor("#111111")
GRIS = HexColor("#6B6B6B")
FILET = HexColor("#D8D8D8")

D = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DJ", D + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DJ-B", D + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DJ-I", D + "DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFontFamily("DJ", normal="DJ", bold="DJ-B", italic="DJ-I")

CORPS = ParagraphStyle("corps", fontName="DJ", fontSize=8.4, leading=12.6,
                       alignment=TA_JUSTIFY, textColor=NOIR, spaceAfter=5.2)
PUCE = ParagraphStyle("puce", parent=CORPS, fontSize=8.2, leading=12,
                      spaceAfter=2.4, alignment=TA_JUSTIFY)
TITRE_ART = ParagraphStyle("art", fontName="DJ-B", fontSize=9.6, leading=13,
                           textColor=NOIR, spaceBefore=9, spaceAfter=4.4)
GRAND = ParagraphStyle("grand", fontName="DJ-B", fontSize=17, leading=21,
                       textColor=NOIR, spaceAfter=3)
SOUS = ParagraphStyle("sous", fontName="DJ", fontSize=8.2, leading=11.6,
                      textColor=GRIS, spaceAfter=2)
SURTITRE = ParagraphStyle("sur", fontName="DJ-B", fontSize=7, leading=9,
                          textColor=GRIS, spaceAfter=5)


def xml(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def decor(canevas, doc):
    """Le filet et le pied de page légal, sur chaque page."""
    canevas.saveState()
    bas = 13 * mm
    canevas.setStrokeColor(FILET)
    canevas.setLineWidth(0.4)
    canevas.line(doc.leftMargin, bas + 7.5 * mm,
                 A4[0] - doc.rightMargin, bas + 7.5 * mm)
    canevas.setFont("DJ", 6.4)
    canevas.setFillColor(GRIS)
    canevas.drawString(doc.leftMargin, bas + 3.4 * mm,
                       SOCIETE + " — " + SIEGE + " — " + TVA + " — " + COURRIEL)
    canevas.drawRightString(A4[0] - doc.rightMargin, bas + 3.4 * mm,
                            str(canevas.getPageNumber()))
    canevas.restoreState()


def main():
    donnees = json.load(io.open(sys.argv[1], encoding="utf-8"))
    ui = donnees["UI"][LANGUE]
    articles = donnees["CGV"][LANGUE]

    doc = BaseDocTemplate(SORTIE, pagesize=A4,
                          leftMargin=20 * mm, rightMargin=20 * mm,
                          topMargin=18 * mm, bottomMargin=24 * mm,
                          title=ui["title"] + " — " + SOCIETE,
                          author=SOCIETE, subject=ui["sub"],
                          creator="nishman.be")
    cadre = Frame(doc.leftMargin, doc.bottomMargin,
                  A4[0] - doc.leftMargin - doc.rightMargin,
                  A4[1] - doc.topMargin - doc.bottomMargin, id="c")
    doc.addPageTemplates([PageTemplate(id="p", frames=[cadre], onPage=decor)])

    flux = [Paragraph(xml(SOCIETE).upper(), SURTITRE),
            Paragraph(xml(ui["title"]), GRAND),
            Paragraph(xml(ui["sub"]), SOUS),
            Spacer(1, 7 * mm)]

    for titre, bloc in articles:
        morceaux = [Paragraph(xml(titre), TITRE_ART)]
        for p in bloc:
            if isinstance(p, list):
                morceaux.append(ListFlowable(
                    [ListItem(Paragraph(xml(x), PUCE), leftIndent=11,
                              value="bulletchar") for x in p],
                    bulletType="bullet", bulletFontName="DJ", bulletFontSize=6,
                    bulletColor=GRIS, leftIndent=11, spaceAfter=5))
            else:
                morceaux.append(Paragraph(xml(p), CORPS))
        # Un titre d'article ne doit jamais rester seul en bas de page.
        flux.append(KeepTogether(morceaux[:2]))
        flux.extend(morceaux[2:])

    doc.build(flux)
    print("écrit :", SORTIE, "—", len(articles), "articles")


if __name__ == "__main__":
    main()
