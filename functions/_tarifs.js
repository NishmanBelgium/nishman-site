/* ==========================================================================
   TARIFS — le catalogue et la table de prix, en un seul endroit.

   Deux points d'entrée en ont besoin : le panier, qui affiche un montant, et
   la commande, qui l'engage. Ils doivent lire la même chose, sinon le client
   voit un total et paie un autre. D'où ce module, et le cache partagé qui va
   avec : une seule source, une seule durée de vie.
   ========================================================================== */

const PORTIER_DEFAUT =
  "https://script.google.com/macros/s/AKfycbxGO1OpyvQVYdEKwuDr-TZgkD7Z9zL8Ly0PNZSMJZDnf_mfIHgz0GOGOMOPCzBAQTWMWw/exec";

// Le script Google répond en JSONP : « p({...}) ». On extrait l'objet.
function extraireJson(texte) {
  const debut = texte.indexOf("(");
  const fin = texte.lastIndexOf(")");
  if (debut === -1 || fin <= debut) return null;
  try { return JSON.parse(texte.slice(debut + 1, fin)); } catch (e) { return null; }
}

let cacheCatalogue = null;
let cachePrix = null;
let cachePrixExpire = 0;
const PRIX_DUREE_MS = 60 * 1000;

export async function catalogue(request) {
  if (cacheCatalogue) return cacheCatalogue;
  const r = await fetch(new URL("/assets/data/products.json", request.url));
  if (!r.ok) throw new Error("catalogue injoignable");
  const d = await r.json();
  cacheCatalogue = Array.isArray(d) ? d : (d.products || []);
  return cacheCatalogue;
}

export async function tableDePrix(env) {
  if (cachePrix && Date.now() < cachePrixExpire) return cachePrix;

  const code = env.PORTIER_CODE;
  if (!code) throw new Error("portier non configuré");

  const url = (env.PORTIER_URL || PORTIER_DEFAUT)
    + "?action=unlock&callback=p&code=" + encodeURIComponent(code);
  const r = await fetch(url, { headers: { accept: "*/*" } });
  if (!r.ok) throw new Error("portier injoignable");

  const d = extraireJson(await r.text());
  if (!d || !d.ok || !d.prices) throw new Error("portier sans prix");

  cachePrix = d.prices;
  cachePrixExpire = Date.now() + PRIX_DUREE_MS;
  return cachePrix;
}

export { PORTIER_DEFAUT };
