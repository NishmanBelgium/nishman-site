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
    h1: "Colognes et après-rasage NISHMAN",
    titre: "Cologne NISHMAN après-rasage — toutes les fragrances",
    intro: "Les colognes NISHMAN sont des après-rasage : elles rafraîchissent, " +
      "resserrent les pores et apaisent le feu du rasoir, en laissant un sillage. " +
      "C'est la touche finale du barbershop, et la famille la plus large du catalogue.",
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
    intro: "Les Aqua Wax sont des cires à base aqueuse : application facile, " +
      "fini brillant, tenue forte sur la journée. Elles ne laissent pas de " +
      "résidu et se rincent en un seul shampoing.",
  },
  "spider": {
    nom: "Spider",
    h1: "Cires Spider NISHMAN",
    titre: "NISHMAN Spider Wax — cire fibreuse effet toile",
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

const ORDRE = Object.keys(FAMILLES);

function feuille(p, base) {
  const url = base + "/boutique/" + p.slug + "/";
  const nom = p.nom_court || p.nom;
  return `
    <a class="fam-carte" href="/boutique/${echapper(p.slug)}/">
      <div class="fam-img">
        <img src="/assets/img/products/${echapper(p.image)}" alt="${echapper(p.nom)}"
             width="600" height="600" loading="lazy" />
      </div>
      <div class="fam-nom">${echapper(nom)}</div>
      <div class="fam-vol">${echapper(p.volume || "")}</div>
      <div class="fam-prix">${p.bientot ? "Bientôt disponible" : euros(p.ttc)}</div>
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
<link rel="stylesheet" href="/assets/css/base.css?v=289" />
<link rel="stylesheet" href="/assets/css/boutique.css?v=289" />
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
  .fam-carte { display: block; text-decoration: none; color: inherit; }
  .fam-img { background: #f4f1ea; border-radius: 14px; overflow: hidden; margin-bottom: 10px; }
  .fam-img img { width: 100%; height: auto; display: block; }
  .fam-nom { font-weight: 600; line-height: 1.25; }
  .fam-vol { color: #8a8070; font-size: .85rem; margin-top: 2px; }
  .fam-prix { font-family: "Space Grotesk", system-ui, sans-serif; font-weight: 700;
              margin-top: 6px; }
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

  <div class="fam-grille">${produits.map((p) => feuille(p, base)).join("")}</div>

  <nav class="fam-autres">
    <b>Les autres familles NISHMAN</b>
    ${autres}
  </nav>

  <p class="fam-pro">Vous êtes coiffeur ou barbier ?
    <a href="/">Le catalogue professionnel passe par l'accueil</a> — vente au
    carton, facture et livraison au salon.</p>
</main>

<script src="/assets/js/mesure.js?v=278" defer></script>
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
export { FAMILLES, ORDRE };
