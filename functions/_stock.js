/* ==========================================================================
   LE STOCK RÉEL — une seule source, et c'est Odoo.

   Ce qui existait avant : la boutique n'avait aucun stock, seulement un
   drapeau « bientôt » écrit à la main dans le catalogue, posé sur deux
   références sur cent vingt-cinq. Et le catalogue professionnel limitait
   bien les quantités, mais dans le navigateur seulement — le serveur ne
   vérifiait rien au moment de créer la commande. Un onglet resté ouvert
   une heure, deux salons sur le dernier carton, un panier modifié, et la
   commande passait.

   Trois décisions, et il faut les expliciter parce qu'elles ne vont pas
   de soi :

   1. ON COMPTE LE DISPONIBLE, PAS LE PHYSIQUE. Odoo distingue ce qui est
      sur l'étagère de ce qui y est encore libre : une pièce réservée pour
      une commande en cours est physiquement là, mais elle est vendue.
      Compter le physique, c'est vendre deux fois la même pièce.

   2. UN SEUL EMPLACEMENT, WH/Stock. Le showroom (WH/PRESENTATION) porte
      près de sept mille pièces qui servent à la démonstration. Elles
      existent, elles ne sont pas à vendre.

   3. UNE MARGE DE DEUX PIÈCES. Une référence à deux ou moins passe en
      rupture. L'inventaire du 29 octobre a trouvé 1 058 pièces d'écart
      avec Odoo, dans les deux sens : un stock informatique n'est jamais
      exact à la pièce près, et la marge est ce qui évite qu'une erreur de
      comptage devienne une commande impossible à honorer.
   ========================================================================== */

import { appel, produitsParEan } from "./_odoo.js";

export const MARGE = 2;
const EMPLACEMENT = "WH/Stock";
const CACHE_MS = 45 * 1000;

let cache = null;
let cacheExpire = 0;
let cacheEmplacement = null;

/** L'identifiant de l'emplacement de vente, cherché par son nom complet. */
async function idEmplacement(env) {
  if (cacheEmplacement) return cacheEmplacement;
  const l = await appel(env, "stock.location", "search_read",
    [[["complete_name", "=", EMPLACEMENT], ["usage", "=", "internal"]], ["id"]], { limit: 1 });
  if (!l || !l.length) throw new Error("emplacement " + EMPLACEMENT + " introuvable");
  cacheEmplacement = l[0].id;
  return cacheEmplacement;
}

/**
 * Le stock vendable, par code-barres.
 *
 * On lit les quants et non le champ `free_qty` du produit : ce dernier
 * additionne tous les emplacements internes, showroom compris. Les quants
 * permettent de n'en retenir qu'un.
 *
 * @returns { [ean]: nombre }  déjà net de la marge, jamais négatif.
 */
export async function stockVendable(env, eans) {
  const codes = [...new Set((eans || []).map((e) => String(e || "").trim()).filter(Boolean))];
  if (!codes.length) return {};

  const maintenant = Date.now();
  const manquants = cache && maintenant < cacheExpire
    ? codes.filter((c) => cache[c] === undefined)
    : codes;

  if (manquants.length) {
    const lieu = await idEmplacement(env);
    const produits = await produitsParEan(env, manquants);
    const ids = Object.values(produits).map((p) => p.id);
    const parProduit = {};
    const PAQUET = 150;
    for (let i = 0; i < ids.length; i += PAQUET) {
      const lot = ids.slice(i, i + PAQUET);
      const quants = await appel(env, "stock.quant", "search_read",
        [[["product_id", "in", lot], ["location_id", "=", lieu]],
         ["product_id", "quantity", "reserved_quantity"]], { limit: 2000 });
      for (const q of quants || []) {
        const pid = q.product_id && q.product_id[0];
        if (!pid) continue;
        // Une même référence peut porter plusieurs lignes de quant au même
        // endroit — Odoo les fusionne avec le temps, pas tout de suite.
        parProduit[pid] = (parProduit[pid] || 0) +
          (Number(q.quantity) || 0) - (Number(q.reserved_quantity) || 0);
      }
    }
    if (!cache || maintenant >= cacheExpire) { cache = {}; cacheExpire = maintenant + CACHE_MS; }
    for (const ean of manquants) {
      const p = produits[ean];
      // Une référence inconnue d'Odoo vaut zéro : on ne vend pas ce qu'on
      // ne sait pas compter.
      const brut = p ? (parProduit[p.id] || 0) : 0;
      cache[ean] = Math.max(0, Math.floor(brut - MARGE));
    }
  }

  const sortie = {};
  for (const c of codes) sortie[c] = cache[c] !== undefined ? cache[c] : 0;
  return sortie;
}

/**
 * Ramène une sélection dans les limites du stock.
 *
 * Ne lève pas : une commande dont tout dépasse revient vide, et c'est à
 * l'appelant de le dire au client. Une exception ici ferait échouer un
 * paiement déjà engagé.
 *
 * @param selection  { ean: quantité }
 * @returns { selection, retires, reduits, rupture }
 */
export async function limiterAuStock(env, selection) {
  const eans = Object.keys(selection || {});
  if (!eans.length) return { selection: {}, retires: [], reduits: [], rupture: false };

  const dispo = await stockVendable(env, eans);
  const propre = {};
  const retires = [];
  const reduits = [];

  for (const ean of eans) {
    const voulu = Math.floor(Number(selection[ean]) || 0);
    if (!(voulu > 0)) continue;
    const libre = dispo[ean] || 0;
    if (libre <= 0) { retires.push(ean); continue; }
    if (voulu > libre) { reduits.push({ ean, voulu, servi: libre }); propre[ean] = libre; continue; }
    propre[ean] = voulu;
  }

  return {
    selection: propre,
    retires,
    reduits,
    rupture: retires.length > 0 || reduits.length > 0,
  };
}

/**
 * Le même contrôle, pour le panier professionnel.
 *
 * Il ne compte pas en unités mais en cartons ET en pièces : { u, b }. Le
 * nombre de pièces réellement demandées est u + b × box_qty.
 *
 * On ne rogne pas une commande de salon en silence. Un professionnel qui
 * a commandé trois cartons et en reçoit deux sans qu'on le lui dise
 * refera la commande, ou pire, la croira complète. On refuse, on nomme ce
 * qui manque, et on le laisse réviser son panier.
 *
 * @param selection  { ean: {u, b} }
 * @param produits   le catalogue, pour connaître box_qty
 * @returns { rupture, manquants: [{ean, nom, demande, restant}] }
 */
export async function verifierStockPro(env, selection, produits) {
  const eans = Object.keys(selection || {});
  if (!eans.length) return { rupture: false, manquants: [] };

  const parEan = new Map();
  for (const p of produits || []) if (p && p.ean) parEan.set(String(p.ean), p);

  const demande = {};
  for (const ean of eans) {
    const q = selection[ean] || {};
    const p = parEan.get(String(ean));
    const parCarton = Math.max(0, Math.floor(Number(p && p.box_qty) || 0));
    const pieces = Math.max(0, Math.floor(Number(q.u) || 0)) +
                   Math.max(0, Math.floor(Number(q.b) || 0)) * parCarton;
    if (pieces > 0) demande[ean] = pieces;
  }
  if (!Object.keys(demande).length) return { rupture: false, manquants: [] };

  const dispo = await stockVendable(env, Object.keys(demande));
  const manquants = [];
  for (const ean of Object.keys(demande)) {
    const libre = dispo[ean] || 0;
    if (demande[ean] > libre) {
      const p = parEan.get(String(ean));
      manquants.push({
        ean,
        nom: (p && (p.name || p.nom)) || "",
        demande: demande[ean],
        restant: libre,
      });
    }
  }
  return { rupture: manquants.length > 0, manquants };
}
