/* ==========================================================================
   INSCRIPTION — création d'un compte professionnel.
   Le compte ouvre l'accès aux prix : on recueille donc dès l'inscription
   l'identité complète de l'entreprise, pays d'abord, car c'est le pays qui
   décide de l'identifiant demandé (TVA en Belgique et au Luxembourg,
   SIRET en France).
   ========================================================================== */

import { controlerEtEnregistrer, ouvreDroitAExoneration } from "../_tva.js";
import { freinerIp, estAdresseAdmin,
  json, erreur, hacher, ouvrirSession, cookieSession,
  emailValide, cleEmail, motDePasseValide,
  paysValide, identifiantFiscal, texteValide,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500, "base_absente");

  /* Un robot ne crée pas mille comptes.
   *
   * Rien ne freinait l'inscription : ni plafond, ni vérification
   * d'adresse. Or chaque inscription ouvre une session valide, écrit une
   * ligne en base et déclenche un appel VIES sortant. C'est ce qui
   * rendait les autres défauts atteignables par un inconnu, et c'est
   * aussi, tout seul, de quoi remplir la base. */
  if (await freinerIp(db, request, "inscription", 5, 60)) {
    return erreur("Trop d'inscriptions depuis cette connexion. Réessayez plus tard.",
                  429, "trop_tentatives");
  }

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

  // Facultatif : utile pour vous joindre, pas assez pour bloquer l'inscription.
  const tel = texteValide(corps.telephone, 6, 30);

  const email = String(corps.email || "").trim();
  const mdp   = String(corps.motdepasse || "");
  if (!emailValide(email)) return erreur("Cette adresse e-mail n'est pas valide.", 400, "email_invalide");
  if (!motDePasseValide(mdp))
    return erreur("Le mot de passe doit faire au moins 8 caractères.", 400, "mdp_court");

  /* Une adresse d'administration ne s'inscrit pas.
   *
   * L'inscription ne vérifie pas qu'on possède l'adresse qu'on déclare —
   * aucun lien de confirmation n'est envoyé. Tant qu'il en est ainsi,
   * laisser créer un compte sur l'adresse de NBD reviendrait à distribuer
   * les clés : les pages réservées reconnaissent l'administratrice à son
   * adresse, et rien d'autre.
   *
   * Même message que pour une adresse déjà prise : qui tâtonne n'apprend
   * rien, là où « réservée » confirmerait la cible. */
  if (estAdresseAdmin(env, email)) {
    return erreur("Un compte existe déjà avec cette adresse.", 409, "email_pris");
  }

  const cle = cleEmail(email);

  const existe = await db.prepare("SELECT id FROM comptes WHERE email_cle = ?")
    .bind(cle).first();
  if (existe) {
    return erreur("Un compte existe déjà avec cette adresse. Connectez-vous.", 409, "compte_existe");
  }

  const empreinte = await hacher(mdp);
  const maintenant = new Date().toISOString();

  // tva_valide est posé à 0 ici, puis la vérification VIES le relève juste
  // après la création du compte. On ne la fait pas AVANT : une panne du
  // registre européen ne doit jamais empêcher quelqu'un de s'inscrire.
  const res = await db.prepare(`
    INSERT INTO comptes
      (email, email_cle, salon, prenom, nom, pays, tva, siret,
       telephone, adresse, code_postal, ville, mot_de_passe, cree_le, vu_le)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    email, cle, societe, prenom, nom, pays, fiscal.tva, fiscal.siret,
    tel, adresse, cp, ville, empreinte, maintenant, maintenant
  ).run();

  const compteId = res.meta.last_row_id;
  const jeton = await ouvrirSession(db, compteId);

  // Le registre européen, interrogé une fois le compte créé. Un numéro
  // français ou luxembourgeois confirmé ouvre l'autoliquidation dès la
  // première commande, sans intervention. Une panne de VIES laisse
  // simplement le compte en TVA belge, et le client pourra relancer la
  // vérification depuis son espace.
  let tva = { statut: "jamais", valide: false };
  try {
    tva = await controlerEtEnregistrer(db,
      { id: compteId, tva: fiscal.tva, siret: fiscal.siret, pays }, env);
  } catch (e) { /* l'inscription aboutit quoi qu'il arrive */ }

  // Le compte est créé et la session ouverte dans la foulée : lui redemander
  // son mot de passe juste après l'avoir choisi n'apporte rien.
  return json(
    {
      ok: true,
      compte: {
        email, salon: societe, prenom, nom, pays,
        tva: fiscal.tva, siret: fiscal.siret,
        tva_valide: tva.valide ? 1 : 0,
        tva_statut: tva.statut,
        exonere: ouvreDroitAExoneration(pays, tva.statut),
      },
      // Signalé à l'inscrit sans bloquer : une clé de contrôle fausse est
      // presque toujours une faute de frappe, et vaut mieux d'être corrigée
      // tout de suite que découverte au moment de facturer.
      avertissement: fiscal.coherent ? null
        : "Ce numéro ne passe pas le contrôle de cohérence. Vérifiez-le depuis votre compte : une erreur empêcherait la facturation hors TVA.",
      avertissement_code: fiscal.coherent ? null : "tva_incoherente_inscription",
    },
    201,
    { "set-cookie": cookieSession(jeton) }
  );
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
