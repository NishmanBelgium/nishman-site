/* ==========================================================================
   COMMANDES — l'historique du client connecté, lu en direct dans Odoo.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { configure, commandesDuClient } from "../_odoo.js";
import { ficheVivante } from "../_liaison.js";

export async function onRequestGet({ request, env }) {
  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous pour voir vos commandes.", 401, "session_requise");

  if (!configure(env)) {
    // Le pont vers Odoo n'est pas encore branché : on le dit franchement
    // plutôt que de renvoyer une liste vide qui ferait croire à zéro commande.
    return json({ pret: false, commandes: [] });
  }

  try {
    /* La fiche client, retenue au premier passage et VÉRIFIÉE à chaque
       fois : un rattachement mort — fiche fusionnée ou supprimée dans
       Odoo — affichait un historique vide sans le moindre message. Voir
       ficheVivante() dans _liaison.js. */
    const partnerId = await ficheVivante(env, compte);

    if (!partnerId) return json({ pret: true, commandes: [], inconnu: true });

    const brut = await commandesDuClient(env, partnerId);
    const commandes = brut.map((c) => ({
      id: c.id,
      reference: c.name,
      date: c.date_order,
      // Le texte français sert de secours ; c'est le code que le navigateur
      // traduit dans la langue choisie.
      etat: etatLisible(c.state),
      etat_code: c.state,
      total_ht: c.amount_untaxed,
      total: c.amount_total,
      livraison: c.delivery_status || null,
      facturation: c.invoice_status || null,
    }));

    return json({ pret: true, commandes });
  } catch (e) {
    return json({ pret: false, commandes: [], souci: String(e.message || e) }, 200);
  }
}

function etatLisible(state) {
  switch (state) {
    case "draft":  return "Devis";
    case "sent":   return "Devis envoyé";
    case "sale":   return "Confirmée";
    case "done":   return "Clôturée";
    case "cancel": return "Annulée";
    default:       return state;
  }
}
