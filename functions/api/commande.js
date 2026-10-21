/* ==========================================================================
   COMMANDE — le détail d'une commande : ce qui a été commandé, ligne à ligne.
   Appelée quand le client déplie une ligne de son historique.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { configure, commandeDuClient, lignesDeCommande } from "../_odoo.js";

export async function onRequestGet({ request, env }) {
  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous pour voir vos commandes.", 401, "session_requise");

  if (!configure(env)) return json({ pret: false, lignes: [] });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id || !Number.isInteger(id)) return erreur("Commande inconnue.", 400, "commande_inconnue");

  // Sans fiche Odoo rattachée, il n'y a rien à montrer — et surtout rien à
  // interroger : le contrôle d'appartenance ci-dessous n'aurait aucun sens.
  if (!compte.odoo_partner_id) return erreur("Commande inconnue.", 404, "commande_inconnue");

  try {
    // On ne demande pas « la commande numéro X » mais « la commande numéro X
    // DE ce client ». Celle d'un autre n'existe pas, de son point de vue.
    const commande = await commandeDuClient(env, compte.odoo_partner_id, id);
    if (!commande) return erreur("Commande inconnue.", 404, "commande_inconnue");

    const brut = await lignesDeCommande(env, commande.id);

    // Odoo garde aussi dans sale.order.line les notes et les sections, qui
    // n'ont ni quantité ni prix : elles n'ont rien à faire dans un récapitulatif.
    const lignes = brut
      .filter((l) => Number(l.product_uom_qty) > 0)
      .map((l) => ({
        designation: String(l.name || "").split("\n")[0],
        quantite: l.product_uom_qty,
        prix_unitaire: l.price_unit,
        remise: l.discount || 0,
        total: l.price_subtotal,
      }));

    return json({
      pret: true,
      commande: {
        reference: commande.name,
        date: commande.date_order,
        total_ht: commande.amount_untaxed,
        total: commande.amount_total,
      },
      lignes,
    });
  } catch (e) {
    return json({ pret: false, lignes: [], souci: String(e.message || e) }, 200);
  }
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
