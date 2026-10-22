-- Étape 204 — trace des rapprochements entre un compte du site et une fiche
-- client Odoo. Le rapprochement se fait tout seul ; cette table garde qui a
-- été relié à quoi, sur quel critère et quand, pour qu'un cas douteux puisse
-- être retrouvé même si le courriel d'alerte s'est perdu.
CREATE TABLE IF NOT EXISTS liaisons (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id       INTEGER NOT NULL,
  compte_email    TEXT    NOT NULL,
  odoo_partner_id INTEGER NOT NULL,
  partenaire_nom  TEXT,
  partenaire_tva  TEXT,
  critere         TEXT    NOT NULL,   -- 'email' ou 'tva'
  cree_le         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS liaisons_compte ON liaisons (compte_id);
CREATE INDEX IF NOT EXISTS liaisons_date   ON liaisons (cree_le);
