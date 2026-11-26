/* ==========================================================================
   LIRE LE JOURNAL D'INCIDENTS — le pendant manquant de incident.js.

   Écrit le 26 novembre 2026.

   Le registre des incidents existe depuis le 17 novembre et il a bien fait
   son travail : chaque échec de commande y est inscrit, avec l'étape, le
   statut, le pays, l'appareil et — le champ le plus précieux — le compte de
   la personne qui a échoué, pour pouvoir la rappeler.

   Mais il n'avait aucune lecture. Pas de GET, pas d'écran, rien. Pour
   savoir ce qu'il contenait il fallait ouvrir la console D1 de Cloudflare
   et écrire du SQL à la main. Autrement dit : un registre que personne ne
   lit.

   C'est ce qui a permis à la panne française de durer six jours. Les
   échecs étaient tous là, rangés par jour, à portée d'une requête. Entre
   le 20 et le 26 novembre le registre savait déjà tout : cinq salons
   français au tunnel professionnel, dix clientes à la boutique, trente-sept
   tentatives. Personne n'avait les yeux dessus.

   UN REGISTRE QU'ON NE SAIT PAS LIRE N'EST PAS UNE SURVEILLANCE, C'EST UNE
   ARCHIVE.

   Réservé au compte de NBD : la table contient les comptes et les pays des
   personnes qui ont échoué.
   ========================================================================== */

/* lireIncidents() existait déjà dans _incidents.js — écrite, exportée, et
   appelée par personne. Le registre avait sa lecture depuis le premier
   jour ; il lui manquait seulement une porte. La voici. Elle crée la table
   au besoin, donc un site qui n'a jamais eu d'incident répond proprement
   au lieu de tomber sur une table absente. */
import { json, erreur, compteAdmin } from "../_commun.js";
import { lireIncidents } from "../_incidents.js";

/* Combien de jours on regarde par défaut. Sept couvre la semaine écoulée,
   donc une panne qui aurait commencé un vendredi soir. */
const JOURS_DEFAUT = 7;
const JOURS_MAX = 60;
const LIGNES_MAX = 300;

/* Le détail est utile mais encombrant, et quand Cloudflare a remplacé la
   réponse il ne vaut plus rien : 294 caractères de page d'erreur, toujours
   les mêmes. On le reconnaît et on le dit en trois mots, plutôt que de
   recopier du HTML dans un rapport. */
function corpsRecu(detail) {
  const d = String(detail || "");
  if (!d) return "";
  if (/^\s*<!DOCTYPE html>/i.test(d)) return "page d'erreur de Cloudflare (motif perdu)";
  if (/^\s*[{[]/.test(d)) return "réponse JSON du site : " + d.slice(0, 200);
  return d.slice(0, 200);
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");

  const url = new URL(request.url);
  let jours = Number(url.searchParams.get("jours") || JOURS_DEFAUT);
  if (!Number.isFinite(jours) || jours < 1) jours = JOURS_DEFAUT;
  if (jours > JOURS_MAX) jours = JOURS_MAX;

  const depuis = new Date(Date.now() - jours * 86400000).toISOString();

  let lignes = [];
  try {
    const toutes = await lireIncidents(env.DB, LIGNES_MAX);
    lignes = toutes.filter((l) => String(l.quand || "") >= depuis);
  } catch (e) {
    return erreur("Le registre n'a pas répondu : " + String((e && e.message) || e).slice(0, 160),
                  503, "registre");
  }

  if (!lignes.length) {
    return json({
      ok: true, jours, total: 0, foyers: [], lignes: [],
      resume: "Aucun incident sur " + jours + " jours.",
    });
  }

  /* LE REGROUPEMENT QUI DÉSIGNE UNE PANNE.
   *
   * Une ligne isolée est du bruit : une connexion coupée, un onglet laissé
   * ouvert, un robot. Ce qui désigne une panne, c'est la répétition sur un
   * même couple étape + pays, et surtout plusieurs PERSONNES différentes :
   * une seule qui insiste huit fois peut avoir un souci chez elle, trois
   * comptes distincts qui échouent au même endroit, non. */
  /* DEUX FAMILLES QU'IL NE FAUT PAS MÊLER — c'est déjà écrit dans
     _incidents.js, et la première version de cet écran l'avait oublié :
     « la connexion a lâché » et « le serveur a répondu 502 » sont deux
     problèmes opposés, l'un ne nous regarde pas, l'autre est le nôtre.

     statut 0 : le navigateur n'a jamais reçu de réponse. Métro, tunnel,
     wifi d'hôtel, onglet fermé en cours de route. On les garde — trois
     clientes qui lâchent au même endroit peut révéler une page trop lourde
     — mais on ne les appelle pas une panne du site.

     statut >= 500 : le site a répondu, et il a répondu qu'il n'y arrivait
     pas. Celle-là est à nous.

     ET LE COMPTEUR DE PERSONNES, corrigé dans le même mouvement. Une
     visiteuse non connectée porte `compte_id` nul : les compter comme une
     seule personne cachait l'ampleur — « boutique · FR, 44 tentatives,
     2 personnes », là où c'étaient dix clientes distinctes. On compte donc
     les comptes identifiés d'un côté, les tentatives anonymes de l'autre,
     et on ne prétend pas savoir combien de personnes se cachent derrière
     les secondes. */
  const groupes = new Map();
  for (const l of lignes) {
    const statut = Number(l.statut);
    const famille = statut === 0 ? "connexion" : (statut >= 500 ? "serveur" : null);
    if (!famille) continue;

    const cle = famille + " :: " + (l.etape || "?") + " · " + (l.pays || "?");
    let g = groupes.get(cle);
    if (!g) {
      g = { famille, ou: (l.etape || "?") + " · " + (l.pays || "?"),
            etape: l.etape || "", pays: l.pays || "", tentatives: 0, anonymes: 0,
            comptes: new Set(), statuts: new Set(), premier: l.quand, dernier: l.quand };
      groupes.set(cle, g);
    }
    g.tentatives += 1;
    if (l.compte_id) g.comptes.add(l.compte_id); else g.anonymes += 1;
    g.statuts.add(statut);
    if (l.quand < g.premier) g.premier = l.quand;
    if (l.quand > g.dernier) g.dernier = l.quand;
  }

  const foyers = [...groupes.values()]
    .map((g) => ({
      famille: g.famille,
      ou: g.ou,
      etape: g.etape,
      pays: g.pays,
      tentatives: g.tentatives,
      comptes_identifies: [...g.comptes],
      tentatives_anonymes: g.anonymes,
      statuts: [...g.statuts].sort((a, b) => a - b),
      premier: g.premier,
      dernier: g.dernier,
      /* Ce qui fait une panne plutôt qu'un incident : plusieurs comptes
         distincts au même endroit, ou assez de tentatives anonymes pour
         qu'une seule personne acharnée ne suffise plus à l'expliquer. Et
         seulement du côté serveur : une connexion perdue n'est pas notre
         panne, même répétée. */
      panne: g.famille === "serveur"
             && (g.comptes.size > 1 || g.anonymes >= 5 || g.tentatives >= 5),
    }))
    .sort((a, b) => b.tentatives - a.tentatives);

  const pannes = foyers.filter((f) => f.panne);
  const dit = (f) => {
    const qui = [];
    if (f.comptes_identifies.length) {
      qui.push(f.comptes_identifies.length + " compte"
               + (f.comptes_identifies.length > 1 ? "s" : ""));
    }
    if (f.tentatives_anonymes) qui.push(f.tentatives_anonymes + " anonymes");
    return f.ou + " (" + f.tentatives + " tentatives — " + (qui.join(" + ") || "?") + ")";
  };

  return json({
    ok: pannes.length === 0,
    jours,
    total: lignes.length,
    resume: pannes.length === 0
      ? "Aucun foyer de panne du site sur " + jours + " jours."
      : "FOYERS DE PANNE : " + pannes.map(dit).join(" · "),
    foyers,
    lignes: lignes.map((l) => ({
      quand: l.quand,
      etape: l.etape,
      cause: l.cause,
      statut: l.statut,
      pays: l.pays,
      appareil: l.appareil,
      compte_id: l.compte_id,
      corps_recu: corpsRecu(l.detail),
    })),
  });
}
