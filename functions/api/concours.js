/* ==========================================================================
   /api/concours — inscription du public, décompte, et tirage réservé.

   GET  : le décompte de l'édition du jour. Public, sans donnée personnelle.
   POST {geste:"inscription"} : une participation.
   POST {geste:"tirage"}      : réservé aux administrateurs.

   Les données personnelles ne sortent JAMAIS par la porte publique : le
   décompte dit « 143 participants », jamais qui. La liste n'est lisible
   que par un compte administrateur connecté.
   ========================================================================== */

import {
  json, erreur, emailValide, texteValide, origineSure, freinerIp,
  adresseIp, compteAdmin,
} from "../_commun.js";
import {
  preparer, cleTelephone, cleCourriel, editionDuJour, tirerUnBillet, etat,
  CHANCES_MAX,
} from "../_concours.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return erreur("Base indisponible.", 503, "base");
  await preparer(env.DB);

  const edition = editionDuJour();
  const compteur = await etat(env.DB, edition);

  const admin = await compteAdmin(request, env);
  if (!admin) return json({ ok: true, edition, ...compteur });

  const liste = await env.DB
    .prepare(
      "SELECT id, cree_le, prenom, nom, email, telephone, chances, instagram, salon, gagnant" +
      " FROM concours_participants WHERE edition = ? ORDER BY id DESC LIMIT 500"
    )
    .bind(edition)
    .all();
  const tirages = await env.DB
    .prepare("SELECT * FROM concours_tirages ORDER BY id DESC LIMIT 20")
    .all();

  return json({
    ok: true, edition, ...compteur, admin: true,
    participants_liste: (liste && liste.results) || [],
    tirages: (tirages && tirages.results) || [],
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return erreur("Base indisponible.", 503, "base");
  if (!origineSure(request)) return erreur("Origine refusée.", 403, "origine");
  await preparer(env.DB);

  let corps = {};
  try { corps = await request.json(); } catch (e) { corps = {}; }
  const geste = String(corps.geste || "inscription");

  if (geste === "tirage") return tirage(request, env, corps);
  return inscription(request, env, corps);
}

/* --- Inscription --------------------------------------------------------- */

async function inscription(request, env, corps) {
  /* Le piège à robots : un champ que personne ne voit et que seul un
     automate remplit. On répond « merci » sans rien enregistrer — dire
     non apprendrait au robot à mieux s'y prendre. */
  if (String(corps.societe_web || "").trim()) {
    return json({ ok: true, deja: false, chances: 1, leurre: true });
  }

  /* 40 inscriptions par heure et par adresse réseau. Volontairement haut :
     sur le wifi d'un salon, cent visiteurs partagent une seule adresse, et
     un seuil serré bloquerait de vrais participants. */
  if (await freinerIp(env.DB, request, "concours", 40, 60)) {
    return erreur("Trop d'inscriptions depuis ce réseau, réessayez dans un moment.", 429, "frein");
  }

  const prenom = texteValide(corps.prenom, 2, 40);
  const nom = texteValide(corps.nom, 2, 40);
  const email = String(corps.email || "").trim();
  const telephone = texteValide(corps.telephone, 6, 24);

  if (!prenom || !nom) return erreur("Prénom et nom sont nécessaires.", 400, "nom");
  if (!emailValide(email)) return erreur("Cette adresse e-mail n'a pas l'air valide.", 400, "email");
  if (!telephone) return erreur("Un numéro de téléphone est nécessaire.", 400, "tel");

  const telCle = cleTelephone(telephone);
  if (!telCle) return erreur("Ce numéro de téléphone n'a pas l'air valide.", 400, "tel");
  const mailCle = cleCourriel(email);

  /* Une chance par produit acheté, et au moins une pour tout le monde :
     participer reste gratuit. Le plafond évite le « j'en ai acheté 300 ». */
  let chances = parseInt(corps.chances, 10);
  if (!Number.isFinite(chances) || chances < 1) chances = 1;
  if (chances > CHANCES_MAX) chances = CHANCES_MAX;

  const edition = editionDuJour();
  const maintenant = new Date().toISOString();

  try {
    await env.DB
      .prepare(
        "INSERT INTO concours_participants" +
        " (cree_le, edition, prenom, nom, email, email_cle, telephone, telephone_cle," +
        "  chances, instagram, salon, ip)" +
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
      )
      .bind(
        maintenant, edition, prenom, nom, email, mailCle, telephone, telCle,
        chances, corps.instagram ? 1 : 0,
        texteValide(corps.salon, 2, 60) || null,
        adresseIp(request)
      )
      .run();
  } catch (e) {
    /* L'index unique a parlé : ce téléphone ou cette adresse est déjà
       inscrit. On le dit gentiment et on renvoie ses chances — le
       participant croit souvent que sa première tentative a échoué. */
    /* Le doublon se cherche DANS LA JOURNÉE : quelqu'un inscrit hier a le
       droit de revenir aujourd'hui, et doit repartir avec ses nouvelles
       chances, pas avec celles de la veille. */
    const deja = await env.DB
      .prepare(
        "SELECT prenom, chances FROM concours_participants" +
        " WHERE edition = ? AND (telephone_cle = ? OR email_cle = ?) LIMIT 1"
      )
      .bind(edition, telCle, mailCle)
      .first();
    if (deja) {
      return json({ ok: true, deja: true, prenom: deja.prenom, chances: deja.chances });
    }
    return erreur("L'inscription n'a pas pu être enregistrée.", 500, "ecriture");
  }

  const compteur = await etat(env.DB, edition);
  return json({ ok: true, deja: false, prenom, chances, ...compteur });
}

/* --- Tirage -------------------------------------------------------------- */

async function tirage(request, env, corps) {
  const admin = await compteAdmin(request, env);
  /* 404 et non 403 : dire « interdit » confirmerait que le tirage existe. */
  if (!admin) return erreur("Introuvable.", 404, "introuvable");

  /* Par défaut on tire sur l'édition du jour. Un salon de deux jours fait
     donc deux tirages distincts, sans mélanger les journées. */
  const edition = texteValide(corps.edition, 4, 10) || editionDuJour();

  const r = await env.DB
    .prepare(
      "SELECT id, prenom, nom, telephone, email, chances FROM concours_participants" +
      " WHERE edition = ? AND gagnant = 0"
    )
    .bind(edition)
    .all();
  const lignes = (r && r.results) || [];
  if (!lignes.length) return erreur("Aucun participant à tirer pour cette édition.", 400, "vide");

  const gagnant = tirerUnBillet(lignes);
  if (!gagnant) return erreur("Le tirage n'a rien rendu.", 500, "tirage");

  const chancesTotal = lignes.reduce((s, l) => s + Math.max(1, l.chances | 0), 0);
  const maintenant = new Date().toISOString();

  /* Le gagnant est marqué AVANT d'être annoncé : si la page est rechargée,
     on ne retire pas quelqu'un d'autre. Un tirage qu'on peut relancer
     discrètement n'est pas un tirage. */
  await env.DB
    .prepare("UPDATE concours_participants SET gagnant = 1, tire_le = ? WHERE id = ?")
    .bind(maintenant, gagnant.id)
    .run();

  await env.DB
    .prepare(
      "INSERT INTO concours_tirages" +
      " (fait_le, fait_par, edition, participant_id, nom, telephone, chances," +
      "  participants_total, chances_total) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .bind(
      maintenant, admin.email, edition, gagnant.id,
      gagnant.prenom + " " + gagnant.nom, gagnant.telephone, gagnant.chances,
      lignes.length, chancesTotal
    )
    .run();

  return json({
    ok: true,
    gagnant: {
      prenom: gagnant.prenom, nom: gagnant.nom,
      telephone: gagnant.telephone, email: gagnant.email,
      chances: gagnant.chances,
    },
    edition,
    participants_total: lignes.length,
    chances_total: chancesTotal,
    fait_le: maintenant,
  });
}
