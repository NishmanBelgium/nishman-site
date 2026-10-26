/* ==========================================================================
   MOI — qui est connecté ? Appelé par les pages pour savoir quoi afficher.
   Répond toujours 200 : « personne » est une réponse valable, pas une erreur.
   ========================================================================== */

import { json, compteConnecte, prolongerSiBesoin } from "../_commun.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ connecte: false, souci: "base" });

  const c = await compteConnecte(request, env.DB);
  if (!c) return json({ connecte: false });

  // Chaque passage sur le site repousse l'échéance : quelqu'un qui vient
  // régulièrement ne ressaisit jamais son mot de passe.
  const cookie = await prolongerSiBesoin(env.DB, c);

  return json({
    connecte: true,
    compte: {
      email: c.email,
      salon: c.salon,
      prenom: c.prenom,
      nom: c.nom,
      pays: c.pays,
      tva: c.tva,
      siret: c.siret,
      tva_valide: !!c.tva_valide,
      tva_statut: c.tva_statut || "jamais",
      tva_verifiee_le: c.tva_verifiee_le || "",
      tva_motif: c.tva_motif || "",
      telephone: c.telephone,
      adresse: c.adresse,
      code_postal: c.code_postal,
      ville: c.ville,
      client_odoo: !!c.odoo_partner_id,
      depuis: c.cree_le,
    },
  }, 200, cookie ? { "set-cookie": cookie } : {});
}
