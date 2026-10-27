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
      "note TEXT, " +
      "cree_le TEXT NOT NULL, " +
      "vu_le TEXT)"
  );
  tablePrete = true;
}

export async function enregistrer(db, p) {
  await preparerTable(db);
  const maintenant = new Date().toISOString();
  await db.prepare(
    "INSERT INTO paiements (mollie_id, ref, compte_id, odoo_order_id, odoo_nom, " +
    "montant, devise, statut, cree_le, vu_le) VALUES (?, ?, ?, ?, ?, ?, ?, 'ouvert', ?, ?)"
  ).bind(
    p.mollie_id, p.ref, p.compte_id, p.odoo_order_id, p.odoo_nom || null,
    p.montant, p.devise || "EUR", maintenant, maintenant
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
 * Marque le paiement comme traité, et ne le fait qu'une fois.
 *
 * La condition « traite_le IS NULL » est dans la requête elle-même, pas
 * dans un test préalable : deux notifications arrivées en même temps
 * liraient toutes les deux « pas encore traité » avant que l'une n'écrive.
 * Ici, la base tranche, et le nombre de lignes modifiées dit laquelle des
 * deux a gagné.
 *
 * @returns true si c'est CET appel qui a pris la main.
 */
export async function prendreLaMain(db, mollieId) {
  await preparerTable(db);
  const r = await db.prepare(
    "UPDATE paiements SET traite_le = ? WHERE mollie_id = ? AND traite_le IS NULL"
  ).bind(new Date().toISOString(), mollieId).run();
  const change = r && r.meta ? (r.meta.changes || r.meta.rows_written || 0) : 0;
  return change > 0;
}

/** En cas d'échec après avoir pris la main : on rend la main. */
export async function rendreLaMain(db, mollieId) {
  await preparerTable(db);
  await db.prepare("UPDATE paiements SET traite_le = NULL WHERE mollie_id = ?")
    .bind(mollieId).run();
}
