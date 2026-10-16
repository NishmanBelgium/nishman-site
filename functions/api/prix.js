/* ==========================================================================
   PRIX — les tarifs professionnels, servis uniquement à une session ouverte.

   Avant, le navigateur réclamait les prix au portier (le script Google) en
   présentant un code d'accès. Le code circulait donc chez le visiteur, et se
   recopiait d'un salon à l'autre. Désormais c'est le serveur qui interroge le
   portier, avec un code qui ne quitte jamais Cloudflare, et il ne le fait que
   si le cookie de session correspond à un compte actif.
   ========================================================================== */

import { json, compteConnecte } from "../_commun.js";

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
  if (!compte) return json({ ok: false, raison: "anonyme" });

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
  // c'est le client qui regarde ses prix, pas NBD.
  return json({
    ok: true,
    prices: data.prices,
    limits: data.limits || null,
    societe: compte.salon,
    email: compte.email,
  });
}

export async function onRequest() {
  return json({ ok: false, raison: "methode" }, 405);
}
