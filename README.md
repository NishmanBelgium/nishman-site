# Nishman Cosmetics — mini-site cartes de visite

Mini-site statique pour les cartes de visite des commerciaux (QR codes
permanents). Une seule base de code sert les trois URLs :

- `https://nishman.be/dilhan`
- `https://nishman.be/guilem`
- `https://nishman.be/bekir`

## 1. Arborescence

```
nishman-site/
├── index.html                 # Page principale (racine du site)
├── 404.html                   # COPIE STRICTE de index.html (voir §3)
├── CNAME                      # Contient "nishman.be" (config GitHub Pages)
├── .nojekyll                  # Désactive le traitement Jekyll de GitHub
├── catalogue.pdf              # À AJOUTER PAR VOS SOINS (voir §5)
├── assets/
│   ├── css/
│   │   └── style.css          # Tout le design (une seule feuille de style)
│   ├── js/
│   │   ├── config.js          # ✅ SEUL FICHIER À MODIFIER AU QUOTIDIEN
│   │   └── app.js             # Logique de routage (ne pas modifier)
│   └── img/
│       └── favicon.svg        # Logo/monogramme (à remplacer par le vôtre)
└── README.md                  # Ce fichier
```

## 2. Comment ça marche (architecture "une seule page")

GitHub Pages est un hébergement 100% statique : il n'existe pas de dossier
`/dilhan` sur le disque. L'astuce est la suivante :

1. `index.html` et `404.html` sont **rigoureusement identiques**.
2. Quand un visiteur ouvre `nishman.be/dilhan`, GitHub Pages ne trouve pas
   de fichier à cette adresse et sert automatiquement `404.html` — mais
   l'URL affichée dans le navigateur reste `nishman.be/dilhan`.
3. Le script `assets/js/app.js` lit cette URL (`window.location.pathname`),
   y trouve `"dilhan"`, et va chercher les informations correspondantes
   dans `assets/js/config.js` (nom, numéro WhatsApp).
4. Il remplit ensuite le template HTML commun avec ces informations.

Résultat : **un seul design, un seul CSS, un seul JS** pour les trois
commerciaux. Rien n'est dupliqué à part deux fichiers HTML strictement
identiques (contrainte technique de GitHub Pages, pas un vrai
"doublon" de contenu).

⚠️ **Règle d'or : si vous modifiez `index.html`, recopiez-le immédiatement
sur `404.html`** (`cp index.html 404.html`), sinon les deux pages
diveront.

## 3. Modifier le contenu au quotidien

Tout se passe dans **`assets/js/config.js`** :

```js
const AGENTS = {
  dilhan:  { name: "Dilhan", whatsapp: "32470000001" },
  guilem:  { name: "Guilem", whatsapp: "32470000002" },
  bekir:   { name: "Bekir",   whatsapp: "32470000003" },
};

const SHARED = {
  instagram: "https://instagram.com/nishman.cosmetics",
  catalog: "/catalogue.pdf",
  website: "https://nishman.be",
  bio: "…",
};
```

| Je veux… | Je modifie… |
|---|---|
| Changer un numéro WhatsApp | `whatsapp` de l'agent concerné dans `AGENTS` |
| Ajouter le lien Instagram (une fois le compte créé) | `SHARED.instagram` dans `config.js` (le bouton est masqué tant que ce champ est vide) |
| Changer le catalogue | Remplacez le fichier `catalogue.pdf` (même nom !) — rien à toucher dans le code |
| Ajouter un 4ᵉ commercial | Ajoutez une entrée dans `AGENTS`, ex. `sara: { name: "Sara", whatsapp: "32..." }`, puis générez un QR code vers `nishman.be/sara` |
| Changer le texte de présentation | `SHARED.bio` |

Le format du numéro WhatsApp : indicatif pays + numéro, **sans** `+`,
**sans** espaces (Belgique : `32470123456` pour `0470 12 34 56`).

Aucune de ces modifications n'affecte les QR codes déjà imprimés.

## 4. Déploiement sur GitHub Pages — étape par étape

### 4.1 Créer le dépôt

1. Sur [github.com](https://github.com), créez un compte si besoin
   (gratuit).
2. Créez un nouveau dépôt, par exemple `nishman-site` (public — GitHub
   Pages gratuit exige un dépôt public, sauf si vous avez GitHub Pro).
3. Uploadez tout le contenu de ce dossier (via l'interface web
   "Add file → Upload files", ou via Git en ligne de commande) :

```bash
git init
git add .
git commit -m "Site cartes de visite Nishman"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/nishman-site.git
git push -u origin main
```

### 4.2 Activer GitHub Pages

1. Dans le dépôt : **Settings → Pages**.
2. Section "Build and deployment" → Source : **Deploy from a branch**.
3. Branch : **main**, dossier : **/ (root)**. Cliquez **Save**.
4. GitHub vous donne une URL provisoire du type
   `https://votre-compte.github.io/nishman-site/` — vérifiez que le
   site s'affiche correctement dessus avant de brancher le domaine.

### 4.3 Brancher votre domaine `nishman.be`

1. Toujours dans **Settings → Pages**, section "Custom domain" :
   tapez `nishman.be` puis **Save**. Cela crée/actualise automatiquement
   le fichier `CNAME` à la racine du dépôt (déjà présent ici, avec la
   bonne valeur).
2. Une fois le DNS propagé (§5), cochez **Enforce HTTPS** — GitHub
   génère un certificat SSL gratuit (Let's Encrypt) sous 24h en général.

## 5. Configuration DNS chez OVH

Direction **OVH → Espace client → Domaines → nishman.be → Zone DNS**.

Vous devez pointer le domaine "racine" (apex, sans www) vers les 4
adresses IP de GitHub Pages, via des enregistrements **A** :

| Type | Sous-domaine | Cible |
|---|---|---|
| A | (laisser vide / `@`) | `185.199.108.153` |
| A | (laisser vide / `@`) | `185.199.109.153` |
| A | (laisser vide / `@`) | `185.199.110.153` |
| A | (laisser vide / `@`) | `185.199.111.153` |

Si vous voulez aussi que `www.nishman.be` fonctionne (redirection vers
la racine) :

| Type | Sous-domaine | Cible |
|---|---|---|
| CNAME | `www` | `votre-compte.github.io.` (avec le point final) |

**Important OVH :** si OVH affiche déjà des enregistrements A ou un
"Web Cloud" par défaut sur la racine, supprimez-les avant d'ajouter les
4 lignes ci-dessus — un domaine ne peut avoir qu'un seul jeu
d'enregistrements A actif.

La propagation DNS prend généralement de quelques minutes à 24h.
Vérifiez avec : `dig nishman.be` ou un outil comme
[dnschecker.org](https://dnschecker.org).

## 6. Bonnes pratiques pour des QR codes qui durent 10 ans

1. **Ne changez jamais les slugs** (`dilhan`, `guilem`, `bekir`) une
   fois les cartes imprimées. Ce sont eux — pas le design, pas le
   contenu — qui sont "gravés" dans le QR code.
2. **Générez les QR codes une seule fois**, en pointant directement
   vers `https://nishman.be/dilhan` (etc.), avec un niveau de correction
   d'erreur moyen (M) ou élevé (Q) pour tolérer l'usure de la carte.
   Outils gratuits et sans compte : `qr-code-generator.com`,
   ou en ligne de commande avec `qrencode`.
3. **Ne renommez jamais le dépôt GitHub** après l'avoir branché à votre
   domaine (ça casserait temporairement la config Pages — récupérable,
   mais évitez).
4. **Le fichier `CNAME`** doit toujours rester présent à la racine du
   dépôt et contenir exactement `nishman.be`. Si vous re-uploadez le
   projet un jour, pensez à le garder.
5. Pour ajouter un commercial plus tard, il suffit d'ajouter une entrée
   dans `config.js` et d'imprimer un nouveau QR code — **les 3 QR codes
   existants ne sont jamais impactés**.
6. Gardez une copie de ce dépôt (ou un simple `git clone`) en lieu sûr :
   c'est votre seule dépendance technique, et elle est entièrement sous
   votre contrôle (pas d'abonnement, pas de service tiers).

## 7. Personnalisation du design

- **Logo** : votre vrai logo Nishman est déjà intégré
  (`assets/img/logo.png`, version dorée sur fond sombre). La version noire
  (`assets/img/logo-black.png`) est fournie en réserve si vous voulez un
  jour une déclinaison sur fond clair.
- **Couleurs** : tout est centralisé en haut de `assets/css/style.css`
  dans le bloc `:root { --color-... }`. L'or (`--color-gold: #faa21b`) a
  été extrait au pixel près de votre logo, pour une cohérence parfaite
  avec le catalogue.
- **Polices** : Fraunces (titres) + Manrope (texte courant), chargées
  depuis Google Fonts dans `index.html`.
- **Instagram** : le bouton reste automatiquement masqué tant que
  `SHARED.instagram` est vide dans `config.js`. Dès que votre compte
  existe, collez son URL dans ce champ — le bouton apparaît aussitôt
  sur les 3 cartes.

## 8. Test en local avant déploiement

Aucune installation nécessaire, un simple serveur statique suffit :

```bash
cd nishman-site
python3 -m http.server 8080
```

Puis ouvrez `http://localhost:8080/dilhan`, `http://localhost:8080/guilem`,
`http://localhost:8080/bekir` dans le navigateur pour vérifier que
chaque page affiche le bon nom et le bon lien WhatsApp.
