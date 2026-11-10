/* ==========================================================================
   DEVIS — le relais entre la page de devis et le script Google.

   Jusqu'ici la page envoyait la demande directement au script, dont
   l'adresse figurait en clair dans config.js. Le script, lui, acceptait
   n'importe quel envoi sans vérifier qui appelait : n'importe qui lisant le
   code source du site pouvait injecter de faux devis dans Odoo.

   La demande passe désormais par ici. Le code interne qui authentifie
   l'appel ne quitte jamais Cloudflare, et la réponse du script est lue pour
   de vrai — le visiteur ne verra plus « envoyé » quand rien n'est parti.

   Une session est exigée, parce que la page de devis l'exige déjà depuis
   l'étape 202 : sans cela, le point d'entrée resterait ouvert alors que la
   page ne l'est pas. Si vous rouvrez un jour le devis aux prospects, c'est
   le contrôle ci-dessous qu'il faudra retirer, et lui seul.
   ========================================================================== */

import { json, erreur, compteConnecte, freinerIp, rangerParDepot } from "../_commun.js";
import { produitsParEan } from "../_odoo.js";
import { codePortier, adressePortier } from "../_portier.js";
import { calculer } from "../_calcul.js";
import { catalogue, tableDePrix } from "../_tarifs.js";
import { ouvreDroitAExoneration, controlerSiBesoin } from "../_tva.js";
import { rattraperApresVente } from "../_tva_rattrapage.js";
import { avertirSiPlusieursColisParNom } from "../_etiquette.js";
import { controlerTvaDuDevis } from "../_controle_tva.js";
import { noterDevis } from "../_devis.js";

const PAYS_NOM = { BE: "Belgique", FR: "France", LU: "Luxembourg" };
const LANGUES = ["fr", "en", "nl", "de", "tr"];

/* L'offre de salon (assets/js/offre.js) : un carton offert par Pack MCB
 * acheté, pendant ses dates seulement. Reprise ici pour que le nombre de
 * cartons offerts ne dépende plus de ce que le navigateur annonce. */
const OFFRE = {
  pack: "NISH-PACK-MCB",
  cadeau: "NISH-OFFERT-AW",
  nom: "AQUA WAX ASSORTI — OFFERT",
  pieces: 48,
  debut: Date.UTC(2026, 9, 8, 22, 0, 0),   // 9 octobre 2026, 00h00 à Bruxelles
  fin: Date.UTC(2026, 9, 12, 22, 0, 0),    // 13 octobre 2026, 00h00 à Bruxelles
};

/** Référence lisible ; celle de la page est gardée si elle a la bonne forme. */
function reference(proposee) {
  const r = String(proposee || "");
  if (/^DEV-\d{8}-[A-Z0-9]{3}$/.test(r)) return r;
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const alea = Math.random().toString(36).slice(2, 5).toUpperCase();
  return "DEV-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + alea;
}

const deux = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);


// Garde-fous de volume : un devis honnête tient largement dessous, et une
// tentative d'inondation s'arrête ici plutôt que dans votre Odoo.
const LIGNES_MAX = 300;
const TAILLE_MAX = 120 * 1024;

/**
 * La réponse du script est du texte. On en tire un statut plutôt que de
 * supposer que tout s'est bien passé.
 */
function lireReponse(texte) {
  const t = String(texte || "");
  if (!t) return { ok: false, motif: "muet" };
  if (/^error:/i.test(t)) return { ok: false, motif: "refus" };
  if (t.indexOf("CODE REFUSE") >= 0) return { ok: false, motif: "code" };
  if (t.indexOf("ERREUR ODOO") >= 0) return { ok: false, motif: "odoo" };
  const m = t.match(/\bS\d{5,}\b/);
  return { ok: true, devis: m ? m[0] : "" };
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  // Lié à son contexte : waitUntil déstructuré perd son destinataire.
  const attendre = (p) => { try { ctx.waitUntil(p); } catch (e) { /* tant pis */ } };
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");
  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous pour envoyer votre demande.", 401, "session");

  const brut = await request.text();
  if (!brut || brut.length > TAILLE_MAX) {
    return erreur("Demande illisible.", 400, "illisible");
  }

  let corps;
  try { corps = JSON.parse(brut); }
  catch (e) { return erreur("Demande illisible.", 400, "illisible"); }

  if (!Array.isArray(corps.lines) || !corps.lines.length) {
    return erreur("Aucun produit dans la demande.", 400, "vide");
  }
  if (corps.lines.length > LIGNES_MAX) {
    return erreur("Demande trop volumineuse.", 400, "volume");
  }

  // Un compte gratuit ne doit pas pouvoir remplir Odoo de devis en boucle.
  if (await freinerIp(env.DB, request, "devis", 10, 60)) {
    return erreur("Trop de demandes en peu de temps. Réessayez dans une heure.", 429, "trop");
  }

  /* Le devis est recomposé ici, comme une commande.
   *
   * Jusqu'au 28 octobre, la page envoyait prix, totaux, remise, type et
   * identité du client, et ce relais les transmettait tels quels au script
   * Google, avec le code interne qui l'authentifie. N'importe quel compte
   * gratuit pouvait donc faire émettre par Odoo un devis officiel, à des
   * prix inventés et au nom de n'importe quelle société.
   *
   * Désormais, du navigateur on ne retient que les références et les
   * quantités. Les prix viennent de la table, les montants de _calcul.js,
   * l'identité du compte connecté — on ne demande un devis que pour soi. */
  const selection = {};
  let cadeauxDemandes = 0;
  for (const l of corps.lines) {
    const ean = String((l && l.ean) || "").trim().slice(0, 40);
    if (!ean) continue;
    if (ean === OFFRE.cadeau) {
      cadeauxDemandes += Math.max(0, Math.floor(Number(l.boxes) || 0));
      continue;
    }
    const u = Math.min(100000, Math.max(0, Math.floor(Number(l.units) || 0)));
    const b = Math.min(10000, Math.max(0, Math.floor(Number(l.boxes) || 0)));
    if (!u && !b) continue;
    const avant = selection[ean] || { u: 0, b: 0 };
    selection[ean] = { u: avant.u + u, b: avant.b + b };
  }

  let produits, prix;
  try { [produits, prix] = await Promise.all([catalogue(request), tableDePrix(env)]); }
  catch (e) { return erreur("Service indisponible.", 503, "prix"); }

  const pays = ["BE", "FR", "LU"].indexOf(String(compte.pays || "")) >= 0 ? compte.pays : "BE";
  const retrait = String(corps.pickup || "") === "1";

  /* LE CONTRÔLE DU NUMÉRO, QUI MANQUAIT ICI.
   *
   * Jusqu'au 7 novembre 2026, le devis se contentait du statut enregistré
   * dans le compte, sans jamais redemander au registre. Un numéro validé
   * six mois plus tôt et radié depuis ouvrait donc encore l'exonération,
   * et un numéro resté « indisponible » parce que le registre était
   * engorgé un soir restait taxé indéfiniment. Les deux erreurs coûtent,
   * et un devis se transforme en facture.
   *
   * controlerSiBesoin applique les mêmes règles que le paiement : un
   * budget de trois secondes, un plancher de dix minutes entre deux
   * interrogations, et l'état connu si le registre se tait. */
  let tva = { valide: !!compte.tva_valide, statut: compte.tva_statut || "",
              motif: compte.tva_motif || "" };
  try { tva = await controlerSiBesoin(env.DB, compte, env); }
  catch (e) { /* le registre muet ne doit pas faire perdre le devis */ }

  const r = calculer({
    selection, produits, prix, pays,
    tvaValide: ouvreDroitAExoneration(pays, tva.statut),
    mode: retrait ? "retrait" : "livraison",
    promo: corps.promo,
  });
  if (!r.lignes.length) return erreur("Aucun produit valable dans la demande.", 400, "vide");

  // Les cartons offerts : jamais plus que de packs achetés, et seulement
  // pendant l'offre.
  const maintenant = Date.now();
  const packs = r.lignes.filter((l) => l.ean === OFFRE.pack).reduce((s, l) => s + l.pieces, 0);
  const offerts = (maintenant >= OFFRE.debut && maintenant < OFFRE.fin)
    ? Math.min(cadeauxDemandes, packs) : 0;

  // RANGÉES DANS L'ORDRE DU DÉPÔT avant de partir chez le portier.
  //
  // Le devis est le document sur lequel la commande est préparée : il doit
  // suivre le parcours des rayons (A-11, B-01, D-05…), pas l'ordre où le
  // client a cliqué. Les emplacements ne sont connus que d'Odoo, d'où
  // l'aller-retour.
  //
  // Et surtout : si Odoo ne répond pas, on envoie l'ordre d'origine. Un
  // devis mal rangé se prépare ; un devis refusé parce qu'une base est
  // muette, non. Le tri est un confort, pas une condition.
  let rangees = r.lignes;
  try {
    const refs = await produitsParEan(env, r.lignes.map((l) => l.ean));
    rangees = rangerParDepot(r.lignes,
      (l) => (refs[l.ean] || {}).ref,
      (l) => l.nom);
  } catch (e) { /* Odoo muet : l'ordre d'origine fera l'affaire. */ }

  const lignes = rangees.map((l) => ({
    ean: l.ean, name: l.nom, units: l.unites, boxes: l.cartons, boxQty: l.par_carton,
    pieces: l.pieces, unitPrice: deux(l.prix_unitaire), subtotal: deux(l.total),
  }));
  if (offerts > 0) {
    lignes.push({
      ean: OFFRE.cadeau, name: OFFRE.nom, units: 0, boxes: offerts, boxQty: OFFRE.pieces,
      pieces: offerts * OFFRE.pieces, unitPrice: "0.00", subtotal: "0.00",
    });
  }

  const saisi = (corps && corps.client) || {};
  const champ = (v, max) => String(v || "").trim().slice(0, max);
  const client = {
    first: champ(compte.prenom, 60),
    last: champ(compte.nom, 60),
    company: champ(compte.salon, 120),
    vat: champ(compte.tva, 20),
    phone: champ(compte.telephone, 30),
    email: champ(compte.email, 120),
    street: champ(compte.adresse, 200),
    zip: champ(compte.code_postal, 12),
    city: champ(compte.ville, 80),
    country: PAYS_NOM[pays] || "Belgique",
    shipmode: champ(saisi.shipmode, 20),
  };

  const charge = {
    type: "quote",
    ref: reference(corps.ref),
    date: new Date().toISOString(),
    lang: LANGUES.indexOf(String(corps.lang || "")) >= 0 ? corps.lang : "fr",
    client,
    total: deux(r.marchandise + r.port),
    subTotal: deux(r.sous_total),
    shipping: deux(r.port),
    pickup: retrait ? "1" : "",
    promo: r.promo || "",
    discountRate: r.promo ? "10" : "",
    discount: deux(r.remise),
    currency: "EUR",
    lines: lignes,
  };

  const code = codePortier(env);
  if (!code) return erreur("Service indisponible.", 503, "portier");

  const url = adressePortier(env);

  let reponse;
  try {
    const rep = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // Le code voyage dans la charge utile, jamais jusqu'au navigateur.
      body: JSON.stringify({ ...charge, code }),
    });
    reponse = lireReponse(await rep.text());
  } catch (e) {
    reponse = { ok: false, motif: "injoignable" };
  }

  if (!reponse.ok) {
    return json({ ok: false, motif: reponse.motif }, 502);
  }
  // L'avertissement « plusieurs colis », en arrière-plan : un devis de
  // plus de vingt kilos se prépare en deux colis, et mieux vaut le lire
  // sur le devis que le découvrir l'étiquette imprimée.
  if (reponse.devis) attendre(avertirSiPlusieursColisParNom(env, reponse.devis));

  /* LE CONTRÔLE DE TVA, en arrière-plan.
   *
   * Le devis est parti, le client a son numéro : rien ici ne doit le lui
   * retirer. Mais la commande que le script Google vient de créer dans
   * Odoo n'a jamais été relue par personne, alors que le tunnel « payer »
   * relit la sienne et refuse le paiement au moindre écart.
   *
   * Le 9 novembre 2026, deux commandes belges sont ainsi sorties à 0 % de
   * TVA sans qu'aucun signal ne s'allume. Voir _controle_tva.js. */
  if (reponse.devis) {
    attendre(controlerTvaDuDevis(env, env.DB, {
      nom: reponse.devis,
      attendu: r,
      compte_id: compte.id,
    }));
  }

  /* Le devis est noté dans le registre local, en arrière-plan.
   *
   * Odoo en garde la trace, mais Odoo mêle les ventes faites hors du
   * site ; sans cette ligne, le tableau de bord ne peut pas répondre à
   * « combien de devis le site a-t-il sortis cette semaine ». L'écriture
   * suit l'envoi et ne le conditionne jamais : le client a son numéro,
   * un registre muet ne doit pas le lui retirer. */
  /* Le même rattrapage que pour le paiement : si le registre n'a pas
   * tranché, le devis part avec la TVA belge, et l'on reprend le contrôle
   * une fois le client servi. Un devis non confirmé se corrige facilement
   * — c'est même le meilleur moment pour s'en apercevoir. */
  if (reponse.devis) {
    attendre(rattraperApresVente(env.DB, env, compte, {
      ref: reponse.devis,
      odoo_nom: reponse.devis,
      client: compte.salon || compte.email,
      montant: charge.total,
      statut_vente: tva.statut,
      motif_vente: tva.motif,
    }));
  }

  if (reponse.devis) {
    attendre(noterDevis(env.DB, {
      ref: reponse.devis,
      compte_id: compte.id,
      client: charge.client.company || (charge.client.first + " " + charge.client.last).trim(),
      email: charge.client.email,
      pays,
      montant: charge.total,
      retrait,
      lignes: lignes.length,
      cree_le: charge.date,
    }));
  }

  return json({ ok: true, devis: reponse.devis || "" });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
