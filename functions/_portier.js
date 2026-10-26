/* ==========================================================================
   PORTIER — l'unique endroit qui sait où joindre le script Google
   et comment lui présenter le code interne.

   Pourquoi ce fichier existe : le code était lu séparément dans cinq
   fichiers, avec cinq fois la même ligne. Le 26 octobre 2026, un code
   recopié dans Cloudflare avec un espace invisible à la fin a fait tomber
   d'un seul coup les prix et l'envoi des devis, sans qu'aucun message ne
   dise pourquoi. Le code est désormais nettoyé une fois pour toutes ici,
   et les appelants ne lisent plus la variable eux-mêmes.
   ========================================================================== */

export const PORTIER_DEFAUT =
  "https://script.google.com/macros/s/AKfycbxGO1OpyvQVYdEKwuDr-TZgkD7Z9zL8Ly0PNZSMJZDnf_mfIHgz0GOGOMOPCzBAQTWMWw/exec";

// Les espaces, tabulations et retours à la ligne autour du code sont
// invisibles à l'oeil et fatals à la comparaison. On les retire.
export function codePortier(env) {
  return String((env && env.PORTIER_CODE) || "").trim();
}

export function adressePortier(env) {
  const brut = (env && (env.PORTIER_URL || env.ORDER_LOG_URL)) || PORTIER_DEFAUT;
  return String(brut).trim();
}

// Le portier répond en JSONP : « nom(<json>); ». On récupère ce qu'il y a
// entre la première parenthèse et la dernière.
export function extraireJson(texte) {
  const t = String(texte || "");
  const debut = t.indexOf("(");
  const fin = t.lastIndexOf(")");
  if (debut === -1 || fin <= debut) return null;
  try { return JSON.parse(t.slice(debut + 1, fin)); }
  catch (e) { return null; }
}

/* Interroge le portier et dit lequel des trois maillons a cédé :
   - « portier »  : le script n'a pas été joint, ou a répondu du charabia
   - « code »     : le script a été joint et a refusé le code interne
   - « ok »       : le script a répondu et accepté                        */
export async function interrogerPortier(env, requete) {
  const code = codePortier(env);
  if (!code) return { etat: "portier", motif: "code absent" };

  const url = adressePortier(env) + "?" + requete
    + "&code=" + encodeURIComponent(code);

  let r;
  try { r = await fetch(url, { headers: { accept: "*/*" } }); }
  catch (e) { return { etat: "portier", motif: "injoignable" }; }
  if (!r.ok) return { etat: "portier", motif: "http " + r.status };

  const donnees = extraireJson(await r.text());
  if (!donnees) return { etat: "portier", motif: "réponse illisible" };
  if (donnees.ok !== true) return { etat: "code", motif: "refus du portier" };
  return { etat: "ok", donnees: donnees };
}
