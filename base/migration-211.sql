-- ===========================================================================
-- ÉTAPE 211 — la trace des vérifications VIES
--
-- tva_valide disait déjà oui ou non. Il manquait de quoi distinguer « le
-- registre a démenti » de « le registre n'a pas répondu » — deux situations
-- qui facturent toutes deux la TVA, mais dont une seule se corrige en
-- réessayant.
--
-- tva_preuve conserve le numéro de consultation rendu par VIES. C'est la
-- pièce à produire en cas de contrôle pour justifier une facture en
-- autoliquidation : elle atteste que le numéro a été vérifié ce jour-là.
-- ===========================================================================

ALTER TABLE comptes ADD COLUMN tva_statut TEXT;
ALTER TABLE comptes ADD COLUMN tva_preuve TEXT;
ALTER TABLE comptes ADD COLUMN tva_nom    TEXT;
ALTER TABLE comptes ADD COLUMN tva_motif  TEXT;

-- Les comptes déjà créés n'ont jamais été confrontés au registre.
UPDATE comptes SET tva_statut = 'jamais' WHERE tva_statut IS NULL;
