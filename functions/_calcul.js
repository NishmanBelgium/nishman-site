/* ==========================================================================
   CALCUL — les règles commerciales, en un seul endroit, côté serveur.

   Jusqu'ici le navigateur calculait les prix, la remise et le port, et les
   envoyait. Acceptable pour un devis qu'on relit avant de facturer ; faux
   dès qu'on encaisse, puisqu'un navigateur se modifie.

   Ce fichier ne fait aucun appel réseau : on lui donne un panier, un
   catalogue, une table de prix et un client, il rend des montants. C'est ce
   qui le rend vérifiable ligne à ligne, sans Cloudflare et sans Odoo.
   ========================================================================== */

/* --- Barèmes ------------------------------------------------------------ */

// Frais de port HT par pays de livraison : offerts au-delà du seuil,
// forfaitaires en dessous. Pas de minimum de commande.
export const PORT = {
  BE: { seuil: 300, forfait: 10 },
  FR: { seuil: 500, forfait: 15 },
  LU: { seuil: 500, forfait: 15 },
};

// TVA belge. Un client français ou luxembourgeois dont le numéro de TVA est
// valide relève de l'autoliquidation : on facture à 0 % et c'est lui qui
// déclare chez lui. Sans numéro valide, il est traité comme un client belge.
export const TAUX_TVA_BE = 0.21;

export const PROMO = { code: "FIRST10", taux: 0.10 };

/* --- Outils ------------------------------------------------------------- */

const sou = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Le régime de TVA applicable, et pourquoi. La raison est renvoyée avec :
 * c'est elle qu'on affiche au client avant qu'il paie.
 */
export function regimeTva(pays, tvaValide) {
  if (pays === "BE") return { taux: TAUX_TVA_BE, regime: "national" };
  if ((pays === "FR" || pays === "LU") && tvaValide) {
    return { taux: 0, regime: "intracom" };
  }
  if (pays === "FR" || pays === "LU") {
    return { taux: TAUX_TVA_BE, regime: "intracom_sans_tva" };
  }
  return { taux: TAUX_TVA_BE, regime: "national" };
}

export function fraisDePort(pays, montant, retrait) {
  if (retrait) return { port: 0, seuil: null, manque: 0 };
  const regle = PORT[pays] || PORT.BE;
  if (montant >= regle.seuil) return { port: 0, seuil: regle.seuil, manque: 0 };
  return { port: regle.forfait, seuil: regle.seuil, manque: sou(regle.seuil - montant) };
}

/* --- Le calcul ---------------------------------------------------------- */

/**
 * @param selection {ean: {u, b}}   ce que le navigateur prétend vouloir
 * @param produits  [{ean, name, box_qty, ...}]  le catalogue, qui fait foi
 * @param prix      {ean: prix HT}  la table de prix, qui fait foi
 * @param pays      "BE" | "FR" | "LU"
 * @param tvaValide le numéro du client a-t-il été vérifié
 * @param mode      "livraison" | "retrait"
 * @param promo     le code saisi, tel quel
 *
 * Rien de ce que le navigateur envoie n'est cru sur parole, hormis les
 * références et les quantités — et encore : une référence inconnue ou une
 * quantité négative est écartée, pas facturée.
 */
export function calculer({ selection, produits, prix, pays, tvaValide, mode, promo }) {
  const parEan = new Map();
  for (const p of produits || []) if (p && p.ean) parEan.set(String(p.ean), p);

  const lignes = [];
  const ignorees = [];

  for (const [ean, q] of Object.entries(selection || {})) {
    const produit = parEan.get(String(ean));
    const pu = prix ? prix[ean] : undefined;

    if (!produit || pu === undefined || pu === null) { ignorees.push(String(ean)); continue; }

    const unites = Math.max(0, Math.floor(Number(q && q.u) || 0));
    const cartons = Math.max(0, Math.floor(Number(q && q.b) || 0));
    const parCarton = Math.max(0, Math.floor(Number(produit.box_qty) || 0));
    if (!unites && !cartons) continue;
    if (cartons && !parCarton) { ignorees.push(String(ean)); continue; }

    const pieces = unites + cartons * parCarton;
    const total = sou(pu * pieces);

    lignes.push({
      ean: String(ean),
      nom: produit.name,
      unites, cartons, par_carton: parCarton, pieces,
      prix_unitaire: sou(pu),
      total,
    });
  }

  const sousTotal = sou(lignes.reduce((s, l) => s + l.total, 0));

  const promoOk = sousTotal > 0 &&
    String(promo || "").trim().toUpperCase() === PROMO.code;
  const remise = promoOk ? sou(sousTotal * PROMO.taux) : 0;

  const marchandise = sou(sousTotal - remise);

  const retrait = mode === "retrait";
  const { port, seuil, manque } = fraisDePort(pays, marchandise, retrait);

  // Le transport suit le sort de la marchandise : même régime, même taux.
  const baseTva = sou(marchandise + port);
  const { taux, regime } = regimeTva(pays, tvaValide);
  const tva = sou(baseTva * taux);

  return {
    lignes, ignorees,
    sous_total: sousTotal,
    promo: promoOk ? PROMO.code : "",
    remise,
    marchandise,
    port, port_seuil: seuil, port_manque: manque,
    retrait,
    base_tva: baseTva,
    taux_tva: taux,
    regime,
    tva,
    total: sou(baseTva + tva),
  };
}
