/* ==========================================================================
   COMPTES MANQUANTS — qui a commandé, et ne peut plus se connecter.

   CE QUI A DÉCLENCHÉ CETTE PAGE. Le 10 novembre 2026, un coiffeur ne reçoit
   pas son lien de réinitialisation. Vérification faite : aucun compte sous
   son adresse. Sauf qu'il a passé QUATRE commandes par le site, la dernière
   le 7 octobre — et api/devis.js refuse toute demande sans compte connecté.
   Son compte a donc existé, puis a disparu.

   On a d'abord cru à un oubli de sa part. C'était une erreur de lecture :
   on expliquait l'écart entre 119 clients et 68 comptes en supposant que
   les autres n'avaient jamais ouvert de compte. Pour une partie d'entre
   eux, c'est faux — ils en avaient un, puisqu'ils ont commandé avec.

   Cette page cesse de supposer. Elle croise ce qu'Odoo sait des commandes
   avec ce que la base du site sait des comptes, et distingue deux
   populations qu'il ne faut surtout pas confondre :

   « perdus »   — ils ont commandé PAR LE SITE, donc ils avaient un compte,
                  et ce compte n'existe plus. Pour eux, « mot de passe
                  oublié » est une impasse muette et ils ne peuvent plus
                  commander. C'est un incident, pas une invitation à
                  envoyer.

   « a_inviter » — ils ont commandé autrement (au téléphone, au comptoir,
                  par mail) et n'ont jamais eu de compte. Pour eux, tout
                  est normal : il suffit de les inviter à en créer un.

   La distinction change tout : à un client qui a perdu son compte on ne
   dit pas « créez-en un », on s'excuse et on le rétablit.

   Lecture seule. Ne crée, ne modifie et n'efface aucun compte : rendre
   leur accès à des gens se décide, ça ne s'automatise pas au détour d'un
   rapport. Réservée au compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin, cleEmail } from "../_commun.js";
import { appel, configure } from "../_odoo.js";

/* LA DATE QUI CHANGE TOUT, ET QUE LA PREMIÈRE VERSION IGNORAIT.
 *
 * Écrite le 10 novembre 2026, cette page raisonnait ainsi : « il a commandé
 * par le site, donc il avait un compte ». Elle en concluait que 78 clients
 * avaient perdu le leur, pour 60 078 € de chiffre, et annonçait une perte
 * de données qui n'a jamais eu lieu.
 *
 * C'était faux, et NBD l'a dit tout de suite : avant la mi-octobre, le
 * tunnel professionnel fonctionnait au CODE D'ACCÈS, envoyé par courriel,
 * sans aucun compte ni mot de passe. Les comptes sont arrivés ensuite — le
 * plus ancien date du 15 octobre 2026. Une commande d'août ou de septembre
 * ne prouve donc rien du tout.
 *
 * La leçon est plus large que cette page : un raisonnement juste
 * aujourd'hui peut être faux appliqué à hier, et un système qui a changé
 * de règles en cours de route rend les déductions sur son passé
 * trompeuses. Il fallait une date, et la voici.
 *
 * Seules les commandes passées APRÈS cette date impliquent qu'un compte
 * existait. */
const COMPTES_DEPUIS = "2026-10-15";

export async function onRequestGet({ request, env }) {
  const admin = await compteAdmin(request, env);
  if (!admin) return erreur("Réservé à NBD.", 403, "reserve");

  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500, "base_absente");
  if (!configure(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

  /* 1. Les commandes, et la façon dont elles sont nées. Une référence
   *    « DEV-… » signifie que le site l'a créée, donc que son auteur était
   *    connecté à un compte à ce moment-là. */
  let commandes;
  try {
    commandes = await appel(env, "sale.order", "search_read",
      [[["state", "in", ["sale", "done"]]],
       ["partner_id", "client_order_ref", "date_order", "amount_total"]],
      { limit: 1000 });
  } catch (e) {
    return erreur("Odoo n'a pas répondu : " + String((e && e.message) || "").slice(0, 120),
      502, "odoo_muet");
  }

  const parClient = {};
  for (const c of commandes || []) {
    if (!Array.isArray(c.partner_id)) continue;
    const id = c.partner_id[0];
    const e = (parClient[id] = parClient[id] || {
      id, nom: c.partner_id[1], commandes: 0, total: 0,
      par_le_site: 0, par_le_site_depuis_comptes: 0, derniere: "",
    });
    e.commandes += 1;
    e.total += Number(c.amount_total || 0);
    const date = String(c.date_order || "");
    const duSite = String(c.client_order_ref || "").indexOf("DEV-") === 0;
    if (duSite) {
      e.par_le_site += 1;
      // Seules celles-ci prouvent qu'un compte a existé.
      if (date.slice(0, 10) >= COMPTES_DEPUIS) e.par_le_site_depuis_comptes += 1;
    }
    if (date > e.derniere) e.derniere = date;
  }

  const ids = Object.keys(parClient).map(Number);
  const fiches = [];
  for (let i = 0; i < ids.length; i += 100) {
    const bout = await appel(env, "res.partner", "search_read",
      [[["id", "in", ids.slice(i, i + 100)]], ["name", "email", "phone", "city"]],
      { limit: 200 });
    if (bout && bout.length) fiches.push(...bout);
  }
  const parId = {};
  for (const f of fiches) parId[f.id] = f;

  /* 2. Les comptes qui existent aujourd'hui, par clé d'adresse. */
  const r = await db.prepare("SELECT email_cle, etat FROM comptes").all();
  const comptes = new Map();
  for (const x of ((r && r.results) || [])) comptes.set(x.email_cle, x.etat);

  /* 3. Le croisement. */
  const perdus = [], aInviter = [], sansAdresse = [];
  let avecCompte = 0;

  for (const id of ids) {
    const e = parClient[id];
    const f = parId[id] || {};
    const email = String(f.email || "").trim();
    const ligne = {
      client: f.name || e.nom, email: email || null,
      telephone: f.phone || null, ville: f.city || null,
      commandes: e.commandes, par_le_site: e.par_le_site,
      par_le_site_depuis_comptes: e.par_le_site_depuis_comptes,
      chiffre: Math.round(e.total * 100) / 100,
      derniere_commande: e.derniere.slice(0, 10),
    };
    if (!email) { sansAdresse.push(ligne); continue; }

    const etat = comptes.get(cleEmail(email));
    if (etat) { avecCompte += 1; ligne.etat_compte = etat; if (etat !== "actif") perdus.push(ligne); continue; }

    /* Le compte n'existe pas. Est-ce une perte, ou n'y en a-t-il jamais eu ?
     * Seule une commande passée par le site APRÈS l'arrivée des comptes
     * tranche. Avant, le code d'accès suffisait. */
    if (e.par_le_site_depuis_comptes > 0) perdus.push(ligne);
    else aInviter.push(ligne);
  }

  const parChiffre = (a, b) => b.chiffre - a.chiffre;
  perdus.sort(parChiffre);
  aInviter.sort(parChiffre);
  sansAdresse.sort(parChiffre);

  return json({
    ok: true,
    comptes_depuis: COMPTES_DEPUIS,
    comptes_existants: comptes.size,
    clients_ayant_commande: ids.length,
    clients_avec_compte: avecCompte,
    perdus: {
      combien: perdus.length,
      chiffre: Math.round(perdus.reduce((s, x) => s + x.chiffre, 0) * 100) / 100,
      quoi: "Ils ont commandé par le site APRÈS le " + COMPTES_DEPUIS + ", donc "
        + "avec un compte, et ce compte n'existe plus ou n'est plus actif. "
        + "« Mot de passe oublié » ne leur renvoie rien. Ce sont des accès à "
        + "rétablir, pas des gens à inviter. Une liste vide est le cas normal.",
      clients: perdus,
    },
    a_inviter: {
      combien: aInviter.length,
      chiffre: Math.round(aInviter.reduce((s, x) => s + x.chiffre, 0) * 100) / 100,
      quoi: "Ils n'ont jamais eu de compte : commandes passées autrement, ou "
        + "par le site avant le " + COMPTES_DEPUIS + ", à l'époque où le code "
        + "d'accès suffisait. Rien d'anormal : il suffit de les inviter.",
      clients: aInviter,
    },
    sans_adresse: {
      combien: sansAdresse.length,
      quoi: "Aucune adresse e-mail dans Odoo : on ne peut ni les inviter ni "
        + "retrouver leur compte tant qu'elle n'est pas renseignée.",
      clients: sansAdresse,
    },
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
