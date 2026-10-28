/* ==========================================================================
   COMMANDE B2C — la commande d'un particulier dans Odoo.

   Le pendant de _commande_odoo.js, et volontairement un fichier à part :
   les deux clients n'ont presque rien en commun.

   Un professionnel a une société, un numéro de TVA, un compte sur le site,
   un régime fiscal qui dépend de son pays, et une remise éventuelle. Un
   particulier n'a qu'un nom, une adresse e-mail et un point relais. Mêler
   les deux dans une seule fonction à coups de « si c'est un pro » aurait
   donné du code que personne n'ose plus toucher.

   Deux règles qui gouvernent tout ce fichier :

   1. Les prix arrivent déjà en hors taxe, calculés par _calcul_b2c.js à la
      manière d'Odoo. On ne recalcule rien ici, on transmet — et on vérifie
      ensuite qu'Odoo est tombé sur le même total.

   2. La TVA est la TVA belge, pour les trois pays. Tant que NBD reste sous
      le seuil des ventes à distance et n'est pas inscrite à l'OSS, une
      vente à un particulier français se facture avec la TVA belge. Le jour
      de l'inscription à l'OSS, c'est le taux du pays du client qui
      s'applique et la position fiscale change — c'est signalé plus bas, à
      l'endroit exact où il faudra intervenir.
   ========================================================================== */

import { appel } from "./_odoo.js";
import { produitsParEan, partenaireParEmail } from "./_odoo.js";
import { nomLivraison, echec, parNomInsensible, paysId } from "./_commande_odoo.js";
import { nomsPossibles } from "./_fiscal.js";

/**
 * Le client particulier. Retrouvé par son adresse e-mail, créé sinon.
 *
 * Pas de recherche par numéro de TVA, évidemment, mais surtout :
 * `is_company: false`. Une fiche de particulier marquée « société » fausse
 * les statistiques d'Odoo et fait apparaître des « entreprises » qui n'en
 * sont pas dans le carnet d'adresses.
 */
export async function trouverOuCreerParticulier(env, client) {
  const email = String(client.email || "").trim();
  if (!email) throw echec("client_sans_email", "Adresse e-mail manquante.");

  let fiche = null;
  try { fiche = await partenaireParEmail(env, email); } catch (e) { /* on créera */ }
  if (fiche && fiche.id) {
    // La fiche existe — peut-être créée lors d'une commande précédente, ou
    // bien c'est un professionnel qui commande à titre privé. On ne touche
    // à rien : écraser l'adresse d'un client parce qu'il a tapé autre chose
    // au clavier ferait plus de dégâts que de bien.
    return { id: fiche.id, cree: false, nom: fiche.name || email };
  }

  const nom = [client.prenom, client.nom].filter(Boolean).join(" ").trim() || email;

  const valeurs = {
    name: nom,
    is_company: false,
    email: email,
    phone: String(client.telephone || "").trim() || false,
    street: String(client.adresse || "").trim() || false,
    zip: String(client.code_postal || "").trim() || false,
    city: String(client.ville || "").trim() || false,
  };
  const pid = await paysId(env, client.pays);
  if (pid) valeurs.country_id = pid;

  const id = await appel(env, "res.partner", "create", [valeurs], {});
  if (!id) throw echec("client_non_cree", "Odoo n'a pas créé la fiche client.");
  return { id, cree: true, nom };
}

/**
 * L'adresse de livraison : le point relais, enregistré comme adresse de
 * livraison rattachée au client.
 *
 * Pourquoi une adresse à part plutôt que l'adresse du client. Le colis ne
 * part pas chez lui, il part au point relais — et c'est cette adresse-là
 * qui doit figurer sur le bon de livraison, sans quoi la préparation
 * imprimerait la mauvaise. L'adresse du client reste celle de facturation.
 *
 * Le nom porte celui du commerce ET celui du client : un point relais reçoit
 * des dizaines de colis et c'est le nom du destinataire qui permet de
 * retrouver le sien.
 */
async function adresseDuRelais(env, parentId, client, relais) {
  const valeurs = {
    name: String(relais.nom || "Point relais") + " — " + String(client.prenom || "") + " " + String(client.nom || ""),
    parent_id: parentId,
    type: "delivery",
    street: [relais.rue, relais.numero].filter(Boolean).join(" ").trim() || false,
    zip: String(relais.code_postal || "").trim() || false,
    city: String(relais.ville || "").trim() || false,
    email: String(client.email || "").trim() || false,
    phone: String(client.telephone || "").trim() || false,
  };
  const pid = await paysId(env, relais.pays || client.pays);
  if (pid) valeurs.country_id = pid;

  const id = await appel(env, "res.partner", "create", [valeurs], {});
  if (!id) throw echec("relais_non_cree", "Odoo n'a pas enregistré le point relais.");
  return id;
}

function note({ resultat, relais, ref }) {
  const l = [];
  l.push("Commande boutique (particulier) — référence " + ref + ".");
  l.push("");
  if (relais) {
    l.push("POINT RELAIS CHOISI PAR LE CLIENT");
    l.push("  " + (relais.nom || ""));
    l.push("  " + [relais.rue, relais.numero].filter(Boolean).join(" "));
    l.push("  " + [relais.code_postal, relais.ville].filter(Boolean).join(" ")
           + " (" + (relais.pays || "") + ")");
    l.push("  Transporteur : " + (relais.transporteur || "—"));
    l.push("  Identifiant SendCloud : " + (relais.id || "—"));
  } else {
    l.push("Aucun point relais : à vérifier avant expédition.");
  }
  l.push("");
  l.push("Montants annoncés au client :");
  l.push("  marchandise  " + resultat.sous_total.toFixed(2) + " € TTC");
  l.push("  livraison    " + resultat.port.toFixed(2) + " € TTC");
  l.push("  TOTAL        " + resultat.total.toFixed(2) + " € TTC");
  return l.join("\n");
}

/**
 * Crée la commande, en brouillon, et vérifie qu'Odoo est d'accord sur le
 * montant.
 *
 * La vérification porte sur le TTC et pas sur le hors taxe, parce que c'est
 * le TTC que le client a lu et que c'est lui qui sera débité. Le moindre
 * écart arrête tout : mieux vaut un client qui réessaie qu'un client débité
 * d'un montant qui ne correspond à aucune facture.
 */
export async function creerCommandeB2C(env, { client, relais, resultat, ref }) {
  if (!resultat || !Array.isArray(resultat.lignes) || !resultat.lignes.length) {
    throw echec("panier_vide", "Aucune ligne à enregistrer.");
  }

  const fiche = await trouverOuCreerParticulier(env, client);

  const eans = resultat.lignes.map((l) => l.ean);
  const produits = await produitsParEan(env, eans);
  const manquants = eans.filter((e) => !produits[e]);
  if (manquants.length) {
    throw echec("produits_inconnus",
      "Certaines références n'existent pas dans Odoo.", manquants);
  }

  // LA TAXE « TOUTES TAXES COMPRISES ».
  //
  // Les prix de la boutique sont TTC, et c'est le prix affiché qui engage.
  // Si on transmettait le hors-taxe, Odoo le multiplierait par la quantité
  // puis ajouterait 21 % : quatre articles à 7,90 € deviendraient 31,61 €
  // au lieu de 31,60 €, parce qu'avec une base hors taxe au centime,
  // 31,60 € n'est pas un montant atteignable.
  //
  // On lui donne donc le prix TTC avec une taxe déclarée « toutes taxes
  // comprises » : Odoo fait la division lui-même et retombe exactement sur
  // notre total. La taxe est une copie de « 21% Ventes » — mêmes grilles de
  // déclaration (03/54, 49/64) — avec la seule case « Inclus dans le prix »
  // changée. Les ventes professionnelles, elles, continuent en hors taxe.
  // Recherche sur le nom exact : « 21% TTC » contient un %, qui serait un
  // joker dans une recherche « ilike ».
  const nomTaxe = String((env && env.TAXE_TTC) || "21% TTC").trim();
  const trouvees = await appel(env, "account.tax", "search_read",
    [[["name", "=", nomTaxe], ["type_tax_use", "=", "sale"]], ["id", "name"]],
    { limit: 2 });
  const taxe = (trouvees && trouvees.length === 1) ? trouvees[0] : null;
  if (!taxe) {
    throw echec("taxe_introuvable",
      "La taxe « " + nomTaxe + " » n'existe pas dans Odoo. Sans elle, le total "
      + "facturé ne correspondrait pas au prix affiché.", nomTaxe);
  }
  const taxes = [[6, 0, [taxe.id]]];

  const lignes = resultat.lignes.map((l) => [0, 0, {
    product_id: produits[l.ean].id,
    product_uom_qty: l.quantite,
    price_unit: l.prix_unitaire,
    tax_id: taxes,
  }]);

  // Le port emprunte le produit du mode de livraison du pays, pour tomber
  // dans le même compte comptable que les ports saisis à la main.
  let carrierId = null;
  if (resultat.port > 0) {
    const mode = await parNomInsensible(env, "delivery.carrier",
      nomLivraison(client.pays, env), ["id", "name", "product_id"]);
    if (!mode) {
      throw echec("livraison_introuvable",
        "Le mode de livraison n'a pas été trouvé dans Odoo.", nomLivraison(client.pays, env));
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
      tax_id: taxes,
    }]);
  }

  // LA POSITION FISCALE. Aujourd'hui « National » pour les trois pays : la
  // TVA belge s'applique aux ventes à distance tant que NBD reste sous le
  // seuil de 10 000 € et n'est pas inscrite à l'OSS.
  //
  // LE JOUR DE L'INSCRIPTION À L'OSS, c'est ici que ça change : la France
  // et le Luxembourg devront passer sur « UE B2C » et le taux devra devenir
  // celui du pays du client, dans _calcul_b2c.js. Les deux vont ensemble —
  // changer l'un sans l'autre facturerait un taux et en déclarerait un
  // autre.
  let positionId = null;
  for (const candidat of nomsPossibles("national", env)) {
    const fp = await parNomInsensible(env, "account.fiscal.position", candidat);
    if (fp) { positionId = fp.id; break; }
  }
  if (!positionId) {
    const toutes = await appel(env, "account.fiscal.position", "search_read",
      [[], ["id", "name"]], { limit: 40 });
    throw echec("position_introuvable",
      "La position fiscale « National » n'a pas été trouvée dans Odoo.",
      (toutes || []).map((f) => f.name));
  }

  const valeurs = {
    partner_id: fiche.id,
    client_order_ref: ref,
    order_line: lignes,
    fiscal_position_id: positionId,
    note: note({ resultat, relais, ref }),
  };
  if (carrierId) valeurs.carrier_id = carrierId;

  if (relais && relais.nom) {
    valeurs.partner_shipping_id = await adresseDuRelais(env, fiche.id, client, relais);
  }

  const id = await appel(env, "sale.order", "create", [valeurs], {});
  if (!id) throw echec("commande_non_creee", "Odoo n'a pas créé la commande.");

  const relu = await appel(env, "sale.order", "read",
    [[id], ["name", "amount_total", "amount_untaxed"]], {});
  const o = (relu && relu[0]) || {};
  const totalOdoo = Number(o.amount_total);
  const ecart = Number.isFinite(totalOdoo)
    ? Math.round((totalOdoo - resultat.total) * 100) / 100 : null;

  return {
    id,
    nom: o.name || "",
    client: fiche,
    total_odoo: Number.isFinite(totalOdoo) ? totalOdoo : null,
    ecart,
  };
}
