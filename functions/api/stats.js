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
import { lireMesure, preparerMesure, lireGestes } from "../_mesure.js";

const JOURS_DEFAUT = 30;
const JOURS_MAX = 365;

function jour(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function ilYA(n) {
  return jour(Date.now() - n * 86400000);
}

/** Les chiffres de commerce d'une période, lus dans le registre des paiements.
 *
 * Le côté change tout. La boutique encaisse des particuliers (compte_id
 * à zéro) ; le catalogue encaisse des salons connectés. Mêler les deux
 * donne un panier moyen qui ne correspond à personne : vingt euros de
 * cire et trois cents euros de carton ne se moyennent pas. */
export async function commerce(db, depuis, jusqua, cote) {
  const quiPaie = cote === "pro" ? "compte_id <> 0" : "compte_id = 0";
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
        "FROM paiements WHERE " + quiPaie + " AND statut = 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ?"),
    une("SELECT substr(cree_le, 1, 10) AS jour, COUNT(*) AS commandes, " +
        "COALESCE(SUM(CAST(montant AS REAL)), 0) AS chiffre " +
        "FROM paiements WHERE " + quiPaie + " AND statut = 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ? GROUP BY jour ORDER BY jour"),
    une("SELECT etape, COUNT(*) AS n FROM paiements " +
        "WHERE " + quiPaie + " AND statut = 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ? GROUP BY etape"),
    une("SELECT COUNT(*) AS n FROM paiements " +
        "WHERE " + quiPaie + " AND statut <> 'paye' " +
        "AND substr(cree_le, 1, 10) BETWEEN ? AND ?"),
  ]);

  const commandes = Number((totaux[0] && totaux[0].commandes) || 0);
  const chiffre = Number((totaux[0] && totaux[0].chiffre) || 0);

  return {
    cote: cote === "pro" ? "pro" : "boutique",
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

/** L'état de la chaîne, maintenant : ce qui est resté en route.
 *
 * Les deux côtés y figurent, avec la mention de celui dont il s'agit :
 * une commande bloquée est une commande bloquée, qu'elle vienne d'un
 * salon ou d'un particulier, et c'est la seule liste de cette page qui
 * demande un geste plutôt qu'une lecture. */
export async function enSouffrance(db) {
  const r = await db.prepare(
    "SELECT ref, etape, note, cree_le, " +
    "CASE WHEN compte_id = 0 THEN 'boutique' ELSE 'pro' END AS cote " +
    "FROM paiements WHERE statut = 'paye' AND etape <> 'fini' " +
    "ORDER BY cree_le DESC LIMIT 20"
  ).all();
  return (r && r.results) || [];
}

/** Les clients professionnels : qui s'est inscrit, et d'où.
 *
 * Le côté boutique n'a pas de clients à compter — on y achète sans
 * compte, et c'est voulu. Un salon, lui, ouvre un compte avant de
 * commander : la courbe des inscriptions est l'indicateur avancé des
 * commandes qui viendront. */
export async function clients(db, depuis, jusqua) {
  const une = async (sql, bornes) => {
    try {
      const r = await db.prepare(sql).bind(...bornes).all();
      return (r && r.results) || [];
    } catch (e) {
      /* La table n'existe pas encore sur une base neuve. Un tableau de
         bord qui tombe en panne pour cela ne rend service à personne. */
      return [];
    }
  };

  const [nouveaux, total, parPays, parJour] = await Promise.all([
    une("SELECT COUNT(*) AS n FROM comptes WHERE substr(cree_le, 1, 10) BETWEEN ? AND ?",
        [depuis, jusqua]),
    une("SELECT COUNT(*) AS n FROM comptes", []),
    une("SELECT pays, COUNT(*) AS n FROM comptes GROUP BY pays ORDER BY n DESC LIMIT 10", []),
    une("SELECT substr(cree_le, 1, 10) AS jour, COUNT(*) AS n FROM comptes " +
        "WHERE substr(cree_le, 1, 10) BETWEEN ? AND ? GROUP BY jour ORDER BY jour",
        [depuis, jusqua]),
  ]);

  return {
    nouveaux: Number((nouveaux[0] && nouveaux[0].n) || 0),
    total: Number((total[0] && total[0].n) || 0),
    par_pays: parPays,
    par_jour: parJour,
  };
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

  const [
    audience, audienceAvant,
    audienceBoutique, audienceBoutiqueAvant,
    audiencePro, audienceProAvant,
    vente, venteAvant,
    ventePro, venteProAvant,
    gens, gensAvant, portes, bloquees,
  ] = await Promise.all([
    lireMesure(env.DB, depuis, jusqua),
    lireMesure(env.DB, avantDepuis, avantJusqua),
    lireMesure(env.DB, depuis, jusqua, "boutique"),
    lireMesure(env.DB, avantDepuis, avantJusqua, "boutique"),
    lireMesure(env.DB, depuis, jusqua, "pro"),
    lireMesure(env.DB, avantDepuis, avantJusqua, "pro"),
    commerce(env.DB, depuis, jusqua, "boutique"),
    commerce(env.DB, avantDepuis, avantJusqua, "boutique"),
    commerce(env.DB, depuis, jusqua, "pro"),
    commerce(env.DB, avantDepuis, avantJusqua, "pro"),
    clients(env.DB, depuis, jusqua),
    clients(env.DB, avantDepuis, avantJusqua),
    lireGestes(env.DB, depuis, jusqua),
    enSouffrance(env.DB),
  ]);

  /* Le taux de transformation se calcule sur les sessions, pas sur les
   * pages vues : un visiteur qui regarde dix fiches n'est pas dix
   * occasions d'acheter, c'est une. */
  const taux = (v, a) => (a.sessions ? Math.round((v.commandes / a.sessions) * 10000) / 100 : null);

  /* Chaque côté se juge sur son propre public. Rapporter les commandes
     de la boutique à l'audience totale du site — catalogue professionnel
     compris — donnerait un taux de transformation artificiellement bas,
     et décourageant pour rien. */
  const cote = (nom, v, a, vAv, aAv) => ({
    audience: a,
    commerce: { ...v, taux_transformation: taux(v, a) },
    precedent: {
      audience: { vues: aAv.vues, sessions: aAv.sessions },
      commerce: {
        commandes: vAv.commandes, chiffre: vAv.chiffre,
        panier_moyen: vAv.panier_moyen,
        taux_transformation: taux(vAv, aAv),
      },
    },
  });

  return json({
    ok: true,
    periode: { depuis, jusqua, jours },
    periode_precedente: { depuis: avantDepuis, jusqua: avantJusqua },

    /* La vue d'ensemble. « audience » porte la répartition par moitié de
       site, « commerce » reste la boutique : c'est le seul canal qui
       encaisse en ligne sans compte, et le confondre avec le
       professionnel ferait mentir le panier moyen. */
    audience,
    commerce: { ...vente, taux_transformation: taux(vente, audienceBoutique) },
    precedent: {
      audience: {
        vues: audienceAvant.vues, sessions: audienceAvant.sessions,
        /* La répartition d'avant, pour que les deux cartes de segment
           portent une vraie comparaison au lieu d'un « nouveau » qui ne
           veut rien dire. */
        par_segment: audienceAvant.par_segment,
      },
      commerce: {
        commandes: venteAvant.commandes, chiffre: venteAvant.chiffre,
        panier_moyen: venteAvant.panier_moyen,
        taux_transformation: taux(venteAvant, audienceBoutiqueAvant),
      },
    },

    boutique: cote("boutique", vente, audienceBoutique, venteAvant, audienceBoutiqueAvant),
    pro: cote("pro", ventePro, audiencePro, venteProAvant, audienceProAvant),

    clients: { ...gens, nouveaux_avant: gensAvant.nouveaux },

    /* Les deux portes de l'accueil. Comptées depuis le 29 octobre 2026 :
       avant cette date, il n'y a rien, et le tableau de bord doit le dire
       plutôt que d'afficher un zéro qui ressemble à un échec. */
    portes,

    en_souffrance: bloquees,
    date: new Date().toISOString(),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
