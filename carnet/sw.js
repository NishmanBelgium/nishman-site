/* ==========================================================================
   Le service worker du carnet, et de rien d'autre.

   Portée /carnet/ : il ne voit pas le reste du site et ne peut donc rien y
   casser. Celui de la boutique garde la sienne.

   Deux règles, une seule raison : un commercial dans un sous-sol doit
   pouvoir ouvrir son carnet.
     - la coquille (page, manifeste) est servie depuis le cache et
       rafraîchie en arrière-plan ;
     - /api/ n'est JAMAIS mis en cache : des notes périmées affichées
       comme fraîches seraient pires que pas de notes du tout. La page
       garde elle-même sa dernière copie des données et dit sa date.
   ========================================================================== */

const VERSION = "carnet-2";
const COQUILLE = ["/carnet/", "/carnet/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((n) => n.startsWith("carnet-") && n !== VERSION).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const requete = e.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/carnet")) return;   // le reste du site n'est pas mon affaire
  if (url.pathname.startsWith("/api/")) return;      // jamais de données en cache

  /* Dans MON tiroir, et nulle part ailleurs.
   *
   * caches.match() sans préciser le tiroir fouille TOUS les caches de
   * l'origine — y compris celui de la boutique, dont le service worker,
   * de portée /, avait gardé une copie du carnet avant que celui-ci
   * n'existe. Résultat : le carnet se servait lui-même une version
   * périmée, que ses propres mises à jour ne remplaçaient jamais. Une
   * heure de perdue à chercher un bug qui n'était pas là. */
  e.respondWith((async () => {
    const tiroir = await caches.open(VERSION);
    const enCache = await tiroir.match(requete);
    const reseau = fetch(requete)
      .then((reponse) => {
        if (reponse && reponse.ok && reponse.type === "basic") {
          tiroir.put(requete, reponse.clone());
        }
        return reponse;
      })
      .catch(() => enCache || Response.error());
    if (enCache) { e.waitUntil(reseau); return enCache; }
    return reseau;
  })());
});
