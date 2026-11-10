/* ==========================================================================
   PAGES DE FAMILLE — une adresse par gamme, rendue par le serveur.

   Jusqu'ici la boutique comptait 125 produits rangés en 16 familles, mais
   ces familles n'étaient que des filtres posés par le navigateur sur une
   seule et même adresse. Pour un moteur de recherche il n'existait donc
   qu'une page boutique, pas seize — et aucune page ne pouvait répondre à
   « nishman poudre » ou « nishman cologne », qui sont pourtant les deux
   premières suggestions de Google après le nom de la marque.

   D'où ces pages. Elles ne réinventent rien : elles rassemblent les
   produits d'une famille, avec leurs vrais noms, leurs vraies photos et
   leurs vrais prix, sous un titre qui dit ce que les gens tapent.

   Pourquoi côté serveur : une grille construite en JavaScript après coup
   n'est pas lue de façon fiable, et surtout elle n'a pas d'adresse propre.
   Ici chaque famille a la sienne, elle figure au plan du site, et elle
   renvoie vers les fiches — ce qui donne enfin à Google un chemin pour
   descendre jusqu'aux 125 références.
   ========================================================================== */

import { catalogue, echapper, euros, origine } from "../../_boutique.js";
import { ENTETES_SECURITE, CSP_PAGE } from "../../_commun.js";
import { REGLES } from "../../_calcul_b2c.js";

/* Les seize familles, dans l'ordre du catalogue.
 *
 * `nom` doit correspondre au caractère près au champ famille du fichier
 * de données : c'est la clé de regroupement, pas une étiquette.
 *
 * `h1`, `titre` et `intro` sont écrits à la main. Les intros reprennent ce
 * que disent les fiches elles-mêmes — rien n'y est ajouté qui ne soit déjà
 * affirmé par la marque sur ses propres produits.
 */
const FAMILLES = {
  "colognes": {
    nom: "Colognes",
    h1: "Les eaux de Cologne NISHMAN",
    /* Le mot « après-rasage » ne paraît plus à l'écran : la marque dit
       eau de Cologne. Il reste une fois dans le titre de recherche, et
       une seule, parce que « nishman after shave cologne » est l'une des
       requêtes réellement tapées — la retirer partout coûterait des
       visites sans rien gagner, personne ne lit un titre de résultat
       comme une étiquette de rayon. */
    titre: "Eau de Cologne NISHMAN — toutes les fragrances (after shave)",
    intro: "Vingt fragrances, du cèdre sec au cassis, de la pluie du Nord " +
      "à l'ambre. Chacune rafraîchit, resserre les pores et apaise le feu du " +
      "rasoir — la touche finale du barbershop.",
    retirer: /\b(?:after\s*shave\s+cologne|eau\s+de\s+cologne|after\s*shave|cologne)\b|\bno[:.]?\s*(?=\d)/gi,
  },
  "mat-wax": {
    nom: "Mat Wax",
    h1: "Cires mates NISHMAN — Mat Wax",
    titre: "NISHMAN Mat Wax — cire coiffante effet mat",
    intro: "Les Mat Wax coiffent sans brillance : fini mat, tenue marquée, " +
      "texture travaillable. La famille comprend aussi les cires colorantes, " +
      "qui coiffent et intensifient la couleur en un seul geste.",
  },
  "aqua-wax": {
    nom: "Aqua Wax",
    h1: "Cires à l'eau NISHMAN — Aqua Wax",
    titre: "NISHMAN Aqua Wax — cire à base d'eau, se rince au shampoing",
    retirer: /\bhair\s+styling\b|\baqua\b/gi,
    intro: "Les Aqua Wax sont des cires à base aqueuse : application facile, " +
      "fini brillant, tenue forte sur la journée. Elles ne laissent pas de " +
      "résidu et se rincent en un seul shampoing.",
  },
  "spider": {
    nom: "Spider",
    h1: "Cires Spider NISHMAN",
    titre: "NISHMAN Spider Wax — cire fibreuse effet toile",
    retirer: /\baqua\s+spider\s+wax\b|\bhair\s+styling\b/gi,
    intro: "La Spider est la cire à effet « toile d'araignée » de NISHMAN : une " +
      "texture fibreuse qui ajoute de l'épaisseur et de la matière, avec une " +
      "tenue forte et souple. Base aqueuse, se rince au shampoing.",
  },
  "poudres-coiffantes": {
    nom: "Poudres coiffantes",
    h1: "Poudres coiffantes NISHMAN",
    titre: "Poudre coiffante NISHMAN — volume à la racine, fini mat",
    intro: "La poudre coiffante se saupoudre sur cheveux secs : volume instantané " +
      "à la racine, fini mat et tenue légère qui laisse le cheveu mobile. " +
      "Quelques pressions suffisent, sans effet poudreux ni résidu.",
  },
  "gels-mousses": {
    nom: "Gels & Mousses",
    h1: "Gels et mousses coiffantes NISHMAN",
    titre: "NISHMAN gel et mousse coiffante — tenue et volume",
    intro: "Gels de coiffage et cires en mousse : du volume souple pour un style " +
      "naturel au quotidien, jusqu'aux tenues les plus fermes.",
  },
  "creme-bien-etre": {
    nom: "Crème & Bien-être",
    h1: "Crèmes et soins NISHMAN",
    titre: "NISHMAN crèmes et soins — boucles, hydratation, bien-être",
    intro: "Les crèmes de soin NISHMAN : définition des boucles, hydratation et " +
      "confort, sans effet cartonné.",
  },
  "coloration": {
    nom: "Coloration",
    h1: "Coloration et fibres capillaires NISHMAN",
    titre: "NISHMAN coloration et fibres capillaires",
    intro: "Colorations et fibres capillaires, avec les accessoires qui vont avec : " +
      "applicateur de précision pour la ligne frontale, les tempes et la raie.",
  },
  "shampoings-apres-shampoings": {
    nom: "Shampoings & Après-shampoings",
    h1: "Shampoings et après-shampoings NISHMAN",
    titre: "NISHMAN shampoing et après-shampoing — soin et coiffage",
    intro: "Shampoings et après-shampoings, dont les biphasés sans rinçage : " +
      "démêlage immédiat, protection de la chaleur, coiffage facilité.",
  },
  "soins-barbe": {
    nom: "Soins barbe",
    h1: "Soins de la barbe NISHMAN",
    titre: "NISHMAN soins barbe — huile, baume, correcteur",
    intro: "Tout ce qui entretient et dessine la barbe : soins, correcteurs de " +
      "contours et accessoires de finition.",
  },
  "cream-cologne": {
    nom: "Cream Cologne",
    h1: "Cream Cologne NISHMAN",
    titre: "NISHMAN Cream Cologne — après-rasage 2 en 1",
    intro: "Le 2-en-1 de NISHMAN : la fraîcheur d'une cologne et le confort d'un " +
      "baume hydratant en un seul geste. Texture non grasse, absorption rapide.",
  },
  "consommables": {
    nom: "Consommables",
    h1: "Consommables de salon NISHMAN",
    titre: "NISHMAN consommables de salon et barbershop",
    intro: "Les consommables du salon : cires d'épilation professionnelles et " +
      "fournitures de poste de travail.",
  },
  "coffrets": {
    nom: "Coffrets",
    h1: "Coffrets NISHMAN",
    titre: "Coffret NISHMAN — idées cadeau et découverte de la gamme",
    intro: "Les coffrets NISHMAN rassemblent plusieurs produits d'une même " +
      "routine — pour offrir, ou pour découvrir la gamme.",
  },
  "cremes-coiffantes": {
    nom: "Crèmes coiffantes",
    h1: "Crèmes coiffantes NISHMAN",
    titre: "NISHMAN crème coiffante — tenue souple, rendu naturel",
    intro: "Les crèmes coiffantes disciplinent sans rigidifier : le cheveu reste " +
      "mobile et le toucher reste doux sur la journée.",
  },
  "pommades-brillantine": {
    nom: "Pommades & Brillantine",
    h1: "Pommades et brillantine NISHMAN",
    titre: "NISHMAN pommade et brillantine — styles rétro",
    intro: "Brillance intense et contrôle souple, pour les coiffures rétro et " +
      "les finitions élégantes.",
  },
  "rasage": {
    nom: "Rasage",
    h1: "Rasage NISHMAN",
    titre: "NISHMAN rasage — talc et finition barbier",
    intro: "Les produits de finition du rasage et de la tonte de nuque.",
  },
};

/* L'ordre d'affichage des familles, et pourquoi il est écrit ici.
 *
 * ORDRE valait `Object.keys(FAMILLES)`, c'est-à-dire l'ordre dans lequel
 * les familles avaient été déclarées plus haut — un quatrième classement,
 * après celui du quadrillage, du menu de filtres et de l'index. Les
 * colognes y passaient premières parce qu'elles ont été écrites en
 * premier, et le bas de chaque page de famille proposait donc les autres
 * familles dans un ordre que le visiteur n'avait vu nulle part ailleurs.
 *
 * La liste ci-dessous reprend celle d'`outils/trier.py`, traduite en
 * identifiants d'adresse. Elle ne peut pas être importée : ce module
 * tourne chez Cloudflare, l'autre est un script Python. Les deux doivent
 * donc être modifiées ensemble — d'où ce rappel.
 *
 * Une famille absente de la liste garde sa place de déclaration, à la
 * suite : elle reste accessible, elle n'est pas perdue.
 */
const ORDRE_AFFICHAGE = [
  "mat-wax", "aqua-wax", "spider", "poudres-coiffantes",
  "cremes-coiffantes", "pommades-brillantine", "gels-mousses",
  "colognes", "cream-cologne",
  "soins-barbe", "rasage", "shampoings-apres-shampoings",
  "coloration", "creme-bien-etre",
  "consommables", "coffrets",
];
const ORDRE = ORDRE_AFFICHAGE.filter((s) => s in FAMILLES)
  .concat(Object.keys(FAMILLES).filter((s) => !ORDRE_AFFICHAGE.includes(s)));

/* L'étiquette courte d'un produit à l'intérieur de sa famille.
 *
 * Dans une page qui ne montre que des eaux de Cologne, répéter « AFTER
 * SHAVE COLOGNE NO: » vingt fois n'apprend rien et noie le seul
 * mot qui distingue : le numéro et le nom de la fragrance.
 *
 * J'ai d'abord calculé le début commun à toute la famille. Ça ne tient
 * pas : trois références commencent par « 13 - », « 14 - », « 15 - », et
 * il suffit d'un nom sur vingt qui commence autrement pour que le
 * préfixe commun soit vide. La règle est donc écrite, famille par
 * famille, dans `retirer` — c'est de toute façon une décision éditoriale
 * et non un calcul : c'est ici que la marque décide de ne plus dire
 * « after shave » mais eau de Cologne.
 *
 * Le nom du fabricant, lui, ne bouge pas : il reste dans les données,
 * sur la fiche, dans le flux Google et sur l'emballage. Seul l'affichage
 * en grille est allégé. */
function etiquette(p, retirer) {
  const nom = p.nom_court || p.nom;
  if (!retirer) return nom;
  const reste = nom.replace(retirer, " ")
    .replace(/\s+[-–]\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:\-–]+|[\s:\-–]+$/g, "")
    .trim();
  /* Un numéro seul distingue très bien une fragrance dans sa famille :
     « 16 » à côté de « 13 CEDARWOOD » se lit. On ne retombe sur le nom
     entier que s'il ne reste rien du tout. */
  return reste.length >= 1 ? reste : nom;
}

/* La première phrase de la fiche : c'est celle qui décrit l'odeur, la
   texture ou le geste, et c'est la seule qui change d'un produit à
   l'autre. Les suivantes répètent la promesse de la famille — elles ont
   leur place sur la fiche, pas répétées vingt fois dans une
   grille. */
function accroche(p) {
  const d = String(p.desc_fr || "").trim();
  if (!d) return "";
  const m = d.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : d).trim();
}

/* L'ODEUR, EN IMAGE.
 *
 * Une eau de Cologne ne se juge pas sur la photo de son flacon : vingt et
 * un flacons identiques à la couleur près n'aident personne à choisir.
 * La carte porte donc une seconde image — les ingrédients de la
 * fragrance, posés dans le noir de la marque — qui prend la place du
 * flacon au survol, et se fait glisser du doigt sur téléphone.
 *
 * Ce qui est généré et ce qui ne l'est pas. Le packshot reste la photo
 * du fabricant, toujours. L'image d'odeur ne montre aucun flacon, aucun
 * emballage : ce sont des ingrédients, et rien d'autre. Une bouteille
 * NISHMAN produite par une machine serait une fausse photo de produit.
 *
 * Les mentions sont écrites ici, pas gravées dans l'image : elles
 * restent nettes à toutes les tailles, se corrigent sans régénérer une
 * photo, et pourront se traduire comme le reste du site.
 *
 * Chaque ligne vient de la description du produit telle qu'elle existe
 * déjà. Les quatre dernières colognes du catalogue, 16 Olympic et
 * 17 Soleil, n'y figurent pas : le fabricant ne publie leurs notes nulle
 * part — vérifié sur son site et sur sa propre boutique en ligne — et
 * les inventer aurait été facile et faux. Elles gardent leur packshot
 * seul jusqu'à ce que l'usine les donne. 18 Vanilla et 19 Sea Salt, en
 * revanche, portent leur odeur dans leur nom. */
const ODEURS = {
  "8684736674883": "Bois de cèdre, notes vertes & baume",
  "8684736674890": "Patchouli, camphre, ambre & bois",
  "8684736674906": "Cassis, fruits noirs & musc",
  "8682035088004": "Pluie, fleurs sauvages & conifères",
  "8682035088134": "Pamplemousse, mandarine & eau glacée",
  "8682035088141": "Vanille, caramel, café & lavande",
  "8682035082736": "Citron, fleurs blanches & patchouli",
  "8682035082002": "Citron, fleur d'oranger & rose",
  "8682035080176": "Mandarine, bergamote, cannelle & ambre",
  "8682035083696": "Sel marin, citron, lime & cèdre",
  "8682035083702": "Orange sanguine, menthe, cannelle & cuir",
  "8682035083719": "Blé doré, orange & miel",
  "8682035083726": "Iode, algues & sel marin",
  "8682035083733": "Ambre, bois & épices",
  "8682035083740": "Bergamote, lavande, menthe & thym",
  "8682035084556": "Poivre rose, safran, cannelle & tabac",
  "8684736674937": "Vanille",
  "8684736676047": "Sel marin",
};

function feuille(p, retirer) {
  const a = accroche(p);
  const odeur = ODEURS[String(p.ean)];
  /* Chaque vue est enveloppée. Sans cela l'image, seule enfant de la
     piste, calcule sa largeur sur la piste — deux fois la carte — et
     déborde sur sa voisine. */
  const visuels = `
        <span class="fam-vue">
          <img src="/assets/img/products/${echapper(p.image)}" alt="${echapper(p.nom)}"
               width="600" height="600" loading="lazy" />
        </span>` + (odeur ? `
        <span class="fam-vue fam-odeur">
          <img src="/assets/img/odeurs/${echapper(p.ean)}.webp" alt="" aria-hidden="true"
               width="512" height="512" loading="lazy" />
          <span class="fam-sent"><b>Inspiré par</b>${echapper(odeur)}</span>
        </span>` : "");
  return `
    <a class="fam-carte${odeur ? " a-odeur" : ""}" href="/boutique/${echapper(p.slug)}/">
      <div class="fam-img">
        <div class="fam-piste">${visuels}</div>
        ${odeur ? '<span class="fam-puces" aria-hidden="true"><i></i><i></i></span>' : ""}
      </div>
      <div class="fam-nom">${echapper(etiquette(p, retirer))}</div>
      <div class="fam-vol">${echapper(p.volume || "")}</div>
      ${a ? `<p class="fam-accroche">${echapper(a)}</p>` : ""}
      <div class="fam-prix">${p.bientot ? "Bientôt disponible"
        : (p.ttc_plein
          ? `<s class="prix-plein">${euros(p.ttc_plein)}</s> <span class="prix-promo">${euros(p.ttc)}</span>`
          : euros(p.ttc))}</div>
    </a>`;
}

/* Données structurées : une liste d'articles, et le fil d'Ariane.
 *
 * ItemList plutôt que Product : la page n'est pas un produit, et déclarer
 * un prix au niveau de la famille ferait apparaître un montant qui ne
 * correspond à rien. On déclare donc l'ordre et les adresses, et chaque
 * fiche porte son propre balisage Product. */
function donneesStructurees(f, produits, base, url) {
  const liste = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: f.h1,
    description: f.intro,
    numberOfItems: produits.length,
    itemListElement: produits.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.nom_court || p.nom,
      url: base + "/boutique/" + p.slug + "/",
    })),
  };
  const fil = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: base + "/" },
      { "@type": "ListItem", position: 2, name: "Boutique", item: base + "/boutique/" },
      { "@type": "ListItem", position: 3, name: f.nom, item: url },
    ],
  };
  return JSON.stringify([liste, fil]);
}

function page(slug, f, produits, base, indexable) {
  const url = base + "/boutique/famille/" + slug + "/";
  const retirer = f.retirer || null;
  const description = (f.intro + " " + produits.length + " références NISHMAN, " +
    "importateur officiel Belgique, France et Luxembourg.").slice(0, 300);
  const image = produits.length
    ? base + "/assets/img/products/" + produits[0].image
    : base + "/assets/img/nishman.svg";

  const autres = ORDRE.filter((s) => s !== slug).map((s) =>
    `<a href="/boutique/famille/${s}/">${echapper(FAMILLES[s].nom)}</a>`).join(" · ");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${echapper(f.titre)}</title>
<meta name="description" content="${echapper(description)}" />
<link rel="canonical" href="${echapper(url)}" />${indexable ? "" : `
<meta name="robots" content="noindex, nofollow" />`}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Nishman — NBD Distribution Belgium" />
<meta property="og:title" content="${echapper(f.titre)}" />
<meta property="og:description" content="${echapper(description)}" />
<meta property="og:image" content="${echapper(image)}" />
<meta property="og:url" content="${echapper(url)}" />
<meta property="og:locale" content="fr_BE" />
<script type="application/ld+json">${donneesStructurees(f, produits, base, url)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Manrope:wght@400;500;600;700&display=swap" />
<link rel="stylesheet" href="/assets/css/base.css?v=355" />
<link rel="stylesheet" href="/assets/css/boutique.css?v=354" />
<link rel="stylesheet" href="/assets/css/consentement.css?v=359" />
<link rel="stylesheet" href="/assets/css/promo-bf.css?v=417" />
<style>
  .fam-page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 72px; }
  .fam-retour { display: inline-block; margin-bottom: 14px; font-size: .9rem; }
  .fam-titre { font-family: "Space Grotesk", system-ui, sans-serif; font-weight: 700;
               font-size: clamp(1.6rem, 4.4vw, 2.4rem); line-height: 1.12; margin: 0 0 12px; }
  .fam-intro { max-width: 62ch; line-height: 1.65; color: #4a4336; margin: 0 0 6px; }
  .fam-compte { color: #8a8070; font-size: .9rem; margin: 0 0 26px; }
  .fam-grille { display: grid; gap: 18px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 680px) { .fam-grille { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 980px) { .fam-grille { grid-template-columns: repeat(4, 1fr); } }
  /* Les descriptions n'ont pas toutes la même longueur : sans cela, le
     prix flotte à une hauteur différente dans chaque carte et la grille
     perd son peigne. La carte s'étire, le prix est poussé en bas. */
  .fam-grille { align-items: stretch; }
  .fam-carte { display: flex; flex-direction: column; text-decoration: none; color: inherit; }
  .fam-carte .fam-prix { margin-top: auto; padding-top: 8px; }
  /* Deux images sur une piste deux fois plus large que la carte.
     Au doigt, la piste défile et s'aimante : aucun script, le
     navigateur sait faire. Au survol, elle glisse d'une demi-largeur.
     Les deux mécanismes ne se marchent pas dessus : le défilement est
     coupé là où le survol existe. */
  .fam-img { position: relative; background: #f4f1ea; border-radius: 14px;
             overflow: hidden; margin-bottom: 10px; }
  .fam-piste { display: flex; width: 100%; }
  .fam-carte.a-odeur .fam-img { overflow-x: auto; scroll-snap-type: x mandatory;
                                scrollbar-width: none; -ms-overflow-style: none; }
  .fam-carte.a-odeur .fam-img::-webkit-scrollbar { display: none; }
  .fam-carte.a-odeur .fam-piste { width: 200%; }
  .fam-vue { flex: 0 0 100%; scroll-snap-align: start; position: relative; display: block; }
  .fam-carte.a-odeur .fam-vue { flex-basis: 50%; }
  .fam-vue img { width: 100%; height: auto; display: block; }
  .fam-odeur { background: #0b0b0c; }
  .fam-sent { position: absolute; left: 0; right: 0; top: 0; padding: 14px 14px 30px;
              background: linear-gradient(180deg, rgba(8,8,9,.9) 0%, rgba(8,8,9,.5) 58%, rgba(8,8,9,0) 100%);
              font-family: "Archivo Variable", Archivo, sans-serif; font-weight: 800;
              font-size: .78rem; line-height: 1.22; letter-spacing: -.01em;
              text-transform: uppercase; color: #fff; }
  .fam-sent b { display: block; font-weight: 700; font-size: .56rem; letter-spacing: .26em;
                color: #ED9B24; margin-bottom: 5px; }
  .fam-puces { position: absolute; left: 0; right: 0; bottom: 9px; display: flex;
               gap: 4px; justify-content: center; pointer-events: none; }
  .fam-puces i { width: 16px; height: 3px; border-radius: 2px; background: rgba(16,16,16,.25);
                 transition: background .3s; }
  .fam-puces i:first-child { background: rgba(16,16,16,.6); }
  @media (hover: hover) and (pointer: fine) {
    .fam-carte.a-odeur .fam-img { overflow: hidden; }
    .fam-carte.a-odeur .fam-piste { transition: transform .45s cubic-bezier(.22,.9,.22,1); }
    .fam-carte.a-odeur:hover .fam-piste,
    .fam-carte.a-odeur:focus-visible .fam-piste { transform: translateX(-50%); }
    .fam-carte.a-odeur:hover .fam-puces i:first-child { background: rgba(255,255,255,.4); }
    .fam-carte.a-odeur:hover .fam-puces i:last-child { background: #fff; }
    .fam-carte.a-odeur:hover .fam-puces i { background: rgba(255,255,255,.4); }
  }
  @media (prefers-reduced-motion: reduce) {
    .fam-carte.a-odeur .fam-piste { transition: none; }
  }
  .fam-nom { font-weight: 600; line-height: 1.25; }
  .fam-vol { color: #8a8070; font-size: .85rem; margin-top: 2px; }
  .fam-accroche { color: #6b6256; font-size: .82rem; line-height: 1.45; margin: 6px 0 0;
                  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
                  overflow: hidden; }
  .fam-prix { font-family: "Space Grotesk", system-ui, sans-serif; font-weight: 700;
              margin-top: 8px; }
  .fam-autres { margin-top: 48px; padding-top: 18px; border-top: 1px solid #e6e0d2;
                font-size: .9rem; line-height: 2; }
  .fam-autres b { display: block; margin-bottom: 6px; }
  .fam-autres a { white-space: nowrap; }
  .fam-pro { margin-top: 26px; font-size: .85rem; color: #8a8070; }
</style>
</head>
<body>

<div class="ruban">
  Livraison offerte dès <b>${euros(REGLES.franco)}</b> · Expédition sous 2 jours ouvrables · Belgique, France, Luxembourg
</div>

<header class="bar">
  <div class="wrap bar-in">
    <a class="logo" href="/boutique/" aria-label="Nishman, accueil"><img src="/assets/img/nishman.svg" alt="Nishman" /></a>
    <div class="bar-sp"></div>
    <a class="pill" href="/"><span class="long">Accueil</span><span class="court">Accueil</span></a>
    <a class="pill pill-gold" href="/boutique/#panier">Panier</a>
  </div>
</header>

<main class="fam-page">
  <a class="fam-retour" href="/boutique/">← Toute la boutique</a>
  <h1 class="fam-titre">${echapper(f.h1)}</h1>
  <p class="fam-intro">${echapper(f.intro)}</p>
  <p class="fam-compte">${produits.length} référence${produits.length > 1 ? "s" : ""} ·
     expédition sous 2 jours ouvrables vers la Belgique, la France et le Luxembourg.</p>

  <div class="fam-grille">${produits.map((p) => feuille(p, retirer)).join("")}</div>

  <nav class="fam-autres">
    <b>Les autres familles NISHMAN</b>
    ${autres}
  </nav>

  <p class="fam-pro">Vous êtes coiffeur ou barbier ?
    <a href="/">Le catalogue professionnel passe par l'accueil</a> — vente au
    carton, facture et livraison au salon.</p>
</main>

${pied()}

<script src="/assets/js/promo-bf.js?v=418"></script>
<script src="/assets/js/mesure.js?v=391" defer></script>
<script src="/assets/js/consentement.js?v=394" defer></script>
</body>
</html>`;
}

export async function onRequestGet({ request, params, env }) {
  const slug = String(params.nom || "").toLowerCase();
  const f = FAMILLES[slug];
  /* Une famille inconnue renvoie vers la boutique plutôt qu'un 404 : les
     seules adresses possibles sont celles de ce fichier, donc une adresse
     inconnue vient d'un lien périmé ou d'une faute de frappe. */
  if (!f) return new Response(null, { status: 302, headers: { location: "/boutique/" } });

  let liste;
  try { liste = await catalogue(request); }
  catch (e) { return new Response("Boutique momentanément indisponible.", { status: 503 }); }

  const produits = liste.filter((p) => p.famille === f.nom);
  if (!produits.length) {
    return new Response(null, { status: 302, headers: { location: "/boutique/" } });
  }

  const base = origine(request);
  const indexable = String((env && env.INDEXER_BOUTIQUE) || "").trim().toLowerCase() === "oui";

  return new Response(page(slug, f, produits, base, indexable), {
    headers: {
      ...ENTETES_SECURITE,
      "content-security-policy": CSP_PAGE,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
    },
  });
}

/* Exporté pour le plan du site, qui doit lister ces adresses. */
/* Le pied de page est le même partout dans la boutique. Il vivait en
   trois exemplaires — l'index statique, la famille, la fiche — ce qui
   veut dire qu'une adresse corrigée l'était à un endroit sur trois. */
export function pied() {
  return `
<footer class="pied">
  <div class="wrap">
    <div class="pied-cols">
      <div>
        <h3>Commander</h3>
        <p>Livraison en point relais, offerte dès 29,90 €</p>
        <p>Expédition sous 2 jours ouvrables</p>
        <a href="/conditions-de-vente/">Conditions générales de vente</a>
        <a href="/retractation/">Formulaire de rétractation</a>
      </div>
      <div>
        <h3>Nous joindre</h3>
        <a href="mailto:contact@nishman.be">contact@nishman.be</a>
        <a href="https://www.instagram.com/nishman.be.fr/" target="_blank" rel="noopener">Instagram</a>
        <a href="https://www.facebook.com/profile.php?id=61592867044572" target="_blank" rel="noopener">Facebook</a>
        <a href="/">Accueil Nishman</a>
      </div>
      <div>
        <h3>NBD Distribution SRL</h3>
        <p>Siège social : Rue de la Poire d'Or 26, 7033 Mons<br />Showroom : Avenue Léopold III 21, 7134 Binche</p>
        <p>TVA BE 0817.750.283</p>
        <a href="/mentions-legales/">Mentions légales</a>
        <a href="/confidentialite/">Politique de confidentialité</a>
        <a href="#" data-cons-rouvrir>Gérer mes cookies</a>
      </div>
    </div>
    <div class="pied-bas">
      Importateur officiel NISHMAN pour la Belgique, la France et le Luxembourg.
      Prix affichés toutes taxes comprises.
    </div>
  </div>
</footer>`;
}

/* De quel slug relève un produit. La fiche en a besoin pour renvoyer
   vers sa famille ; elle ne peut pas le deviner du nom affiché, qui
   porte des esperluettes et des accents. */
export function slugFamille(nomFamille) {
  const voulu = String(nomFamille || "").trim();
  for (const slug of ORDRE) {
    if (FAMILLES[slug].nom === voulu) return slug;
  }
  return null;
}

export { FAMILLES, ORDRE, ODEURS };
