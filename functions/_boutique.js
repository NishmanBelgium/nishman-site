/* ==========================================================================
   BOUTIQUE — le catalogue grand public, lu côté serveur.

   Les fiches produit sont rendues par le serveur, et non plus composées
   dans le navigateur. Google l'exige pour les annonces Shopping : le prix
   doit se trouver dans le HTML livré, pas être ajouté après coup par du
   JavaScript, sinon le robot lit un prix et le client en voit un autre.
   C'est le motif de refus « prix incohérent », et il est automatique.
   ========================================================================== */

let cache = null;
let cacheExpire = 0;
const DUREE_MS = 60 * 1000;

export async function catalogue(request) {
  if (cache && Date.now() < cacheExpire) return cache;
  const r = await fetch(new URL("/assets/data/boutique.json", request.url));
  if (!r.ok) throw new Error("catalogue boutique injoignable");
  cache = await r.json();
  cacheExpire = Date.now() + DUREE_MS;
  return cache;
}

export async function parSlug(request, slug) {
  const liste = await catalogue(request);
  const voulu = String(slug || "").toLowerCase();
  // L'EAN ferme le slug : même si le nom change, l'ancienne adresse retrouve
  // le produit, et on redirige vers la nouvelle plutôt que de rendre un 404.
  const exact = liste.find((p) => p.slug === voulu);
  if (exact) return { produit: exact, exact: true };
  const ean = (voulu.match(/(\d{8,14})$/) || [])[1];
  const parEan = ean ? liste.find((p) => p.ean === ean) : null;
  return parEan ? { produit: parEan, exact: false } : null;
}

export function echapper(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function euros(n) {
  return Number(n).toFixed(2).replace(".", ",") + " €";
}

/* L'adresse publique du site. En préproduction on reste sur l'hôte courant ;
   en production les adresses canoniques doivent pointer sur nishman.be,
   sinon Google indexerait l'adresse de prévisualisation. */
export function origine(request) {
  const u = new URL(request.url);
  if (u.hostname.endsWith(".pages.dev") || u.hostname === "localhost") return u.origin;
  return "https://" + u.hostname;
}
