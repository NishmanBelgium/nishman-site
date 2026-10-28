/* ==========================================================================
   CALCUL B2C — ce que paie réellement un particulier.

   Le pendant de _calcul.js, mais pour le grand public, et les deux ne se
   ressemblent qu'en apparence.

   Côté professionnel, les prix sont hors taxe, le régime de TVA dépend du
   pays et du numéro intracommunautaire, et le port se déclenche à 300 € ou
   500 € selon la destination.

   Côté particulier, tout est TTC — la loi l'impose en vente au
   consommateur — il n'y a pas de numéro de TVA à vérifier, et la règle de
   port est unique pour la Belgique, la France et le Luxembourg.

   Comme côté pro, et pour la même raison : RIEN de ce que le navigateur
   annonce n'est cru. Il envoie des codes-barres et des quantités. Les prix,
   le port et le total sont recalculés ici, à partir du catalogue publié.
   Un panier bricolé dans la console du navigateur n'achètera pas un wax à
   un euro.
   ========================================================================== */

/* Les réglages commerciaux, décidés par NBD le 28 octobre 2026. Ils vivent
   ici et nulle part ailleurs : la boutique les demande au serveur plutôt
   que d'en garder une copie, pour qu'un changement se fasse en un seul
   endroit et ne puisse pas se contredire d'une page à l'autre. */
export const REGLES = {
  port: 4.95,        // frais de livraison en point relais, en euros TTC
  franco: 29.90,     // au-delà de ce montant de marchandise, livraison offerte
  tva: 0.21,         // TVA belge
  pays: ["BE", "FR", "LU"],
  quantite_max: 24,  // par référence, pour une commande de particulier
  lignes_max: 40,
};

/* La TVA belge s'applique aux trois pays tant que NBD reste sous le seuil
   de 10 000 € de ventes à distance dans l'Union. Au-delà — ou dès
   l'inscription à l'OSS — c'est le taux du pays du client qui s'applique.
   Le prix affiché restera le même TTC dans les trois pays, donc c'est la
   marge qui variera, pas le prix. Le jour venu, c'est ici que ça se
   change. */
export function tauxTva(pays) {
  return REGLES.tva;
}

export function paysValideB2C(pays) {
  return REGLES.pays.indexOf(String(pays || "").trim().toUpperCase()) >= 0;
}

function sou(n) { return Math.round(Number(n) * 100) / 100; }

/* --- La question des centimes -------------------------------------------
 *
 * Les prix de la boutique sont TTC : 9,90 € le wax. Odoo, lui, raisonne en
 * hors taxe et ajoute la TVA ligne par ligne. Les deux chemins ne tombent
 * pas toujours sur le même centime.
 *
 * Trois wax : 3 × 9,90 = 29,70 € en partant du TTC. Odoo prend 9,90 / 1,21
 * = 8,18 € hors taxe, multiplie par trois (24,54 €), applique 21 %
 * (5,15 €) et obtient 29,69 €. Un centime d'écart.
 *
 * Ce centime n'est pas un détail. Si le client paie 29,70 € et que la
 * facture Odoo dit 29,69 €, le lettrage laisse un résidu et la facture
 * reste éternellement « partiellement payée ». Multiplié par les
 * commandes, c'est un carnet de clients impossible à lire.
 *
 * On calcule donc comme Odoo, et pas comme un panier : hors taxe d'abord,
 * arrondi à chaque ligne, TVA ensuite. Le client voit 29,69 €, paie
 * 29,69 €, et la facture se solde au centime.
 */
function htDepuisTtc(ttc, taux) { return sou(Number(ttc) / (1 + taux)); }

/**
 * @param selection  { ean: quantité } tel que le navigateur l'envoie
 * @param produits   le catalogue boutique, lu côté serveur
 * @param pays       BE, FR ou LU
 * @returns          le détail complet, en TTC
 */
export function calculerB2C({ selection, produits, pays }) {
  const parEan = {};
  for (const p of produits || []) {
    // « bientôt » veut dire pas en stock : la fiche s'affiche, mais la
    // référence ne doit pas pouvoir être achetée. L'écarter ici, et pas
    // seulement dans l'affichage, est ce qui le garantit.
    if (p && p.ean && !p.bientot) parEan[String(p.ean)] = p;
  }

  const taux = tauxTva(pays);
  const lignes = [];
  const ignorees = [];
  let n = 0;

  for (const cle of Object.keys(selection || {})) {
    if (n >= REGLES.lignes_max) { ignorees.push(cle); continue; }
    const ean = String(cle).trim();
    const p = parEan[ean];
    if (!p) { ignorees.push(ean); continue; }

    let q = Math.floor(Number(selection[cle]));
    if (!(q > 0)) { ignorees.push(ean); continue; }
    if (q > REGLES.quantite_max) q = REGLES.quantite_max;

    const affiche = Number(p.ttc);
    if (!(affiche > 0)) { ignorees.push(ean); continue; }

    // Le hors-taxe de la ligne est ce qui partira dans Odoo. Tout le reste
    // en découle, y compris le prix unitaire réaffiché au client.
    const puHt = htDepuisTtc(affiche, taux);
    const totalHt = sou(puHt * q);

    lignes.push({
      ean,
      nom: p.nom || "",
      nom_court: p.nom_court || p.nom || "",
      image: p.image || "",
      volume: p.volume || "",
      quantite: q,
      prix_unitaire_ht: puHt,
      prix_unitaire: sou(puHt * (1 + taux)),
      total_ht: totalHt,
      total: sou(totalHt * (1 + taux)),
    });
    n++;
  }

  const sousTotalHt = sou(lignes.reduce((s, l) => s + l.total_ht, 0));
  const sousTotal = sou(sousTotalHt * (1 + taux));

  // Le franco se juge sur le montant que le client voit, c'est-à-dire le
  // TTC de la marchandise : « livraison offerte dès 29,90 € » doit vouloir
  // dire 29,90 € sur l'étiquette, pas 24,71 € hors taxe.
  //
  // Et le port ne s'applique qu'à une commande qui existe : un panier vide
  // ne coûte pas 4,95 € de livraison.
  const offert = sousTotal <= 0 || sousTotal >= REGLES.franco;
  const portTtc = offert ? 0 : REGLES.port;
  const portHt = offert ? 0 : htDepuisTtc(REGLES.port, taux);
  const manque = (sousTotal > 0 && sousTotal < REGLES.franco)
    ? sou(REGLES.franco - sousTotal) : 0;

  const baseHt = sou(sousTotalHt + portHt);
  const tva = sou(baseHt * taux);
  const total = sou(baseHt + tva);

  return {
    lignes,
    ignorees,
    sous_total_ht: sousTotalHt,
    sous_total: sousTotal,
    port: sou(portHt * (1 + taux)),
    port_ht: portHt,
    port_affiche: portTtc,
    port_offert: offert && sousTotal > 0,
    port_franco: REGLES.franco,
    port_manque: manque,
    hors_taxe: baseHt,
    taux_tva: taux,
    tva,
    total,
    pays: String(pays || "BE").toUpperCase(),
  };
}
