/* ==========================================================================
   LE REGISTRE DES DEVIS.

   Un devis part vers Odoo et n'en revient qu'avec son numéro. Odoo en
   garde la trace, mais Odoo contient aussi tout ce qui s'est vendu
   ailleurs — au salon, au téléphone, en direct — et le tableau de bord
   du site ne doit montrer que ce que le site a produit. Sans registre
   local, la question « combien de devis le site a-t-il sortis cette
   semaine ? » n'a tout simplement pas de réponse.

   D'où cette table. Elle ne duplique pas Odoo : elle note qui a demandé
   quoi et quand, du côté du site. Le devis lui-même, ses lignes et son
   suivi commercial restent chez Odoo, qui est leur place.

   Une écriture qui échoue ne doit jamais empêcher un devis de partir :
   le client a rempli son panier, il attend son document, et un registre
   est un confort de pilotage, pas une étape de la commande. Toutes les
   écritures sont donc silencieuses en cas d'échec.
   ========================================================================== */

let tablePrete = false;

export async function preparerDevis(db) {
  if (tablePrete || !db) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS devis (" +
      "ref TEXT PRIMARY KEY, " +
      "compte_id INTEGER NOT NULL DEFAULT 0, " +
      "client TEXT, " +
      "email TEXT, " +
      "pays TEXT, " +
      "montant TEXT NOT NULL DEFAULT '0', " +
      "devise TEXT NOT NULL DEFAULT 'EUR', " +
      "retrait INTEGER NOT NULL DEFAULT 0, " +
      "lignes INTEGER NOT NULL DEFAULT 0, " +
      "cree_le TEXT NOT NULL)"
  );
  try {
    await db.exec("CREATE INDEX IF NOT EXISTS devis_jour ON devis (cree_le)");
  } catch (e) { /* l'index existe déjà */ }
  tablePrete = true;
}

/** Noter un devis qui vient de partir.
 *
 * « INSERT OR REPLACE » plutôt qu'un simple INSERT : si le portier
 * renvoie deux fois le même numéro — ce qui arrive quand une requête est
 * rejouée — on veut une ligne, pas une erreur qui remonterait jusqu'au
 * client alors que son devis est bien parti. */
export async function noterDevis(db, d) {
  if (!db || !d || !d.ref) return;
  try {
    await preparerDevis(db);
    await db
      .prepare(
        "INSERT OR REPLACE INTO devis " +
          "(ref, compte_id, client, email, pays, montant, devise, retrait, lignes, cree_le) " +
          "VALUES (?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?)"
      )
      .bind(
        String(d.ref).slice(0, 40),
        Number(d.compte_id) || 0,
        String(d.client || "").slice(0, 160),
        String(d.email || "").slice(0, 160),
        String(d.pays || "").slice(0, 4),
        String(d.montant || "0").slice(0, 20),
        d.retrait ? 1 : 0,
        Number(d.lignes) || 0,
        d.cree_le || new Date().toISOString()
      )
      .run();
  } catch (e) {
    /* Le devis est parti : c'est ce qui compte. Le registre se rattrapera
       au suivant. */
  }
}

/** Le compte des devis, jour par jour, pour la colonne du journal. */
export async function devisParJour(db, depuis, jusqua) {
  if (!db) return [];
  try {
    await preparerDevis(db);
    const r = await db
      .prepare(
        "SELECT substr(cree_le, 1, 10) AS jour, COUNT(*) AS n, " +
          "COALESCE(SUM(CAST(montant AS REAL)), 0) AS montant " +
          "FROM devis WHERE substr(cree_le, 1, 10) BETWEEN ? AND ? " +
          "GROUP BY jour ORDER BY jour"
      )
      .bind(depuis, jusqua)
      .all();
    return (r && r.results) || [];
  } catch (e) {
    return [];
  }
}

/** La liste des devis émis sur la période, du plus récent au plus ancien.
 *
 * Plafonnée : une page qui déroule mille lignes ne se lit pas, et la
 * période se resserre quand on cherche loin. */
export async function lireDevis(db, depuis, jusqua, limite = 200) {
  if (!db) return { total: 0, montant: 0, liste: [] };
  try {
    await preparerDevis(db);
    const [totaux, liste] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS n, COALESCE(SUM(CAST(montant AS REAL)), 0) AS montant " +
            "FROM devis WHERE substr(cree_le, 1, 10) BETWEEN ? AND ?"
        )
        .bind(depuis, jusqua)
        .all(),
      db
        .prepare(
          "SELECT ref, client, email, pays, montant, retrait, lignes, cree_le " +
            "FROM devis WHERE substr(cree_le, 1, 10) BETWEEN ? AND ? " +
            "ORDER BY cree_le DESC LIMIT " + Number(limite)
        )
        .bind(depuis, jusqua)
        .all(),
    ]);
    const t = (totaux && totaux.results && totaux.results[0]) || {};
    return {
      total: Number(t.n || 0),
      montant: Math.round(Number(t.montant || 0) * 100) / 100,
      liste: (liste && liste.results) || [],
    };
  } catch (e) {
    return { total: 0, montant: 0, liste: [] };
  }
}
