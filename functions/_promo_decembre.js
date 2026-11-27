/* ==========================================================================
   DÉCEMBRE 2026 — −20 % SUR TOUTE LA BOUTIQUE.

   Même principe que `_promo_bf.js`, et volontairement un fichier séparé :
   le Black Friday tourne encore jusqu'au 30 novembre à 23 h 59. Modifier
   son taux ou sa liste pour y loger décembre aurait changé ses prix
   pendant ses trois derniers jours — une opération commerciale en cours
   ne se réécrit pas pour en préparer la suivante.

   Les deux ne se croisent jamais : le Black Friday finit à l'instant où
   décembre commence (30 nov. 23 h 00 UTC = 1er déc. 00 h 00 à Bruxelles).
   `remiseActive` compare `t >= DEBUT && t < FIN`, donc à cet instant précis
   l'un s'éteint et l'autre s'allume, sans recouvrement ni trou.

   CE QUI REND LA REMISE VRAIE. Comme pour le Black Friday : elle
   s'applique sur le champ `ttc` du catalogue, à la source. La fiche
   produit le rend, le panier le multiplie, `_commande_b2c.js` l'envoie à
   Odoo avec la taxe « 21 % TTC », et Mollie débite ce total. Il n'existe
   aucun endroit où afficher un prix et en encaisser un autre, parce qu'il
   n'y a qu'un seul prix dans tout le système.

   CE QUI N'EST PAS TOUCHÉ. Le tunnel professionnel a sa propre chaîne de
   prix (`_tarifs.js`, Odoo) et ne lit jamais ce fichier : les salons
   gardent leurs conditions. C'est la condition qui a rendu cette opération
   acceptable — voir plus bas.

   RIEN N'EST RÉÉCRIT DANS `boutique.json` : la remise est une fonction de
   l'heure, recalculée à chaque requête. Le 31 décembre à 23 h 59 elle
   cesse d'elle-même, sans que personne ait à se connecter, et il n'y a
   rien à restaurer.
   ========================================================================== */

/* L'INTERRUPTEUR. Passé à false, tout s'éteint au prochain chargement :
   prix pleins, badges, bannière. C'est le retour arrière, et il ne demande
   aucune restauration de données. */
export const ACTIVE = true;

export const TAUX = 0.20;

/* Bruxelles est à UTC+1 en décembre : minuit ici, 23 h la veille en UTC. */
const DEBUT = Date.UTC(2026, 10, 30, 23, 0, 0);  // 1er déc. 00h00
const FIN   = Date.UTC(2026, 11, 31, 23, 0, 0);  // 31 déc. 23h59'59

/* TOUT LE CATALOGUE, ET C'EST UNE DÉCISION, PAS UNE DÉDUCTION.
 *
 * Le Black Friday énumérait ses vingt références par code-barres, pour
 * qu'une nouveauté rangée dans la bonne famille n'entre pas en promotion
 * sans que personne l'ait décidé. Ici la décision de NBD est littéralement
 * « tout le site » : une référence ajoutée en décembre DOIT être remisée
 * comme les autres, sinon la boutique afficherait « −20 % sur tout le
 * site » avec un produit à plein tarif au milieu.
 *
 * L'énumération serait donc le piège, et non l'inverse.
 *
 * Décision de NBD du 27 novembre 2026 : −20 % sur toute la boutique, du
 * 1er au 31 décembre, spatules comprises.
 */
export function estEligible() { return true; }

/* LE PRIX DES COFFRETS : ARRÊTÉ, PAS CALCULÉ.
 *
 * 35,00 × 0,80 = 28,00. NBD a arrêté 30,00 € — un prix rond, et les
 * coffrets sont le produit mis en avant du mois : ils n'avaient pas besoin
 * d'une remise pleine pour partir (64 pièces vendues en novembre sans
 * aucune publicité). La remise réelle est donc de 14,3 % sur ces trois
 * références, et de 20 % partout ailleurs.
 *
 * La table est lue par le prix plein en centimes, comme pour le Black
 * Friday, pour qu'un 35,00 stocké comme 34,9999999 tombe quand même sur la
 * bonne ligne. Au 27 novembre, les seules références à 35,00 € sont
 * précisément les trois coffrets — vérifié sur le catalogue réel.
 *
 * Un prix plein absent de la table suit la règle générale : −20 % au
 * centime inférieur. Le passage par quatre décimales avant la troncature
 * évite qu'un 7,9199999 ne tombe à 7,91.
 */
const PRIX_ARRETES = { 3500: 30 };

export function prixRemise(ttc) {
  const arrete = PRIX_ARRETES[Math.round(Number(ttc) * 100)];
  if (arrete !== undefined) return arrete;
  const brut = Number(ttc) * (1 - TAUX);
  return Math.floor(Math.round(brut * 10000) / 100) / 100;
}

/** La remise est-elle en cours ? C'est elle qui touche les prix. */
export function remiseActive(maintenant) {
  if (!ACTIVE) return false;
  const t = Number(maintenant || Date.now());
  return t >= DEBUT && t < FIN;
}

/** L'habillage suit exactement la remise : pas d'avant-première en décembre. */
export function habillageActif(maintenant) { return remiseActive(maintenant); }

/**
 * Applique la remise à un catalogue boutique.
 *
 * Rend une NOUVELLE liste : le catalogue d'origine est mis en cache et
 * partagé entre les requêtes, une mutation en place remiserait deux fois
 * au bout de deux appels.
 *
 * UNE FICHE DÉJÀ REMISÉE EST LAISSÉE TELLE QUELLE. Les dates garantissent
 * déjà qu'une seule opération tourne à la fois ; ce garde-fou existe pour
 * le jour où quelqu'un se tromperait d'une heure en recopiant des bornes.
 * Remiser deux fois ne se voit pas en lisant le code : ça se voit sur la
 * facture d'un client qui a payé 6,33 € un produit à 9,90 €.
 *
 * Les fiches remisées gagnent deux champs lus par l'affichage :
 *   ttc_plein — le prix barré, celui pratiqué depuis plus de 30 jours,
 *               comme la réglementation belge l'exige du prix de référence ;
 *   promo     — le taux RÉELLEMENT obtenu sur cette fiche, pas le taux de
 *               l'opération.
 *
 * LE BADGE DIT LE VRAI TAUX, FICHE PAR FICHE. Le badge de la vignette et
 * la mention de la fiche affichent `Math.round(promo × 100)`. Si on y
 * mettait 0,20 partout, les trois coffrets porteraient « −20 % » au-dessus
 * d'un prix barré 35,00 € → 30,00 €, c'est-à-dire −14 %. Un visiteur qui
 * fait la division trouve l'écart, et un taux annoncé plus fort que le
 * taux pratiqué est une annonce de réduction fausse. On calcule donc le
 * taux sur les deux prix affichés : 20 % partout, 14 % sur les coffrets.
 */
export function appliquer(produits, maintenant) {
  if (!remiseActive(maintenant)) return produits;
  return (produits || []).map((p) => {
    if (!p || p.ttc_plein !== undefined) return p;
    const plein = Number(p.ttc);
    if (!(plein > 0)) return p;
    const remise = prixRemise(plein);
    if (!(remise > 0) || remise >= plein) return p;
    return { ...p, ttc: remise, ttc_plein: plein, promo: (plein - remise) / plein };
  });
}

/** Ce que le diagnostic affiche, et ce que le navigateur doit retrouver. */
export function etatPromo(maintenant) {
  const t = Number(maintenant || Date.now());
  return {
    operation: "decembre-2026",
    active: ACTIVE,
    habillage: habillageActif(t),
    remise: remiseActive(t),
    taux: TAUX,
    eligibles: "tout le catalogue",
    prix_arretes: { "35.00": 30 },
    debut: new Date(DEBUT).toISOString(),
    fin: new Date(FIN).toISOString(),
  };
}
