-- ===========================================================================
-- NISHMAN — étape 194
-- Table des liens de réinitialisation de mot de passe.
-- À exécuter UNE SEULE FOIS dans la console D1 de nishman-comptes.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS reinitialisations (
  -- On ne stocke pas le jeton envoyé par e-mail, seulement son empreinte :
  -- quelqu'un qui lirait la base ne pourrait pas s'en servir.
  empreinte TEXT    PRIMARY KEY,
  compte_id INTEGER NOT NULL,
  cree_le   TEXT    NOT NULL,
  expire_le TEXT    NOT NULL,
  utilise   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reinit_compte ON reinitialisations(compte_id);
