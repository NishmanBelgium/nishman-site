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
 * @param dejaCommande  le client a-t-il déjà une commande confirmée
 *
 * Rien de ce que le navigateur envoie n'est cru sur parole, hormis les
 * références et les quantités — et encore : une référence inconnue ou une
 * quantité négative est écartée, pas facturée.
 */
export function calculer({ selection, produits, prix, pays, tvaValide, mode, promo, dejaCommande }) {
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

  // FIRST10 : une seule condition, et c'est la PREMIÈRE COMMANDE. Pas de
  // minimum. Dix euros ou mille, le client qui n'a jamais commandé a ses
  // −10 % ; celui qui a déjà une commande confirmée ne les a pas.
  //
  // (Décision du 2 novembre 2026, qui remplace celle du commit 216 : le
  // code avait alors un minimum calé sur le franco de port. Il n'en a
  // plus.)
  const codeDonne = sousTotal > 0 &&
    String(promo || "").trim().toUpperCase() === PROMO.code;
  const dejaClient = dejaCommande === true;
  const promoOk = codeDonne && !dejaClient;
  const remise = promoOk ? sou(sousTotal * PROMO.taux) : 0;

  const marchandise = sou(sousTotal - remise);

  const retrait = mode === "retrait";

  // Le franco de port s'apprécie sur le montant COMMANDÉ, avant remise.
  // Qui a commandé pour 300 € a gagné sa livraison : la remise vient
  // après, en plus, et ne la lui reprend pas. Autrement le client qui
  // utilise son code se verrait facturer un port que le même panier sans
  // code lui offrait — il y perdrait à présenter son code.
  //
  // Cela ne crée aucune divergence avec Odoo : le site y écrit lui-même
  // sa ligne de port (_commande_odoo.js, étape 4) et n'attache aucun mode
  // de livraison quand le port est offert. Odoo enregistre ce qui a été
  // annoncé, il ne le recalcule pas.
  const { port, seuil, manque } = fraisDePort(pays, sousTotal, retrait);

  // Le transport suit le sort de la marchandise : même régime, même taux.
  const baseTva = sou(marchandise + port);
  const { taux, regime } = regimeTva(pays, tvaValide);
  const tva = sou(baseTva * taux);

  return {
    lignes, ignorees,
    sous_total: sousTotal,
    promo: promoOk ? PROMO.code : "",
    // Le code a été donné mais écarté : la page doit pouvoir dire pourquoi.
    // Il ne reste qu'un seul motif de refus possible, mais le champ est
    // conservé : le jour où un deuxième code arrive avec ses conditions,
    // les pages sauront déjà lire un motif.
    promo_refusee: codeDonne && !promoOk ? PROMO.code : "",
    promo_motif: codeDonne && !promoOk ? "deja_client" : "",
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
