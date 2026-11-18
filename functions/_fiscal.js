/* ==========================================================================
   POSITIONS FISCALES — le nom Odoo qui correspond au régime décidé ici.

   Le site arrête déjà le régime de TVA (national, autoliquidation, ou
   intracommunautaire sans numéro valide). Restait à dire à Odoo lequel
   appliquer, autrement Odoo le redéduit de son côté avec ses propres
   règles — et deux raisonnements indépendants finissent toujours par
   diverger sur un cas limite.

   Les noms viennent de NBD et sont réglables par variable : une position
   fiscale renommée dans Odoo ne doit pas demander une mise à jour du site.
   Odoo compare les noms caractère par caractère, c'est le script Google qui
   retrouve la fiche en ignorant la casse — même précaution que pour les
   modes de livraison, où « Livraison Belgique » et « LIVRAISON BELGIQUE »
   avaient fait échouer la recherche.
   ========================================================================== */

import { ACTIF as OSS_ACTIF, regimeB2C } from "./_oss.js";

export const POSITIONS_DEFAUT = {
  national: "National",                    // client belge, TVA belge 21 %
  intracom: "Intracommunautaire",          // FR/LU, numéro vérifié : autoliquidation
  intracom_sans_tva: "UE B2C",             // FR/LU sans numéro valide : TVA belge
};

/* --------------------------------------------------------------------------
   LE PROFESSIONNEL SANS NUMÉRO SUIT LE PARTICULIER — à partir de l'OSS.

   Un coiffeur français en franchise en base n'a pas de numéro
   intracommunautaire. Pour la TVA, il n'est pas un assujetti : il relève
   du même régime qu'un particulier français. Le comptable l'a dit en ces
   termes — facturer 20 % de TVA française aux particuliers français ET
   aux professionnels français sans numéro.

   Or le chemin professionnel envoyait ce client en « UE B2C », donc en TVA
   belge à 21 %, tandis que le chemin boutique est déjà prêt à l'envoyer en
   « OSS B2C France » à 20 %. Le jour de la bascule, les deux chemins
   auraient divergé : même client, deux taux, selon la page par laquelle il
   est passé. C'est exactement l'erreur que _oss.js s'applique à rendre
   impossible — « les changer séparément, c'est facturer un taux et en
   déclarer un autre ».

   D'où ce raccordement. Il ne bouge que si _oss.js est ACTIF. Tant qu'il
   est à false — c'est-à-dire tant que l'inscription au guichet n'est pas
   confirmée — les deux fonctions ci-dessous rendent exactement ce qu'elles
   rendaient avant, au caractère près.
   -------------------------------------------------------------------------- */
function ossPourLePro(regime, pays, env) {
  if (!OSS_ACTIF) return null;
  if (String(regime || "") !== "intracom_sans_tva") return null;
  const code = String(pays || "").trim().toUpperCase();
  if (code !== "FR" && code !== "LU") return null;
  const r = regimeB2C(code, env);
  return (r && r.positions && r.positions.length) ? r.positions : null;
}

export function positionFiscale(regime, env, pays) {
  const oss = ossPourLePro(regime, pays, env);
  if (oss) return oss[0];

  const reglages = {
    national: (env && env.FP_NATIONAL) || POSITIONS_DEFAUT.national,
    intracom: (env && env.FP_INTRACOM) || POSITIONS_DEFAUT.intracom,
    intracom_sans_tva: (env && env.FP_UE_B2C) || POSITIONS_DEFAUT.intracom_sans_tva,
  };
  const nom = reglages[String(regime || "")];
  return nom ? String(nom).trim() : "";
}

/* --------------------------------------------------------------------------
   Le piège de la traduction.

   Le nom d'une position fiscale est un champ traduit. Odoo affiche
   « National » à l'écran français de NBD, mais stocke « Domestic » : c'est
   le modèle comptable belge installé en anglais, traduit à l'affichage.
   Une recherche par nom depuis l'extérieur ne voit que la valeur stockée.

   D'où cette table d'équivalences. On essaie d'abord le nom réglé — celui
   que NBD voit et qu'elle renommera peut-être un jour — puis les variantes
   connues. Chercher deux noms coûte une requête ; se tromper de position
   fiscale coûte une TVA mal facturée.
   -------------------------------------------------------------------------- */

const EQUIVALENCES = {
  national: ["National", "Domestic"],
  intracom: ["Intracommunautaire", "Intra-Community"],
  intracom_sans_tva: ["UE B2C", "EU B2C"],
};

/** Les noms à essayer pour ce régime, le réglage d'abord, sans doublon. */
export function nomsPossibles(regime, env, pays) {
  const oss = ossPourLePro(regime, pays, env);
  if (oss) return oss;

  const cle = String(regime || "");
  const noms = [positionFiscale(cle, env), ...(EQUIVALENCES[cle] || [])]
    .map((n) => String(n || "").trim())
    .filter(Boolean);
  const vus = new Set();
  return noms.filter((n) => {
    const k = n.toLowerCase();
    if (vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}
