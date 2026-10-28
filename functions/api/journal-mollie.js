/* ==========================================================================
   JOURNAL MOLLIE — le compte d'attente des encaissements en ligne.

   Pourquoi un journal à part, et pas la banque.

   Mollie ne verse pas à l'unité. Il encaisse les paiements un par un, les
   garde quelques jours, puis vire le total en un seul mouvement. Si l'on
   lettre les factures directement sur le journal bancaire, le même argent
   apparaît deux fois : une fois à chaque encaissement, une fois au virement
   groupé. Le rapprochement bancaire devient alors un travail de fourmi, et
   un travail qu'il faut refaire tous les mois.

   Avec un journal dédié, le mouvement est net : les encaissements entrent
   un par un dans le journal Mollie, le virement de Mollie les en sort en
   bloc vers la banque. Le solde du journal, à tout instant, c'est l'argent
   que Mollie détient encore. Un chiffre vérifiable d'un coup d'œil.

   Cette page regarde, et ne crée que si on le lui demande explicitement par
   ?creer=oui. Créer un journal touche à la comptabilité de NBD : ça ne se
   fait pas en passant.

   Réservé au compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin, origineSure } from "../_commun.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";

const NOM = "Mollie";
const CODES = ["MOLLI", "MOLI", "MLLIE", "MOL1", "MOL2"];

function ressemble(nom) {
  return String(nom || "").trim().toLowerCase().indexOf("mollie") >= 0;
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");

  if (!configureOdoo(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

  const creer = String(new URL(request.url).searchParams.get("creer") || "") === "oui";
  if (creer && !origineSure(request)) {
    return erreur("Ouvrez cette adresse directement, pas depuis un lien extérieur.", 403, "origine");
  }

  // 1) Ce qui existe déjà. On regarde avant d'agir, toujours.
  let journaux;
  try {
    journaux = await appelOdoo(env, "account.journal", "search_read",
      [[["type", "in", ["bank", "cash"]]], ["id", "name", "type", "code"]], { limit: 80 });
  } catch (e) {
    return json({ ok: false, motif: "odoo",
      message: "Odoo n'a pas répondu : " + String(e && e.message || "").slice(0, 200) }, 502);
  }

  const existants = (journaux || []).map((j) => ({ id: j.id, nom: j.name, type: j.type, code: j.code }));
  const deja = existants.find((j) => ressemble(j.nom));

  if (deja) {
    return json({
      ok: true, cree: false, journal: deja, journaux_existants: existants,
      a_faire: "Posez JOURNAL_MOLLIE = « " + deja.nom + " » chez Cloudflare (type Text, pas Secret), "
             + "puis redéployez. Le nom doit être recopié exactement, majuscules comprises.",
      message: "Le journal existe déjà : « " + deja.nom + " ». Rien n'a été créé.",
    });
  }

  if (!creer) {
    return json({
      ok: true, cree: false, journal: null, journaux_existants: existants,
      a_faire: "Aucun journal Mollie n'existe. Rechargez cette page avec ?creer=oui à la fin de "
             + "l'adresse pour que je le crée.",
      message: "Aucun journal Mollie dans Odoo. " + existants.length
             + " journal(aux) de banque ou de caisse trouvé(s) : "
             + existants.map((j) => j.nom).join(", ") + ".",
    });
  }

  // 2) La création. Le code d'un journal doit être unique et court ; on
  //    essaie les variantes jusqu'à ce qu'Odoo en accepte une plutôt que de
  //    renvoyer une erreur technique à NBD.
  const codesPris = new Set(existants.map((j) => String(j.code || "").toUpperCase()));
  let dernierSouci = "";
  for (const code of CODES) {
    if (codesPris.has(code)) continue;
    try {
      const id = await appelOdoo(env, "account.journal", "create",
        [{ name: NOM, type: "bank", code: code }], {});
      if (!id) throw new Error("Odoo n'a pas renvoyé d'identifiant");
      const relu = await appelOdoo(env, "account.journal", "read",
        [[id], ["name", "code", "type"]], {});
      const j = (relu && relu[0]) || { name: NOM, code: code };
      return json({
        ok: true, cree: true,
        journal: { id, nom: j.name, code: j.code, type: j.type },
        a_faire: "Posez JOURNAL_MOLLIE = « " + j.name + " » chez Cloudflare (type Text, pas Secret), "
               + "puis redéployez. Dès ce moment, chaque paiement encaissé lettrera sa facture "
               + "tout seul sur ce journal.",
        message: "Journal « " + j.name + " » (code " + j.code + ") créé dans Odoo.",
        rappel: "Le solde de ce journal représente l'argent que Mollie détient encore et ne vous a "
              + "pas encore viré. Quand le virement arrive sur votre compte bancaire, il faut le "
              + "pointer contre ce journal — c'est ce mouvement-là qui solde les encaissements en "
              + "bloc, et c'est tout l'intérêt du montage.",
      });
    } catch (e) {
      dernierSouci = String(e && e.message || "erreur").slice(0, 240);
    }
  }

  return json({
    ok: false, cree: false, motif: "creation",
    journaux_existants: existants,
    message: "Le journal n'a pas pu être créé : " + dernierSouci,
    a_faire: "Créez-le à la main dans Odoo — Comptabilité, Configuration, Journaux, Nouveau : "
           + "nom « Mollie », type Banque. Puis posez JOURNAL_MOLLIE avec ce nom chez Cloudflare.",
  }, 502);
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
