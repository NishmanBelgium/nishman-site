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

### 3. L'invite de recherche se coupait au milieu d'un mot sur téléphone — APPLIQUÉ, TESTÉ

**Problème.** Le champ de recherche de la boutique porte l'invite
« Chercher une cire, une cologne, une poudre… ». Sur un téléphone il
partage sa ligne avec le menu de tri et il ne reste qu'une quinzaine de
caractères : l'invite s'affichait « Chercher une ci… ».

**Pourquoi ça mérite d'être corrigé.** Un texte tronqué au milieu d'un mot
donne l'air d'une page inachevée. C'est le premier élément que voit
quelqu'un qui arrive avec un produit en tête.

**Ce qui a été fait.** L'invite longue est conservée sur grand écran, où
elle apprend ce qu'on peut chercher. En dessous de 620 px — le même point
de rupture que la feuille de style — elle devient « Chercher… ». Le seuil
est relu à chaque redimensionnement, donc la rotation de l'écran est
gérée.

La mise en page sur une seule ligne n'a pas été touchée : elle résulte
d'un arbitrage documenté dans la feuille de style, où l'empiler coûtait
plus d'un tiers de l'écran.

**Fichiers concernés.**
- `assets/js/boutique.js` — fonction `ajusterInvite` dans `brancherOutils`
- `boutique/index.html` — version du script portée à 370

**Tests réalisés.**
- Rendu à 390 px : « Chercher… » entier, sans troncature.
- Rendu à 1280 px : l'invite longue est intacte.
- `node --check` sur le script : pas d'erreur de syntaxe.

**Ce qui n'a pas été testé.** Le comportement sur un vrai appareil iOS, où
le clavier virtuel modifie la hauteur de la fenêtre — `resize` s'y
déclenche aussi, l'invite peut donc changer à l'ouverture du clavier. Sans
conséquence : à ce moment-là le champ a le focus et l'invite est masquée
par la saisie.

**Risques et limites.** Aucun effet sur la recherche elle-même, qui lit la
valeur du champ et non son invite.

**Retour arrière.** Supprimer le bloc `ajusterInvite` dans
`assets/js/boutique.js` et remettre la version du script à 360.

**Statut : appliqué, testé en local, déployé.**

### 4. Des liens en bleu de navigateur sur fond sombre — APPLIQUÉ, TESTÉ

**Problème.** Plusieurs liens n'avaient aucune couleur déclarée et
sortaient donc dans le bleu par défaut du navigateur, `rgb(0,0,238)` :
les deux liens de la liste « Pourquoi passer par nous » sur l'accueil, et
dans le pied du catalogue professionnel « Mentions légales »,
« Confidentialité », « Gérer mes cookies », « Mon compte » et « Créer un
compte ».

**Pourquoi ça mérite d'être corrigé.** Sur ces fonds presque noirs, le
bleu par défaut tombe autour de 2:1 de contraste, très en dessous du
minimum lisible. Et trois liens bleus au milieu d'un pied gris donnent
l'impression d'une page oubliée en cours de route. C'était d'autant plus
visible sur l'accueil que ces deux liens mènent aux deux pages
commerciales les plus importantes du site.

**Comment ils ont été trouvés.** Un script Playwright parcourt treize
pages, relève la couleur calculée de chaque lien visible et signale ceux
dont la composante bleue domine nettement. Il reste disponible pour
contrôler après coup.

**Ce qui a été fait.**
- `.preuves span a` passe à l'orange de la marque, souligné. Le
  soulignement est conservé : dans un paragraphe, la couleur seule ne
  désigne pas un lien, et elle ne dit rien à qui ne distingue pas les
  teintes.
- `.foot-line a` et `.foot-links > a:not(.foot-btn)` passent au blanc à
  74 %, blanc plein et souligné au survol. Les boutons sociaux sont
  explicitement exclus pour garder leur propre style.
- `.phare` reçoit `color: inherit`. Les deux lignes de texte des tuiles
  ont déjà leur couleur, mais la troisième qu'on ajoutera un jour n'en
  aura pas forcément.

**Fichiers concernés.**
- `assets/css/site.css` — règles `.preuves span a` et pied de page
- `assets/css/familles.css` — `color: inherit` sur `.phare`
- `index.html`, `boutique/index.html`, `produits/index.html` — versions de feuilles

**Tests réalisés.**
- Audit automatique relancé après correction : plus aucun lien bleu sur
  les treize pages testées, à une exception près — le lien du logo sur
  `/produits/`, qui ne contient qu'une image et aucun texte.
- Rendu visuel du bloc « Pourquoi passer par nous » à 390 px avant/après.

**Ce qui n'a pas été testé.** Les pages rendues par le serveur — fiches
produit et pages de famille — ne tournent pas en local. Elles partagent
les mêmes feuilles, donc la correction les couvre, mais je ne l'ai pas
constaté de mes yeux.

**Risques et limites.** Changement purement visuel. Aucune cible de lien
modifiée.

**Retour arrière.** Supprimer les trois blocs de règles ajoutés et
remettre les versions de feuilles à 367 et 354.

**Statut : appliqué, testé en local, déployé.**

### 5. Le bandeau de consentement — EXAMINÉ, VOLONTAIREMENT NON MODIFIÉ

Sur un téléphone, le bandeau occupe environ un cinquième de la hauteur
d'écran et recouvre la première rangée de produits. J'ai regardé s'il
fallait le réduire.

Non. Son texte tient en trois phrases : ce qu'on mesure, à qui les
données sont transmises, et le fait que le site fonctionne pareil en cas
de refus. Supprimer la troisième rendrait le refus moins évident, ce qui
pousse mécaniquement à l'acceptation. Réduire le corps de texte rendrait
l'information moins lisible. Les deux boutons ont déjà exactement le même
poids visuel, ce qui est la condition d'un consentement valable.

La hauteur est le coût honnête d'une information claire. Les quelques
pixels à gagner ne valent pas de l'abîmer.

**Statut : examiné, aucune modification.**
