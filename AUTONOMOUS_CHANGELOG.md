# Journal des modifications autonomes

Ce fichier recense les modifications décidées et appliquées sans validation
préalable, dans le cadre d'autonomie défini le 2 novembre 2026 : améliorations
sûres, réversibles, sans effet sur les règles commerciales, vérifiées après
coup.

**Ce dépôt est public.** Aucune donnée interne n'est consignée ici : pas de
marge, pas de prix d'achat, pas de budget publicitaire, pas de volume de
ventes. Les décisions commerciales se discutent ailleurs.

Chaque entrée distingue ce qui a été **fait** de ce qui est **proposé**.
Une modification faite porte sa procédure de retour arrière.

---

## 2026-11-02

### 1. L'ordre des familles dans les deux catalogues — APPLIQUÉ, TESTÉ

**Problème.** Le catalogue professionnel s'ouvrait sur la famille
« Coffrets » : un salon qui découvrait la gamme voyait cinq coffrets avant
la première cire. Côté boutique, les familles sortaient dans l'ordre
alphabétique, ce qui plaçait les coffrets en deuxième position, juste après
Aqua Wax. Dans les deux cas l'ordre n'était pas un choix : c'était celui où
les familles tombaient dans le fichier.

**Pourquoi ça mérite d'être corrigé.** Les coffrets sont une référence
d'appoint, pas un produit de réassort. Les mettre en vitrine donne une
fausse idée de la maison à l'acheteur qui arrive pour la première fois, et
repousse sous la ligne de flottaison les familles sur lesquelles un salon
revient toutes les semaines.

**Ce qui a été fait.** Une liste d'ordre explicite, `ORDRE_FAMILLES`, est
ajoutée à `outils/trier.py`. Elle suit le métier plutôt que l'alphabet :
le coiffage d'abord (Mat Wax, Aqua Wax, Spider, poudres, crèmes, pommades,
gels), puis l'après-coupe (colognes, cream cologne), puis le soin (barbe,
rasage, shampoings, coloration, crème), puis l'équipement et l'entretien,
et les coffrets en dernier. Une famille absente de la liste conserve son
ordre d'apparition et se range à la suite — une référence ajoutée demain
n'est jamais perdue.

Les deux portails partagent la même liste bien que leurs familles ne se
recouvrent pas : chacun y pioche les siennes.

**Pourquoi trier le fichier et non l'affichage.** Les deux portails, les
pages de famille, l'index du catalogue et le flux Google lisent le même
fichier et en respectent l'ordre. Trier à l'affichage aurait voulu dire
écrire le même tri à quatre endroits.

**Fichiers concernés.**
- `outils/trier.py` — ajout de `ORDRE_FAMILLES` et de son application dans `ranger()`
- `assets/data/boutique.json` — réordonné
- `assets/data/products.json` — réordonné
- `assets/data/index-catalogue.json` — régénéré

**Tests réalisés.**
- Comparaison avant/après du nombre de références et de l'empreinte de
  l'ensemble des EAN, sur les deux fichiers : identiques. Aucun produit
  perdu, aucun ajouté, aucune donnée modifiée — seul l'ordre change.
- Rendu local des deux boutiques (Playwright, 1280 px) : le catalogue
  professionnel ouvre sur « MAT WAX », les coffrets sont en fin de page.
- Index du catalogue régénéré sans erreur : 125 produits, 16 familles.

**Ce qui n'a pas été testé.** Le rendu sur un vrai téléphone, et le
comportement du flux Google Merchant après relecture par Google — il relit
une fois par jour.

**Risques et limites.** L'ordre à l'intérieur d'une famille ne change pas.
Les URL, les filtres et la recherche ne dépendent pas de l'ordre du
fichier : ils travaillent sur la référence et sur le nom. Aucun prix,
stock, conditionnement ni règle de compte n'est touché.

**Retour arrière.** `git revert` du commit, ou plus simplement : remettre
`ORDRE_FAMILLES` à une liste vide dans `outils/trier.py`, relancer
`python3 outils/trier.py` puis `python3 outils/index-catalogue.py`. Les
familles reprennent leur ordre d'apparition.

**Statut : appliqué, testé en local, déployé.**

### 2. L'index « Tout le catalogue » rangeait les familles autrement — APPLIQUÉ, TESTÉ

**Problème.** Trois ordres différents cohabitaient sur la page boutique :
le quadrillage suivait l'ordre du fichier, le menu de filtres suivait le
quadrillage, et le bloc « Tout le catalogue » en bas de page rangeait les
familles de la plus fournie à la moins fournie. Les colognes y arrivaient
premières parce qu'elles sont vingt, pas parce que c'est leur place.

**Pourquoi ça mérite d'être corrigé.** Un visiteur qui descend la page
retrouve le même catalogue rangé deux fois différemment. Chaque bloc est
juste pris isolément, mais l'ensemble donne l'impression d'une boutique
mal tenue — exactement le genre de détail qui se sent sans se formuler.

**Ce qui a été fait.** `outils/index-catalogue.py` importe désormais
`ORDRE_FAMILLES` depuis `outils/trier.py` au lieu de trier par nombre de
références. La liste est importée et non recopiée : deux copies finissent
toujours par diverger. Une famille absente de la liste se range à la
suite, par ordre alphabétique, plutôt que de disparaître.

**Fichiers concernés.**
- `outils/index-catalogue.py` — import de la liste, nouvelle fonction `rang_famille`, ajout de `os` et `sys` aux imports
- `boutique/index.html` — bloc d'index régénéré

**Tests réalisés.**
- Comparaison des liens avant/après : 140 liens dans les deux cas, et la
  liste triée des adresses est rigoureusement identique. Aucun lien perdu,
  aucun ajouté, seul l'ordre des blocs change.
- Ordre vérifié : Mat Wax en premier, Coffrets en dernier, conforme au
  quadrillage et au menu de filtres.

**Risques et limites.** Ce bloc est aussi le chemin par lequel Google
descend vers les fiches produit. L'ordre des liens change, leur nombre et
leur cible non : le maillage interne est intact.

**Retour arrière.** Remplacer l'appel à `rang_famille` par l'ancien tri
par nombre de références décroissant, puis relancer
`python3 outils/index-catalogue.py`.

**Statut : appliqué, testé en local, déployé.**
