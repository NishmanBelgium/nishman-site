/* ==========================================================================
   MOLLIE — l'encaissement.

   La clé vit dans la variable secrète MOLLIE_KEY chez Cloudflare. Elle
   n'apparaît ni dans le dépôt, ni dans les journaux, ni dans les réponses
   du site : ce fichier la lit, s'en sert dans l'en-tête d'autorisation, et
   ne la renvoie jamais. Les messages d'erreur reprennent ce que Mollie a
   dit, pas ce qu'on lui a envoyé.

   Mollie distingue deux mondes par le préfixe de la clé : « test_ » ne
   déplace pas d'argent, « live_ » en déplace. Le site doit savoir dans
   lequel il tourne — une page de paiement qui a l'air de marcher en test
   et qui encaisse pour de vrai est la pire des surprises.
   ========================================================================== */

const BASE = "https://api.mollie.com/v2";

export function configureMollie(env) {
  return !!String((env && env.MOLLIE_KEY) || "").trim();
}

/** « test », « reel », ou « inconnu » — déduit du seul préfixe de la clé. */
export function modeMollie(env) {
  const cle = String((env && env.MOLLIE_KEY) || "").trim();
  if (/^test_/.test(cle)) return "test";
  if (/^live_/.test(cle)) return "reel";
  return cle ? "inconnu" : "absente";
}

/**
 * Un appel à Mollie. Renvoie les données, ou lève une erreur portant le
 * statut HTTP — c'est ce statut qui distingue « clé refusée » (401) de
 * « Mollie est en panne » (5xx), et les deux n'appellent pas la même
 * conduite côté client.
 */
export async function appelMollie(env, chemin, options) {
  const cle = String((env && env.MOLLIE_KEY) || "").trim();
  if (!cle) {
    const e = new Error("La clé Mollie n'est pas configurée.");
    e.statut = 0;
    throw e;
  }

  const o = options || {};
  let r;
  try {
    r = await fetch(BASE + chemin, {
      method: o.method || "GET",
      headers: {
        authorization: "Bearer " + cle,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
  } catch (e) {
    const err = new Error("Mollie est injoignable.");
    err.statut = 0;
    throw err;
  }

  const texte = await r.text();
  let donnees = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch (e) { /* réponse non JSON */ }

  if (!r.ok) {
    const motif = (donnees && (donnees.detail || donnees.title)) || ("HTTP " + r.status);
    const err = new Error(String(motif).slice(0, 300));
    err.statut = r.status;
    throw err;
  }
  return donnees;
}
