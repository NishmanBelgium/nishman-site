/* ==========================================================================
   CALCUL — les règles commerciales, en un seul endroit, côté serveur.

   Jusqu'ici le navigateur calculait les prix, la remise et le port, et les
   envoyait. Acceptable pour un devis qu'on relit avant de facturer ; faux
   dès qu'on encaisse, puisqu'un navigateur se modifie.

   Ce fichier ne fait aucun appel réseau : on lui donne un panier, un
   catalogue, une table de prix et un client, il rend des montants. C'est ce
   qui le rend vérifiable ligne à ligne, sans Cloudflare et sans Odoo.
   ========================================================================== */

import { evaluerOffre } from "./_offre_p1.js";
import { tauxB2C } from "./_oss.js";

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

/* ── DEUX NOMS POUR LA MÊME REMISE ──────────────────────────────────────────
 *
 * `FIRST10` reste accepté pour toujours : il circule, et un code refusé le
 * jour où un client l'essaie coûte plus cher qu'un nom imparfait.
 *
 * `DECEMBRE15` est le nom annoncé dans le mailing du 1er décembre. Il
 * existe parce que `FIRST10` ment deux fois en décembre : sur le chiffre
 * (15 et non 10) et sur la condition (plus réservé à une première
 * commande). Le renommer aurait transporté le mensonge ailleurs —
 * « FIRST15 » dit encore « première ». On en ajoute un, on n'en remplace
 * aucun.
 *
 * Les deux donnent exactement la même chose : le taux et la condition sont
 * décidés par la date, jamais par le nom tapé. Un alias n'a pas de règle à
 * lui, sinon il faudrait les tenir synchronisés et l'un dériverait.
 *
 * Ce qui est renvoyé dans `promo` est TOUJOURS `PROMO.code`, quel que soit
 * le nom tapé : les pages, les devis et Odoo ne connaissent qu'un seul
 * libellé, et l'historique reste lisible. */
const ALIAS = ["DECEMBRE15"];

/**
 * Le nom tapé ouvre-t-il droit à la remise ?
 *
 * Les accents sont retirés avant comparaison. Un coiffeur qui tape
 * « Décembre15 » sur un clavier de téléphone écrit le mot correctement,
 * et se faire refuser pour un accent serait absurde — c'est exactement le
 * genre de refus qui fait écrire au service commercial. Les espaces et
 * les tirets tombent pour la même raison.
 */
export function codeReconnu(saisi) {
  const v = String(saisi || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toUpperCase().replace(/[\s-]/g, "");
  return v === PROMO.code || ALIAS.includes(v);
}

/* ── DÉCEMBRE 2026 : LA PREMIÈRE COMMANDE PASSE À −15 % ─────────────────────
 *
 * Décision de NBD du 27 novembre 2026, pour la campagne salons de décembre :
 * −15 % sur la première commande, sans minimum d'achat, jusqu'au 31 décembre.
 *
 * LE TAUX EST UNE FONCTION DE L'HEURE, PAS UNE CONSTANTE RÉÉCRITE. Le 1er
 * janvier à 00 h 00, le code redevient −10 % tout seul, sans que personne
 * ait à s'en souvenir ni à repousser quoi que ce soit. C'est la leçon déjà
 * payée sur les opérations boutique : une remise qu'il faut penser à
 * éteindre reste allumée.
 *
 * LE CODE NE CHANGE PAS DE NOM. `FIRST10` reste le seul code accepté —
 * il est imprimé sur des documents, il circule chez des clients, et un
 * code refusé le jour où la publicité l'annonce coûte plus cher que le
 * nom imparfait. Ce que le client lit vient du taux renvoyé par le
 * serveur (`promo_taux`), jamais d'un « 10 » écrit en dur dans une page.
 *
 * Bruxelles est à UTC+1 en décembre : minuit ici, 23 h la veille en UTC. */
const PREMIERE_DEBUT = Date.UTC(2026, 10, 30, 23, 0, 0);  // 1er déc. 00h00
const PREMIERE_FIN   = Date.UTC(2026, 11, 31, 23, 0, 0);  // 31 déc. 23h59'59
const PREMIERE_TAUX  = 0.15;

/** Le taux de la remise « première commande » à l'instant donné. */
export function tauxPremiere(maintenant) {
  const t = Number(maintenant || Date.now());
  return (t >= PREMIERE_DEBUT && t < PREMIERE_FIN) ? PREMIERE_TAUX : PROMO.taux;
}

/* ── DÉCEMBRE 2026 : LA REMISE S'OUVRE À TOUS, UNE FOIS CHACUN ──────────────
 *
 * Décision de Dilhan Basan du 27 novembre 2026, le soir même de celle
 * ci-dessus et après avoir vu les chiffres de novembre : sur 128 clients
 * du mois, 121 n'avaient commandé qu'une fois et aucun trois fois. Une
 * offre réservée aux nouveaux disait à 128 payeurs qu'ils n'y avaient pas
 * droit. Elle est donc ouverte à tout le monde — « −15 % sur votre
 * prochaine commande » — et le mailing de décembre va le leur annoncer.
 *
 * COMMENT « UNE FOIS CHACUN » EST VÉRIFIÉ, SANS RIEN STOCKER. La question
 * « a-t-il déjà profité de l'offre ? » est la même que « a-t-il déjà une
 * commande confirmée depuis le 1er décembre ? », et Odoo sait y répondre.
 * Pas de nouveau champ, pas de compteur à tenir à jour, pas de deuxième
 * vérité à synchroniser. C'est `aDejaCommande(env, partnerId, depuis)`
 * dans `_odoo.js` qui reçoit ce plancher.
 *
 * HORS DÉCEMBRE, LA FONCTION REND `null` ET RIEN NE CHANGE : la question
 * redevient « a-t-il déjà commandé un jour », mot pour mot le comportement
 * de toute l'année. Le 1er janvier, l'offre se referme toute seule sur la
 * première commande à −10 %, comme le taux. */

/**
 * Le plancher de date qui définit « déjà servi » à l'instant donné.
 * Renvoie une date Odoo (UTC) pendant l'opération de décembre, `null`
 * sinon — auquel cas l'historique complet fait foi.
 */
export function plancherPremiere(maintenant) {
  const t = Number(maintenant || Date.now());
  // 1er décembre 00 h 00 à Bruxelles = 30 novembre 23 h 00 UTC, et Odoo
  // stocke `date_order` en UTC. Le plancher est la même borne que
  // PREMIERE_DEBUT, écrite dans l'autre format : les deux ne peuvent pas
  // diverger sans qu'on le voie.
  return (t >= PREMIERE_DEBUT && t < PREMIERE_FIN) ? "2026-11-30 23:00:00" : null;
}

/** L'opération « remise ouverte à tous » est-elle en cours ? */
export function remisePourTous(maintenant) {
  return plancherPremiere(maintenant) !== null;
}

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
  /* Sans numéro intracommunautaire, le professionnel français ou
   * luxembourgeois n'est pas un assujetti : il relève du régime du
   * particulier de son pays. Tant que l'OSS n'est pas actif, tauxB2C rend
   * 21 % — soit, au centime près, ce que cette ligne rendait avant. Le
   * jour de la bascule, elle rend 20 % en France et 17 % au Luxembourg,
   * en même temps que la boutique et que la position fiscale posée dans
   * Odoo. Voir la note de _fiscal.js. */
  if (pays === "FR" || pays === "LU") {
    return { taux: tauxB2C(pays), regime: "intracom_sans_tva" };
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
 * @param cadeau    le code-barres de la poudre P1 choisie (Black Friday pro)
 * @param maintenant    l'heure qui fait foi, pour les essais ; sinon l'horloge
 *
 * Rien de ce que le navigateur envoie n'est cru sur parole, hormis les
 * références et les quantités — et encore : une référence inconnue ou une
 * quantité négative est écartée, pas facturée.
 */
export function calculer({ selection, produits, prix, pays, tvaValide, mode, promo, dejaCommande,
                           cadeau, maintenant }) {
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

  // FIRST10 : une seule condition, et c'est d'être SERVI UNE FOIS. Pas de
  // minimum. Dix euros ou mille.
  //
  // Toute l'année, « une fois » veut dire une fois dans la vie du compte :
  // c'est la remise de bienvenue. En décembre 2026, ça veut dire une fois
  // dans le mois, pour tout le monde (voir `plancherPremiere` plus haut).
  // Le calcul ici ne change pas d'un signe : c'est l'appelant qui a posé
  // la bonne question à Odoo et qui rend `dejaCommande`.
  //
  // (Décision du 2 novembre 2026, qui remplace celle du commit 216 : le
  // code avait alors un minimum calé sur le franco de port. Il n'en a
  // plus. Ouverture à tous : 27 novembre 2026.)
  const codeDonne = sousTotal > 0 && codeReconnu(promo);
  const dejaClient = dejaCommande === true;
  const promoOk = codeDonne && !dejaClient;
  const tauxRemise = tauxPremiere(maintenant);
  const remise = promoOk ? sou(sousTotal * tauxRemise) : 0;

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

  // Black Friday pro : le carton de poudres P1 offert. Il se lit, comme le
  // franco, sur le montant commandé avant remise (_offre_p1.js). Il ne
  // touche à aucun montant : la ligne offerte vit à part, dans offre_p1,
  // et `lignes` reste la liste de ce qui se paie.
  const offreP1 = evaluerOffre(sousTotal, cadeau, produits, maintenant);

  return {
    lignes, ignorees,
    offre_p1: offreP1,
    sous_total: sousTotal,
    promo: promoOk ? PROMO.code : "",
    // Le taux appliqué, pour que la page l'affiche au lieu de l'écrire en
    // dur : en décembre il vaut 0,15, le reste de l'année 0,10.
    promo_taux: promoOk ? tauxRemise : 0,
    // Le code a été donné mais écarté : la page doit pouvoir dire pourquoi.
    // Il ne reste qu'un seul motif de refus possible, mais le champ est
    // conservé : le jour où un deuxième code arrive avec ses conditions,
    // les pages sauront déjà lire un motif.
    promo_refusee: codeDonne && !promoOk ? PROMO.code : "",
    // Deux motifs de refus pour une seule condition, parce que la phrase à
    // montrer n'est pas la même : hors opération, « réservé à la première
    // commande » ; pendant, « vous en avez déjà profité ce mois-ci ».
    promo_motif: codeDonne && !promoOk
      ? (remisePourTous(maintenant) ? "deja_servi" : "deja_client") : "",
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
