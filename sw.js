/* ==========================================================================
   SERVICE WORKER — Nishman
   Deux rôles :
   · rendre le site installable sur Android (Chrome l'exige) ;
   · garder le catalogue consultable même sans connexion.

   Les prix ne sont JAMAIS mis en cache : ils viennent du portier Google et
   doivent toujours être frais.
   ========================================================================== */

const VERSION = "nishman-v92";
const SOCLE = [
  "/produits/",
  "/assets/css/site.css?v=92",
  "/assets/js/catalog.js?v=92",
  "/assets/js/config.js?v=92",
  "/assets/data/products.json?v=92",
  "/assets/pwa/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll échoue en bloc si une seule ressource manque : on tolère
      .then((c) => Promise.allSettled(SOCLE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Tout ce qui est dynamique passe directement par le réseau :
  // prix, stock, devis, appels au portier Google.
  if (url.origin !== self.location.origin ||
      url.pathname.startsWith("/devis") ||
      url.hostname.indexOf("script.google.com") >= 0) {
    return;
  }

  // Le réseau d'abord, le cache en secours : le contenu reste à jour,
  // et le site fonctionne quand même en cas de coupure.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copie = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copie));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/produits/")))
  );
});
