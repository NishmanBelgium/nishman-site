/* ==========================================================================
   LE CARNET DE TERRAIN

   Six commerciaux sur la route, une seule mémoire. Chacun ouvre le carnet
   sur son téléphone, voit sa tournée du jour, et note ce qu'il a trouvé.
   Ce qu'il écrit, les autres le voient.

   DEUX CHOIX DE DÉPART, ET LEURS RAISONS.

   1. LE CATALOGUE N'EST PAS DANS LE CODE. Les tournées contiennent le nom
      des clients, ce qu'ils ont acheté, et la liste des salons démarchés.
      Le dépôt de ce site est public : y déposer ces données reviendrait à
      publier le fichier commercial. Elles vivent donc dans la base, et
      n'en sortent que pour quelqu'un qui a donné son code.

   2. PAS DE COMPTE, UN CODE. Les commerciaux n'ont pas de compte sur le
      site et n'en auront pas : un mot de passe oublié un mardi matin sur
      la route, c'est une journée perdue. Un code à six chiffres, donné par
      la direction, ouvre le carnet pour trois mois. Le code identifie
      aussi l'auteur de chaque note — c'est ce qui permet de savoir qui est
      passé où.

   RIEN ICI NE TOUCHE AU RESTE DU SITE. Toutes les tables commencent par
   carnet_, toutes les adresses par /carnet ou /api/carnet. Le catalogue,
   les prix, les commandes et les comptes professionnels ne connaissent pas
   ce fichier et ne le chargent jamais.
   ========================================================================== */

import { nouveauJeton, empreinteJeton } from "./_commun.js";

/** Trois mois : assez long pour ne jamais gêner, assez court pour qu'un
 *  téléphone perdu finisse par se refermer tout seul. */
const DUREE_JOURS = 90;

let tablesFaites = false;

/**
 * Crée les tables au premier appel, puis plus jamais.
 *
 * Le site n'a pas de système de migrations : chaque module crée ce dont il
 * a besoin, en IF NOT EXISTS. On suit la même règle plutôt que d'en
 * inventer une autre pour un seul écran.
 */
export async function tables(db) {
  if (tablesFaites) return;
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS carnet_membres (" +
      "code TEXT PRIMARY KEY, nom TEXT NOT NULL, secteur TEXT, " +
      "actif INTEGER NOT NULL DEFAULT 1, cree_le TEXT)"
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS carnet_sessions (" +
      "empreinte TEXT PRIMARY KEY, code TEXT NOT NULL, expire_le TEXT NOT NULL)"
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS carnet_catalogue (" +
      "secteur TEXT PRIMARY KEY, titre TEXT, commercial TEXT, " +
      "donnees TEXT NOT NULL, maj TEXT)"
    ),
    /* L'état courant d'un salon : une ligne par salon, écrasée à chaque
     * passage. C'est ce que l'écran affiche. */
    db.prepare(
      "CREATE TABLE IF NOT EXISTS carnet_visites (" +
      "salon TEXT PRIMARY KEY, statut TEXT, note TEXT, relance TEXT, " +
      "par TEXT, le TEXT)"
    ),
    /* L'historique : une ligne par passage, jamais écrasée. Sans lui, un
     * commercial qui corrige un statut effacerait la trace du précédent,
     * et on perdrait justement ce qu'on cherche à construire. */
    db.prepare(
      "CREATE TABLE IF NOT EXISTS carnet_journal (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, salon TEXT NOT NULL, " +
      "statut TEXT, note TEXT, par TEXT, le TEXT)"
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS carnet_ajouts (" +
      "id TEXT PRIMARY KEY, nom TEXT NOT NULL, adresse TEXT, cp TEXT, " +
      "ville TEXT, tel TEXT, secteur TEXT, par TEXT, le TEXT)"
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS carnet_journal_salon ON carnet_journal (salon)"
    ),
  ]);
  tablesFaites = true;
}

export function cookieCarnet(jeton) {
  const secondes = DUREE_JOURS * 24 * 3600;
  return "carnet=" + jeton + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + secondes;
}

export function cookieCarnetEfface() {
  return "carnet=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function lireCarnet(requete) {
  const brut = requete.headers.get("cookie") || "";
  for (const part of brut.split(";")) {
    const [cle, ...reste] = part.trim().split("=");
    if (cle === "carnet") return reste.join("=");
  }
  return "";
}

/** Ouvre une session pour ce code et rend le jeton à poser en cookie. */
export async function ouvrir(db, code) {
  const jeton = nouveauJeton();
  const empreinte = await empreinteJeton(jeton);
  const expire = new Date(Date.now() + DUREE_JOURS * 86400000).toISOString();
  await db.prepare(
    "INSERT OR REPLACE INTO carnet_sessions (empreinte, code, expire_le) VALUES (?1, ?2, ?3)"
  ).bind(empreinte, code, expire).run();
  return jeton;
}

/**
 * Le membre connecté, ou null.
 *
 * Le jeton n'est pas stocké tel quel : on garde son empreinte, pour qu'une
 * copie de la base ne donne pas les sessions en clair. Même principe que
 * les sessions du site.
 */
export async function membreConnecte(requete, db) {
  const jeton = lireCarnet(requete);
  if (!jeton) return null;
  const empreinte = await empreinteJeton(jeton);
  const ligne = await db.prepare(
    "SELECT s.code AS code, m.nom AS nom, m.secteur AS secteur, s.expire_le AS expire_le " +
    "FROM carnet_sessions s JOIN carnet_membres m ON m.code = s.code " +
    "WHERE s.empreinte = ?1 AND m.actif = 1"
  ).bind(empreinte).first();
  if (!ligne) return null;
  if (new Date(ligne.expire_le).getTime() < Date.now()) {
    await db.prepare("DELETE FROM carnet_sessions WHERE empreinte = ?1").bind(empreinte).run();
    return null;
  }
  return { code: ligne.code, nom: ligne.nom, secteur: ligne.secteur };
}

export async function fermer(db, requete) {
  const jeton = lireCarnet(requete);
  if (!jeton) return;
  const empreinte = await empreinteJeton(jeton);
  await db.prepare("DELETE FROM carnet_sessions WHERE empreinte = ?1").bind(empreinte).run();
}

/** Texte accepté : borné, débarrassé des espaces de bord. */
export function texte(v, max) {
  const s = String(v == null ? "" : v).trim();
  return s.length > max ? s.slice(0, max) : s;
}
