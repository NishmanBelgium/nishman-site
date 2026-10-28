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
import { donneesPortier } from "../_tarifs.js";

export async function onRequestGet({ request, env }) {
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

  // Le nom affiché est celui du compte, pas celui rattaché au code interne :
  // c'est le client qui regarde ses prix, pas NBD. Un visiteur anonyme n'a
  // évidemment ni l'un ni l'autre.
  return json({
    ok: true,
    connecte: !!compte,
    prices: data.prices,
    limits: data.limits || null,
    societe: compte ? compte.salon : null,
    email: compte ? compte.email : null,
    // Le pays décide du seuil de port affiché dans le panier.
    pays: compte ? compte.pays : null,
  }, 200, cookie ? { "set-cookie": cookie } : {});
}

export async function onRequest() {
  return json({ ok: false, raison: "methode" }, 405);
}
