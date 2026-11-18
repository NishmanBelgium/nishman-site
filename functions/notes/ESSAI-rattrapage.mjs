/* Banc d'essai de decider() — fonction pure, aucun réseau.
   Rejoue les cas réels relevés le 18 novembre 2026. */

import { decider } from "../api/tva-rattrapage.js";

const CAS = [
  {
    quoi: "B.M. BARBER — numéro calculé FR33, vraie clé 0F",
    compte: { tva: "FR33943141192", siret: "94314119200015", tva_statut: "invalide" },
    registre: { etat: "trouve", actif: true, tva: "FR0F943141192", nom: "B.M. BARBER" },
    attendu: { action: "corriger", tva: "FR0F943141192", statut: "a_verifier" },
  },
  {
    quoi: "OFF CUT — franchise, numéro fabriqué en base",
    compte: { tva: "FR55105884324", siret: "10588432400019", tva_statut: "invalide" },
    registre: { etat: "trouve", actif: true, tva: null, nom: "OFF CUT" },
    attendu: { action: "corriger", tva: null, statut: "sans_numero" },
  },
  {
    quoi: "MOMO COIFF 59 — vrai numéro, déjà confirmé au VIES",
    compte: { tva: "FR00981917222", siret: "98191722200012", tva_statut: "valide" },
    registre: { etat: "trouve", actif: true, tva: "FR00981917222", nom: "MOMO COIFF 59" },
    attendu: { action: "aucune" },
  },
  {
    quoi: "Numéro conforme au registre, jamais confirmé au VIES",
    compte: { tva: "FR00981917222", siret: "98191722200012", tva_statut: "indisponible" },
    registre: { etat: "trouve", actif: true, tva: "FR00981917222", nom: "X" },
    attendu: { action: "corriger", tva: "FR00981917222", statut: "a_verifier" },
  },
  {
    quoi: "Confirmé au VIES mais la France ne déclare rien — ne pas déclasser",
    compte: { tva: "FR12345678901", siret: "12345678901234", tva_statut: "valide_sans_preuve" },
    registre: { etat: "trouve", actif: true, tva: null, nom: "Y" },
    attendu: { action: "signaler" },
  },
  {
    quoi: "Hairwin barber — SIREN inexistant",
    compte: { tva: "FR77264657000", siret: "26465700000011", tva_statut: "invalide" },
    registre: { etat: "inconnu", motif: "absent_du_registre" },
    attendu: { action: "corriger", tva: null, statut: "a_corriger" },
  },
  {
    quoi: "LE THERAIN — société cessée",
    compte: { tva: "FR41832941314", siret: "83294131400025", tva_statut: "invalide" },
    registre: { etat: "trouve", actif: false, tva: null, nom: "LE THERAIN" },
    attendu: { action: "corriger", tva: null, statut: "a_corriger" },
  },
  {
    quoi: "Registre en panne — ne rien toucher",
    compte: { tva: "FR33943141192", siret: "94314119200015", tva_statut: "invalide" },
    registre: { etat: "indisponible", motif: "TimeoutError" },
    attendu: { action: "aucune" },
  },
  {
    quoi: "Déjà rattrapé en sans_numero — ne pas réécrire",
    compte: { tva: null, siret: "10588432400019", tva_statut: "sans_numero" },
    registre: { etat: "trouve", actif: true, tva: null, nom: "OFF CUT" },
    attendu: { action: "aucune" },
  },
  {
    quoi: "Déjà rattrapé en a_corriger, cessée — ne pas réécrire",
    compte: { tva: null, siret: "83294131400025", tva_statut: "a_corriger" },
    registre: { etat: "trouve", actif: false, tva: null, nom: "LE THERAIN" },
    attendu: { action: "aucune" },
  },
  {
    quoi: "Déjà rattrapé, en attente du registre européen — ne pas réécrire",
    compte: { tva: "FR0F943141192", siret: null, tva_statut: "a_verifier" },
    registre: { etat: "trouve", actif: true, tva: "FR0F943141192", nom: "B.M. BARBER" },
    attendu: { action: "aucune" },
  },
  {
    quoi: "Numéro écrit avec des espaces — la comparaison doit tenir",
    compte: { tva: "FR 00 981917222", siret: "98191722200012", tva_statut: "valide" },
    registre: { etat: "trouve", actif: true, tva: "FR00981917222", nom: "Z" },
    attendu: { action: "aucune" },
  },
];

let ko = 0;
for (const c of CAS) {
  const r = decider(c.compte, c.registre);
  const ok = r.action === c.attendu.action
    && (c.attendu.action !== "corriger"
        || ((r.tva || null) === (c.attendu.tva || null) && r.statut === c.attendu.statut));
  if (!ok) ko++;
  console.log(
    (ok ? "  ok  " : "  KO  ") + c.quoi
    + "\n        → " + r.action
    + (r.action === "corriger" ? " / " + (r.tva || "aucun numéro") + " / " + r.statut : "")
    + "\n        " + r.pourquoi
  );
}
console.log("\n" + (CAS.length - ko) + "/" + CAS.length + " conformes" + (ko ? "  ← À CORRIGER" : ""));
process.exit(ko ? 1 : 0);
