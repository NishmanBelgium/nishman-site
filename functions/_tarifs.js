/* ==========================================================================
   TARIFS — le catalogue et la table de prix, en un seul endroit.

   Deux points d'entrée en ont besoin : le panier, qui affiche un montant, et
   la commande, qui l'engage. Ils doivent lire la même chose, sinon le client
   voit un total et paie un autre. D'où ce module, et le cache partagé qui va
   avec : une seule source, une seule durée de vie.
   ========================================================================== */

import { interrogerPortier, PORTIER_DEFAUT } from "./_portier.js";

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

  const appel = await interrogerPortier(env, "action=unlock&callback=p");
  if (appel.etat === "code") throw new Error("code interne refusé");
  if (appel.etat !== "ok") throw new Error("portier injoignable");

  const d = appel.donnees;
  if (!d.prices) throw new Error("portier sans prix");

  cachePrix = d.prices;
  cachePrixExpire = Date.now() + PRIX_DUREE_MS;
  return cachePrix;
}

export { PORTIER_DEFAUT };
