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

const PORTIER_DEFAUT =
  "https://script.google.com/macros/s/AKfycbxGO1OpyvQVYdEKwuDr-TZgkD7Z9zL8Ly0PNZSMJZDnf_mfIHgz0GOGOMOPCzBAQTWMWw/exec";

// Le portier répond en JSONP : « nom(<json>); ». On récupère ce qu'il y a
// entre la première parenthèse et la dernière.
function extraireJson(texte) {
  const debut = texte.indexOf("(");
  const fin = texte.lastIndexOf(")");
  if (debut === -1 || fin <= debut) return null;
  try { return JSON.parse(texte.slice(debut + 1, fin)); }
  catch (e) { return null; }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, raison: "base" });

  const compte = await compteConnecte(request, env.DB);

  // Le catalogue appelle cette page à chaque visite : c'est le meilleur
  // endroit pour repousser l'échéance de la session.
  const cookie = compte ? await prolongerSiBesoin(env.DB, compte) : null;

  const code = env.PORTIER_CODE;
  if (!code) return json({ ok: false, raison: "portier" });

  const url = (env.PORTIER_URL || PORTIER_DEFAUT)
    + "?action=unlock&callback=p&code=" + encodeURIComponent(code);

  let reponse;
  try {
    reponse = await fetch(url, { headers: { accept: "*/*" } });
  } catch (e) {
    return json({ ok: false, raison: "portier" });
  }
  if (!reponse.ok) return json({ ok: false, raison: "portier" });

  const data = extraireJson(await reponse.text());
  if (!data || !data.ok || !data.prices) return json({ ok: false, raison: "portier" });

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
  }, 200, cookie ? { "set-cookie": cookie } : {});
}

export async function onRequest() {
  return json({ ok: false, raison: "methode" }, 405);
}
