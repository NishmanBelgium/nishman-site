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
import { donneesPortier, catalogue } from "../_tarifs.js";
import { stockVendable } from "../_stock.js";

export async function onRequestGet(ctx) {
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

  // Le nom affiché est celui du compte, pas celui rattaché au code interne :
  // c'est le client qui regarde ses prix, pas NBD. Un visiteur anonyme n'a
  // évidemment ni l'un ni l'autre.
  return json({
    ok: true,
    connecte: !!compte,
    prices: data.prices,
    limits,
    // « odoo » = le stock réel ; « portier » = des limites approximatives,
    // et limites_souci dit ce qui a empêché les vraies.
    limites_source: limitesSource,
    limites_souci: limitesSouci,
    societe: compte ? compte.salon : null,
    email: compte ? compte.email : null,
    // Le pays décide du seuil de port affiché dans le panier.
    pays: compte ? compte.pays : null,
  }, 200, cookie ? { "set-cookie": cookie } : {});
}

export async function onRequest() {
  return json({ ok: false, raison: "methode" }, 405);
}
