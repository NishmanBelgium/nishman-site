/* ==========================================================================
   PROFIL — le client modifie lui-même ses coordonnées.
   Rien ici ne touche à l'e-mail ni au mot de passe : ceux-là sont les clés
   du compte et passent par leurs propres pages, avec confirmation.
   ========================================================================== */

import {
  json, erreur, compteConnecte,
  paysValide, identifiantFiscal, texteValide,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500, "base_absente");

  const compte = await compteConnecte(request, db);
  if (!compte) return erreur("Session expirée. Reconnectez-vous.", 401, "session_expiree");

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const pays = String(corps.pays || "").toUpperCase();
  if (!paysValide(pays)) return erreur("Choisissez votre pays.", 400, "pays_requis");

  const prenom  = texteValide(corps.prenom, 2, 60);
  const nom     = texteValide(corps.nom, 2, 60);
  const societe = texteValide(corps.societe, 2, 120);
  if (!prenom)  return erreur("Indiquez votre prénom.", 400, "prenom_requis");
  if (!nom)     return erreur("Indiquez votre nom.", 400, "nom_requis");
  if (!societe) return erreur("Indiquez le nom de votre société.", 400, "societe_requise");

  const fiscal = identifiantFiscal(pays, corps.identifiant);
  if (fiscal.erreur) {
    return erreur(fiscal.erreur, 400, fiscal.code || "",
      fiscal.attendu ? { attendu: fiscal.attendu, saisi: fiscal.saisi } : null);
  }

  const adresse = texteValide(corps.adresse, 4, 160);
  const cp      = texteValide(corps.code_postal, 3, 12);
  const ville   = texteValide(corps.ville, 2, 80);
  if (!adresse) return erreur("Indiquez la rue et le numéro.", 400, "adresse_requise");
  if (!cp)      return erreur("Indiquez le code postal.", 400, "cp_requis");
  if (!ville)   return erreur("Indiquez la ville.", 400, "ville_requise");

  // Le téléphone reste facultatif : on n'empêche personne d'enregistrer
  // ses coordonnées parce qu'il ne veut pas laisser son numéro.
  const tel = texteValide(corps.telephone, 6, 30);

  // Le numéro a changé : la vérification VIES éventuelle ne vaut plus.
  const memeNumero = (fiscal.tva || null) === (compte.tva || null)
                  && (fiscal.siret || null) === (compte.siret || null);

  await db.prepare(`
    UPDATE comptes
       SET salon = ?, prenom = ?, nom = ?, pays = ?, tva = ?, siret = ?,
           telephone = ?, adresse = ?, code_postal = ?, ville = ?,
           tva_valide = ?, tva_verifiee_le = ?
     WHERE id = ?
  `).bind(
    societe, prenom, nom, pays, fiscal.tva, fiscal.siret,
    tel, adresse, cp, ville,
    memeNumero ? compte.tva_valide : 0,
    memeNumero ? compte.tva_verifiee_le || null : null,
    compte.id
  ).run();

  return json({
    ok: true,
    avertissement: fiscal.coherent ? null
      : "Ce numéro ne passe pas le contrôle de cohérence. Vérifiez-le : une erreur empêcherait la facturation hors TVA.",
    avertissement_code: fiscal.coherent ? null : "tva_incoherente",
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
