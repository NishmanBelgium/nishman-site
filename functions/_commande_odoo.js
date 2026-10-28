/* ==========================================================================
   COMMANDE ODOO — créer le devis directement, sans passer par le script.

   Jusqu'ici la commande voyageait vers un script Google qui la recopiait
   dans Odoo, et qui répondait du texte libre qu'il fallait interpréter à
   coups d'expressions régulières. Pour un devis relu avant facturation,
   c'était tenable. Pour une commande payée, non : on ne peut pas encaisser
   sur la foi d'une chaîne de caractères qu'on espère avoir bien lue.

   Ici le site parle à Odoo. Il obtient un identifiant de commande ou une
   erreur — pas un texte à deviner.

   Trois principes tiennent tout ce fichier :

   1. Rien de ce que le navigateur annonce n'arrive jusqu'ici. Les montants
      viennent de calculer(), côté serveur, à partir du catalogue et de la
      table de prix.

   2. La commande est créée en BROUILLON. Elle ne devient une vente qu'au
      paiement confirmé. Un devis de trop se supprime ; une vente de trop
      laisse des traces dans les stocks et la comptabilité.

   3. Ce que nous avons calculé et ce qu'Odoo a enregistré sont comparés
      après coup. Deux systèmes qui calculent chacun de leur côté finissent
      toujours par diverger d'un centime, et c'est le jour où ça arrive
      qu'il faut le savoir — pas trois mois plus tard, sur une relance.
   ========================================================================== */

import { appel, produitsParEan, partenaireParEmail, partenaireParTva } from "./_odoo.js";
import { positionFiscale, nomsPossibles } from "./_fiscal.js";

/* --- Noms réglables ------------------------------------------------------
   Odoo compare les noms caractère par caractère ; NBD les renomme parfois.
   Comme pour les positions fiscales, les valeurs par défaut sont celles en
   service, et une variable d'environnement permet de suivre un changement
   sans toucher au code. */

export const LIVRAISON_DEFAUT = {
  BE: "LIVRAISON BELGIQUE",
  FR: "LIVRAISON france",
  LU: "LIVRAISON Luxembourg",
};

export function nomLivraison(pays, env) {
  const reglages = {
    BE: (env && env.LIVRAISON_BE) || LIVRAISON_DEFAUT.BE,
    FR: (env && env.LIVRAISON_FR) || LIVRAISON_DEFAUT.FR,
    LU: (env && env.LIVRAISON_LU) || LIVRAISON_DEFAUT.LU,
  };
  return String(reglages[pays] || reglages.BE).trim();
}

/** Une erreur qui porte un code exploitable, pas seulement une phrase. */
export function echec(code, message, detail) {
  const e = new Error(message);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

/* --- Recherches ---------------------------------------------------------- */

/**
 * Retrouve une fiche par son nom, sans tenir compte de la casse.
 *
 * Odoo, lui, en tient compte : « Livraison Belgique » et « LIVRAISON
 * BELGIQUE » sont deux chaînes différentes pour un domaine `=`. Cette
 * différence avait déjà fait échouer des recherches côté script Google.
 * On cherche donc large, puis on compare nous-mêmes.
 */
export async function parNomInsensible(env, modele, nom, champs) {
  const cible = String(nom || "").trim().toLowerCase();
  if (!cible) return null;
  const r = await appel(env, modele, "search_read",
    [[["name", "ilike", cible]], champs || ["id", "name"]], { limit: 20 });
  for (const f of r || []) {
    if (String(f.name || "").trim().toLowerCase() === cible) return f;
  }
  return null;
}

export async function paysId(env, code) {
  const r = await appel(env, "res.country", "search_read",
    [[["code", "=", String(code || "BE").toUpperCase()]], ["id"]], { limit: 1 });
  return r && r[0] ? r[0].id : null;
}

/* --- Le client ----------------------------------------------------------- */

/** Deux numéros de TVA désignent-ils la même entreprise ? Une fiche sans
 *  numéro ne contredit rien. */
function memeTva(tvaFiche, tvaCompte) {
  const n = (v) => String(v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^[A-Z]{2}/, "");
  const a = n(tvaFiche), b = n(tvaCompte);
  return !a || (!!b && a === b);
}

/**
 * La fiche client dans Odoo : retrouvée, ou créée.
 *
 * On cherche d'abord par numéro de TVA, puis par e-mail. L'ordre compte :
 * un salon change d'adresse de messagerie plus souvent que de numéro
 * d'entreprise, et c'est le numéro qui engage la facturation.
 *
 * Si deux fiches portent le même numéro, partenaireParTva() ne rapproche
 * rien — mieux vaut créer un doublon visible que facturer au mauvais
 * client.
 */
export async function trouverOuCreerPartenaire(env, compte) {
  // 0) Le compte est déjà rattaché à une fiche : c'est elle, et elle seule.
  if (compte.odoo_partner_id) {
    let nomLie = "";
    try {
      const l = await appel(env, "res.partner", "read", [[compte.odoo_partner_id], ["name"]], {});
      nomLie = (l && l[0] && l[0].name) || "";
    } catch (e) { /* le nom n'est qu'un libellé */ }
    return { id: compte.odoo_partner_id, cree: false, nom: nomLie };
  }

  // 1) Sinon, l'adresse e-mail — à condition que la fiche ne porte pas un
  //    AUTRE numéro de TVA. Le numéro de TVA seul ne suffit plus : il est
  //    public, et l'inscription ne le vérifie pas. Le retrouver par lui
  //    revenait à laisser n'importe qui commander, et se faire facturer,
  //    au nom d'un salon existant. Une fiche en double est un désagrément
  //    que NBD fusionne en deux clics ; une commande au nom d'autrui est un
  //    litige.
  let fiche = null;
  if (compte.email) {
    try { fiche = await partenaireParEmail(env, compte.email); } catch (e) { /* on créera */ }
  }
  if (fiche && fiche.id && memeTva(fiche.vat, compte.tva)) {
    return { id: fiche.id, cree: false, nom: fiche.name || "" };
  }

  const nom = String(compte.salon || "").trim()
    || [compte.prenom, compte.nom].filter(Boolean).join(" ").trim()
    || String(compte.email || "").trim();
  if (!nom) throw echec("client_sans_nom", "Impossible d'identifier le client.");

  const valeurs = {
    name: nom,
    is_company: true,
    email: String(compte.email || "").trim() || false,
    phone: String(compte.telephone || "").trim() || false,
    street: String(compte.adresse || "").trim() || false,
    zip: String(compte.code_postal || "").trim() || false,
    city: String(compte.ville || "").trim() || false,
    vat: String(compte.tva || "").trim() || false,
  };

  const pid = await paysId(env, compte.pays);
  if (pid) valeurs.country_id = pid;

  const id = await appel(env, "res.partner", "create", [valeurs], {});
  if (!id) throw echec("client_non_cree", "Odoo n'a pas créé la fiche client.");
  return { id, cree: true, nom };
}

/* --- La commande --------------------------------------------------------- */

/**
 * Crée le devis dans Odoo et rend de quoi le retrouver.
 *
 * @returns { id, nom, montant_odoo, ecart }
 *   ecart : la différence entre notre total hors taxes et celui qu'Odoo a
 *   calculé. Zéro attendu ; non nul, c'est un signal, pas un détail.
 */
export async function creerCommandeOdoo(env, { compte, resultat, livraison, ref, tva }) {
  if (!resultat || !Array.isArray(resultat.lignes) || !resultat.lignes.length) {
    throw echec("panier_vide", "Aucune ligne à enregistrer.");
  }

  // 1) Le client.
  const client = await trouverOuCreerPartenaire(env, compte);

  // 2) Les produits. Une référence inconnue arrête tout : une commande
  //    amputée d'une ligne est pire qu'une commande refusée, parce que
  //    personne ne s'en aperçoit avant la livraison.
  const eans = resultat.lignes.map((l) => l.ean);
  const produits = await produitsParEan(env, eans);
  const manquants = eans.filter((e) => !produits[e]);
  if (manquants.length) {
    throw echec("produits_inconnus",
      "Certaines références n'existent pas dans Odoo.", manquants);
  }

  // 3) Les lignes. La remise FIRST10 est uniforme : on la porte sur chaque
  //    ligne plutôt qu'en ligne négative, pour qu'Odoo affiche un devis
  //    lisible par le client et exploitable par la comptabilité.
  const tauxRemise = resultat.promo ? 10 : 0;
  const lignes = resultat.lignes.map((l) => [0, 0, {
    product_id: produits[l.ean].id,
    product_uom_qty: l.pieces,
    price_unit: l.prix_unitaire,
    discount: tauxRemise,
  }]);

  // 4) Le port, s'il y en a. On emprunte le produit du mode de livraison
  //    pour que la ligne tombe dans le même compte comptable que les ports
  //    saisis à la main dans Odoo.
  let carrierId = null;
  if (resultat.port > 0 && !resultat.retrait) {
    const mode = await parNomInsensible(env, "delivery.carrier",
      nomLivraison(compte.pays, env), ["id", "name", "product_id"]);
    if (!mode) {
      throw echec("livraison_introuvable",
        "Le mode de livraison n'a pas été trouvé dans Odoo.",
        nomLivraison(compte.pays, env));
    }
    carrierId = mode.id;
    const produitPort = Array.isArray(mode.product_id) ? mode.product_id[0] : mode.product_id;
    if (!produitPort) {
      throw echec("livraison_sans_produit",
        "Le mode de livraison n'a pas de produit associé dans Odoo.", mode.name);
    }
    lignes.push([0, 0, {
      product_id: produitPort,
      product_uom_qty: 1,
      price_unit: resultat.port,
      discount: 0,
    }]);
  }

  // 5) Le régime fiscal, arrêté par le site. Odoo doit facturer ce que le
  //    client a lu, pas le redéduire avec ses propres règles.
  const nomPosition = positionFiscale(resultat.regime, env);
  let positionId = null;
  if (nomPosition) {
    let fp = null;
    for (const candidat of nomsPossibles(resultat.regime, env)) {
      fp = await parNomInsensible(env, "account.fiscal.position", candidat);
      if (fp) break;
    }
    if (!fp) {
      // Dire ce qu'on cherchait ne suffit pas : il faut dire ce qu'Odoo
      // propose. Sans cela, on reste devant une liste qui contient
      // visiblement le bon nom et une erreur qui jure le contraire.
      let disponibles = [];
      try {
        const toutes = await appel(env, "account.fiscal.position", "search_read",
          [[], ["id", "name"]], { limit: 50 });
        disponibles = (toutes || []).map((f) => f.name);
      } catch (e) { disponibles = ["lecture impossible : " + String(e && e.message).slice(0, 120)]; }
      throw echec("position_introuvable",
        "La position fiscale n'a pas été trouvée dans Odoo.",
        { cherchees: nomsPossibles(resultat.regime, env), vues_par_le_site: disponibles });
    }
    positionId = fp.id;
  }

  // 6) La création, en brouillon.
  const valeurs = {
    partner_id: client.id,
    order_line: lignes,
    client_order_ref: String(ref || "").slice(0, 60) || false,
  };
  if (positionId) valeurs.fiscal_position_id = positionId;
  if (carrierId) valeurs.carrier_id = carrierId;

  const note = noteInterne({ resultat, livraison, tva });
  if (note) valeurs.note = note;

  const id = await appel(env, "sale.order", "create", [valeurs], {});
  if (!id) throw echec("commande_non_creee", "Odoo n'a pas créé la commande.");

  // 7) La vérification. Ce qu'Odoo a enregistré doit correspondre à ce que
  //    nous avons annoncé au client.
  let nom = "", montantOdoo = null, ecart = null;
  try {
    const relu = await appel(env, "sale.order", "read",
      [[id], ["name", "amount_untaxed", "amount_total"]], {});
    if (relu && relu[0]) {
      nom = relu[0].name || "";
      montantOdoo = relu[0].amount_untaxed;
      const notre = Math.round((resultat.marchandise + resultat.port) * 100) / 100;
      ecart = Math.round((montantOdoo - notre) * 100) / 100;
      // Le TTC aussi : c'est lui que Mollie débite. Un HT juste avec une
      // TVA différente (position fiscale mal appliquée) donnerait une
      // facture qui ne se solde jamais. Odoo arrondit la taxe globalement,
      // comme _calcul.js : les deux doivent tomber au centime.
      const ttcOdoo = Number(relu[0].amount_total);
      const ttcNotre = Math.round(Number(resultat.total) * 100) / 100;
      if (ecart === 0 && Number.isFinite(ttcOdoo) && Number.isFinite(ttcNotre)) {
        ecart = Math.round((ttcOdoo - ttcNotre) * 100) / 100;
      }
    }
  } catch (e) { /* la commande existe ; la relecture est un contrôle, pas une condition */ }

  return { id, nom, client, montant_odoo: montantOdoo, ecart };
}

/**
 * La note portée sur le devis : l'adresse de livraison quand elle diffère,
 * et la preuve de contrôle du numéro de TVA. Ce sont les deux choses qu'on
 * regrette de ne pas trouver quand on rouvre une commande six mois après.
 */
function noteInterne({ resultat, livraison, tva }) {
  const bouts = [];
  if (livraison) {
    bouts.push("Livraison : " + [
      livraison.nom, livraison.adresse,
      livraison.code_postal + " " + livraison.ville, livraison.pays,
    ].filter(Boolean).join(", "));
  }
  if (resultat && resultat.retrait) bouts.push("Retrait sur place.");
  if (resultat && resultat.promo) bouts.push("Code promo " + resultat.promo + " (-10 %).");
  if (tva && tva.statut) {
    bouts.push("Contrôle TVA : " + tva.statut
      + (tva.preuve ? " (n° de consultation " + tva.preuve + ")" : ""));
  }
  return bouts.join("\n");
}
