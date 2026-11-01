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
