/* ==========================================================================
   CONNEXION — ouverture d'une session.
   ========================================================================== */

import { emailValide, freinerIp,
  json, erreur, verifier, ouvrirSession, cookieSession,
  cleEmail, tropDeTentatives, noterTentative, effacerTentatives,
  EMPREINTE_FACTICE,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500, "base_absente");

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const email = String(corps.email || "").trim();
  const cle = cleEmail(email);
  const mdp = String(corps.motdepasse || "");

  if (!cle || !mdp) return erreur("Adresse e-mail et mot de passe requis.", 400, "identifiants_requis");

  /* L'adresse est validée AVANT tout calcul.
   *
   * La vérification d'un mot de passe coûte cent mille tours de PBKDF2,
   * et elle avait lieu même pour une adresse inexistante — c'est voulu,
   * pour que le temps de réponse ne trahisse pas qui est client. Mais
   * sans contrôle de forme préalable, n'importe qui pouvait faire brûler
   * ce calcul en boucle avec « aaaa » et épuiser le budget du site.
   * Une adresse mal formée n'appartient à personne : on sort tout de
   * suite, et le message reste le même pour ne rien apprendre. */
  if (!emailValide(email) || mdp.length > 200) {
    return erreur("Adresse e-mail ou mot de passe incorrect.", 401, "identifiants_faux");
  }

  /* Deux compteurs, pas un.
   *
   * Par adresse, il ralentissait qui s'acharne sur un compte. Mais rien
   * n'empêchait d'essayer le même mot de passe courant sur mille
   * adresses différentes : chacune repartait de zéro. Le compteur par IP
   * borne le robot plutôt que la victime. */
  if (await freinerIp(db, request, "connexion", 40, 15)) {
    return erreur("Trop de tentatives. Réessayez dans un quart d'heure.", 429, "trop_tentatives");
  }

  if (await tropDeTentatives(db, cle)) {
    return erreur(
      "Trop de tentatives. Réessayez dans un quart d'heure.", 429, "trop_tentatives"
    );
  }

  const compte = await db.prepare(`
    SELECT id, email, salon, mot_de_passe, tva, tva_valide, etat, motif_suspension
      FROM comptes WHERE email_cle = ?
  `).bind(cle).first();

  // Même message, même durée, que le compte existe ou non : sinon la page
  // devient un outil pour deviner qui est client.
  const bon = compte
    ? await verifier(mdp, compte.mot_de_passe)
    : await verifier(mdp, EMPREINTE_FACTICE);

  if (!compte || !bon) {
    await noterTentative(db, cle);
    return erreur("Adresse e-mail ou mot de passe incorrect.", 401, "identifiants_faux");
  }

  if (compte.etat !== "actif") {
    return erreur("Ce compte est suspendu. Contactez-nous à contact@nishman.be.", 403, "compte_suspendu");
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
  return erreur("Méthode non autorisée.", 405, "methode");
}
