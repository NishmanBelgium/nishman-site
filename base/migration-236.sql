-- ===========================================================================
-- ÉTAPE 236 — le registre des paiements
--
-- Entre le moment où un client clique « Payer » et celui où l'argent arrive,
-- il se passe des choses que personne ne contrôle : il ferme son navigateur,
-- sa banque met trente secondes, Mollie nous prévient deux fois, ou pas du
-- tout. Sans trace écrite de notre côté, chacun de ces cas devient une
-- commande fantôme ou une commande payée deux fois.
--
-- Cette table est cette trace. Elle relie l'identifiant du paiement chez
-- Mollie à la commande créée dans Odoo, et retient si la suite a déjà été
-- déclenchée. C'est ce dernier point qui compte le plus : Mollie peut
-- notifier plusieurs fois le même paiement, et une facture émise deux fois
-- se répare beaucoup moins facilement qu'une notification ignorée.
--
-- Le montant est enregistré tel qu'il a été ANNONCÉ à Mollie. Au retour, on
-- compare : un paiement dont le montant ne correspond pas à ce qu'on a
-- demandé ne déclenche rien et doit être regardé à la main.
--
-- Cette table est aussi créée automatiquement par le site s'il ne la trouve
-- pas. Ce fichier reste la référence lisible du schéma.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS paiements (
  -- L'identifiant Mollie (« tr_… »). C'est lui que la notification nous
  -- donne, et c'est par lui qu'on retrouve tout le reste.
  mollie_id     TEXT    PRIMARY KEY,

  -- Notre référence lisible, celle que le client voit (« CMD-… »).
  ref           TEXT    NOT NULL,

  compte_id     INTEGER NOT NULL,

  -- La commande dans Odoo, créée en brouillon avant le paiement.
  odoo_order_id INTEGER NOT NULL,
  odoo_nom      TEXT,

  -- Le montant annoncé à Mollie, en euros, sous la forme exacte envoyée.
  montant       TEXT    NOT NULL,
  devise        TEXT    NOT NULL DEFAULT 'EUR',

  -- ouvert | paye | echoue | expire | annule | rembourse
  statut        TEXT    NOT NULL DEFAULT 'ouvert',

  -- Rempli une seule fois, quand la suite a été déclenchée (confirmation
  -- de la commande, facture, étiquette). Tant qu'il est vide, rien n'a été
  -- fait ; dès qu'il est rempli, une seconde notification ne refait rien.
  traite_le     TEXT,

  -- Ce qui s'est passé, en clair, pour pouvoir comprendre sans fouiller.
  note          TEXT,

  cree_le       TEXT    NOT NULL,
  vu_le         TEXT
);

CREATE INDEX IF NOT EXISTS idx_paiements_compte ON paiements(compte_id);
CREATE INDEX IF NOT EXISTS idx_paiements_ref    ON paiements(ref);
CREATE INDEX IF NOT EXISTS idx_paiements_statut ON paiements(statut);
