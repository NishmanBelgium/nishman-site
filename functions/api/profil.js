/* ==========================================================================
   PROFIL — le client modifie lui-même ses coordonnées.
   Rien ici ne touche à l'e-mail ni au mot de passe : ceux-là sont les clés
   du compte et passent par leurs propres pages, avec confirmation.
   ========================================================================== */

import {
  json, erreur, compteConnecte,
  paysValide, identifiantFiscal, texteValide,
} from "../_commun.js";
import { resoudreFrance } from "../_registre_fr.js";

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

  /* La France passe par le registre, comme à l'inscription. C'est par
   * cette page qu'un client corrigera son identifiant quand le message du
   * registre lui aura appris qu'il s'était trompé — ou qu'il déclarera un
   * numéro fraîchement obtenu. */
  const fiscal = pays === "FR"
    ? await resoudreFrance(corps.identifiant)
    : identifiantFiscal(pays, corps.identifiant);
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

  /* LE STATUT DOIT TOMBER AVEC tva_valide, ET IL NE TOMBAIT PAS.
   *
   * Cette page remettait tva_valide à 0 quand le numéro changeait, mais
   * laissait tva_statut tel quel. Or c'est le STATUT que lit
   * ouvreDroitAExoneration(), pas tva_valide. Un client dont le compte
   * portait « valide » pouvait donc changer son numéro pour un autre et
   * rester exonéré sur la foi d'une vérification qui ne concernait plus
   * le numéro inscrit. Les deux lectures se contredisaient — exactement
   * ce que la note de _tva.js s'applique à éviter.
   *
   * Pour la France, le nouveau statut est celui que le registre vient de
   * rendre. Pour la Belgique et le Luxembourg, « jamais » : le contrôle
   * repartira de lui-même au prochain passage. */
  const nouveauStatut = pays === "FR" ? (fiscal.statut || "jamais") : "jamais";

  await db.prepare(`
    UPDATE comptes
       SET salon = ?, prenom = ?, nom = ?, pays = ?, tva = ?, siret = ?,
           telephone = ?, adresse = ?, code_postal = ?, ville = ?,
           tva_valide = ?, tva_statut = ?, tva_verifiee_le = ?,
           tva_preuve = ?, tva_nom = ?, tva_motif = ?
     WHERE id = ?
  `).bind(
    societe, prenom, nom, pays, fiscal.tva, fiscal.siret,
    tel, adresse, cp, ville,
    memeNumero ? compte.tva_valide : 0,
    memeNumero ? (compte.tva_statut || nouveauStatut) : nouveauStatut,
    memeNumero ? compte.tva_verifiee_le || null : null,
    memeNumero ? compte.tva_preuve || null : null,
    memeNumero ? compte.tva_nom || null : (fiscal.nom || null),
    memeNumero ? compte.tva_motif || null
               : String(fiscal.message || "numéro modifié depuis l'espace client").slice(0, 400),
    compte.id
  ).run();

  return json({
    ok: true,
    message_fiscal: pays === "FR" ? (fiscal.message || null) : null,
    statut_fiscal: pays === "FR" ? (fiscal.statut || null) : null,
    avertissement: (pays === "FR" || fiscal.coherent) ? null
      : "Ce numéro ne passe pas le contrôle de cohérence. Vérifiez-le : une erreur empêcherait la facturation hors TVA.",
    avertissement_code: (pays === "FR" || fiscal.coherent) ? null : "tva_incoherente",
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
