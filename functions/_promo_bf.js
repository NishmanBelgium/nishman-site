/* ==========================================================================
   BLACK FRIDAY 2026 — la remise, écrite une fois, côté serveur.

   CE QUI REND UNE REMISE VRAIE. Le prix qui engage la boutique est le champ
   `ttc` du catalogue : la fiche produit le rend, le panier le multiplie,
   _commande_b2c.js l'envoie à Odoo avec la taxe « 21 % TTC » — Odoo refait
   la division et la facture tombe au centime — et Mollie débite ce total.
   Tout descend de là.

   Donc la remise s'applique sur `ttc`, à la source, et nulle part ailleurs.
   Elle devient alors structurellement réelle : il n'existe aucun endroit où
   afficher 6,44 € et en encaisser 9,90, parce qu'il n'y a qu'un seul prix
   dans tout le système. Une remise posée sur l'affichage aurait demandé de
   la reposer sur le panier, puis sur le paiement, puis sur la commande
   Odoo — et la première oubliée aurait facturé le plein tarif à un client
   qui a lu la promotion.

   CE QUI N'EST PAS TOUCHÉ. Le tunnel professionnel a sa propre chaîne de
   prix (_tarifs.js, le portier, Odoo) et ne lit jamais ce fichier : les
   salons continuent à leurs conditions. Odoo, Mollie et Sendcloud ne sont
   pas modifiés — ils reçoivent simplement le prix remisé, comme ils
   recevraient n'importe quel autre prix.

   LE CALENDRIER FAIT FOI, PAS UN INTERRUPTEUR OUBLIÉ. Rien n'est réécrit
   dans boutique.json : la remise est une fonction de l'heure, recalculée à
   chaque requête. Le 30 novembre à 23h59, elle cesse d'elle-même, sans que
   personne ait à se connecter. Et comme rien n'a été écrit, il n'y a rien
   à restaurer.

   Les bornes sont en UTC parce que c'est la seule horloge dont un serveur
   dispose. En novembre, Bruxelles est à UTC+1 : minuit chez nous est 23 h
   la veille en UTC. L'habillage ouvre un jour avant la remise, comme NBD
   l'a demandé — le site s'habille le 10, les prix tombent le 11.
   ========================================================================== */

/* L'INTERRUPTEUR. Passé à false, tout s'éteint au prochain chargement :
   prix pleins, badges, bannière et pop-up disparaissent. C'est le retour
   arrière, et il ne demande aucune restauration de données. */
export const ACTIVE = true;

export const TAUX = 0.35;

/* Bruxelles est à UTC+1 en novembre. */
const HABILLAGE_DEBUT = Date.UTC(2026, 10, 9, 23, 0, 0);   // 10 nov. 00h00
const REMISE_DEBUT    = Date.UTC(2026, 10, 10, 23, 0, 0);  // 11 nov. 00h00
const FIN             = Date.UTC(2026, 10, 30, 23, 0, 0);  // 30 nov. 23h59'59

/* LES 20 ÉLIGIBLES, PAR CODE-BARRES ET NOMMÉMENT.
 *
 * On pourrait se contenter de prendre la famille « Colognes » du
 * catalogue. Ce serait plus court et nettement plus dangereux : il
 * suffirait qu'une référence change de famille, ou qu'une nouveauté y soit
 * rangée, pour qu'elle entre ou sorte de la promotion sans que personne ne
 * l'ait décidé. Une remise commerciale se décide, elle ne se déduit pas.
 *
 * La liste a été arrêtée le 10 novembre 2026 après relevé du catalogue
 * réel : 20 eaux de Cologne 400 ML, de la 00 à la 19. Les numéros 20 et 21
 * existent chez Nishman mais ne sont pas encore importés par NBD — c'est
 * pourquoi l'habillage ne cite aucun chiffre et parle de « toute la
 * gamme », formulation qui restera vraie le jour où ils arriveront.
 *
 * Sont volontairement dehors : les 5 « CREAM + COLOGNE 2en1 », qui sont
 * des crèmes après-rasage et non des eaux de Cologne malgré leur nom ; les
 * parfums à barbe ; la lotion N.1 ; et les 3 coffrets, qui sont des
 * références à part entière, déjà avantageuses au détail.
 *
 * Le diagnostic vérifie que la famille « Colognes » contient toujours
 * exactement ces 20 références : si NBD en ajoute une, il le dira au lieu
 * de la remiser en silence ou de l'oublier en silence. */
export const ELIGIBLES = [
  "8682035088004", // 00 NORTHERN LIGHTS
  "8682035088134", // 01 ANTARCTICA
  "8682035088141", // 02 STORM
  "8682035082736", // 03 NESLY
  "8682035082002", // 04 LEMON
  "8682035080176", // 05 VOLCANO
  "8682035083696", // 06 AQUA D'ASIL
  "8682035083702", // 07 GOLD ONE
  "8682035083719", // 08 SUN SENSE
  "8682035083726", // 09 MARINE
  "8682035083733", // 10 AMBER
  "8682035083740", // 11 LEADER
  "8682035084556", // 12 SPACEX
  "8684736674883", // 13 CEDARWOOD
  "8684736674890", // 14 PATCHOULI
  "8684736674906", // 15 BLACKCURRANT
  "8684736674913", // 16 OLYMPIC
  "8684736674920", // 17 SOLEIL
  "8684736674937", // 18 VANILLA
  "8684736676047", // 19 SEA SALT
];

const JEU = new Set(ELIGIBLES);

/* L'ARRONDI, ET POURQUOI IL VA VERS LE BAS.
 *
 * Les deux prix de la gamme tombent sur un demi-centime : 9,90 × 0,65 =
 * 6,435 et 12,90 × 0,65 = 8,385. L'arrondi habituel les remonterait à
 * 6,44 et 8,39 — et la remise ne ferait plus que 34,95 %. On annoncerait
 * alors « −35 % » en en accordant un peu moins, ce qui est précisément ce
 * qu'une affiche de prix n'a pas le droit de faire.
 *
 * On descend donc au centime inférieur : 6,43 et 8,38, soit 35,05 % de
 * remise. L'annonce devient vraie au sens strict — au moins 35 % — et le
 * demi-centime d'écart va au client, ce qui est le bon sens pour l'erreur.
 *
 * Le passage par quatre décimales avant la troncature évite qu'un prix
 * stocké comme 6,4299999 ne tombe à 6,42 : on arrondit d'abord le bruit
 * du calcul en virgule flottante, on tronque ensuite seulement.
 */
export function prixRemise(ttc) {
  const brut = Number(ttc) * (1 - TAUX);
  return Math.floor(Math.round(brut * 10000) / 100) / 100;
}

/** L'habillage est-il de saison ? (un jour avant la remise) */
export function habillageActif(maintenant) {
  if (!ACTIVE) return false;
  const t = Number(maintenant || Date.now());
  return t >= HABILLAGE_DEBUT && t < FIN;
}

/** La remise est-elle en cours ? C'est elle qui touche les prix. */
export function remiseActive(maintenant) {
  if (!ACTIVE) return false;
  const t = Number(maintenant || Date.now());
  return t >= REMISE_DEBUT && t < FIN;
}

export function estEligible(ean) { return JEU.has(String(ean || "")); }

/**
 * Applique la remise à un catalogue boutique.
 *
 * Rend une NOUVELLE liste : le catalogue d'origine n'est jamais modifié,
 * parce qu'il est mis en cache et partagé entre les requêtes. Une mutation
 * en place aurait remisé deux fois au bout de deux appels — l'erreur
 * classique, et silencieuse jusqu'à ce qu'un client paie 4,19 €.
 *
 * Les fiches remisées gagnent deux champs lus par l'affichage :
 *   ttc_plein — le prix barré, celui pratiqué depuis plus de 30 jours,
 *               comme la réglementation belge l'exige du prix de référence ;
 *   promo     — le taux, pour le badge.
 */
export function appliquer(produits, maintenant) {
  if (!remiseActive(maintenant)) return produits;
  return (produits || []).map((p) => {
    if (!p || !estEligible(p.ean)) return p;
    const plein = Number(p.ttc);
    if (!(plein > 0)) return p;
    return { ...p, ttc: prixRemise(plein), ttc_plein: plein, promo: TAUX };
  });
}

/** Ce que le diagnostic affiche, et ce que le navigateur doit retrouver. */
export function etatPromo(maintenant) {
  const t = Number(maintenant || Date.now());
  return {
    active: ACTIVE,
    habillage: habillageActif(t),
    remise: remiseActive(t),
    taux: TAUX,
    eligibles: ELIGIBLES.length,
    debut_habillage: new Date(HABILLAGE_DEBUT).toISOString(),
    debut_remise: new Date(REMISE_DEBUT).toISOString(),
    fin: new Date(FIN).toISOString(),
  };
}
