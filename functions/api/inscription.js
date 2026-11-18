/* ==========================================================================
   INSCRIPTION — création d'un compte professionnel.
   Le compte ouvre l'accès aux prix : on recueille donc dès l'inscription
   l'identité complète de l'entreprise, pays d'abord, car c'est le pays qui
   décide de l'identifiant demandé (TVA en Belgique et au Luxembourg,
   SIRET en France).
   ========================================================================== */

import { controlerEtEnregistrer, ouvreDroitAExoneration } from "../_tva.js";
import { resoudreFrance } from "../_registre_fr.js";
import { freinerIp, estAdresseAdmin,
  json, erreur, hacher, ouvrirSession, cookieSession,
  emailValide, cleEmail, motDePasseValide,
  paysValide, identifiantFiscal, texteValide,
} from "../_commun.js";

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  /* Lié à son contexte : waitUntil déstructuré perd son destinataire.
     Il sert à la vérification par le relais, qui prend quinze secondes et
     n'a donc rien à faire devant quelqu'un qui s'inscrit. */
  const attendre = (p) => { try { ctx.waitUntil(p); } catch (e) { /* tant pis */ } };
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

  /* L'IDENTIFIANT FISCAL, ET POUR LA FRANCE LE REGISTRE.
   *
   * Jusqu'au 18 novembre 2026, le site calculait ici le numéro de TVA
   * français à partir du SIRET. Il le demande maintenant à la France.
   *
   * Une panne du registre ne bloque pas l'inscription : resoudreFrance()
   * rend alors « a_corriger », le compte se crée sans numéro, la TVA
   * s'applique, et la prochaine vérification rattrape. Perdre une
   * inscription coûte plus cher qu'une facture à corriger. */
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
  if (pays === "FR" && (fiscal.statut === "sans_numero" || fiscal.statut === "a_corriger")) {
    /* La France a déjà tranché : cette entreprise n'a pas de numéro
     * intracommunautaire, ou son identifiant est à corriger. Interroger
     * le registre européen avec un SIRET ne voudrait rien dire et
     * rendrait « invalide » — ce qui laisse croire à un numéro refusé là
     * où il n'y a tout simplement pas de numéro. La nuance compte : l'une
     * est une anomalie à traiter, l'autre est la franchise en base, et
     * c'est normal. */
    tva = { statut: fiscal.statut, valide: false };
    try {
      await db.prepare(
        "UPDATE comptes SET tva_valide = 0, tva_statut = ?, tva_verifiee_le = ?, " +
        "tva_nom = ?, tva_motif = ? WHERE id = ?"
      ).bind(fiscal.statut, maintenant, fiscal.nom || null,
             String(fiscal.revendique
               ? "numéro revendiqué par le client, non déclaré au registre : " + fiscal.revendique
               : (fiscal.message || "")).slice(0, 400),
             compteId).run();
    } catch (e) { /* l'inscription aboutit quoi qu'il arrive */ }
  } else {
    try {
      tva = await controlerEtEnregistrer(db,
        { id: compteId, tva: fiscal.tva, siret: fiscal.siret, pays }, env);
    } catch (e) { /* l'inscription aboutit quoi qu'il arrive */ }
  }

  /* ========================================================================
     LA VÉRIFICATION PAR LE RELAIS, APRÈS LA RÉPONSE.

     Ce qui précède a interrogé les deux portes du registre européen, et
     depuis Cloudflare elles éconduisent l'appel en soixante-quinze
     millisecondes : le compte repart donc « indisponible », en TVA belge,
     alors que le numéro est peut-être parfaitement valide. C'est exactement
     la mécanique qui a produit les factures à corriger et les notes de
     crédit du 18 novembre.

     Le relais, lui, obtient la réponse — en quinze secondes. Personne ne
     peut attendre quinze secondes devant un formulaire d'inscription, mais
     personne n'a besoin d'attendre : entre l'inscription et la première
     commande il s'écoule des minutes au mieux. On répond donc tout de
     suite, et la vérification se fait derrière, pendant que le client
     découvre la boutique. Quand il arrive au panier, son compte est déjà
     exonéré s'il doit l'être.

     On ne le fait QUE s'il reste quelque chose à gagner : un numéro déjà
     confirmé n'a pas à être redemandé, et la France ayant déjà tranché sur
     une absence de numéro, il n'y a rien à vérifier.
     ===================================================================== */
  const aGagner = (pays === "FR" || pays === "LU")
    && !!(fiscal.tva || fiscal.siret)
    && !tva.valide
    && fiscal.statut !== "sans_numero" && fiscal.statut !== "a_corriger";

  if (aGagner && env.CLE_VATSENSE) {
    attendre((async () => {
      try {
        await controlerEtEnregistrer(db,
          { id: compteId, tva: fiscal.tva, siret: fiscal.siret, pays }, env,
          /* Une seule tentative sur les portes officielles : on sait
             qu'elles vont refuser, inutile d'insister trois fois avant
             d'arriver au relais. */
          { tentatives: 1, delaiMs: 4000, relais: true,
            cleRelais: String(env.CLE_VATSENSE || ""), delaiRelaisMs: 25000 });
      } catch (e) { /* le rattrapage de nuit repassera */ }
    })());
  }

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
      /* Ce que le registre français a répondu, dit au client dans ses
       * mots. C'est la pièce qui manquait le plus : un coiffeur en
       * franchise en base voyait la TVA sur sa facture sans comprendre
       * pourquoi, et nous non plus. Maintenant il le lit à l'inscription. */
      /* LA PHRASE QUI MANQUAIT, et qui vaut une note de crédit évitée.
       *
       * Un professionnel français ou luxembourgeois dont le numéro part en
       * vérification voit la TVA belge s'il commande dans la minute. Jusqu'ici
       * il la découvrait sur sa facture, sans explication, et c'est comme ça
       * qu'on se retrouve à émettre des notes de crédit et à passer une
       * journée à démêler des factures. Maintenant il est prévenu avant, et
       * il sait que c'est provisoire.
       *
       * Elle s'ajoute au message du registre français plutôt que de le
       * remplacer : les deux comptent, et le second explique le premier. */
      message_fiscal: messageFiscal(pays, fiscal, aGagner && !!env.CLE_VATSENSE),
      statut_fiscal: pays === "FR" ? (fiscal.statut || null) : null,
      // Signalé à l'inscrit sans bloquer : une clé de contrôle fausse est
      // presque toujours une faute de frappe, et vaut mieux d'être corrigée
      // tout de suite que découverte au moment de facturer. En France, le
      // registre a déjà répondu : son message vaut mieux que ce contrôle.
      avertissement: (pays === "FR" || fiscal.coherent) ? null
        : "Ce numéro ne passe pas le contrôle de cohérence. Vérifiez-le depuis votre compte : une erreur empêcherait la facturation hors TVA.",
      avertissement_code: (pays === "FR" || fiscal.coherent) ? null : "tva_incoherente_inscription",
    },
    201,
    { "set-cookie": cookieSession(jeton) }
  );
}

/**
 * Ce qu'on dit à l'inscrit de sa situation fiscale, en un seul message.
 *
 * Deux choses peuvent devoir être dites, et elles se complètent : ce que le
 * registre français a répondu sur son numéro, et le fait qu'une vérification
 * européenne est en cours. La seconde seule laisserait croire à une anomalie ;
 * la première seule laisserait découvrir la TVA sur la facture.
 */
function messageFiscal(pays, fiscal, verificationLancee) {
  const bouts = [];
  if (pays === "FR" && fiscal && fiscal.message) bouts.push(String(fiscal.message));

  if (verificationLancee) {
    bouts.push(
      "Nous vérifions votre numéro de TVA auprès du registre européen ; "
      + "cela prend moins d'une minute. Si vous commandez avant la fin de "
      + "cette vérification, la TVA belge sera appliquée par précaution et "
      + "vous sera remboursée : la facture sera corrigée."
    );
  }

  return bouts.length ? bouts.join(" ") : null;
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
