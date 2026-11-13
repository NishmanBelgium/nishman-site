/* ==========================================================================
   PRIX — les tarifs professionnels, visibles de tous.

   Le navigateur ne connaît aucun code : il demande les prix à son propre
   serveur, qui interroge le portier (le script Google) avec un code qui ne
   quitte jamais Cloudflare.

   Les prix sont servis sans condition depuis l'étape 201 : c'est la commande,
   et non la consultation, qui demande un compte. La session reste lue malgré
   tout — pour la prolonger, et pour dire à la page si elle doit proposer
   « Accès professionnel » ou « Mon compte ».
   ========================================================================== */

import { json, compteConnecte, prolongerSiBesoin } from "../_commun.js";
import { donneesPortier, catalogue, catalogueEnMemoire } from "../_tarifs.js";
import { stockVendable } from "../_stock.js";

/* ==========================================================================
   RIEN NE SORT D'ICI SANS ÊTRE DIT.

   Le 13 novembre 2026, cette page a rendu « Worker threw exception » —
   l'erreur 1101 de Cloudflare — sur chaque appel, pendant des heures. Le
   catalogue professionnel, ses 223 références, affichait « Tarifs
   momentanément indisponibles » : le repli faisait son travail, mais la
   maison ne vendait plus rien en ligne.

   Et il a été IMPOSSIBLE de savoir pourquoi depuis l'extérieur. Chaque
   dépendance était pourtant protégée — le portier, le filet Odoo, le
   catalogue, le relevé de stock ont tous leur try/catch, et leurs erreurs
   remontent en JSON lisible. Ce qui tombait tombait donc AILLEURS : entre
   ces blocs, ou dans la plateforme elle-même (temps processeur dépassé,
   mémoire, limite de sous-requêtes), là où aucun catch local ne regardait.
   Une page 1101 ne dit rien : ni le message, ni la ligne.

   D'où cette enveloppe. Elle ne change RIEN au chemin normal — le corps
   est intact, déplacé tel quel dans `servir`. Elle garantit seulement
   deux choses :

     - LE CATALOGUE N'A PLUS JAMAIS DE 1101. Il reçoit un JSON, donc il
       affiche son repli au lieu d'une page d'erreur Cloudflare.
     - LA CAUSE EST ÉCRITE DANS LA RÉPONSE. `raison: "exception"` et le
       message exact, consultable par n'importe qui depuis le navigateur,
       sans journal ni tableau de bord.

   Si malgré cette enveloppe l'appel rend encore 1101, l'information est
   tout aussi précieuse : c'est qu'aucun code JavaScript ne s'exécute plus
   au moment de la chute — la plateforme a tué l'isolat — et il faut
   alléger la page, pas la corriger.
   ========================================================================== */
export async function onRequestGet(ctx) {
  try {
    return await servir(ctx);
  } catch (e) {
    const m = String((e && e.message) || e).slice(0, 300);
    const pile = String((e && e.stack) || "").split("\n").slice(0, 4).join(" | ").slice(0, 400);
    return json({ ok: false, raison: "exception", detail: m, pile });
  }
}

async function servir(ctx) {
  const { request, env } = ctx;
  // Lié à son contexte : waitUntil déstructuré perd son destinataire et
  // lève à l'appel. L'enveloppe garde aussi le site debout sur une
  // plateforme qui ne l'offrirait pas.
  const attendre = (p) => { try { ctx.waitUntil(p); } catch (e) { /* tant pis */ } };
  if (!env.DB) return json({ ok: false, raison: "base" });

  const compte = await compteConnecte(request, env.DB);

  // Le catalogue appelle cette page à chaque visite : c'est le meilleur
  // endroit pour repousser l'échéance de la session.
  const cookie = compte ? await prolongerSiBesoin(env.DB, compte) : null;

  // « portier » = le script n'a pas répondu ; « code » = il a répondu et a
  // refusé le code interne. Les deux donnaient le même mot avant le 214,
  // ce qui rendait la panne du 26 octobre indéchiffrable depuis la page.
  // Les mêmes prix que le panier et la commande, gardés une minute.
  let data;
  try { data = await donneesPortier(env); }
  catch (e) {
    const m = String((e && e.message) || "");
    return json({ ok: false, raison: m.indexOf("code") >= 0 ? "code" : "portier" });
  }

  // Les limites affichées doivent être celles que le serveur appliquera au
  // moment de valider. Sinon le client compose un panier que la commande
  // refuse, ce qui est la pire façon de dire « c'est épuisé ».
  //
  // Elles viennent donc d'Odoo, comme le contrôle. Si Odoo ne répond pas on
  // retombe sur celles du portier : des limites approximatives valent mieux
  // qu'un catalogue sans aucune limite, et le contrôle serveur tient le
  // filet de toute façon.
  let limits = data.limits || null;
  /* D'où viennent les limites servies, et ce qui a empêché les bonnes.
   *
   * Ce repli était muet. Le 5 novembre 2026, il a fallu comparer la forme
   * des valeurs rendues pour s'apercevoir que le catalogue affichait les
   * limites approximatives du script Google au lieu du stock réel d'Odoo
   * — rien, dans la réponse, ne le disait. Un repli qui ne s'annonce pas
   * est un repli qu'on découvre trop tard. */
  let limitesSource = "portier";
  let limitesSouci = "";

  /* Une seule forme de réponse, construite au moment où on la rend.
     Les trois variables ci-dessus sont lues à l'appel, pas à la
     définition : le départ anticipé plus bas et la fin normale rendent
     donc exactement la même chose, sans qu'on ait à tenir deux copies du
     même objet à jour. */
  const reponse = () => json({
    ok: true,
    // Le nom affiché est celui du compte, pas celui rattaché au code
    // interne : c'est le client qui regarde ses prix, pas NBD. Un
    // visiteur anonyme n'a évidemment ni l'un ni l'autre.
    connecte: !!compte,
    prices: data.prices,
    limits,
    // « odoo » = le stock réel ; « portier » = des limites approximatives,
    // et limites_souci dit ce qui a empêché les vraies.
    limites_source: limitesSource,
    limites_souci: limitesSouci,
    // D'où viennent les PRIX. « portier » = la table du script Google, à
    // jour. « secours » = la dernière table connue, resservie parce que le
    // portier se taisait, avec son âge en secondes. Un repli muet serait
    // un repli qu'on découvre trop tard — voir la note dans _tarifs.js.
    prix_source: data.source || "portier",
    prix_age_s: data.age_s || 0,
    societe: compte ? compte.salon : null,
    email: compte ? compte.email : null,
    // Le pays décide du seuil de port affiché dans le panier.
    pays: compte ? compte.pays : null,
  }, 200, cookie ? { "set-cookie": cookie } : {});

  /* ====================================================================
     LES LIMITES NE DOIVENT JAMAIS COÛTER LES PRIX.

     Ce qui suit — analyser les 334 Ko de products.json, puis relever le
     stock de 223 références dans Odoo — ne sert QU'À calculer les
     limites. Les prix, eux, sont déjà là, au-dessus.

     Le 13 novembre 2026, ce bloc a mis le catalogue professionnel à
     l'arrêt pendant des heures. Sur un isolat froid, ce travail dépasse
     le temps processeur accordé par Cloudflare : la plateforme tue
     l'isolat, la page rend « Worker threw exception », et le visiteur ne
     voit AUCUN prix. Les limites, qui ne sont qu'un confort d'affichage,
     emportaient ainsi la seule chose qui compte vraiment.

     Le symptôme était sournois : dès qu'une requête passait, elle
     remplissait les caches et les suivantes répondaient en 80 ms. La
     panne se résorbait donc toute seule sous trafic, et revenait dès que
     les isolats refroidissaient. Trois jours de coupures intermittentes
     avant de devenir permanente.

     D'où la règle posée ici : on ne fait ce travail en ligne QUE s'il est
     déjà gratuit, c'est-à-dire si le catalogue est en mémoire. Sinon on
     sert immédiatement les limites du portier — le repli documenté plus
     haut, que le catalogue sait déjà afficher — et on préchauffe en
     arrière-plan pour que la requête suivante ait les vraies.

     Autrement dit : une page un peu moins précise pendant une requête,
     plutôt qu'une page morte pendant des heures. */
  if (!catalogueEnMemoire()) {
    limitesSouci = "démarrage à froid : limites réelles en préparation";
    attendre((async () => {
      try {
        const p = await catalogue(request);
        await stockVendable(env, (p || []).map((x) => x && x.ean), { attendre: attendre });
      } catch (e) { /* la requête suivante réessaiera */ }
    })());
    return reponse();
  }

  try {
    const produits = await catalogue(request);
    const dispo = await stockVendable(env, (produits || []).map((p) => p && p.ean),
      { attendre: attendre });
    const calculees = {};
    for (const p of produits || []) {
      if (!p || !p.ean) continue;
      const u = dispo[String(p.ean)] || 0;
      const parCarton = Math.max(0, Math.floor(Number(p.box_qty) || 0));
      calculees[String(p.ean)] = {
        u,
        b: parCarton ? Math.floor(u / parCarton) : 0,
        state: u > 0 ? "ok" : "out",
      };
    }
    if (Object.keys(calculees).length) {
      limits = calculees;
      limitesSource = "odoo";
    } else {
      limitesSouci = "catalogue vide : " + ((produits || []).length) + " référence(s)";
    }
  } catch (e) {
    // On garde celles du portier, mais on dit pourquoi.
    limitesSouci = String((e && e.message) || e).slice(0, 200);
  }

  return reponse();
}

export async function onRequest() {
  return json({ ok: false, raison: "methode" }, 405);
}
