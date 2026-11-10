/* ==========================================================================
   CONTRÔLE TVA — la TVA enregistrée dans Odoo doit dire la même chose que
   celle annoncée au client.

   LE 9 NOVEMBRE 2026, deux commandes sont sorties du site avec 0 % de TVA
   pour des clients belges : S00299 (La Barberia, Saint-Ghislain, retrait à
   Binche, 276,00 € HT) et S00304 (Noel Steve, Frameries, 285,70 € HT, déjà
   facturée). Sur 173 commandes, deux. Personne ne l'a vu : c'est NBD qui
   s'en est aperçue en ajoutant une remise, parce qu'Odoo crée une ligne de
   remise par groupe de TVA et qu'elle en a vu deux au lieu d'une. La double
   remise n'était pas le défaut — c'était le symptôme, et le seul signal.

   POURQUOI LE FILET N'A PAS JOUÉ. Il existait déjà, mais sur un seul
   chemin. Le tunnel « payer » crée la commande lui-même, relit ce qu'Odoo
   a enregistré, compare au centime et REFUSE le paiement si l'écart n'est
   pas nul (api/payer.js, api/payer-public.js). Le tunnel « devis », lui,
   ne crée pas la commande : il la fait créer par le script Google, qui
   renvoie son numéro. Aucune relecture, aucune comparaison. Or c'est par
   là que passent la plupart des commandes professionnelles, celles payées
   par virement.

   Le même raisonnement que pour le mot de passe oublié, hier : une
   protection posée sur la moitié du parcours n'est pas une protection,
   c'est une illusion de protection — et elle coûte plus cher qu'une
   absence, parce qu'on croit être couvert.

   CE QUE CE FICHIER NE FAIT PAS. Il ne corrige rien dans Odoo. Une TVA
   mal posée se répare à la main, après avoir décidé qui a raison ; un
   programme qui réécrirait tout seul une base comptable ferait courir un
   risque bien plus grand que celui qu'il évite. Il écrit au journal des
   incidents, et c'est tout. Le journal, lui, est lu par le diagnostic.

   CE QU'IL COMPARE. Le taux, pas les montants. Le script Google peut
   composer ses lignes autrement que nous — arrondir une remise, ranger le
   port ailleurs — et un contrôle au centime sur le total crierait pour des
   raisons qui ne nous intéressent pas. Le taux effectif, lui, ne dépend
   d'aucune de ces libertés : 21 % attendu contre 0 % enregistré, c'est la
   panne, et c'est la seule chose qu'on veut savoir.
   ========================================================================== */

import { appel, configure } from "./_odoo.js";
import { noterIncident } from "./_incidents.js";

/* Un point de pourcentage de tolérance. Un arrondi global sur un panier
   mélangé peut faire dériver le taux effectif de quelques centièmes ; une
   position fiscale mal appliquée le fait dériver de vingt-et-un points.
   Entre les deux, aucun cas réel. */
const TOLERANCE_POINTS = 1;

/**
 * Relit la commande dans Odoo et compare son taux de TVA effectif à celui
 * que le site a appliqué. Ne lève jamais : le client a son devis, et un
 * contrôle muet ne doit pas le lui retirer.
 *
 * @param env        l'environnement Cloudflare
 * @param db         la base D1, pour le journal des incidents
 * @param nom        le numéro Odoo renvoyé par le script (« S00299 »)
 * @param attendu    le résultat de calculer() : { taux_tva, tva, base_tva, regime }
 * @param compte_id  le compte du client, pour pouvoir le rappeler
 * @returns { controle: boolean, concorde: boolean, motif: string }
 */
export async function controlerTvaDuDevis(env, db, { nom, attendu, compte_id }) {
  const propre = String(nom || "").trim();
  if (!/^S\d{4,}$/.test(propre)) {
    return { controle: false, concorde: true, motif: "numéro inexploitable" };
  }
  if (!configure(env)) {
    return { controle: false, concorde: true, motif: "Odoo non configuré" };
  }

  let cmd = null;
  try {
    const r = await appel(env, "sale.order", "search_read",
      [[["name", "=", propre]],
       ["id", "name", "amount_untaxed", "amount_tax", "amount_total", "fiscal_position_id"]],
      { limit: 1 });
    cmd = r && r[0];
  } catch (e) {
    // Odoo muet : on ne sait pas, et « on ne sait pas » n'est pas « c'est
    // faux ». On le dit sans remplir le journal d'incidents imaginaires.
    return { controle: false, concorde: true, motif: "Odoo injoignable" };
  }
  if (!cmd) {
    /* Le script a renvoyé un numéro et la commande n'existe pas : ce n'est
     * pas un problème de TVA, c'est pire. Le client a reçu un devis qui ne
     * correspond à rien dans la base. */
    await noterIncident(db, {
      etape: "devis", cause: "serveur", compte_id,
      detail: "devis " + propre + " annoncé au client mais introuvable dans Odoo",
    });
    return { controle: true, concorde: false, motif: "commande introuvable" };
  }

  const ht = Number(cmd.amount_untaxed);
  const taxe = Number(cmd.amount_tax);
  if (!Number.isFinite(ht) || !Number.isFinite(taxe) || ht <= 0) {
    return { controle: false, concorde: true, motif: "montants illisibles" };
  }

  const tauxOdoo = (taxe / ht) * 100;
  const tauxSite = Number(attendu && attendu.taux_tva) * 100;
  if (!Number.isFinite(tauxSite)) {
    return { controle: false, concorde: true, motif: "taux du site inconnu" };
  }

  const ecart = Math.abs(tauxOdoo - tauxSite);
  if (ecart <= TOLERANCE_POINTS) {
    return { controle: true, concorde: true, motif: "" };
  }

  /* La divergence. On écrit tout ce qu'il faut pour trancher sans rouvrir
   * la commande : le numéro, les deux taux, la position fiscale qu'Odoo a
   * retenue, le régime que le site avait décidé, et l'euro en jeu. */
  const manque = Math.round((ht * (tauxSite - tauxOdoo) / 100) * 100) / 100;
  const position = cmd.fiscal_position_id ? cmd.fiscal_position_id[1] : "aucune";
  const detail = "TVA divergente sur " + propre
    + " — site " + tauxSite.toFixed(0) + " % (régime " + String((attendu && attendu.regime) || "?") + ")"
    + ", Odoo " + tauxOdoo.toFixed(1) + " % (position " + position + ")"
    + " sur " + ht.toFixed(2) + " EUR HT"
    + " — " + (manque >= 0 ? "manque " : "excédent ") + Math.abs(manque).toFixed(2) + " EUR";

  await noterIncident(db, { etape: "devis", cause: "serveur", compte_id, detail });
  return { controle: true, concorde: false, motif: detail };
}
