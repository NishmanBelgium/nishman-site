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
export async function donneesPortier(env) {
  if (cachePrix && Date.now() < cachePrixExpire) {
    return { prices: cachePrix, limits: cacheLimites };
  }

  const reponse = await interrogerPortier(env, "action=unlock&callback=p");
  if (reponse.etat === "code") throw new Error("code interne refusé");
  if (reponse.etat !== "ok") throw new Error("portier injoignable");

  const d = reponse.donnees;
  if (!d.prices) throw new Error("portier sans prix");

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
  return { prices: cachePrix, limits: cacheLimites };
}

export async function tableDePrix(env) {
  return (await donneesPortier(env)).prices;
}

export { PORTIER_DEFAUT };
