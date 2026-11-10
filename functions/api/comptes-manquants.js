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
      par_le_site: 0, derniere: "",
    });
    e.commandes += 1;
    e.total += Number(c.amount_total || 0);
    if (String(c.client_order_ref || "").indexOf("DEV-") === 0) e.par_le_site += 1;
    if (String(c.date_order || "") > e.derniere) e.derniere = String(c.date_order || "");
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
      chiffre: Math.round(e.total * 100) / 100,
      derniere_commande: e.derniere.slice(0, 10),
    };
    if (!email) { sansAdresse.push(ligne); continue; }

    const etat = comptes.get(cleEmail(email));
    if (etat) { avecCompte += 1; ligne.etat_compte = etat; if (etat !== "actif") perdus.push(ligne); continue; }

    if (e.par_le_site > 0) perdus.push(ligne);
    else aInviter.push(ligne);
  }

  const parChiffre = (a, b) => b.chiffre - a.chiffre;
  perdus.sort(parChiffre);
  aInviter.sort(parChiffre);
  sansAdresse.sort(parChiffre);

  return json({
    ok: true,
    comptes_existants: comptes.size,
    clients_ayant_commande: ids.length,
    clients_avec_compte: avecCompte,
    perdus: {
      combien: perdus.length,
      chiffre: Math.round(perdus.reduce((s, x) => s + x.chiffre, 0) * 100) / 100,
      quoi: "Ils ont commandé par le site, donc ils avaient un compte, et ce "
        + "compte n'existe plus ou n'est plus actif. « Mot de passe oublié » ne "
        + "leur renvoie rien. Ce sont des accès à rétablir, pas des gens à inviter.",
      clients: perdus,
    },
    a_inviter: {
      combien: aInviter.length,
      chiffre: Math.round(aInviter.reduce((s, x) => s + x.chiffre, 0) * 100) / 100,
      quoi: "Ils ont commandé autrement et n'ont jamais eu de compte. "
        + "Rien d'anormal : il suffit de les inviter à en créer un.",
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
