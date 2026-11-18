/* ==========================================================================
   RATTRAPAGE — remettre la vérité dans les comptes déjà créés.

   POURQUOI CETTE PAGE EXISTE

   Remplacer le calcul par le registre (voir _registre_fr.js) répare les
   inscriptions à venir. Elle ne répare rien du passé : chaque compte
   français créé avant le 18 novembre 2026 porte, dans la base du site, le
   numéro que la formule avait produit. Un compte existant garderait donc
   son faux numéro, et serait encore facturé de travers à sa prochaine
   commande — c'est la question que Dilhan a posée, et la réponse était non.

   Cette page est ce « non » transformé en oui. Elle interroge le registre
   français pour chaque compte français et réécrit ce que la France
   déclare : le vrai numéro, ou aucun numéro.

   DEUX PRINCIPES, DONT TOUT LE RESTE DÉCOULE

   1. LECTURE AVANT ÉCRITURE. Le GET ne touche à rien : il rend le plan,
      compte par compte, avec ce qui changerait. Le POST applique ce même
      plan. On regarde avant d'écrire, sur 229 fiches clients on ne fait
      pas autrement.

   2. ON NE DÉCLASSE JAMAIS UNE CONFIRMATION DU REGISTRE EUROPÉEN. Si VIES
      a confirmé un numéro et que le registre français dit autre chose,
      cette page ne touche à rien et le signale. VIES fonde l'exonération ;
      le registre français dit seulement ce que la France déclare. Le
      second ne renverse pas le premier.

   ET CE QU'ELLE NE FAIT PAS

   Elle ne pose jamais tva_valide à 1. Seul le registre européen ouvre
   l'exonération, et depuis Cloudflare il ne répond pas (voir _vies.js).
   Un numéro retrouvé ici repart donc en « a_verifier » : connu, pas encore
   confirmé. La confirmation vient du veilleur ou du constat manuel.

   Par lots, parce qu'une interrogation du registre coûte une demi-seconde
   et qu'un travailleur Cloudflare n'a pas la soirée devant lui : ?apres=
   reprend où le lot précédent s'est arrêté.

   Réservée au compte de NBD, ou au porteur de la clé de service.
   ========================================================================== */

import { json, erreur, compteAdmin } from "../_commun.js";
import { cleDeService } from "../_cle_service.js";
import { chercherEntreprise } from "../_registre_fr.js";

const LOT_DEFAUT = 8;
const LOT_MAX = 15;

/* LA PAUSE ENTRE DEUX APPELS AU REGISTRE, ET POURQUOI ELLE EXISTE.
 *
 * Premier passage en production, 18 novembre 2026 : 61 appels enchaînés
 * sans pause, 47 refus 429. Le module n'a rien écrit de faux — un refus
 * rend « indisponible », donc « ne touche à rien » — mais le compte rendu
 * annonçait 62 comptes « rien à faire » alors que 47 n'avaient jamais été
 * examinés. Un passage incomplet qui se lit comme complet est pire qu'un
 * passage qui échoue franchement.
 *
 * D'où deux garde-fous qui marchent ensemble : cette pause, et le compteur
 * « muets » ci-dessous, qui empêche de lire un passage comme terminé tant
 * qu'un seul compte n'a pas eu de réponse. */
const PAUSE_MS = 1500;

/* Les statuts qui valent exonération aujourd'hui, c'est-à-dire ceux qu'une
 * réponse du registre français n'a pas qualité pour défaire. Repris de
 * _tva.js plutôt qu'importés : si cette liste y change, on veut le
 * constater ici en relisant, pas l'hériter sans y penser. */
const CONFIRMES = ["valide", "valide_ancien", "valide_manuel", "valide_sans_preuve"];

function normaliser(n) {
  return String(n || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Le SIREN d'un compte : son SIRET s'il en a un, sinon celui qui dort
 *  dans le numéro de TVA stocké (FRxx + 9 chiffres). */
function sirenDuCompte(c) {
  const siret = String(c.siret || "").replace(/[^0-9]/g, "");
  if (siret.length >= 9) return siret.slice(0, 9);
  const tva = normaliser(c.tva);
  if (/^FR[0-9A-Z]{2}[0-9]{9}$/.test(tva)) return tva.slice(4);
  return "";
}

/**
 * Ce qu'il faut faire de ce compte, au vu de ce que le registre a répondu.
 *
 * Rend { action, tva, statut, pourquoi }. action vaut :
 *   "aucune"    → la base dit déjà la vérité
 *   "corriger"  → on réécrit le numéro et le statut
 *   "signaler"  → une machine ne tranche pas ce cas ; il revient à un humain
 */
export function decider(compte, registre) {
  const stocke = normaliser(compte.tva);
  const confirme = CONFIRMES.indexOf(String(compte.tva_statut || "")) !== -1;

  /* Le registre n'a pas répondu. On ne touche à rien : effacer un numéro
   * sur une panne de réseau serait exactement l'erreur inverse de celle
   * qu'on répare. */
  if (!registre || registre.etat === "indisponible") {
    return { action: "aucune", pourquoi: "registre muet (" + (registre && registre.motif) + ")" };
  }

  if (registre.etat === "inconnu") {
    /* Deux cas très différents sous le même mot. Un SIREN que le registre
     * ne connaît pas est un numéro qui n'existe pas — on l'efface, le
     * SIRET saisi reste en base pour pouvoir redemander au client. Une
     * saisie trop courte ou qui rate sa clé, on la signale sans y toucher :
     * c'est peut-être une faute de frappe, et le client seul le sait. */
    if (registre.motif === "absent_du_registre") {
      if (confirme) {
        return { action: "signaler",
                 pourquoi: "le registre européen a confirmé ce numéro, mais ce SIREN est absent du registre français" };
      }
      if (!stocke) return { action: "aucune", pourquoi: "SIREN absent du registre, aucun numéro en base" };
      return { action: "corriger", tva: null, statut: "a_corriger",
               pourquoi: "ce SIREN n'existe pas au registre français" };
    }
    return { action: "signaler", pourquoi: "identifiant inexploitable (" + registre.motif + ")" };
  }

  /* Société cessée. Le numéro, s'il en reste un, n'ouvre plus rien. */
  if (!registre.actif) {
    if (!stocke && String(compte.tva_statut || "") === "a_corriger") {
      return { action: "aucune", pourquoi: "cessée, déjà signalée" };
    }
    return { action: "corriger", tva: null, statut: "a_corriger",
             pourquoi: "le registre indique une activité cessée" };
  }

  const vrai = normaliser(registre.tva);

  /* La France déclare que cette entreprise n'a pas de numéro
   * intracommunautaire : c'est la franchise en base, et c'est normal. La
   * TVA s'applique, ce n'est pas une anomalie à corriger côté client. */
  if (!vrai) {
    if (confirme) {
      return { action: "signaler",
               pourquoi: "le registre européen a confirmé un numéro que la France ne déclare pas" };
    }
    if (!stocke && String(compte.tva_statut || "") === "sans_numero") {
      return { action: "aucune", pourquoi: "sans numéro, déjà enregistré comme tel" };
    }
    return { action: "corriger", tva: null, statut: "sans_numero",
             pourquoi: stocke ? "numéro fabriqué par le calcul ; la France n'en déclare aucun"
                              : "la France ne déclare aucun numéro" };
  }

  /* Le registre déclare un numéro, et c'est celui qu'on a. */
  if (vrai === stocke) {
    if (confirme) return { action: "aucune", pourquoi: "numéro conforme et déjà confirmé" };
    /* Déjà en attente du registre européen : il n'y a rien à réécrire.
     * Sans cette ligne, chaque passage réécrivait les mêmes comptes à
     * l'identique et le compte rendu n'arrivait jamais à zéro — ce qui
     * aurait vidé de son sens le « complet » qu'on vient d'ajouter. */
    if (String(compte.tva_statut || "") === "a_verifier") {
      return { action: "aucune", tva: vrai,
               pourquoi: "numéro conforme, en attente du registre européen" };
    }
    return { action: "corriger", tva: vrai, statut: "a_verifier",
             pourquoi: "numéro confirmé par le registre français, reste à confirmer au registre européen" };
  }

  /* Le registre déclare un AUTRE numéro que celui en base. C'est le cas
   * B.M. BARBER : la formule avait produit FR33…, la vraie clé est 0F. */
  if (confirme) {
    return { action: "signaler",
             pourquoi: "le registre européen a confirmé " + (stocke || "—")
                     + ", la France déclare " + vrai };
  }
  return { action: "corriger", tva: vrai, statut: "a_verifier",
           pourquoi: stocke ? "le numéro en base était calculé, pas déclaré" : "numéro retrouvé au registre" };
}

async function lot(env, apres, max) {
  const r = await env.DB.prepare(
    "SELECT id, email, salon, pays, tva, siret, tva_valide, tva_statut, " +
    "tva_verifiee_le, tva_motif " +
    "FROM comptes WHERE pays = 'FR' AND id > ? ORDER BY id LIMIT ?"
  ).bind(apres, max).all();
  return (r && r.results) || [];
}

async function examiner(env, comptes) {
  const plan = [];
  let premier = true;
  for (const c of comptes) {
    const siren = sirenDuCompte(c);
    let registre = null;
    if (siren) {
      if (!premier) await new Promise((ok) => setTimeout(ok, PAUSE_MS));
      premier = false;
      registre = await chercherEntreprise(siren);
    }
    const d = siren
      ? decider(c, registre)
      : { action: "signaler", pourquoi: "ni SIRET ni numéro exploitable en base" };

    plan.push({
      id: c.id, salon: c.salon || "", siren,
      avant: { tva: c.tva || null, statut: c.tva_statut || "", valide: !!c.tva_valide },
      registre: registre ? { etat: registre.etat, actif: registre.actif === true,
                             nom: registre.nom || "", tva: registre.tva || null } : null,
      action: d.action,
      apres: d.action === "corriger" ? { tva: d.tva, statut: d.statut, valide: false } : null,
      pourquoi: d.pourquoi,
    });
  }
  return plan;
}

function bornes(url) {
  const apres = Math.max(0, Number(url.searchParams.get("apres") || 0) | 0);
  let max = Number(url.searchParams.get("max") || LOT_DEFAUT) | 0;
  if (!(max > 0)) max = LOT_DEFAUT;
  return { apres, max: Math.min(max, LOT_MAX) };
}

/* Le compte rendu, et le chiffre qui empêche de se tromper en le lisant.
 *
 * « muets » compte les comptes pour lesquels le registre n'a pas répondu.
 * Ceux-là ne sont ni corrects ni à corriger : ils n'ont pas été examinés,
 * et il faut repasser. Sans ce chiffre, ils se rangeaient avec les
 * « aucune » et un passage à moitié fait se lisait comme un passage
 * terminé. C'est l'erreur du premier passage du 18 novembre. */
function resume(plan) {
  const n = { aucune: 0, corriger: 0, signaler: 0, muets: 0 };
  for (const p of plan) {
    n[p.action] = (n[p.action] || 0) + 1;
    if (p.registre && p.registre.etat === "indisponible") n.muets++;
  }
  n.examines = plan.length - n.muets;
  return n;
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  const machine = !compte && cleDeService(request, env);
  if (!compte && !machine) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  const { apres, max } = bornes(new URL(request.url));
  const comptes = await lot(env, apres, max);
  const plan = await examiner(env, comptes);

  const reste = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM comptes WHERE pays = 'FR' AND id > ?"
  ).bind(comptes.length ? comptes[comptes.length - 1].id : apres).first();

  const bilan = resume(plan);
  return json({
    ok: true, ecrit: false,
    lu: plan.length,
    /* Faux tant qu'un seul compte n'a pas eu de réponse du registre : ce
     * lot est à repasser. Voir la note sur PAUSE_MS. */
    complet: bilan.muets === 0,
    resume: bilan,
    suite: comptes.length ? comptes[comptes.length - 1].id : null,
    restants: (reste && reste.n) || 0,
    plan,
  });
}

export async function onRequestPost({ request, env }) {
  const compte = await compteAdmin(request, env);
  const machine = !compte && cleDeService(request, env);
  if (!compte && !machine) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  const url = new URL(request.url);
  if (url.searchParams.get("appliquer") !== "oui") {
    return erreur("Ajoutez ?appliquer=oui pour écrire. Sans cela, utilisez le GET.",
                  400, "confirmation_requise");
  }

  const { apres, max } = bornes(url);
  const comptes = await lot(env, apres, max);
  const plan = await examiner(env, comptes);

  const quand = new Date().toISOString().slice(0, 10);
  let ecrits = 0;
  for (const p of plan) {
    if (p.action !== "corriger") continue;
    /* Le motif garde la correction visible : ce qui était là, et pourquoi
     * ça a changé. Un coffre qui réécrit l'histoire devient un piège. */
    const motif = "rattrapage " + quand + " : "
      + (p.avant.tva ? p.avant.tva + " → " : "")
      + (p.apres.tva || "aucun numéro") + " — " + p.pourquoi;
    try {
      await env.DB.prepare(
        "UPDATE comptes SET tva = ?, tva_statut = ?, tva_valide = 0, tva_motif = ? WHERE id = ?"
      ).bind(p.apres.tva, p.apres.statut, motif.slice(0, 400), p.id).run();
      p.ecrit = true;
      ecrits++;
    } catch (e) {
      p.ecrit = false;
      p.echec = String((e && e.message) || e).slice(0, 120);
    }
  }

  /* COMBIEN IL EN RESTE APRÈS CE LOT. Le GET le donnait, le POST non — et
   * un appelant qui parcourt la base lot par lot n'avait donc aucun moyen
   * de savoir quand s'arrêter. Trouvé le 18 novembre en lançant la passe
   * complète : ma boucle a lu « restants » absent, l'a pris pour zéro, et
   * s'est arrêtée après douze comptes sur soixante-sept en croyant avoir
   * fini. C'est exactement la faute du matin, dans l'autre sens : un
   * passage partiel qui se lit comme terminé. Le veilleur du showroom
   * parcourra cette page en POST : il lui faut ce compteur. */
  const dernier = comptes.length ? comptes[comptes.length - 1].id : apres;
  let restants = null;
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM comptes WHERE pays = 'FR' AND id > ?"
    ).bind(dernier).first();
    restants = Number((r && r.n) || 0);
  } catch (e) { restants = null; }

  const bilan = resume(plan);
  return json({
    ok: true, ecrit: true,
    lu: plan.length, ecrits,
    complet: bilan.muets === 0,
    resume: bilan,
    suite: comptes.length ? dernier : null,
    restants,
    plan,
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
