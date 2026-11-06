/* ==========================================================================
   ESSAI DU CONSENTEMENT ET DES CONVERSIONS.

   Ce que ce fichier vérifie tient en une phrase : rien ne part avant le
   « oui », et tout part après. C'est la seule promesse que la page de
   confidentialité fait au visiteur, donc c'est celle qu'il faut pouvoir
   relire en une commande plutôt que de la croire sur parole.

   On ne simule rien : une vraie page du site est servie à un vrai
   navigateur, et on regarde les requêtes qui sortent. Les requêtes vers
   Meta et Google sont interceptées avant d'atteindre le réseau — on veut
   savoir qu'elles ont été tentées, pas les laisser partir.

       node outils/essai-consentement.mjs
   ========================================================================== */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

/* Playwright n'est pas une dépendance du site : il est installé sur la
   machine qui lance l'essai, pas dans le dépôt. On le résout donc comme
   le ferait un require() classique, plutôt que d'imposer un
   node_modules à un site qui n'en a pas. */
const { chromium } = createRequire(import.meta.url)("playwright");

const RACINE = new URL("..", import.meta.url).pathname;
const PAGE = "/grossiste-barbier/";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

/* Un serveur de fichiers minuscule : le site est statique, et le faire
   passer par un vrai serveur évite les surprises de file:// — où le
   stockage local et les scripts se comportent autrement. */
function servir() {
  return new Promise((ok) => {
    const s = createServer(async (req, rep) => {
      let chemin = normalize(decodeURIComponent(req.url.split("?")[0]));
      if (chemin.endsWith("/")) chemin += "index.html";
      try {
        const corps = await readFile(join(RACINE, chemin));
        rep.writeHead(200, { "content-type": TYPES[extname(chemin)] || "application/octet-stream" });
        rep.end(corps);
      } catch {
        rep.writeHead(404).end("absent");
      }
    });
    s.listen(0, "127.0.0.1", () => ok({ serveur: s, port: s.address().port }));
  });
}

const TIERS = /facebook\.net|facebook\.com|googletagmanager\.com|googleadservices\.com|doubleclick\.net|google\.com\/(ads|pagead)/;

let echecs = 0;
function verifier(nom, condition, detail) {
  if (condition) {
    console.log("  ok   " + nom);
  } else {
    echecs++;
    console.log("  ÉCHEC " + nom + (detail ? "\n         " + detail : ""));
  }
}

const { serveur, port } = await servir();
const navigateur = await chromium.launch();

/* Un appareil neuf par scénario. Le choix est mémorisé dans le stockage
   local, donc réutiliser le même contexte après un refus donnerait un
   visiteur qui a déjà répondu — et le bandeau ne reparaîtrait pas. */
async function appareilNeuf(sorties) {
  const contexte = await navigateur.newContext();
  /* Les requêtes vers les tiers sont comptées puis avortées : on mesure
     l'intention du code, sans rien envoyer à personne. */
  await contexte.route("**/*", (route) => {
    const url = route.request().url();
    if (TIERS.test(url)) {
      sorties.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const p = await contexte.newPage();
  await p.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: "networkidle" });
  return p;
}

const sorties = [];
const page = await appareilNeuf(sorties);

console.log("\nAvant toute réponse au bandeau");
verifier("aucune requête vers Meta ou Google", sorties.length === 0, sorties.join("\n         "));
verifier("le bandeau est affiché", await page.locator(".cons").count() === 1);
verifier("deux boutons de même nature", await page.locator(".cons-btn").count() === 2);

/* Un refus, dans une page à part : le choix est mémorisé, et on veut
   pouvoir tester l'acceptation sur un appareil vierge ensuite. */
console.log("\nAprès un refus");
await page.locator('[data-cons="non"]').click();
await page.waitForTimeout(800);
verifier("toujours aucune requête vers Meta ou Google", sorties.length === 0, sorties.join("\n         "));
verifier("le bandeau a disparu", await page.locator(".cons").count() === 0);
verifier(
  "une conversion émise malgré le refus ne part pas",
  await page.evaluate(() => window.nishmanConsentement.compteProUneFois("essai-refus", "valide") === false),
);
await page.close();

console.log("\nAprès une acceptation");
const sorties2 = [];
const page2 = await appareilNeuf(sorties2);
await page2.locator('[data-cons="oui"]').click();
await page2.waitForTimeout(1500);

verifier("le pixel Meta est demandé", sorties2.some((u) => u.includes("facebook.net")),
  sorties2.join("\n         "));
verifier("la balise Google est demandée", sorties2.some((u) => u.includes("googletagmanager.com")),
  sorties2.join("\n         "));

/* La balise est interceptée, donc gtag() reste la file d'attente posée
   par notre amorce : elle empile sans envoyer. C'est exactement ce qu'on
   veut observer — que les bons arguments y entrent. */
const empile = await page2.evaluate(() => {
  window.nishmanConsentement.compteProUneFois("essai-a", "valide", { country: "BE" });
  window.nishmanConsentement.compteProUneFois("essai-a", "valide", { country: "BE" });
  window.nishmanConsentement.achatUneFois("CMD-1", { value: 240, currency: "EUR" });
  window.nishmanConsentement.achatUneFois("CMD-1", { value: 240, currency: "EUR" });
  return (window.dataLayer || []).map((a) => Array.from(a));
});

const conversions = empile.filter((a) => a[0] === "event" && a[1] === "conversion").map((a) => a[2]);
const comptePro = conversions.filter((c) => c.send_to.endsWith("XGwNCIbLk7MdEMmOxpFF"));
const achats = conversions.filter((c) => c.send_to.endsWith("xjOtCNm577IdEMmOxpFF"));

verifier("le compte pro validé part une seule fois", comptePro.length === 1,
  "reçu " + comptePro.length + " fois");
verifier("l'achat part une seule fois", achats.length === 1, "reçu " + achats.length + " fois");
verifier("l'achat porte le montant du serveur", achats[0] && achats[0].value === 240);
verifier("l'achat porte la référence de commande", achats[0] && achats[0].transaction_id === "CMD-1");
verifier("l'achat porte la devise", achats[0] && achats[0].currency === "EUR");

const consentements = empile.filter((a) => a[0] === "consent");
verifier("le mode consentement est renseigné", consentements.length === 2);
verifier("il est d'abord refusé", consentements[0] && consentements[0][1] === "default"
  && consentements[0][2].ad_storage === "denied");
verifier("puis accordé", consentements[1] && consentements[1][1] === "update"
  && consentements[1][2].ad_storage === "granted");

const config = empile.find((a) => a[0] === "config");
verifier("le suivi avancé des conversions reste éteint",
  config && config[2] && config[2].allow_enhanced_conversions === false);

/* Un compte pro créé sans TVA validée intéresse Meta, pour le volume,
   mais ne doit pas piloter les enchères de Google. */
const avant = (await page2.evaluate(() => window.dataLayer.length));
await page2.evaluate(() => window.nishmanConsentement.compteProUneFois("essai-b", "en-attente"));
const apres = await page2.evaluate(() => window.dataLayer.filter(
  (a) => a[0] === "event" && a[1] === "conversion").length);
verifier("un compte sans TVA validée ne part pas vers Google", apres === conversions.length,
  "dataLayer avant " + avant);

await navigateur.close();
serveur.close();

console.log(echecs === 0
  ? "\nTout est conforme : rien avant le oui, tout après.\n"
  : "\n" + echecs + " vérification(s) en échec.\n");
process.exit(echecs === 0 ? 0 : 1);
