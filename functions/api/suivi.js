/* ==========================================================================
   /api/suivi — ce qui attend quelque chose, en une seule lecture.

   Réservé au compte de NBD, et en lecture stricte : cet endpoint ne crée
   rien, n'envoie rien et ne modifie rien dans Odoo. Il peut donc être
   rafraîchi sans compter.

   Comme les autres pages internes, il répond 404 à qui n'est pas
   administrateur plutôt que 403 : dire « interdit », c'est confirmer que
   la page existe.
   ========================================================================== */

import { json, erreur, compteAdmin } from "../_commun.js";
import { suivi } from "../_suivi.js";

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");

  try {
    return json(await suivi(env));
  } catch (e) {
    /* Un écran de pilotage vide est inutile, mais un écran de pilotage qui
       plante est pire : on rend le souci en clair pour qu'il se voie. */
    return json({ pret: false, souci: String((e && e.message) || e).slice(0, 300) });
  }
}
