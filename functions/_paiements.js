/* ==========================================================================
   PAIEMENTS — le registre qui relie Mollie à Odoo.

   Un paiement en ligne n'est pas un instant, c'est une période : le client
   part chez sa banque, revient peut-être, et Mollie nous prévient quand il
   veut — parfois deux fois, parfois avant que le client ne soit revenu.

   Ce module tient la trace qui permet de s'y retrouver, et surtout de ne
   déclencher la suite QU'UNE SEULE FOIS. Une notification ignorée se
   rattrape ; une facture émise deux fois se rattrape beaucoup moins bien.

   La table est créée à la volée si elle n'existe pas : le site ne doit pas
   dépendre d'une migration lancée à la main pour fonctionner. Le fichier
   base/migration-236.sql reste la référence lisible du schéma.
   ========================================================================== */

let tablePrete = false;

export async function preparerTable(db) {
  if (tablePrete || !db) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS paiements (" +
      "mollie_id TEXT PRIMARY KEY, " +
      "ref TEXT NOT NULL, " +
      "compte_id INTEGER NOT NULL, " +
      "odoo_order_id INTEGER NOT NULL, " +
      "odoo_nom TEXT, " +
      "montant TEXT NOT NULL, " +
      "devise TEXT NOT NULL DEFAULT 'EUR', " +
      "statut TEXT NOT NULL DEFAULT 'ouvert', " +
      "traite_le TEXT, " +
      "etape TEXT NOT NULL DEFAULT 'rien', " +
      "facture_id INTEGER, " +
      "facture_nom TEXT, " +
      "note TEXT, " +
      "cree_le TEXT NOT NULL, " +
      "vu_le TEXT)"
  );
  // Les colonnes ajoutées après coup, pour les bases créées avant elles.
  // SQLite ne connaît pas « ADD COLUMN IF NOT EXISTS » : on tente, et
  // l'échec signifie simplement que la colonne est déjà là.
  for (const sql of [
    "ALTER TABLE paiements ADD COLUMN etape TEXT NOT NULL DEFAULT 'rien'",
    "ALTER TABLE paiements ADD COLUMN facture_id INTEGER",
    "ALTER TABLE paiements ADD COLUMN facture_nom TEXT",
    "ALTER TABLE paiements ADD COLUMN relais_id INTEGER",
    "ALTER TABLE paiements ADD COLUMN suivi TEXT",
  ]) {
    try { await db.exec(sql); } catch (e) { /* colonne déjà présente */ }
  }
  tablePrete = true;
}

/**
 * Où en est la suite après paiement.
 *
 *   rien        le paiement n'est pas encore confirmé
 *   confirmee   la commande est passée en commande client dans Odoo
 *   facturee    la facture existe et est comptabilisée
 *   lettree     le paiement est enregistré sur la facture — ou le lettrage
 *               a été écarté faute de journal configuré, ce qui est dit
 *   envoyee     la facture est partie chez le client
 *   expediee    l'étiquette est créée et le suivi est dans Odoo
 *   fini        plus rien à faire
 *
 * L'ordre compte : chaque étape suppose la précédente. Reprendre une suite
 * interrompue consiste à repartir de l'étape atteinte, pas du début.
 *
 * Il existe une étape de plus, « abandon », qui ne figure pas dans cette
 * liste parce qu'elle n'est pas sur le chemin : c'est celle d'un paiement
 * annulé, expiré ou refusé, dont le devis a été retiré. Elle est terminale
 * comme « fini », mais pour l'autre issue, et la laisser hors de l'ordre
 * évite qu'une reprise ne la prenne pour une étape à dépasser.
 */
export const ETAPES = ["rien", "confirmee", "facturee", "lettree", "envoyee", "expediee", "fini"];

export async function noterEtape(db, mollieId, etape, extra) {
  await preparerTable(db);
  const champs = ["etape = ?", "vu_le = ?"];
  const vals = [etape, new Date().toISOString()];
  if (extra && extra.facture_id) { champs.push("facture_id = ?"); vals.push(extra.facture_id); }
  if (extra && extra.facture_nom) { champs.push("facture_nom = ?"); vals.push(extra.facture_nom); }
  if (extra && extra.suivi) { champs.push("suivi = ?"); vals.push(extra.suivi); }
  if (extra && extra.note !== undefined) { champs.push("note = ?"); vals.push(extra.note); }
  vals.push(mollieId);
  await db.prepare("UPDATE paiements SET " + champs.join(", ") + " WHERE mollie_id = ?")
    .bind(...vals).run();
}

export async function enregistrer(db, p) {
  await preparerTable(db);
  const maintenant = new Date().toISOString();
  await db.prepare(
    "INSERT INTO paiements (mollie_id, ref, compte_id, odoo_order_id, odoo_nom, " +
    "montant, devise, statut, relais_id, cree_le, vu_le) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'ouvert', ?, ?, ?)"
  ).bind(
    p.mollie_id, p.ref, p.compte_id, p.odoo_order_id, p.odoo_nom || null,
    p.montant, p.devise || "EUR", p.relais_id || null, maintenant, maintenant
  ).run();
}

export async function lire(db, mollieId) {
  await preparerTable(db);
  return db.prepare("SELECT * FROM paiements WHERE mollie_id = ?").bind(mollieId).first();
}

export async function lireParRef(db, ref, compteId) {
  await preparerTable(db);
  return db.prepare(
    "SELECT * FROM paiements WHERE ref = ? AND compte_id = ? ORDER BY cree_le DESC LIMIT 1"
  ).bind(ref, compteId).first();
}

export async function majStatut(db, mollieId, statut, note) {
  await preparerTable(db);
  await db.prepare(
    "UPDATE paiements SET statut = ?, vu_le = ?, note = COALESCE(?, note) WHERE mollie_id = ?"
  ).bind(statut, new Date().toISOString(), note || null, mollieId).run();
}

/**
 * Prend la main sur un paiement pour en traiter la suite, et une seule
 * fois à la fois.
 *
 * La condition est dans la requête elle-même, pas dans un test préalable :
 * deux notifications arrivées en même temps liraient toutes les deux
 * « personne ne s'en occupe » avant que l'une n'écrive. Ici c'est la base
 * qui tranche, et le nombre de lignes modifiées dit laquelle a gagné.
 *
 * La main se périme au bout de deux minutes. Sans cela, une fonction
 * interrompue au mauvais moment — le réseau qui coupe, Cloudflare qui
 * arrête l'exécution — laisserait le paiement verrouillé pour toujours, et
 * la suite ne reprendrait jamais. Mieux vaut un verrou qui s'use qu'un
 * verrou qui bloque.
 *
 * @returns true si c'est CET appel qui a pris la main.
 */
const BAIL_MS = 2 * 60 * 1000;

export async function prendreLaMain(db, mollieId) {
  await preparerTable(db);
  const maintenant = new Date();
  const perime = new Date(maintenant.getTime() - BAIL_MS).toISOString();
  const r = await db.prepare(
    "UPDATE paiements SET traite_le = ? WHERE mollie_id = ? " +
    "AND (traite_le IS NULL OR traite_le < ?)"
  ).bind(maintenant.toISOString(), mollieId, perime).run();
  const change = r && r.meta ? (r.meta.changes || r.meta.rows_written || 0) : 0;
  return change > 0;
}

/** Le travail est fini ou abandonné : on rend la main pour la reprise. */
export async function rendreLaMain(db, mollieId) {
  await preparerTable(db);
  await db.prepare("UPDATE paiements SET traite_le = NULL WHERE mollie_id = ?")
    .bind(mollieId).run();
}
