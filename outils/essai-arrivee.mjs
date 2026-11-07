/* ==========================================================================
   ESSAI — LA PAGE D'ARRIVÉE DES PUBLICITÉS, ET LE FILTRE PAR FAMILLE.

   Mesuré du 5 au 7 novembre 2026 : 247 sessions atterrissent sur
   /grossiste-barbier/, 51 seulement atteignent /produits/. La page
   s'ouvrait sur un « ← Accueil » puis sur un mur de texte, avec pour
   seules actions deux pastilles d'en-tête.

   Ce que ces vérifications retiennent, c'est ce qui compte pour la
   conversion et qui se perd au premier remaniement : un appel à l'action
   visible SANS DÉFILER, un seul bouton dominant, des tuiles qui mènent au
   catalogue professionnel et non à la boutique grand public, et le lien
   de retour qui ne s'affiche plus là où il invitait à partir.

   On vérifie aussi que le texte de référencement n'a pas été sacrifié :
   le remède ne doit pas coûter la raison d'être de la page.
   ========================================================================== */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const RACINE = new URL("..", import.meta.url).pathname;

let faits = 0, rates = 0;
function verifier(nom, condition, detail) {
  faits++;
  if (condition) { console.log("  ok   " + nom); return; }
  rates++;
  console.log("  ÉCHEC " + nom + (detail ? "\n         " + detail : ""));
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".json": "application/json",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png",
};

const serveur = createServer(async (req, rep) => {
  let chemin = decodeURIComponent(req.url.split("?")[0]);
  if (chemin.endsWith("/")) chemin += "index.html";
  try {
    const corps = await readFile(join(RACINE, chemin));
    rep.writeHead(200, { "Content-Type": TYPES[extname(chemin)] || "text/plain" });
    rep.end(corps);
  } catch (e) {
    rep.writeHead(404); rep.end("absent");
  }
});
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + serveur.address().port;

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 } });

// Les polices Google et tout appel sortant sont coupés : un test ne doit
// pas dépendre du réseau, et leur absence ne change rien à ce qu'on mesure.
await contexte.route("**://fonts.googleapis.com/**", (r) => r.abort());
await contexte.route("**://fonts.gstatic.com/**", (r) => r.abort());

const erreurs = [];
const page = await contexte.newPage();
page.on("pageerror", (e) => erreurs.push(String(e)));

/* --- Le premier écran, sur un téléphone ---------------------------------- */

console.log("La page d'arrivée, sur un écran de téléphone");
await page.goto(BASE + "/grossiste-barbier/", { waitUntil: "domcontentloaded" });

const cta = page.locator(".gb-cta").first();
verifier("un appel à l'action existe", await cta.count() > 0);

const boite = await cta.boundingBox();
verifier("il est visible sans défiler — c'est tout l'enjeu",
  boite !== null && boite.y + boite.height <= 844,
  boite ? "il commence à " + Math.round(boite.y) + " px" : "introuvable");

verifier("il mène au catalogue professionnel",
  (await cta.getAttribute("href")) === "/produits/",
  "lu « " + (await cta.getAttribute("href")) + " »");

const pleins = await page.locator(".gb-cta:not(.gb-cta-second)").count();
verifier("un seul bouton est dominant : deux appels de même poids ne sont "
  + "pas un choix, c'est une hésitation", pleins === 1, "reçu " + pleins);

const second = page.locator(".gb-cta-second");
verifier("le devis est proposé en second, sans concurrencer le catalogue",
  await second.count() === 1 && (await second.getAttribute("href")) === "/devis/");

const h1 = page.locator("h1");
verifier("la page garde un seul titre de niveau 1", await h1.count() === 1,
  "reçu " + await h1.count());

/* --- Le retour, qui ne doit plus inviter à partir ----------------------- */

const retourHaut = await page.evaluate(() => {
  const a = document.querySelector(".doc-retour");
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return r.top + window.scrollY;
});
verifier("le lien de retour ne s'affiche plus juste sous le titre",
  retourHaut === null || retourHaut > 844,
  retourHaut === null ? "" : "il est à " + Math.round(retourHaut) + " px");

/* --- Les tuiles de familles -------------------------------------------- */

console.log("\nLes cinq familles, en photos de produits réels");
const tuiles = page.locator(".phares-piste .phare");
const nbTuiles = await tuiles.count();
verifier("cinq tuiles sont posées", nbTuiles === 5, "reçu " + nbTuiles);

const liens = await tuiles.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
verifier("toutes mènent au catalogue PRO, aucune à la boutique grand public — "
  + "la page s'adresse aux salons",
  liens.every((h) => h.startsWith("/produits/")),
  "lu " + JSON.stringify(liens));
verifier("chacune vise une famille précise",
  liens.every((h) => h.indexOf("?famille=") > 0), "lu " + JSON.stringify(liens));

const images = await page.locator(".phares-piste .phare-objet img").evaluateAll(
  (els) => els.map((e) => e.getAttribute("src")));
verifier("ce sont les photos de produits réelles du catalogue, pas des "
  + "images fabriquées",
  images.length === 5 && images.every((s) => /^\/assets\/img\/products\/\d+\.webp$/.test(s)),
  "lu " + JSON.stringify(images));

const manquantes = [];
for (const src of images) {
  const r = await page.request.get(BASE + src);
  if (!r.ok()) manquantes.push(src);
}
verifier("et ces photos existent bel et bien sur le site",
  manquantes.length === 0, "absentes : " + manquantes.join(", "));

/* --- Le texte de référencement, qui ne doit pas avoir été sacrifié ----- */

console.log("\nCe que la page disait, et qu'elle doit continuer de dire");
const texte = await page.locator("main.doc").innerText();
verifier("le texte de fond est toujours là", texte.length > 2000,
  "longueur " + texte.length);
verifier("le statut d'importateur officiel y figure",
  /importateur officiel/i.test(texte));
verifier("les trois pays y figurent",
  /Belgique/.test(texte) && /France/.test(texte) && /Luxembourg/.test(texte));
verifier("« eau de Cologne » est employé, jamais « aftershave »",
  /Cologne/i.test(texte) && !/aftershave/i.test(texte));

/* --- Le catalogue s'ouvre-t-il sur la bonne famille ? ------------------ */

console.log("\nLe catalogue, ouvert sur une famille");
const pageCat = await contexte.newPage();
const erreursCat = [];
pageCat.on("pageerror", (e) => erreursCat.push(String(e)));

await pageCat.goto(BASE + "/produits/?famille=Poudres%20coiffantes",
  { waitUntil: "domcontentloaded" });
await pageCat.waitForFunction(
  () => { const e = document.getElementById("cat-btn-label");
          return e && e.textContent.trim().length > 0; },
  { timeout: 15000 }).catch(() => {});

const libelle = (await pageCat.locator("#cat-btn-label").textContent() || "").trim();
verifier("le filtre affiche la famille demandée, pas « Toutes »",
  /poudres/i.test(libelle), "lu « " + libelle + " »");

const filtre = await pageCat.locator("#cat-btn").evaluate(
  (e) => e.classList.contains("filtered"));
verifier("et le bouton se montre comme filtré", filtre);

await pageCat.goto(BASE + "/produits/?famille=NExistePas",
  { waitUntil: "domcontentloaded" });
await pageCat.waitForFunction(
  () => { const e = document.getElementById("cat-btn-label");
          return e && e.textContent.trim().length > 0; },
  { timeout: 15000 }).catch(() => {});
const libelle2 = (await pageCat.locator("#cat-btn-label").textContent() || "").trim();
verifier("une famille inventée laisse le catalogue entier plutôt qu'une "
  + "grille vide : un lien un peu faux vaut mieux qu'une page cassée",
  !/nexistepas/i.test(libelle2), "lu « " + libelle2 + " »");

await pageCat.goto(BASE + "/produits/", { waitUntil: "domcontentloaded" });
await pageCat.waitForFunction(
  () => { const e = document.getElementById("cat-btn-label");
          return e && e.textContent.trim().length > 0; },
  { timeout: 15000 }).catch(() => {});
verifier("sans paramètre, rien ne change pour les visiteurs habituels",
  !(await pageCat.locator("#cat-btn").evaluate((e) => e.classList.contains("filtered"))));

/* --- LA BANDE BLANCHE SOUS L'AFFICHE ------------------------------------
 *
 * Signalée par NBD le 7 novembre 2026, présente depuis des semaines : un
 * rectangle blanc en travers de la page, entre l'affiche du catalogue et
 * la barre de recherche. Cause unique, une marge basse de 20 px sur le
 * bandeau, héritée d'une époque où ce qui suivait était clair. La barre
 * de recherche étant devenue sombre, ces 20 px ne séparaient plus deux
 * blocs : ils laissaient voir la feuille blanche entre deux noirs.
 *
 * Le test mesure l'écart réel entre les deux, sur les deux tailles
 * d'écran. C'est le genre de défaut qu'un remaniement de mise en page
 * fait revenir sans qu'on s'en aperçoive. */

console.log("\nLe catalogue : pas de bande claire sous l'affiche");
for (const [nom, vp] of [["téléphone", { width: 430, height: 932 }],
                         ["bureau", { width: 1280, height: 900 }]]) {
  const ctxCat = await navigateur.newContext({ viewport: vp, hasTouch: nom === "téléphone" });
  await ctxCat.route("**://fonts.googleapis.com/**", (r) => r.abort());
  await ctxCat.route("**://fonts.gstatic.com/**", (r) => r.abort());
  const pc = await ctxCat.newPage();
  await pc.goto(BASE + "/produits/", { waitUntil: "load" });
  await pc.waitForSelector(".search-sticky", { timeout: 15000 }).catch(() => {});

  const ecart = await pc.evaluate(() => {
    const b = document.querySelector(".bandeau");
    const s = document.querySelector(".search-sticky");
    if (!b || !s) return null;
    return Math.round(s.getBoundingClientRect().top - b.getBoundingClientRect().bottom);
  });
  verifier("sur " + nom + ", l'affiche et la barre de recherche se touchent",
    ecart === 0, ecart === null ? "éléments introuvables" : "écart de " + ecart + " px");
  await ctxCat.close();
}

/* --- Rien de cassé ----------------------------------------------------- */

console.log("\nAucune erreur en cours de route");
const vraies = [...erreurs, ...erreursCat].filter((e) => !/Failed to load resource/i.test(e));
verifier("les deux pages s'affichent sans erreur JavaScript",
  vraies.length === 0, vraies.join(" | "));

await navigateur.close();
serveur.close();

console.log("");
if (rates) {
  console.log(rates + " vérification(s) en échec sur " + faits + ".");
  process.exit(1);
}
console.log("La page d'arrivée pousse vers le catalogue, et le catalogue "
  + "s'ouvre là où on l'envoie. " + faits + " vérifications.");
