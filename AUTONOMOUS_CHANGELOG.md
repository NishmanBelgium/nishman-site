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

### 5. Le quatrième ordre de familles, côté serveur — APPLIQUÉ, TESTÉ

**Problème.** Après avoir aligné le quadrillage, le menu de filtres et
l'index, il restait un quatrième classement que je n'avais pas vu :
`functions/boutique/famille/[nom].js` calculait son ordre avec
`Object.keys(FAMILLES)`, c'est-à-dire l'ordre dans lequel les familles
ont été écrites dans le fichier. Les colognes y passaient premières parce
qu'elles ont été déclarées en premier.

Cet ordre sert à deux endroits : la ligne « autres familles » en bas de
chaque page de famille, et la liste des familles dans
`functions/sitemap.xml.js`, qui importe la même constante.

**Pourquoi ça mérite d'être corrigé.** Un salon qui arrive sur la page
Mat Wax et descend trouve en bas une liste de familles rangée autrement
que partout ailleurs sur le site. Et c'est aussi l'ordre dans lequel
Google lit les familles dans le plan du site.

**Ce qui a été fait.** Une liste explicite, `ORDRE_AFFICHAGE`, reprend
celle d'`outils/trier.py` traduite en identifiants d'adresse. Elle ne
peut pas être importée : ce module tourne chez Cloudflare, l'autre est un
script Python. Les deux doivent donc être modifiées ensemble, et un
commentaire au-dessus de la liste le dit.

Une famille absente de la liste garde sa place de déclaration et se range
à la suite. Ce n'est pas une précaution de principe : la même constante
sert à `slugFamille()`, qui traduit un nom de famille en adresse pour les
fiches produit. Une famille oubliée dans la liste et perdue en route
aurait cassé le lien « retour à la famille » de ses fiches.

**Fichiers concernés.**
- `functions/boutique/famille/[nom].js` — `ORDRE_AFFICHAGE` et son repli

**Tests réalisés.**
- Évaluation du module : 16 familles déclarées, 16 dans l'ordre calculé,
  aucun doublon, et l'ensemble est rigoureusement identique à celui des
  familles déclarées. Aucune famille perdue, aucune dupliquée.
- Ordre obtenu vérifié ligne à ligne : Mat Wax en premier, Coffrets en
  dernier, conforme aux trois autres classements.
- `node --check` : pas d'erreur de syntaxe.

**Vérifié ensuite sur le site en ligne** (2 novembre, après déploiement) :
`nishman.be/boutique/famille/mat-wax/` sort ses quinze autres familles
dans l'ordre voulu, Aqua Wax en premier et Coffrets en dernier. Plus
rien de théorique ici.

**Risques et limites.** Les adresses ne changent pas, seul leur ordre
d'apparition. Le plan du site contient les mêmes seize familles qu'avant.
`slugFamille()` cherche par nom et non par position : son résultat est
inchangé.

**Retour arrière.** Remplacer les deux déclarations par
`const ORDRE = Object.keys(FAMILLES);`.

**Statut : appliqué, testé, constaté en ligne.**

### 6. Le devis promettait une remise que la commande refuse — APPLIQUÉ, PARTIELLEMENT TESTÉ

**À lire : cette entrée touche à de l'affichage commercial. Elle mérite
votre relecture, et la formulation est à valider.**

**Problème.** La page de demande de devis (`/devis/`) décide toute seule
si FIRST10 s'applique, et sa règle n'était plus celle du serveur. Elle
accordait les −10 % dès que le code était reconnu : sans minimum de
commande, et sans tenir compte du fait que le code est réservé à la
première commande. Son commentaire le disait noir sur blanc, daté du
23/09/2026.

Or le serveur, lui, refuse le code dans deux cas : en dessous du franco
de port du pays (règle du commit 216), et pour un client qui a déjà une
commande confirmée (règle que vous avez fixée, commit 367). Le devis
annonçait donc une remise que la commande allait retirer.

**Pourquoi ça mérite d'être corrigé.** Un devis est un document qu'un
salon imprime, montre à son associé et sur lequel il décide. Annoncer
−10 % puis les retirer au moment de commander est la pire des trois
situations possibles — pire que ne rien annoncer. Et c'est exactement
le chemin qu'emprunteront les salons qui arrivent par les publications
portant le code.

**Ce qui a été fait.** La page ne décide plus : elle reflète. Des trois
conditions du serveur, deux sont vérifiables ici et le sont désormais —
code reconnu, et montant atteignant le franco du pays remise déduite,
avec le même calcul et le même arrondi que le serveur. La troisième ne
l'est pas : cette page est publique, elle ne sait pas qui la consulte,
donc elle ne peut pas refuser le code à un client déjà installé. Elle ne
le prétend plus non plus : le message dit « première commande » et la
ligne du document porte « 1re commande ».

En dessous du minimum, elle dit à partir de quel montant le code
devient utilisable — 333,33 € HT en Belgique, 555,56 € au Luxembourg et
en France — plutôt que de refuser sans expliquer. Les cinq langues sont
traitées.

**Fichiers concernés.**
- `assets/js/quote.js` — `promoMinimum()`, `promoEtat()`, messages dans les cinq langues
- `devis/index.html` — version du script portée à 373

**Tests réalisés.**
- La fonction de décision a été évaluée directement, aux bornes :
  Belgique 333,33 € accepté / 333,32 € refusé ; France 555,56 € accepté
  / 500 € refusé. Vérifié que ces bornes sont exactement celles du
  serveur, en relisant `_calcul.js` : même seuil, même fonction
  d'arrondi, même ordre des opérations.
- Code vide, code inconnu, code en minuscules avec tiret et espaces :
  les trois donnent le résultat attendu.
- Les cinq objets de langue sont complets et leur message de minimum
  s'affiche correctement.
- `node --check` : pas d'erreur de syntaxe.

**Vérifié ensuite sur le site en ligne** (2 novembre, session pro
ouverte, quatre cas sur un devis réel non envoyé) :

| Cas | Message affiché | Ligne de remise |
| --- | --- | --- |
| BE, 334,80 € (au-dessus de 333,33 €) | « Code FIRST10 appliqué : −10 % sur votre première commande » | −33,48 €, total 301,32 € HT, port offert |
| BE, 332,10 € (un cran en dessous) | « FIRST10 s'applique à partir de 333,33 € HT de marchandise » | aucune |
| Code FIRST20 | « Ce code promo n'est pas reconnu » | aucune |
| Aucun code | message masqué | aucune |

Le cas à 334,80 € confirme au passage l'intérêt de juger le seuil remise
déduite : le total retombe à 301,32 €, soit au-dessus de 300 €, donc le
port reste offert et il n'y a pas de divergence avec le barème d'Odoo.

Pourquoi le banc d'essai local avait échoué : `/devis/` demande une
connexion pour composer le formulaire. Ce n'était pas le banc d'essai,
c'était la porte — et elle fait son travail.

**Risques et limites.** Aucune condition commerciale n'est modifiée :
les conditions restent celles du serveur, qui est seul juge au moment
de la commande. Ce qui change, c'est ce que la page en dit. En
contrepartie, un devis en dessous du minimum n'affiche plus de remise
là où il en affichait une : des salons ont pu voir le montant remisé
ces dernières semaines. Si l'un revient avec un devis en main, c'est de
là que ça vient.

**Formulation à valider.** « −10 % sur votre première commande » et
« à partir de 333,33 € HT de marchandise » sont de moi. Le fond suit vos
règles, les mots sont à vous.

**Retour arrière.** Dans `assets/js/quote.js`, remplacer l'appel à
`promoEtat(...)` par `promoValide(client.promo)` et remettre la version
du script à 365 dans `devis/index.html`.

**Statut : appliqué, testé, constaté en ligne. Formulation à valider.**

### 7. Le bandeau de consentement — EXAMINÉ, VOLONTAIREMENT NON MODIFIÉ

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
