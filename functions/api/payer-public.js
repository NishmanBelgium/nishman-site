/* ==========================================================================
   PAYER PUBLIC — la commande d'un particulier, puis son paiement.

   Même ordre que côté professionnel, et pour la même raison : la commande
   est créée dans Odoo AVANT que le client n'arrive chez Mollie. Un paiement
   reçu sans commande en face ne se rattrape qu'à la main, en cherchant qui
   a payé quoi à partir d'un montant et d'une heure. Un brouillon sans
   paiement se supprime tout seul.

   Pas de session, pas de compte : c'est une boutique grand public. Mais
   l'absence de compte ne donne aucun droit supplémentaire au navigateur.
   Il envoie des codes-barres, des quantités, une adresse et un point
   relais ; tous les montants sont recalculés ici.

   Le point relais mérite une attention particulière : son identifiant
   vient du sélecteur SendCloud, donc du navigateur. On ne le croit pas sur
   parole — on redemande la fiche du point à SendCloud avec notre clé
   secrète, et c'est cette fiche-là qui part dans Odoo et sur l'étiquette.
   Sans ça, un identifiant bricolé enverrait le colis n'importe où.
   ========================================================================== */

import { json, erreur, texteValide } from "../_commun.js";
import { catalogue } from "../_boutique.js";
import { calculerB2C, paysValideB2C } from "../_calcul_b2c.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";
import { creerCommandeB2C } from "../_commande_b2c.js";
import { configureMollie, modeMollie, appelMollie, paiementsAutorises } from "../_mollie.js";
import { configureSendcloud, pointRelais } from "../_sendcloud.js";
import { enregistrer } from "../_paiements.js";

/**
 * La référence d'une commande boutique.
 *
 * Elle est plus longue que celle des professionnels, et ce n'est pas
 * cosmétique. Un professionnel consulte ses commandes connecté à son
 * compte ; un particulier n'a pas de compte, et cette référence est la
 * SEULE chose qui lui donne accès à l'état de sa commande. Elle doit donc
 * être impossible à deviner : dix caractères tirés au hasard par le
 * générateur cryptographique, soit de quoi décourager toute tentative de
 * parcourir les commandes des autres.
 *
 * Math.random() ne conviendrait pas : il est prévisible par construction.
 */
function reference() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const lettres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sans I, O, 0, 1
  const octets = new Uint8Array(10);
  crypto.getRandomValues(octets);
  let alea = "";
  for (const o of octets) alea += lettres[o % lettres.length];
  return "WEB-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + alea;
}

function montantMollie(n) {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;

/* Le format du code postal, par pays.
 *
 * Il était vérifié en longueur seulement — « bbn » passait. SendCloud le
 * refusait tout au bout de la chaîne, après le paiement, quand le client
 * était déjà parti et ne pouvait plus rien corriger. Un format faux doit
 * être refusé devant le client, pendant qu'il a encore son clavier. */
const CODES_POSTAUX = {
  BE: /^[1-9]\d{3}$/,
  LU: /^L?-?\d{4}$/i,
  FR: /^\d{5}$/,
};

/** Les coordonnées du client, vérifiées une à une. */
function lireClient(brut) {
  const c = {
    email: String((brut && brut.email) || "").trim().toLowerCase(),
    prenom: String((brut && brut.prenom) || "").trim(),
    nom: String((brut && brut.nom) || "").trim(),
    telephone: String((brut && brut.telephone) || "").trim(),
    adresse: String((brut && brut.adresse) || "").trim(),
    code_postal: String((brut && brut.code_postal) || "").trim(),
    ville: String((brut && brut.ville) || "").trim(),
    pays: String((brut && brut.pays) || "").trim().toUpperCase(),
  };
  if (!EMAIL.test(c.email) || c.email.length > 120) throw new Error("email");
  if (!texteValide(c.prenom, 2, 60)) throw new Error("prenom");
  if (!texteValide(c.nom, 2, 60)) throw new Error("nom");
  if (!texteValide(c.adresse, 4, 200)) throw new Error("adresse");
  if (!texteValide(c.code_postal, 3, 12)) throw new Error("code_postal");
  if (!texteValide(c.ville, 2, 80)) throw new Error("ville");
  if (!paysValideB2C(c.pays)) throw new Error("pays");

  const forme = CODES_POSTAUX[c.pays];
  const cp = c.code_postal.replace(/\s+/g, "").toUpperCase();
  if (forme && !forme.test(cp)) throw new Error("code_postal_format");
  c.code_postal = cp.replace(/^L-?/, "");   // le Luxembourg s'écrit L-1611 ou 1611

  return c;
}

export async function onRequestPost({ request, env }) {
  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");
  if (!configureOdoo(env)) return erreur("Service de commande indisponible.", 503, "odoo");
  if (!configureMollie(env) || !paiementsAutorises(env)) {
    return erreur("Le paiement en ligne n'est pas disponible.", 503, "mollie");
  }

  if (corps.cgv !== true) return erreur("Acceptez les conditions de vente.", 400, "cgv");

  let client;
  try { client = lireClient(corps.client); }
  catch (e) { return erreur("Vos coordonnées sont incomplètes.", 400, String(e.message)); }

  const selection = (corps && corps.selection) || {};
  if (typeof selection !== "object" || Array.isArray(selection) || !Object.keys(selection).length) {
    return erreur("Votre panier est vide.", 400, "vide");
  }

  let produits;
  try { produits = await catalogue(request); }
  catch (e) { return erreur("Boutique momentanément indisponible.", 503, "catalogue"); }

  const resultat = calculerB2C({ selection, produits, pays: client.pays });
  if (!resultat.lignes.length) return erreur("Aucun produit reconnu.", 400, "vide");
  if (!(resultat.total > 0)) return erreur("Le montant à payer est nul.", 400, "montant");

  // Le point relais. Obligatoire dès qu'il y a quelque chose à expédier, et
  // vérifié auprès de SendCloud plutôt que cru sur parole.
  let relais = null;
  const relaisId = Number((corps.relais && corps.relais.id) || 0);
  if (!relaisId) return erreur("Choisissez un point relais.", 400, "relais");
  if (!configureSendcloud(env)) {
    return erreur("La livraison est momentanément indisponible.", 503, "sendcloud");
  }
  try {
    const p = await pointRelais(env, relaisId);
    if (!p || !p.id) throw new Error("introuvable");
    relais = {
      id: p.id,
      nom: p.name || "",
      rue: p.street || "",
      numero: p.house_number || "",
      code_postal: p.postal_code || "",
      ville: p.city || "",
      pays: String(p.country || client.pays).toUpperCase(),
      transporteur: p.carrier || "",
    };
  } catch (e) {
    return erreur("Ce point relais n'est plus disponible. Choisissez-en un autre.",
                  400, "relais_inconnu");
  }

  // Un point relais dans un autre pays que l'adresse de facturation n'est
  // pas forcément une fraude — on vit près d'une frontière — mais c'est
  // assez inhabituel pour mériter d'être bloqué plutôt que découvert au
  // moment de coller l'étiquette.
  if (relais.pays && relais.pays !== client.pays) {
    return erreur("Le point relais choisi n'est pas dans votre pays de livraison.",
                  400, "relais_pays");
  }

  const ref = reference();

  // 1) La commande, en brouillon.
  let commande;
  try {
    commande = await creerCommandeB2C(env, { client, relais, resultat, ref });
  } catch (e) {
    return json({
      ok: false, motif: (e && e.code) || "odoo", ref,
      message: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité.",
    }, 502);
  }

  // Odoo doit annoncer exactement ce que le client a lu. Un centime d'écart
  // et c'est une facture qui ne se soldera jamais : on arrête.
  if (commande.ecart !== null && commande.ecart !== 0) {
    try { await appelOdoo(env, "sale.order", "unlink", [[commande.id]], {}); } catch (e) {}
    return json({
      ok: false, motif: "ecart", ref,
      message: "Votre commande n'a pas pu être validée. Rien ne vous a été débité.",
    }, 502);
  }

  // 2) Le paiement.
  const origine = new URL(request.url).origin;
  const valeur = montantMollie(resultat.total);
  let paiement;
  try {
    paiement = await appelMollie(env, "/payments", {
      method: "POST",
      body: {
        amount: { currency: "EUR", value: valeur },
        description: "NISHMAN " + (commande.nom || ref),
        redirectUrl: origine + "/boutique/commander/?retour=" + encodeURIComponent(ref),
        webhookUrl: origine + "/api/mollie-notification",
        metadata: { ref, odoo_order_id: commande.id, boutique: 1 },
      },
    });
  } catch (e) {
    try { await appelOdoo(env, "sale.order", "unlink", [[commande.id]], {}); } catch (e2) {}
    return json({
      ok: false, motif: "mollie", ref,
      message: "Le paiement n'a pas pu être ouvert. Rien ne vous a été débité.",
    }, 502);
  }

  const lien = paiement && paiement._links && paiement._links.checkout && paiement._links.checkout.href;
  if (!paiement || !paiement.id || !lien) {
    try { await appelOdoo(env, "sale.order", "unlink", [[commande.id]], {}); } catch (e) {}
    return json({
      ok: false, motif: "mollie_incomplet", ref,
      message: "Le paiement n'a pas pu être ouvert. Rien ne vous a été débité.",
    }, 502);
  }

  // 3) Le lien entre les deux, AVANT d'envoyer payer.
  //
  //    Le registre des paiements veut un compte_id : il n'y en a pas ici,
  //    et c'est 0 qui tient ce rôle. Une commande boutique n'appartient à
  //    aucun compte du site, et le suivi se fait par la référence, qui ne
  //    quitte jamais le navigateur du client.
  try {
    await enregistrer(env.DB, {
      mollie_id: paiement.id,
      ref,
      compte_id: 0,
      odoo_order_id: commande.id,
      odoo_nom: commande.nom || "",
      montant: valeur,
      devise: "EUR",
      relais_id: relais.id,
      // L'adresse saisie au moment de la commande. C'est elle qui ira sur
      // le colis, et pas celle de la fiche Odoo : quand un client a déjà
      // commandé il y a six mois, sa fiche porte l'adresse d'alors, et le
      // colis partirait là-bas.
      client,
    });
  } catch (e) {
    return json({
      ok: false, motif: "registre", ref,
      message: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité.",
    }, 502);
  }

  return json({
    ok: true,
    ref,
    commande: commande.nom || "",
    paiement_url: lien,
    mode_mollie: modeMollie(env),
    total: resultat.total,
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
