/* ==========================================================================
   TARIFS — le catalogue et la table de prix, en un seul endroit.

   Deux points d'entrée en ont besoin : le panier, qui affiche un montant, et
   la commande, qui l'engage. Ils doivent lire la même chose, sinon le client
   voit un total et paie un autre. D'où ce module, et le cache partagé qui va
   avec : une seule source, une seule durée de vie.
   ========================================================================== */

import { interrogerPortier, PORTIER_DEFAUT } from "./_portier.js";
import { appel, configure as odooConfigure } from "./_odoo.js";

let cacheCatalogue = null;
let cachePrix = null;
let cachePrixExpire = 0;
const PRIX_DUREE_MS = 60 * 1000;

/* Le catalogue est-il DÉJÀ en mémoire dans cet isolat ?

   products.json pèse 334 Ko. L'analyser coûte du temps processeur, et
   Cloudflare en accorde très peu par requête. Tant que l'isolat est chaud,
   `cacheCatalogue` répond sans rien coûter ; à froid, la première requête
   paie l'analyse entière — et le 13 novembre 2026, elle la payait en plus
   d'un relevé de stock Odoo, ce qui dépassait le budget et tuait l'isolat
   avant qu'une seule ligne ne puisse répondre (voir l'enveloppe de
   api/prix.js). La page rendait « Worker threw exception ».

   Savoir si le catalogue est déjà là permet à l'appelant de choisir :
   faire le travail maintenant parce qu'il est gratuit, ou le renvoyer en
   arrière-plan pour servir tout de suite. On expose donc l'état du cache
   plutôt que de laisser chacun deviner. */
export function catalogueEnMemoire() {
  return cacheCatalogue;
}

export async function catalogue(request) {
  if (cacheCatalogue) return cacheCatalogue;
  const r = await fetch(new URL("/assets/data/products.json", request.url));
  if (!r.ok) throw new Error("catalogue injoignable");
  const d = await r.json();
  cacheCatalogue = Array.isArray(d) ? d : (d.products || []);
  return cacheCatalogue;
}

let cacheLimites = null;

/* --- Le filet : les prix qu'Odoo connaît et que le portier ignore -------
 *
 * La table du portier est écrite à la main dans le script Google. Une
 * référence créée dans Odoo et publiée au catalogue n'y figure donc pas,
 * et une fiche sans prix n'est PAS commandable : `calculer` l'écarte, le
 * bouton ne s'arme jamais. Le 9 novembre 2026, les quinze nouveautés de
 * la 3e commande étaient en ligne depuis le matin, avec leur photo et
 * leur stock — et invendables pour cette seule raison. Rien, nulle part,
 * ne le signalait : le catalogue affichait simplement une fiche muette.
 *
 * Le tarif professionnel d'Odoo (`list_price`) EST celui du portier :
 * vérifié le même jour sur douze références prises au hasard, douze
 * valeurs identiques au centime. Odoo peut donc compléter sans risque de
 * contredire.
 *
 * Deux garde-fous :
 *   - LE PORTIER GARDE LA MAIN. Odoo ne remplace jamais un prix existant,
 *     il ne bouche que les trous. Une remise négociée saisie dans le
 *     script reste la remise appliquée.
 *   - UN PRIX NE SUFFIT PAS À VENDRE. `calculer` exige en plus la fiche
 *     au catalogue : les références qu'Odoo porte en trop (le showroom,
 *     les articles retirés du site) restent inertes.
 *
 * Et surtout, ce complément est posé ICI plutôt que dans /api/prix, pour
 * que le panier et la commande lisent exactement la même table que la
 * page. Un prix affiché que la commande ignorerait serait pire que pas
 * de prix du tout.
 */
const FILET_MS = 10 * 60 * 1000;
let cacheFilet = null;
let cacheFiletExpire = 0;
let filetSouci = "";
let filetAjoutes = 0;

async function prixOdoo(env) {
  if (cacheFilet && Date.now() < cacheFiletExpire) return cacheFilet;
  // Sans identifiants, on ne tente rien : une question qu'on sait perdue
  // d'avance coûte un aller-retour par minute et salit le diagnostic.
  if (!odooConfigure(env)) {
    cacheFilet = {};
    cacheFiletExpire = Date.now() + FILET_MS;
    return cacheFilet;
  }
  const lignes = await appel(env, "product.product", "search_read",
    [[["barcode", "!=", false], ["list_price", ">", 0]], ["barcode", "list_price"]],
    { limit: 2000 });
  const t = {};
  for (const l of lignes || []) {
    const b = String((l && l.barcode) || "").trim();
    if (b) t[b] = Number(l.list_price);
  }
  cacheFilet = t;
  cacheFiletExpire = Date.now() + FILET_MS;
  return t;
}

/** Ce que le filet a comblé au dernier calcul, pour /api/diagnostic. */
export function etatFilet() {
  return { ajoutes: filetAjoutes, souci: filetSouci };
}

/**
 * Les prix ET les limites de stock, tels que le portier les rend, gardés
 * une minute. /api/prix interrogeait le script Google à chaque visite :
 * un robot qui boucle sur cette adresse anonyme épuisait les quotas du
 * script, et coupait du même coup les prix, les devis et les e-mails.
 */
/* ==========================================================================
   LE FILET DE SECOURS — servir la dernière table connue quand le portier
   se tait. Écrit le 12 novembre 2026, après la deuxième panne en deux jours.

   LE 11 ET LE 12 NOVEMBRE, à quelques minutes d'intervalle, le catalogue
   professionnel a affiché « Tarifs momentanément indisponibles » sur ses
   188 références. Les deux fois, la panne a duré quelques minutes et s'est
   résorbée seule. Les deux fois, pendant ce temps, la maison ne pouvait
   rien vendre en ligne : sans prix, aucun bouton ne s'arme.

   La cause est structurelle, pas accidentelle. La table de prix vit dans
   un script Google, et le site la redemande toutes les soixante secondes.
   Chaque hoquet de ce script — saturation, quota, latence — supprime donc
   la totalité des prix du catalogue. Une dépendance extérieure momentanée
   ne devrait jamais avoir ce pouvoir-là.

   CE QUE FAIT LE FILET. À chaque réponse valide, la table est recopiée
   dans la base, sous la même mécanique que le relevé de stock partagé
   (table cache_stock, une clé par usage) — donc rien de neuf à installer.
   Quand le portier se tait, on ressert cette copie au lieu de ne rien
   rendre.

   POURQUOI LA BASE ET PAS LA MÉMOIRE. Le cache d'une minute vit dans
   l'instance Cloudflare qui l'a rempli. Une instance froide — et il y en
   a sans arrêt — n'a rien en mémoire, et c'est précisément au moment
   d'une panne que de nouvelles instances démarrent. Un filet qui ne
   survit pas au redémarrage n'est pas un filet.

   LES DEUX GARDE-FOUS.
     - UNE LIMITE D'ÂGE. Au-delà, on préfère ne rien dire que d'engager un
       prix peut-être périmé. Trois heures : assez pour couvrir largement
       les pannes observées, trop peu pour qu'un tarif modifié dans le
       script circule une journée entière.
     - LA MÊME TABLE POUR TOUT LE MONDE. Le filet est posé ici, dans le
       module que lisent la page, le panier ET la commande. Il n'existe
       donc aucun moment où l'on afficherait un prix que la commande
       ignorerait — c'est la règle déjà posée plus haut pour le filet Odoo,
       et elle vaut doublement ici.

   Ce que le filet ne fait PAS : masquer la panne. La réponse porte
   `source` et `age_s`, le diagnostic les montre, et la page peut le dire.
   Un repli silencieux est un repli qu'on découvre trop tard.
   ========================================================================== */

const SECOURS_MAX_MS = 3 * 60 * 60 * 1000;   // 3 heures
const SECOURS_ECRIRE_MS = 10 * 60 * 1000;    // on ne réécrit pas à chaque minute
let secoursEcritLe = 0;
let secoursSouci = "";

async function preparerSecours(db) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS cache_stock (" +
      "cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, pose_le INTEGER NOT NULL)"
  );
}

/** Recopie la table valide dans la base. Ne lève jamais : un filet qui
 *  casse ne doit pas faire tomber la réponse qu'il devait protéger. */
async function poserSecours(db, prix, limites) {
  if (!db) return;
  if (Date.now() - secoursEcritLe < SECOURS_ECRIRE_MS) return;
  try {
    await preparerSecours(db);
    await db.prepare(
      "INSERT INTO cache_stock (cle, valeur, pose_le) VALUES ('prix', ?, ?) " +
      "ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur, pose_le = excluded.pose_le"
    ).bind(JSON.stringify({ prices: prix, limits: limites || null }), Date.now()).run();
    secoursEcritLe = Date.now();
    secoursSouci = "";
  } catch (e) {
    secoursSouci = String((e && e.message) || e).slice(0, 160);
  }
}

/** La dernière table connue, si elle existe et n'est pas trop vieille. */
async function lireSecours(db) {
  if (!db) return null;
  try {
    await preparerSecours(db);
    const r = await db.prepare(
      "SELECT valeur, pose_le FROM cache_stock WHERE cle = 'prix'"
    ).first();
    if (!r || !r.valeur) return null;
    const age = Date.now() - Number(r.pose_le);
    if (!(age >= 0) || age > SECOURS_MAX_MS) return null;
    const d = JSON.parse(r.valeur);
    if (!d || !d.prices || !Object.keys(d.prices).length) return null;
    return { prices: d.prices, limits: d.limits || null, age_s: Math.round(age / 1000) };
  } catch (e) {
    return null;
  }
}

/** Ce que le diagnostic affiche sur le filet de secours. Ne lève jamais. */
export async function etatSecoursPrix(db) {
  const s = await lireSecours(db);
  if (s) {
    return { ok: true, detail: Object.keys(s.prices).length + " prix en secours, posés il y a "
      + Math.round(s.age_s / 60) + " min" };
  }
  return { ok: false, detail: "Aucune table de secours exploitable"
    + (secoursSouci ? " — dernière écriture refusée : " + secoursSouci : "")
    + ". Une panne du portier laisserait le catalogue sans prix." };
}

export async function donneesPortier(env, options) {
  if (cachePrix && Date.now() < cachePrixExpire) {
    return { prices: cachePrix, limits: cacheLimites, source: "portier" };
  }

  /* ====================================================================
     SERVIR D'ABORD, RAFRAÎCHIR DERRIÈRE — pour l'AFFICHAGE seulement.

     Sur un isolat froid, ce qui suit coûte cher : interroger le portier,
     puis lire 2 000 fiches dans Odoo pour le filet, puis réécrire la
     copie de secours. Mesuré le 14 novembre 2026 : 7,5 secondes de bout
     en bout. Cloudflare accorde très peu de temps processeur par
     requête, et au-delà il tue l'isolat — le catalogue rendait alors une
     page d'erreur, et le visiteur ne voyait aucun prix (voir la note
     dans api/prix.js).

     Or une copie complète et fusionnée de la table dort déjà en base,
     réécrite toutes les dix minutes. La servir coûte une lecture.

     On la sert donc immédiatement, et on va chercher la vraie table en
     arrière-plan pour que la requête suivante soit à jour. La réponse
     annonce `source: "secours"` et son âge en secondes : le repli reste
     visible, jamais silencieux.

     CE RACCOURCI EST RÉSERVÉ À L'AFFICHAGE. La commande et le paiement
     appellent cette fonction SANS l'option : eux doivent toujours
     interroger l'autorité, parce qu'une table vieille de deux heures
     pourrait facturer un ancien prix. Afficher un prix d'il y a deux
     heures est un inconvénient ; en encaisser un est une erreur. */
  const attendre = options && options.attendre;
  if (options && options.secoursDabord && attendre) {
    const s = await lireSecours(env && env.DB);
    if (s) {
      attendre((async () => {
        try { await donneesPortier(env); } catch (e) { /* la suivante réessaiera */ }
      })());
      return { prices: s.prices, limits: s.limits, source: "secours", age_s: s.age_s };
    }
  }

  const reponse = await interrogerPortier(env, "action=unlock&callback=p");

  /* Un code refusé est une erreur de configuration, pas une panne : le
     filet la masquerait sans que personne ne la corrige jamais. On la
     laisse donc remonter, comme avant. */
  if (reponse.etat === "code") throw new Error("code interne refusé");

  /* Le portier se tait. C'est ICI que le catalogue tombait. */
  if (reponse.etat !== "ok") {
    const s = await lireSecours(env && env.DB);
    if (s) return { prices: s.prices, limits: s.limits, source: "secours", age_s: s.age_s };
    throw new Error("portier injoignable");
  }

  const d = reponse.donnees;
  /* Le portier a répondu, mais sans table. Pour le catalogue, c'est le
     même désastre qu'un silence : le filet vaut aussi ici. */
  if (!d.prices) {
    const s = await lireSecours(env && env.DB);
    if (s) return { prices: s.prices, limits: s.limits, source: "secours", age_s: s.age_s };
    throw new Error("portier sans prix");
  }

  // Le portier a répondu : ses prix font foi. Odoo ne vient qu'ensuite,
  // et seulement là où il n'y a rien. Si Odoo ne répond pas, on sert la
  // table du portier telle quelle — un filet absent ne doit pas faire
  // tomber des prix qui, eux, sont arrivés.
  let prix = d.prices;
  try {
    const odoo = await prixOdoo(env);
    const fusion = Object.assign({}, prix);
    let n = 0;
    for (const ean of Object.keys(odoo)) {
      if (fusion[ean] === undefined) { fusion[ean] = odoo[ean]; n++; }
    }
    prix = fusion;
    filetAjoutes = n;
    filetSouci = "";
  } catch (e) {
    filetSouci = String((e && e.message) || e).slice(0, 160);
  }

  cachePrix = prix;
  cacheLimites = d.limits || null;
  cachePrixExpire = Date.now() + PRIX_DUREE_MS;

  /* La table est bonne : on en garde une copie pour la prochaine panne.
     Espacée de dix minutes, et silencieuse en cas d'échec — recopier le
     filet n'est jamais plus important que de rendre les prix. */
  await poserSecours(env && env.DB, cachePrix, cacheLimites);

  return { prices: cachePrix, limits: cacheLimites, source: "portier" };
}

export async function tableDePrix(env) {
  return (await donneesPortier(env)).prices;
}

export { PORTIER_DEFAUT };
