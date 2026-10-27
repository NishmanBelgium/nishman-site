/* ==========================================================================
   NOTIFICATION MOLLIE — ce que le site fait quand l'argent arrive.

   Mollie appelle cette adresse pour dire « le paiement tr_… a changé
   d'état ». Ce message n'est PAS une preuve : c'est une requête HTTP que
   n'importe qui peut fabriquer, et qui ne contient qu'un identifiant.

   Donc le site ne le croit pas. Il reprend l'identifiant, rappelle Mollie
   avec sa propre clé, et c'est cette réponse-là — la sienne, à sa
   question — qui fait foi. C'est la différence entre « on m'a dit que
   c'était payé » et « j'ai vérifié que c'était payé ».

   Trois précautions de plus :

   — Le montant encaissé est comparé à celui qu'on avait annoncé. Un
     paiement d'un euro sur une commande de six cents ne doit rien
     déclencher.
   — La suite n'est déclenchée qu'une fois, même si Mollie notifie dix
     fois. La base tranche, pas le code.
   — On répond toujours 200. Mollie réessaie sur autre chose, et une
     notification rejouée en boucle sur une erreur de notre côté finirait
     par tout engorger.
   ========================================================================== */

import { configure as configureOdoo } from "../_odoo.js";
import { configureMollie, appelMollie } from "../_mollie.js";
import { lire, majStatut, prendreLaMain, rendreLaMain } from "../_paiements.js";
import { poursuivre, abandonner } from "../_apres_paiement.js";

const ETATS = {
  paid: "paye",
  canceled: "annule",
  expired: "expire",
  failed: "echoue",
  open: "ouvert",
  pending: "ouvert",
  authorized: "ouvert",
};

/** Toujours 200 : Mollie ne doit pas réessayer sur nos propres pannes. */
function recu(quoi) {
  return new Response(quoi || "ok", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !configureMollie(env)) return recu();

  // 1) L'identifiant, et rien d'autre.
  let id = "";
  try {
    const type = String(request.headers.get("content-type") || "");
    if (type.indexOf("application/json") >= 0) {
      const j = await request.json();
      id = String((j && j.id) || "");
    } else {
      const f = await request.formData();
      id = String(f.get("id") || "");
    }
  } catch (e) { return recu(); }

  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return recu();

  // 2) Le connaissons-nous ? Un identifiant inventé ne doit mener nulle part.
  let enregistre;
  try { enregistre = await lire(env.DB, id); }
  catch (e) { return recu(); }
  if (!enregistre) return recu();

  // 3) La vérité vient de Mollie, à notre demande.
  let paiement;
  try { paiement = await appelMollie(env, "/payments/" + encodeURIComponent(id)); }
  catch (e) {
    try { await majStatut(env.DB, id, enregistre.statut, "Mollie injoignable à la notification."); } catch (e2) {}
    return recu();
  }

  const etat = String((paiement && paiement.status) || "");
  const notre = ETATS[etat] || "ouvert";

  // 4) Le montant doit être celui que nous avons demandé.
  const encaisse = paiement && paiement.amount ? String(paiement.amount.value || "") : "";
  const devise = paiement && paiement.amount ? String(paiement.amount.currency || "") : "";
  const concorde = encaisse === String(enregistre.montant) && devise === String(enregistre.devise);

  if (etat === "paid" && !concorde) {
    try {
      await majStatut(env.DB, id, "ouvert",
        "MONTANT DIVERGENT : annoncé " + enregistre.montant + " " + enregistre.devise
        + ", encaissé " + encaisse + " " + devise + ". Rien n'a été déclenché.");
    } catch (e) {}
    return recu();
  }

  try { await majStatut(env.DB, id, notre, null); } catch (e) {}

  // 5) Perdu pour de bon : on retire le devis créé avant le paiement. Le
  //    verrou sert ici aussi — Mollie notifie l'annulation plusieurs fois,
  //    et le ménage ne doit se faire qu'une.
  if (notre === "annule" || notre === "expire" || notre === "echoue") {
    if (!configureOdoo(env)) return recu();
    let main = false;
    try { main = await prendreLaMain(env.DB, id); } catch (e) { return recu(); }
    if (!main) return recu();
    try { await abandonner(env, env.DB, enregistre, notre); }
    catch (e) { /* le devis restera, ce n'est pas bloquant */ }
    finally { try { await rendreLaMain(env.DB, id); } catch (e2) {} }
    return recu();
  }

  // 6) Payé : on enchaîne la suite — confirmation, facture, expédition.
  //    Une seule exécution à la fois, et une reprise possible ensuite.
  if (etat !== "paid") return recu();
  if (String(enregistre.etape || "rien") === "fini") return recu();
  if (!configureOdoo(env)) return recu();

  let aLaMain = false;
  try { aLaMain = await prendreLaMain(env.DB, id); }
  catch (e) { return recu(); }
  if (!aLaMain) return recu();   // une autre sollicitation s'en occupe déjà

  try {
    const frais = await lire(env.DB, id);
    await poursuivre(env, env.DB, frais || { ...enregistre, statut: "paye" });
  } catch (e) {
    // poursuivre() écrit déjà ce qui s'est passé ; ici on ne fait que
    // garantir qu'on rendra la main quoi qu'il arrive.
  } finally {
    try { await rendreLaMain(env.DB, id); } catch (e2) {}
  }

  return recu();
}

/** Mollie n'appelle qu'en POST ; le reste n'a rien à faire ici. */
export async function onRequest() {
  return new Response("", { status: 405 });
}
