-- ===========================================================================
-- ÉTAPE 214 — la validation à la main, quand le registre européen est muet
--
-- VIES tombe régulièrement : « MS_MAX_CONCURRENT_REQ » signifie que
-- l'administration interrogée refuse momentanément de répondre. Un client
-- français parfaitement en règle se retrouve alors facturé avec 21 % de TVA
-- belge qu'il ne devait pas, simplement parce qu'une machine à Bruxelles
-- n'a pas répondu à la seconde où il commandait.
--
-- Un compte déjà validé garde son exonération depuis l'étape 211. Il
-- restait le cas du client dont le numéro n'a JAMAIS pu être vérifié.
--
-- La réponse n'est pas de faire confiance au client : c'est de permettre à
-- NBD de vérifier par un autre moyen (le site de la Commission, ou son
-- bureau de TVA) et d'enregistrer ICI le numéro de consultation obtenu.
-- La preuve reste donc une vraie preuve, opposable à un contrôle ; seul le
-- chemin pour l'obtenir change.
--
-- On garde qui l'a saisie et quand : une validation manuelle engage la
-- responsabilité de celui qui la pose, elle ne doit pas être anonyme.
-- ===========================================================================

ALTER TABLE comptes ADD COLUMN tva_manuel_par TEXT;
ALTER TABLE comptes ADD COLUMN tva_manuel_le  TEXT;
ALTER TABLE comptes ADD COLUMN tva_manuel_note TEXT;
