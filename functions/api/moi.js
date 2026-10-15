/* ==========================================================================
   MOI — qui est connecté ? Appelé par les pages pour savoir quoi afficher.
   Répond toujours 200 : « personne » est une réponse valable, pas une erreur.
   ========================================================================== */

import { json, compteConnecte } from "../_commun.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ connecte: false, souci: "base" });

  const c = await compteConnecte(request, env.DB);
  if (!c) return json({ connecte: false });

  return json({
    connecte: true,
    compte: {
      email: c.email,
      salon: c.salon,
      tva: c.tva,
      tva_valide: !!c.tva_valide,
      client_odoo: !!c.odoo_partner_id,
      depuis: c.cree_le,
    },
  });
}
