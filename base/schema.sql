-- ===========================================================================
-- NISHMAN — base des comptes professionnels
-- À exécuter une seule fois sur la base D1 de Cloudflare.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS comptes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT    NOT NULL,
  -- L'email sert d'identifiant : on le range en minuscules pour que
  -- Jean@Salon.be et jean@salon.be soient le même compte.
  email_cle       TEXT    NOT NULL UNIQUE,
  -- Nom de la société (la colonne s'appelle salon pour des raisons
  -- historiques ; elle porte la raison sociale saisie à l'inscription).
  salon           TEXT    NOT NULL,
  prenom          TEXT,
  nom             TEXT,
  -- Format : pbkdf2$<iterations>$<sel en base64>$<empreinte en base64>.
  -- Le mot de passe lui-même n'est jamais stocké, ni récupérable.
  mot_de_passe    TEXT    NOT NULL,

  -- Belgique et Luxembourg : numéro de TVA. France : SIRET dans siret,
  -- et tva porte le numéro de TVA reconstitué à partir du SIREN.
  tva             TEXT,
  siret           TEXT,
  tva_valide      INTEGER NOT NULL DEFAULT 0,
  tva_verifiee_le TEXT,

  -- Résultat du dernier contrôle au registre européen (VIES).
  --   valide         le registre a confirmé
  --   invalide       le registre a démenti
  --   indisponible   le registre n'a pas répondu
  --   valide_manuel  vérifié autrement par NBD, numéro de consultation saisi
  --   jamais         aucun contrôle encore effectué
  tva_statut      TEXT    DEFAULT 'jamais',
  -- Numéro de consultation rendu par VIES : la pièce à produire en cas de
  -- contrôle pour justifier une facture en autoliquidation.
  tva_preuve      TEXT,
  -- Raison sociale telle que le registre la connaît, utile à comparer.
  tva_nom         TEXT,
  -- Pourquoi le contrôle a échoué, ou pourquoi un statut a été conservé.
  tva_motif       TEXT,

  -- Validation posée à la main par NBD quand le registre est muet. Elle
  -- engage celui qui la pose, elle ne doit donc pas être anonyme.
  tva_manuel_par  TEXT,
  tva_manuel_le   TEXT,
  tva_manuel_note TEXT,
  telephone       TEXT,
  adresse         TEXT,
  code_postal     TEXT,
  ville           TEXT,
  pays            TEXT,

  -- Lien vers la fiche client dans Odoo, qui reste la source de vérité.
  odoo_partner_id INTEGER,

  -- actif | suspendu. Un compte suspendu ne peut plus se connecter.
  etat            TEXT    NOT NULL DEFAULT 'actif',
  motif_suspension TEXT,

  cree_le         TEXT    NOT NULL,
  vu_le           TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  jeton      TEXT    PRIMARY KEY,
  compte_id  INTEGER NOT NULL,
  cree_le    TEXT    NOT NULL,
  expire_le  TEXT    NOT NULL,
  FOREIGN KEY (compte_id) REFERENCES comptes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_compte ON sessions(compte_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire_le);

-- Tentatives de connexion ratées, pour ralentir les attaques par force brute.
CREATE TABLE IF NOT EXISTS tentatives (
  email_cle TEXT NOT NULL,
  quand     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tentatives ON tentatives(email_cle, quand);

-- Liens de réinitialisation de mot de passe (étape 194).
CREATE TABLE IF NOT EXISTS reinitialisations (
  empreinte TEXT    PRIMARY KEY,
  compte_id INTEGER NOT NULL,
  cree_le   TEXT    NOT NULL,
  expire_le TEXT    NOT NULL,
  utilise   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reinit_compte ON reinitialisations(compte_id);
