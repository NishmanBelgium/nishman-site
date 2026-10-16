-- ===========================================================================
-- NISHMAN — étape 189
-- Le compte professionnel recueille désormais l'identité complète.
-- À exécuter UNE SEULE FOIS dans la console D1 de nishman-comptes.
-- Les colonnes pays, tva, adresse, code_postal et ville existaient déjà.
-- ===========================================================================

ALTER TABLE comptes ADD COLUMN prenom TEXT;
ALTER TABLE comptes ADD COLUMN nom    TEXT;
ALTER TABLE comptes ADD COLUMN siret  TEXT;
