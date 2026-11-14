/* ==========================================================================
   /api/carnet — la seule porte du carnet de terrain.

   GET  ?partie=etat       l'état partagé : membres, visites, ajouts
   GET  ?partie=catalogue  les tournées du secteur demandé
   POST {action: ...}      connexion, visite, ajout, retrait, déconnexion,
                           et le versement du catalogue, réservé à la
                           direction

   Tout exige le cookie de carnet, sauf la connexion elle-même. Une réponse
   sans session ne dit pas « interdit » : elle dit « connectez-vous », parce
   qu'un commercial dont la session a expiré en trois mois doit comprendre
   en une seconde ce qu'il a à faire.
   ========================================================================== */

import { json, erreur, origineSure, freinerIp, compteAdmin } from "../_commun.js";
import {
  tables, ouvrir, fermer, membreConnecte, cookieCarnet, cookieCarnetEfface, texte,
} from "../_carnet.js";

const STATUTS = ["", "vu", "cm", "rl", "no", "fe"];

/* --- lecture ------------------------------------------------------------ */

export async function onRequestGet({ request, env }) {
  if (!env.DB) return erreur("Base indisponible.", 503, "base");
  await tables(env.DB);

  const membre = await membreConnecte(request, env.DB);
  if (!membre) return json({ ok: false, raison: "session" }, 401);

  const url = new URL(request.url);
  const partie = url.searchParams.get("partie") || "etat";

  if (partie === "catalogue") {
    const secteur = texte(url.searchParams.get("secteur"), 60);
    if (secteur) {
      const l = await env.DB.prepare(
        "SELECT secteur, titre, commercial, donnees, maj FROM carnet_catalogue WHERE secteur = ?1"
      ).bind(secteur).first();
      if (!l) return json({ ok: true, secteur: null });
      return json({
        ok: true,
        secteur: { id: l.secteur, titre: l.titre, commercial: l.commercial,
                   jours: JSON.parse(l.donnees), maj: l.maj },
      });
    }
    /* Sans secteur précis : la liste des secteurs et leur date, pour que la
     * page sache lesquels recharger sans rapatrier tout le catalogue. */
    const r = await env.DB.prepare(
      "SELECT secteur, titre, commercial, maj FROM carnet_catalogue ORDER BY secteur"
    ).all();
    return json({ ok: true, secteurs: (r && r.results) || [] });
  }

  const [visites, ajouts, membres] = await Promise.all([
    env.DB.prepare(
      "SELECT salon, statut, note, relance, par, le FROM carnet_visites"
    ).all(),
    env.DB.prepare(
      "SELECT id, nom, adresse, cp, ville, tel, secteur, par, le FROM carnet_ajouts"
    ).all(),
    env.DB.prepare(
      "SELECT code, nom FROM carnet_membres WHERE actif = 1 ORDER BY nom"
    ).all(),
  ]);

  const parNom = {};
  for (const m of (membres && membres.results) || []) parNom[m.code] = m.nom;

  return json({
    ok: true,
    moi: { code: membre.code, nom: membre.nom, secteur: membre.secteur },
    membres: parNom,
    visites: (visites && visites.results) || [],
    ajouts: (ajouts && ajouts.results) || [],
    heure: new Date().toISOString(),
  });
}

/* --- écriture ----------------------------------------------------------- */

export async function onRequestPost({ request, env }) {
  if (!env.DB) return erreur("Base indisponible.", 503, "base");
  if (!origineSure(request)) return erreur("Requête refusée.", 403, "origine");
  await tables(env.DB);

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "corps"); }
  const action = String((corps && corps.action) || "");

  /* --- connexion : la seule action ouverte, donc la seule freinée ------- */
  if (action === "connexion") {
    if (await freinerIp(env.DB, request, "carnet", 12, 10)) {
      return erreur("Trop d'essais. Réessayez dans quelques minutes.", 429, "frein");
    }
    const code = texte(corps.code, 20).replace(/\D/g, "");
    if (code.length < 4) return json({ ok: false, raison: "code" }, 401);
    const m = await env.DB.prepare(
      "SELECT code, nom FROM carnet_membres WHERE code = ?1 AND actif = 1"
    ).bind(code).first();
    if (!m) return json({ ok: false, raison: "code" }, 401);
    const jeton = await ouvrir(env.DB, m.code);
    return json({ ok: true, nom: m.nom }, 200, { "set-cookie": cookieCarnet(jeton) });
  }

  if (action === "deconnexion") {
    await fermer(env.DB, request);
    return json({ ok: true }, 200, { "set-cookie": cookieCarnetEfface() });
  }

  /* --- versement du catalogue : direction seulement --------------------- */
  if (action === "catalogue") {
    const admin = await compteAdmin(request, env);
    if (!admin) return json({ ok: false, raison: "reserve" }, 404);
    const secteur = texte(corps.secteur, 60);
    if (!secteur) return erreur("Secteur manquant.", 400, "secteur");
    if (!Array.isArray(corps.jours)) return erreur("Journées manquantes.", 400, "jours");
    await env.DB.prepare(
      "INSERT INTO carnet_catalogue (secteur, titre, commercial, donnees, maj) " +
      "VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(secteur) DO UPDATE SET " +
      "titre = excluded.titre, commercial = excluded.commercial, " +
      "donnees = excluded.donnees, maj = excluded.maj"
    ).bind(secteur, texte(corps.titre, 120), texte(corps.commercial, 120),
           JSON.stringify(corps.jours), new Date().toISOString()).run();
    return json({ ok: true, secteur, arrets: corps.jours.reduce(
      (n, j) => n + ((j && j.s && j.s.length) || 0), 0) });
  }

  if (action === "membres") {
    const admin = await compteAdmin(request, env);
    if (!admin) return json({ ok: false, raison: "reserve" }, 404);
    if (!Array.isArray(corps.liste)) return erreur("Liste manquante.", 400, "liste");
    const lignes = corps.liste.map((m) => env.DB.prepare(
      "INSERT INTO carnet_membres (code, nom, secteur, actif, cree_le) " +
      "VALUES (?1, ?2, ?3, 1, ?4) ON CONFLICT(code) DO UPDATE SET " +
      "nom = excluded.nom, secteur = excluded.secteur, actif = 1"
    ).bind(texte(m.code, 20).replace(/\D/g, ""), texte(m.nom, 80),
           texte(m.secteur, 60), new Date().toISOString()));
    if (lignes.length) await env.DB.batch(lignes);
    return json({ ok: true, membres: lignes.length });
  }

  /* --- à partir d'ici, il faut être du carnet --------------------------- */
  const membre = await membreConnecte(request, env.DB);
  if (!membre) return json({ ok: false, raison: "session" }, 401);
  const maintenant = new Date().toISOString();

  if (action === "visite") {
    const salon = texte(corps.salon, 80);
    if (!salon) return erreur("Salon manquant.", 400, "salon");
    const statut = STATUTS.indexOf(String(corps.statut || "")) >= 0 ? String(corps.statut || "") : "";
    const note = texte(corps.note, 2000);
    const relance = texte(corps.relance, 10);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO carnet_visites (salon, statut, note, relance, par, le) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(salon) DO UPDATE SET " +
        "statut = excluded.statut, note = excluded.note, relance = excluded.relance, " +
        "par = excluded.par, le = excluded.le"
      ).bind(salon, statut, note, relance, membre.code, maintenant),
      /* L'historique garde tout, même quand l'état courant est écrasé. */
      env.DB.prepare(
        "INSERT INTO carnet_journal (salon, statut, note, par, le) VALUES (?1, ?2, ?3, ?4, ?5)"
      ).bind(salon, statut, note, membre.code, maintenant),
    ]);
    return json({ ok: true, le: maintenant });
  }

  if (action === "ajout") {
    const nom = texte(corps.nom, 120);
    if (!nom) return erreur("Nom manquant.", 400, "nom");
    const id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await env.DB.prepare(
      "INSERT INTO carnet_ajouts (id, nom, adresse, cp, ville, tel, secteur, par, le) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
    ).bind(id, nom, texte(corps.adresse, 160), texte(corps.cp, 12),
           texte(corps.ville, 80), texte(corps.tel, 40),
           texte(corps.secteur, 60), membre.code, maintenant).run();
    return json({ ok: true, id });
  }

  if (action === "retrait") {
    const id = texte(corps.id, 80);
    if (!id) return erreur("Identifiant manquant.", 400, "id");
    await env.DB.prepare("DELETE FROM carnet_ajouts WHERE id = ?1").bind(id).run();
    return json({ ok: true });
  }

  return erreur("Action inconnue.", 400, "action");
}

export async function onRequest() {
  return json({ ok: false, raison: "methode" }, 405);
}
