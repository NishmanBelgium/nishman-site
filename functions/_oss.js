/* ==========================================================================
   OSS — LA TVA DU PAYS DU CLIENT, POUR LES VENTES AUX PARTICULIERS.

   CE QUE C'EST. Jusqu'ici, un particulier français qui achetait sur la
   boutique payait la TVA belge à 21 %, et NBD la déclarait en Belgique.
   C'est la règle tant qu'on reste sous le seuil de 10 000 € de ventes à
   distance dans l'Union. Au-delà — ou dès l'inscription au guichet OSS —
   c'est la TVA du pays du client qui s'applique : 20 % en France, 17 % au
   Luxembourg, et elle se déclare au guichet unique.

   POURQUOI UN SEUL FICHIER. Il y a trois choses à changer le même jour :
   le taux qui sert à calculer, la position fiscale qu'Odoo reçoit, et la
   taxe posée sur la ligne de commande. Les changer séparément, c'est
   facturer un taux et en déclarer un autre — l'erreur que le commentaire
   de _commande_b2c.js redoutait depuis le début. Ici les trois sont sur la
   même ligne du même tableau : on ne peut pas en bouger une sans les
   autres.

   LE PRIX AFFICHÉ NE CHANGE PAS. 9,90 € reste 9,90 € en Belgique, en
   France et au Luxembourg. C'est la répartition qui bouge, pas le prix :
   8,18 + 1,72 de TVA belge devient 8,25 + 1,65 en France. Le client paie
   la même chose, NBD garde quelques centimes de plus. C'est le sens de la
   phrase déjà écrite dans _calcul_b2c.js : « c'est la marge qui variera,
   pas le prix ».

   VÉRIFIÉ DANS ODOO LE 11 NOVEMBRE 2026, sur facture réelle, les six cas :
     particulier BE  9,90 → 8,18 + 21 %     (aucune position)
     particulier FR  9,90 → 8,25 + 20 %     (OSS B2C France)
     particulier LU  9,90 → 8,46 + 17 %     (OSS B2C Luxembourg)
     salon BE        100  → +21 %           (aucune position)
     micro FR        100  → +20 %           (OSS B2C France)
     société FR + n° 100  → 0 %             (Intra-Community)
   ========================================================================== */

/* L'INTERRUPTEUR, ET LA RAISON POUR LAQUELLE IL EST ENCORE À FALSE.
 *
 * Facturer 20 % de TVA française suppose de pouvoir la reverser à la
 * France, donc d'être inscrit au guichet OSS. Tant que l'inscription
 * n'est pas confirmée, encaisser 20 % français serait pire que la
 * situation actuelle : une TVA perçue que personne ne peut déclarer.
 *
 * Odoo est prêt — positions fiscales et taxes créées et testées. Le site
 * est prêt — ce fichier. Il ne manque que la confirmation de
 * l'administration. Le jour où elle arrive : passer cette ligne à true,
 * déployer, et les trois pays basculent ensemble.
 *
 * À false, tout se comporte exactement comme avant : TVA belge partout,
 * position « National », taxe « 21% TTC ». Il n'y a rien à restaurer. */
export const ACTIF = false;

/* LE TABLEAU. Une ligne par pays, et les trois valeurs qui doivent rester
 * d'accord entre elles.
 *
 *   taux     sert à déduire le hors-taxe du prix TTC affiché (_calcul_b2c)
 *   position le nom Odoo de la position fiscale (_commande_b2c)
 *   taxe     le nom Odoo de la taxe posée sur chaque ligne (_commande_b2c)
 *
 * Les positions fiscales OSS sont créées par Odoo lui-même et portent un
 * nom anglais non traduit, contrairement à « National » qui s'affiche en
 * français mais se stocke « Domestic » — d'où les deux variantes pour la
 * Belgique, reprises de _fiscal.js et pour la même raison.
 *
 * Les taxes « TTC » sont des copies des taxes OSS avec la seule case
 * « inclus dans le prix » changée : mêmes grilles de déclaration, même
 * groupe. Même méthode que « 21% TTC », copie de « 21% Ventes ». Elles
 * existent parce que la boutique transmet des prix TTC — voir la longue
 * note sur les centimes dans _calcul_b2c.js. */
const REGIMES = {
  BE: { taux: 0.21, positions: ["National", "Domestic"], taxe: "21% TTC" },
  FR: { taux: 0.20, positions: ["OSS B2C France"],       taxe: "20% TTC FR" },
  LU: { taux: 0.17, positions: ["OSS B2C Luxembourg"],   taxe: "17% TTC LU" },
};

/* Le régime belge, qui sert aussi de régime par défaut : avant l'OSS pour
 * tout le monde, et après l'OSS pour tout pays qu'on ne connaîtrait pas. */
const BELGE = REGIMES.BE;

/**
 * Le régime de TVA applicable à un particulier de ce pays.
 *
 * Tant que ACTIF est false, rend le régime belge quel que soit le pays :
 * c'est le comportement d'avant, à l'identique.
 *
 * Les noms Odoo peuvent être surchargés par variable d'environnement, pour
 * qu'une position fiscale renommée dans Odoo ne demande pas un déploiement
 * du site. Le taux, lui, n'est pas réglable : c'est la loi, pas un
 * paramètre.
 */
export function regimeB2C(pays, env) {
  const code = String(pays || "").trim().toUpperCase();
  const base = (ACTIF && REGIMES[code]) || BELGE;

  const surcharge = env && code && {
    BE: [env.FP_NATIONAL, env.TAXE_TTC],
    FR: [env.FP_OSS_FR, env.TAXE_TTC_FR],
    LU: [env.FP_OSS_LU, env.TAXE_TTC_LU],
  }[ACTIF ? code : "BE"];

  const nomPosition = surcharge && surcharge[0] ? String(surcharge[0]).trim() : "";
  const nomTaxe = surcharge && surcharge[1] ? String(surcharge[1]).trim() : "";

  /* Le nom réglé d'abord, puis les variantes connues, sans doublon :
     chercher deux noms coûte une requête, se tromper de position fiscale
     coûte une TVA mal facturée. Même raisonnement que _fiscal.js. */
  const vus = new Set();
  const positions = [nomPosition, ...base.positions]
    .map((n) => String(n || "").trim())
    .filter((n) => {
      if (!n) return false;
      const k = n.toLowerCase();
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });

  return { taux: base.taux, positions, taxe: nomTaxe || base.taxe };
}

/** Le taux seul, pour le calcul des prix. */
export function tauxB2C(pays) {
  return regimeB2C(pays).taux;
}

/** Ce que le diagnostic affiche, et ce qu'on relit avant de basculer. */
export function etatOss() {
  return {
    actif: ACTIF,
    regimes: Object.keys(REGIMES).reduce((acc, p) => {
      const r = regimeB2C(p);
      acc[p] = { taux: r.taux, position: r.positions[0], taxe: r.taxe };
      return acc;
    }, {}),
  };
}
