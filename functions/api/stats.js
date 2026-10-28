/* ==========================================================================
   LES CHIFFRES DU SITE

   Ce que le site produit, sur une période, et ce que la période
   précédente avait produit. Un chiffre seul ne dit rien : « 240 visites »
   ne se juge qu'à côté des 180 de la semaine d'avant.

   Deux sources, et une seule base de données :

   - la table des visites, alimentée par la mesure d'audience ;
   - la table des paiements, qui porte chaque commande de la boutique de
     sa création à son expédition.

   Rien n'est demandé à Odoo ici. Odoo connaît aussi les ventes faites
   hors du site — au salon, par téléphone, par devis — et les mêler
   fausserait le taux de transformation, qui est le chiffre que cette
   page existe pour donner : combien de visiteurs finissent par acheter.

   Réservé au compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin } from "../_commun.js";
import { preparerTable } from "../_paiements.js";
import { lireMesure, preparerMesure } from "../_mesure.js";

const JOURS_DEFAUT = 30;
const JOURS_MAX = 365;

function jour(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function ilYA(n) {
  return jour(Date.now() - n * 86400000);
}

/** Les chiffres de commerce d'une période, lus dans le registre des paiements. */
async function commerce(db, depuis, jusqua) {
  // Les bornes sont des jours ; les dates stockées sont des instants ISO.
  // On compare donc sur les dix premiers caractères, ce que SQLite fait
  // sans peine et qui évite tout décalage d'heure.
  const bornes = [depuis, jusqua];

  const une = async (sql) => {
    const r = await db.prepare(sql).bind(...bornes).all();
    return (r && r.results) || [];
  };

  const [totaux, parJour, parEtape, abandons] = await Promise.all([
    une("SELECT COUNT(*) AS commandes, " +
        "COALESCE(SUM(CAST(montant AS REAL)), 0) AS chiffre " +
        "FROM paiements WHERE compte_id = 0 AND statut = 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ?"),
    une("SELECT substr(cree_le, 1, 10) AS jour, COUNT(*) AS commandes, " +
        "COALESCE(SUM(CAST(montant AS REAL)), 0) AS chiffre " +
        "FROM paiements WHERE compte_id = 0 AND statut = 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ? GROUP BY jour ORDER BY jour"),
    une("SELECT etape, COUNT(*) AS n FROM paiements " +
        "WHERE compte_id = 0 AND statut = 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ? GROUP BY etape"),
    une("SELECT COUNT(*) AS n FROM paiements " +
        "WHERE compte_id = 0 AND statut <> 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ?"),
  ]);

  const commandes = Number((totaux[0] && totaux[0].commandes) || 0);
  const chiffre = Number((totaux[0] && totaux[0].chiffre) || 0);

  return {
    commandes,
    chiffre: Math.round(chiffre * 100) / 100,
    panier_moyen: commandes ? Math.round((chiffre / commandes) * 100) / 100 : 0,
    // Une commande ouverte puis abandonnée n'est pas un échec du site :
    // c'est quelqu'un qui a renoncé au paiement. Le chiffre mérite d'être
    // vu, pas d'être caché dans le taux de transformation.
    abandons: Number((abandons[0] && abandons[0].n) || 0),
    par_jour: parJour,
    par_etape: parEtape,
  };
}

/** L'état de la chaîne, maintenant : ce qui est resté en route. */
async function enSouffrance(db) {
  const r = await db.prepare(
    "SELECT ref, etape, note, cree_le FROM paiements " +
    "WHERE compte_id = 0 AND statut = 'paye' AND etape <> 'fini' " +
    "ORDER BY cree_le DESC LIMIT 20"
  ).all();
  return (r && r.results) || [];
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  await preparerTable(env.DB);
  await preparerMesure(env.DB);

  const url = new URL(request.url);
  let jours = Number(url.searchParams.get("jours")) || JOURS_DEFAUT;
  if (!Number.isFinite(jours) || jours < 1) jours = JOURS_DEFAUT;
  if (jours > JOURS_MAX) jours = JOURS_MAX;

  const jusqua = jour(Date.now());
  const depuis = ilYA(jours - 1);
  // La période précédente, de même longueur, collée à la première.
  const avantJusqua = ilYA(jours);
  const avantDepuis = ilYA(jours * 2 - 1);

  const [audience, audienceAvant, vente, venteAvant, bloquees] = await Promise.all([
    lireMesure(env.DB, depuis, jusqua),
    lireMesure(env.DB, avantDepuis, avantJusqua),
    commerce(env.DB, depuis, jusqua),
    commerce(env.DB, avantDepuis, avantJusqua),
    enSouffrance(env.DB),
  ]);

  /* Le taux de transformation se calcule sur les sessions, pas sur les
   * pages vues : un visiteur qui regarde dix fiches n'est pas dix
   * occasions d'acheter, c'est une. */
  const taux = (v, a) => (a.sessions ? Math.round((v.commandes / a.sessions) * 10000) / 100 : null);

  return json({
    ok: true,
    periode: { depuis, jusqua, jours },
    periode_precedente: { depuis: avantDepuis, jusqua: avantJusqua },
    audience,
    commerce: { ...vente, taux_transformation: taux(vente, audience) },
    precedent: {
      audience: { vues: audienceAvant.vues, sessions: audienceAvant.sessions },
      commerce: {
        commandes: venteAvant.commandes, chiffre: venteAvant.chiffre,
        panier_moyen: venteAvant.panier_moyen,
        taux_transformation: taux(venteAvant, audienceAvant),
      },
    },
    en_souffrance: bloquees,
    date: new Date().toISOString(),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
