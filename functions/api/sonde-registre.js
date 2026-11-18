/* --------------------------------------------------------------------------
   BANC D'ESSAI DU REGISTRE — branche de préversion uniquement.

   Rejoue les cas réels relevés le 18 novembre 2026 sur les clients de NBD,
   et vérifie que _registre_fr.js tranche comme il doit. Chaque cas porte le
   verdict attendu : si la colonne « conforme » n'est pas vraie partout, le
   module ne part pas en production.

   À supprimer une fois le module en service.
   -------------------------------------------------------------------------- */

import { chercherEntreprise, consigne } from "../_registre_fr.js";

const CAS = [
  { siren: "943141192", qui: "B.M. BARBER — a un vrai numéro, clé 0F",
    attendu: "a_verifier", tva: "FR0F943141192" },
  { siren: "105884324", qui: "OFF CUT — franchise, aucun numéro",
    attendu: "sans_numero" },
  { siren: "931290100", qui: "GOLD BARBER — franchise",
    attendu: "sans_numero" },
  { siren: "940168651", qui: "TI HOUSE BARBER — franchise",
    attendu: "sans_numero" },
  { siren: "979315660", qui: "MK ltd — franchise",
    attendu: "sans_numero" },
  { siren: "832941314", qui: "LE THERAIN — société cessée",
    attendu: "a_corriger" },
  { siren: "264657000", qui: "Hairwin barber — SIREN inexistant",
    attendu: "a_corriger" },
  { siren: "308712700", qui: "coifor dou pais — SIREN inexistant",
    attendu: "a_corriger" },
];

export async function onRequestGet() {
  const sortie = [];
  for (const c of CAS) {
    const t0 = Date.now();
    const r = await chercherEntreprise(c.siren);
    const k = consigne(r);
    const conforme = k.suite === c.attendu && (!c.tva || k.tva === c.tva);
    sortie.push({
      cas: c.qui, siren: c.siren, ms: Date.now() - t0,
      attendu: c.attendu, obtenu: k.suite, tva: k.tva,
      nom: k.nom || r.nom || "", conforme,
    });
    await new Promise((r) => setTimeout(r, 120));
  }
  const tous = sortie.every((s) => s.conforme);
  return new Response(
    JSON.stringify({ ok: true, tous_conformes: tous,
                     echecs: sortie.filter((s) => !s.conforme).length,
                     cas: sortie }, null, 2),
    { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
