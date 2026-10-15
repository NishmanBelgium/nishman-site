/* ==========================================================================
   CONNEXION — ouverture d'une session.
   ========================================================================== */

import {
  json, erreur, verifier, ouvrirSession, cookieSession,
  cleEmail, tropDeTentatives, noterTentative, effacerTentatives,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500);

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible."); }

  const cle = cleEmail(corps.email || "");
  const mdp = String(corps.motdepasse || "");

  if (!cle || !mdp) return erreur("Adresse e-mail et mot de passe requis.");

  if (await tropDeTentatives(db, cle)) {
    return erreur(
      "Trop de tentatives. Réessayez dans un quart d'heure.", 429
    );
  }

  const compte = await db.prepare(`
    SELECT id, email, salon, mot_de_passe, tva, tva_valide, etat, motif_suspension
      FROM comptes WHERE email_cle = ?
  `).bind(cle).first();

  // Même message, même durée, que le compte existe ou non : sinon la page
  // devient un outil pour deviner qui est client.
  const bon = compte ? await verifier(mdp, compte.mot_de_passe) : await verifier(mdp, "pbkdf2$210000$AAAA$AAAA");

  if (!compte || !bon) {
    await noterTentative(db, cle);
    return erreur("Adresse e-mail ou mot de passe incorrect.", 401);
  }

  if (compte.etat !== "actif") {
    return erreur(
      "Ce compte est suspendu. Contactez-nous à contact@nishman.be.", 403
    );
  }

  await effacerTentatives(db, cle);
  const jeton = await ouvrirSession(db, compte.id);
  await db.prepare("UPDATE comptes SET vu_le = ? WHERE id = ?")
    .bind(new Date().toISOString(), compte.id).run();

  return json(
    {
      ok: true,
      compte: {
        email: compte.email, salon: compte.salon,
        tva: compte.tva, tva_valide: compte.tva_valide,
      },
    },
    200,
    { "set-cookie": cookieSession(jeton) }
  );
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405);
}
