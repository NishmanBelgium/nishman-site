/* ==========================================================================
   APRÈS PAIEMENT — la suite, reprise là où elle s'est arrêtée.

   Confirmer la commande, émettre la facture, préparer l'expédition : trois
   gestes qui doivent s'enchaîner tout seuls, et dont chacun peut échouer
   pour une raison qui n'a rien à voir avec les deux autres. Odoo qui ne
   répond pas, une facture déjà émise, un réseau qui coupe au mauvais
   moment.

   La mauvaise façon de traiter ça est d'écrire la suite d'un trait et
   d'espérer : au premier incident, on ne sait plus ce qui a été fait. La
   bonne est celle-ci — un état noté après chaque geste, et une reprise qui
   repart de cet état.

   Deux garanties tiennent l'ensemble :

   1. Avant d'agir, on regarde ce qu'Odoo dit DÉJÀ. Une commande confirmée
      ne se reconfirme pas, une facture existante ne se recrée pas. L'état
      que nous notons est un raccourci ; la vérité reste chez Odoo. C'est
      ce qui rend une reprise sans danger, même si notre note est fausse.

   2. Un échec ne fait pas reculer l'étape atteinte. On s'arrête, on écrit
      pourquoi, et la prochaine sollicitation — notification de Mollie,
      consultation de la page de retour — reprendra au même endroit.
   ========================================================================== */

import { appel } from "./_odoo.js";
import { noterEtape } from "./_paiements.js";

/** Un petit journal, pour pouvoir raconter ce qui s'est passé. */
function ligne(journal, quoi, ok, detail) {
  journal.push({ geste: quoi, ok, detail });
}

/* --- Les gestes, un par un ---------------------------------------------- */

/**
 * La commande devient une commande client.
 *
 * On lit l'état avant d'agir : si Odoo la donne déjà confirmée — parce
 * qu'une notification précédente a abouti, ou parce que NBD l'a confirmée
 * à la main — il n'y a rien à faire, et c'est une réussite, pas un échec.
 */
async function confirmerCommande(env, orderId, journal) {
  const lu = await appel(env, "sale.order", "read", [[orderId], ["state", "name"]], {});
  if (!lu || !lu[0]) throw new Error("commande introuvable dans Odoo");
  const etat = String(lu[0].state || "");

  if (etat === "cancel") {
    throw new Error("la commande a été annulée dans Odoo : rien ne sera facturé");
  }
  if (etat === "sale" || etat === "done") {
    ligne(journal, "confirmation", true, "déjà confirmée dans Odoo");
    return;
  }
  await appel(env, "sale.order", "action_confirm", [[orderId]], {});
  ligne(journal, "confirmation", true, "commande " + (lu[0].name || orderId) + " confirmée");
}

/**
 * La facture : créée si elle n'existe pas, comptabilisée si elle est encore
 * en brouillon.
 *
 * Les deux moitiés sont séparées à dessein. Une facture créée mais non
 * comptabilisée est le résultat normal d'une interruption entre les deux ;
 * la reprise doit la retrouver et finir le travail, pas en créer une
 * seconde.
 */
async function facturer(env, orderId, journal) {
  const lu = await appel(env, "sale.order", "read", [[orderId], ["invoice_ids", "name"]], {});
  if (!lu || !lu[0]) throw new Error("commande introuvable dans Odoo");

  let factureIds = Array.isArray(lu[0].invoice_ids) ? lu[0].invoice_ids.slice() : [];

  if (!factureIds.length) {
    // Odoo refuse qu'on appelle à distance une méthode dont le nom commence
    // par un tiret bas — _create_invoices en fait partie. On passe donc par
    // l'assistant de facturation, qui est le chemin prévu pour l'extérieur
    // et qui traversera les mises à jour d'Odoo sans se casser.
    const contexte = { active_model: "sale.order", active_id: orderId, active_ids: [orderId] };
    const assistant = await appel(env, "sale.advance.payment.inv", "create",
      [{ advance_payment_method: "delivered" }], { context: contexte });
    if (!assistant) throw new Error("l'assistant de facturation n'a pas pu être ouvert");
    await appel(env, "sale.advance.payment.inv", "create_invoices",
      [[assistant]], { context: contexte });

    const relu = await appel(env, "sale.order", "read", [[orderId], ["invoice_ids"]], {});
    factureIds = (relu && relu[0] && Array.isArray(relu[0].invoice_ids)) ? relu[0].invoice_ids.slice() : [];
    if (!factureIds.length) throw new Error("Odoo n'a créé aucune facture");
    ligne(journal, "création de la facture", true, factureIds.length + " facture(s) créée(s)");
  } else {
    ligne(journal, "création de la facture", true, "facture déjà existante");
  }

  const factures = await appel(env, "account.move", "read",
    [factureIds, ["name", "state", "amount_total"]], {});

  const aComptabiliser = (factures || []).filter((f) => String(f.state) === "draft").map((f) => f.id);
  if (aComptabiliser.length) {
    await appel(env, "account.move", "action_post", [aComptabiliser], {});
    ligne(journal, "comptabilisation", true, aComptabiliser.length + " facture(s) comptabilisée(s)");
  } else {
    ligne(journal, "comptabilisation", true, "déjà comptabilisée");
  }

  const relu = await appel(env, "account.move", "read", [factureIds, ["name", "state"]], {});
  const principale = (relu || [])[0] || {};
  return { id: factureIds[0], nom: principale.name || "" };
}

/**
 * Le lettrage : dire à la comptabilité que cette facture est payée.
 *
 * Sans lui, Mollie a encaissé et Odoo affiche encore « montant dû ». Les
 * relances partent vers des clients qui ont payé, et le compte client ne
 * veut plus rien dire.
 *
 * Le journal n'a PAS de valeur par défaut, et c'est délibéré. Mollie ne
 * verse pas à l'unité : il regroupe plusieurs paiements et vire le total
 * quelques jours plus tard. Lettrer directement sur le journal bancaire
 * ferait apparaître deux fois le même argent — une fois à l'encaissement,
 * une fois au virement — et le rapprochement bancaire deviendrait
 * ingérable.
 *
 * Le bon montage est un journal dédié à Mollie, qui sert de compte
 * d'attente : les encaissements y entrent un par un, le virement de Mollie
 * les en sort en bloc. C'est un choix comptable, il revient à NBD, et tant
 * qu'il n'est pas fait la chaîne s'arrête ici sans rien casser.
 */
async function lettrer(env, factureIds, journalNom, journal) {
  const cible = String(journalNom || "").trim().toLowerCase();
  const trouves = await appel(env, "account.journal", "search_read",
    [[["type", "in", ["bank", "cash"]]], ["id", "name", "type"]], { limit: 50 });

  const j = (trouves || []).find((x) => String(x.name || "").trim().toLowerCase() === cible);
  if (!j) {
    throw new Error("le journal « " + journalNom + " » n'existe pas parmi les journaux "
      + "de banque et de caisse : " + (trouves || []).map((x) => x.name).join(", "));
  }

  const contexte = { active_model: "account.move", active_ids: factureIds };
  const assistant = await appel(env, "account.payment.register", "create",
    [{ journal_id: j.id }], { context: contexte });
  if (!assistant) throw new Error("l'assistant d'enregistrement de paiement n'a pas pu être ouvert");

  await appel(env, "account.payment.register", "action_create_payments",
    [[assistant]], { context: contexte });

  const relu = await appel(env, "account.move", "read",
    [factureIds, ["name", "payment_state", "amount_residual"]], {});
  const etat = (relu && relu[0]) ? String(relu[0].payment_state || "") : "";
  ligne(journal, "lettrage", true,
    "paiement enregistré sur « " + j.name + " »"
    + (etat ? " — état de paiement : " + etat : ""));
}

/* --- Le paiement qui n'aboutit pas --------------------------------------- */

/**
 * Le client a renoncé, ou sa banque a refusé. Le devis créé juste avant le
 * paiement n'a plus d'objet : on le retire.
 *
 * Sans ce geste, chaque panier abandonné laisserait un brouillon dans Odoo.
 * Au bout d'un mois, les devis réels seraient noyés dans les tentatives, et
 * NBD ne saurait plus lesquels relancer. Ce n'est pas une question de place,
 * c'est une question de lisibilité du carnet de commandes.
 *
 * Deux conditions, et les deux sont nécessaires :
 *
 *   — l'état doit être « brouillon ». Une commande confirmée ne se supprime
 *     pas : si NBD l'a confirmée à la main entre-temps, c'est qu'elle a
 *     décidé de la traiter, et cette décision passe avant la nôtre.
 *   — aucune facture ne doit y être rattachée. Supprimer une commande
 *     facturée laisserait une facture sans origine.
 *
 * Et dans tous les cas, on ne lève pas d'erreur : un ménage qui échoue ne
 * doit pas faire échouer la réponse au client. On dit ce qu'on a fait, ou
 * pourquoi on ne l'a pas fait.
 *
 * @returns { fait, motif }
 */
export async function nettoyerBrouillon(env, orderId) {
  if (!orderId) return { fait: false, motif: "aucune commande à retirer" };

  let lu;
  try {
    lu = await appel(env, "sale.order", "read", [[orderId], ["state", "name", "invoice_ids"]], {});
  } catch (e) {
    return { fait: false, motif: "Odoo n'a pas répondu" };
  }
  if (!lu || !lu[0]) return { fait: false, motif: "commande déjà absente" };

  const etat = String(lu[0].state || "");
  const factures = Array.isArray(lu[0].invoice_ids) ? lu[0].invoice_ids : [];
  const nom = lu[0].name || orderId;

  if (etat !== "draft" && etat !== "sent") {
    return { fait: false, motif: "la commande " + nom + " n'est plus un brouillon (" + etat + ")" };
  }
  if (factures.length) {
    return { fait: false, motif: "la commande " + nom + " porte déjà une facture" };
  }

  try {
    await appel(env, "sale.order", "unlink", [[orderId]], {});
  } catch (e) {
    // Odoo peut refuser la suppression pour une raison qui lui appartient.
    // On annule alors, ce qui atteint le même but : sortir la commande du
    // carnet sans effacer sa trace.
    try {
      await appel(env, "sale.order", "action_cancel", [[orderId]], {});
      return { fait: true, motif: "commande " + nom + " annulée (suppression refusée)" };
    } catch (e2) {
      return { fait: false, motif: "la commande " + nom + " n'a pu être ni supprimée ni annulée" };
    }
  }
  return { fait: true, motif: "devis " + nom + " retiré" };
}

/**
 * Appelée quand un paiement est définitivement perdu — annulé, expiré,
 * échoué. Elle fait le ménage et écrit ce qu'il faut dans le registre, une
 * seule fois : le passage par l'étape « abandon » empêche de recommencer à
 * chaque notification.
 */
export async function abandonner(env, db, p, statut) {
  if (String(p.etape || "rien") === "abandon") return;

  const r = await nettoyerBrouillon(env, p.odoo_order_id);
  const dit = { annule: "annulé", expire: "expiré", echoue: "échoué" }[statut] || statut;

  await noterEtape(db, p.mollie_id, "abandon", {
    note: "Paiement " + dit + " : " + r.motif + ".",
  });
}

/* --- L'enchaînement ------------------------------------------------------ */

/**
 * Avance aussi loin que possible, et s'arrête proprement au premier
 * obstacle.
 *
 * @param p la ligne du registre des paiements
 * @returns { etape, journal, fini, erreur }
 */
export async function poursuivre(env, db, p) {
  const journal = [];

  if (String(p.statut) !== "paye") {
    return { etape: p.etape || "rien", journal, fini: false, erreur: null };
  }

  let etape = String(p.etape || "rien");
  let factureId = p.facture_id || null;
  let factureNom = p.facture_nom || "";

  try {
    if (etape === "rien") {
      await confirmerCommande(env, p.odoo_order_id, journal);
      etape = "confirmee";
      await noterEtape(db, p.mollie_id, etape, { note: "Commande confirmée." });
    }

    if (etape === "confirmee") {
      const f = await facturer(env, p.odoo_order_id, journal);
      factureId = f.id; factureNom = f.nom;
      etape = "facturee";
      await noterEtape(db, p.mollie_id, etape, {
        facture_id: factureId, facture_nom: factureNom,
        note: "Facture " + (factureNom || factureId) + " comptabilisée.",
      });
    }

    if (etape === "facturee") {
      const journalNom = String((env && env.JOURNAL_MOLLIE) || "").trim();
      if (journalNom) {
        const lu = await appel(env, "sale.order", "read", [[p.odoo_order_id], ["invoice_ids"]], {});
        const factureIds = (lu && lu[0] && Array.isArray(lu[0].invoice_ids)) ? lu[0].invoice_ids : [];
        if (!factureIds.length) throw new Error("aucune facture à lettrer");
        await lettrer(env, factureIds, journalNom, journal);
        etape = "lettree";
        await noterEtape(db, p.mollie_id, etape, {
          note: "Facture " + (factureNom || factureId) + " lettrée sur « " + journalNom + " ».",
        });
      } else {
        // Pas de journal choisi : la facture reste ouverte, et on le dit.
        etape = "lettree";
        await noterEtape(db, p.mollie_id, etape, {
          note: "Facture " + (factureNom || factureId) + " comptabilisée. "
              + "Lettrage non effectué : aucun journal Mollie n'est configuré (JOURNAL_MOLLIE).",
        });
        ligne(journal, "lettrage", true,
          "ignoré : aucun journal Mollie configuré, la facture reste à lettrer");
      }
    }

    // L'étiquette d'expédition viendra se placer ici. Tant qu'elle n'est
    // pas en service, le bon de livraison attend NBD dans Odoo.
    if (etape === "lettree") {
      etape = "fini";
      await noterEtape(db, p.mollie_id, etape, null);
      ligne(journal, "expédition", true, "bon de livraison prêt dans Odoo, à préparer et étiqueter");
    }

    return { etape, journal, fini: etape === "fini", erreur: null };
  } catch (e) {
    const motif = String((e && e.message) || "erreur").slice(0, 240);
    ligne(journal, "arrêt", false, motif);
    try {
      await noterEtape(db, p.mollie_id, etape, {
        note: "Suite interrompue à l'étape « " + etape + " » : " + motif
            + ". Elle reprendra d'elle-même à la prochaine sollicitation.",
      });
    } catch (e2) { /* le registre est indisponible ; l'essentiel est déjà dit */ }
    return { etape, journal, fini: false, erreur: motif };
  }
}
