/* ==========================================================================
   TVA — SOLDER UNE LIGNE DE RATTRAPAGE.

   Le tableau de bord liste les ventes facturées TVA comprise alors que le
   numéro du client s'est révélé valide au second contrôle. Chacune demande
   une note de crédit, et c'est NBD qui l'émet : le site ne touche pas à la
   comptabilité.

   Une fois la note émise, il faut pouvoir faire sortir la ligne — sinon la
   liste grossit, cesse d'être lue, et une liste qu'on ne lit plus ne sert
   plus à rien. C'est tout l'objet de ce point d'entrée.

   Réservé au compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin } from "../_commun.js";
import { marquerReglee } from "../_tva_rattrapage.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Demande illisible.", 400, "illisible"); }

  const ref = String((corps && corps.ref) || "").trim();
  if (!ref || ref.length > 40) return erreur("Référence manquante.", 400, "ref");

  const ok = await marquerReglee(env.DB, ref);
  if (!ok) return erreur("La ligne n'a pas pu être soldée.", 500, "ecriture");
  return json({ ok: true, ref });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
