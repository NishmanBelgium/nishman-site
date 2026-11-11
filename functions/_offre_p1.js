/* ==========================================================================
   BLACK FRIDAY PRO 2026 — un carton de 12 poudres P1 offert dès 300 € HT.

   LA RÈGLE, ARRÊTÉE PAR NBD LE 11 NOVEMBRE 2026.
   Une commande professionnelle qui atteint 300 € HT reçoit un carton de
   12 poudres P1, toutes du même parfum, au choix du client parmi les cinq
   P1 du catalogue. Le carton est ajouté gratuitement à la commande, sur le
   site comme dans Odoo, où il sort du stock comme n'importe quelle ligne
   au moment où le bon de livraison est validé.

   CE QUI EST DÉCIDÉ ICI, ET POURQUOI.
   - Un carton PAR COMMANDE, pas un par tranche de 300 € : c'est l'offre
     telle qu'elle a été annoncée (« un carton offert à l'achat de 300 € »).
   - Le seuil se lit sur le montant COMMANDÉ hors TVA, avant le code de
     bienvenue — exactement comme le franco de port (_calcul.js). Qui a
     rempli son panier jusqu'à 300 € a gagné son carton ; une remise
     accordée en plus ne le lui reprend pas.
   - Le port n'entre pas dans le seuil : on offre sur ce qu'on achète, pas
     sur ce qu'on paie pour le recevoir.
   - Le parfum est CHOISI par le client. Le serveur ne devine jamais : sans
     choix valide, pas de ligne offerte (la page de commande empêche
     d'envoyer sans choisir, pour que personne ne perde son carton).

   LE PRIX DE LA LIGNE OFFERTE EST ÉCRIT ICI, PAS LU DU NAVIGATEUR. Le
   navigateur n'envoie qu'un code-barres ; ce fichier vérifie qu'il est
   dans la liste, que le seuil est atteint et que l'offre est ouverte. Une
   requête bricolée ne peut donc ni changer le produit offert, ni la
   quantité, ni obtenir le carton sous le seuil.

   La même règle est écrite côté navigateur (assets/js/offre-p1.js) pour
   l'affichage. TOUTE MODIFICATION ICI DOIT Y ÊTRE REPORTÉE — le serveur
   fait foi, mais un navigateur qui annoncerait un autre seuil promettrait
   un carton que la commande refuserait.
   ========================================================================== */

/* L'INTERRUPTEUR. false : plus de carton, plus d'habillage, au prochain
   chargement — sans rien à restaurer. */
export const ACTIVE = true;

/* Bruxelles est à UTC+1 en novembre : minuit chez nous, 23 h la veille
   en UTC. L'offre part le 11 novembre (le jour de la décision) et s'arrête
   avec le Black Friday de la boutique, le 30 novembre à 23h59'59. */
export const DEBUT = Date.UTC(2026, 10, 10, 23, 0, 0);   // 11 nov. 00h00
export const FIN   = Date.UTC(2026, 10, 30, 23, 0, 0);   // 30 nov. 23h59'59

export const SEUIL_HT = 300;
export const PIECES = 12;

/* LES CINQ P1, PAR CODE-BARRES. Relevées le 11 novembre 2026 dans le
   catalogue professionnel et dans Odoo (rayon C-01 à C-05, fiches stockées).
   Les autres poudres (X1, X5, P5+, Milky, texture) ne sont PAS des P1 et
   restent hors de l'offre. */
export const POUDRES = [
  { ean: "8684736671004", parfum: "Sport" },
  { ean: "8684736670991", parfum: "GumGum" },
  { ean: "8684736671011", parfum: "Flaming" },
  { ean: "8684736671028", parfum: "Fresh Look" },
  { ean: "8682035088851", parfum: "Light Control" },
];

const PAR_EAN = new Map(POUDRES.map((p) => [p.ean, p]));

const sou = (n) => Math.round(Number(n) * 100) / 100;

export function offreOuverte(maintenant) {
  if (!ACTIVE) return false;
  const t = Number(maintenant || Date.now());
  return t >= DEBUT && t < FIN;
}

export function estPoudreP1(ean) { return PAR_EAN.has(String(ean || "")); }

/**
 * Où en est la commande par rapport à l'offre.
 *
 * @param sousTotal  le montant HT commandé, avant remise (calculer())
 * @param choix      le code-barres envoyé par le navigateur, tel quel
 * @param produits   le catalogue, pour le nom exact de la poudre choisie
 * @returns un objet toujours présent, même offre fermée : la page sait
 *          ainsi s'il faut se taire, encourager ou faire choisir.
 */
export function evaluerOffre(sousTotal, choix, produits, maintenant) {
  const ouverte = offreOuverte(maintenant);
  const montant = sou(sousTotal || 0);
  const atteinte = ouverte && montant >= SEUIL_HT;
  const ean = String(choix || "").trim();
  const poudre = atteinte && PAR_EAN.has(ean) ? PAR_EAN.get(ean) : null;

  let ligne = null;
  if (poudre) {
    const fiche = (produits || []).find((p) => p && String(p.ean) === poudre.ean);
    ligne = {
      ean: poudre.ean,
      nom: (fiche && fiche.name) || ("POWDER HAIR STYLING WAX " + poudre.parfum.toUpperCase() + " P1"),
      parfum: poudre.parfum,
      unites: 0,
      cartons: 1,
      par_carton: PIECES,
      pieces: PIECES,
      prix_unitaire: 0,
      total: 0,
      offert: true,
    };
  }

  return {
    ouverte,
    seuil: SEUIL_HT,
    pieces: PIECES,
    atteinte,
    manque: ouverte && !atteinte ? sou(SEUIL_HT - montant) : 0,
    // Seuil atteint mais aucun parfum valide : la page doit faire choisir.
    a_choisir: atteinte && !poudre,
    choix: poudre ? poudre.ean : "",
    ligne,
    parfums: POUDRES.map((p) => ({ ean: p.ean, parfum: p.parfum })),
  };
}

/**
 * La sélection telle que le stock doit la voir : le carton offert sort du
 * même rayon que les cartons vendus. Douze poudres offertes et six
 * achetées du même parfum, c'est dix-huit pièces à trouver en stock.
 */
export function selectionAvecCadeau(selection, offre) {
  const copie = Object.assign({}, selection || {});
  if (offre && offre.ligne) {
    const ean = offre.ligne.ean;
    const q = copie[ean] || {};
    copie[ean] = { u: (Math.floor(Number(q.u) || 0)) + offre.ligne.pieces, b: Math.floor(Number(q.b) || 0) };
  }
  return copie;
}

/**
 * La rupture vient-elle UNIQUEMENT du carton offert ?
 *
 * Dans ce cas, refuser la commande en parlant de « références plus
 * disponibles » serait faux et décourageant : ce que le client paie est
 * là. On lui demande seulement de choisir un autre parfum.
 */
export function ruptureDuCadeau(stock, offre) {
  if (!stock || !stock.rupture || !offre || !offre.ligne) return false;
  return (stock.manquants || []).every((m) =>
    String(m.ean) === offre.ligne.ean
    && Number(m.demande) - offre.ligne.pieces <= Number(m.restant));
}

/** Le libellé de la ligne offerte dans Odoo : lisible sur le devis, le
 *  bon de livraison et la facture, sans avoir à connaître l'opération. */
export function libelleOdoo(ligne) {
  return ligne.nom + " — OFFERT (Black Friday pro : 1 carton de "
    + PIECES + " poudres P1 dès " + SEUIL_HT + " € HT)";
}

/** La ligne telle que le script Google l'attend : le même format que le
 *  carton d'Aqua Wax de l'offre MCB, qu'il a déjà écrit à 0 € dans Odoo. */
export function ligneScript(ligne) {
  return {
    ean: ligne.ean,
    name: libelleOdoo(ligne),
    units: 0,
    boxes: 1,
    boxQty: PIECES,
    pieces: PIECES,
    unitPrice: "0.00",
    subtotal: "0.00",
  };
}

/** La phrase portée dans la note interne de la commande. */
export function noteOdoo(ligne) {
  return "Black Friday pro : " + PIECES + " × P1 " + ligne.parfum
    + " offertes (commande ≥ " + SEUIL_HT + " € HT).";
}

/** Pour /api/diagnostic. */
export function etatOffre(maintenant) {
  return {
    active: ACTIVE,
    ouverte: offreOuverte(maintenant),
    seuil_ht: SEUIL_HT,
    pieces: PIECES,
    poudres: POUDRES.map((p) => p.parfum + " " + p.ean),
    debut: new Date(DEBUT).toISOString(),
    fin: new Date(FIN).toISOString(),
  };
}
