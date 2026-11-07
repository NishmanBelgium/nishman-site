/* ==========================================================================
   ESSAI DU TABLEAU DE BORD.

   La page des chiffres ne peut pas se relire à l'œil : elle n'affiche rien
   tant qu'on n'est pas connecté en administrateur, et les totaux qu'elle
   calcule sont justement ceux qu'on ne saurait pas vérifier de tête. Un
   zéro de trop dans une addition y passerait inaperçu des semaines.

   On sert donc la vraie page à un vrai navigateur, on lui répond une
   fausse API dont on connaît les totaux par cœur, et on vérifie que la
   page retombe dessus. Le reste — filtres, export, états vides — se
   vérifie dans la foulée, parce que ce sont les chemins qu'on emprunte
   une fois par mois et qu'on ne teste jamais à la main.

       node outils/essai-dashboard.mjs
   ========================================================================== */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

const RACINE = new URL("..", import.meta.url).pathname;
const PAGE = "/pro/stats/";

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

function servir() {
  return new Promise((ok) => {
    const s = createServer(async (req, rep) => {
      let chemin = normalize(decodeURIComponent(req.url.split("?")[0]));
      if (chemin.endsWith("/")) chemin += "index.html";
      try {
        const corps = await readFile(join(RACINE, chemin));
        rep.writeHead(200, {
          "content-type": TYPES[extname(chemin)] || "application/octet-stream",
        });
        rep.end(corps);
      } catch {
        rep.writeHead(404).end("absent");
      }
    });
    s.listen(0, "127.0.0.1", () => ok({ serveur: s, port: s.address().port }));
  });
}

/* --- La fausse réponse de l'API ----------------------------------------
 *
 * Des chiffres choisis pour que les totaux attendus tombent rond et se
 * vérifient à la main : 15 visites, 42 pages, 2 commandes boutique à
 * 59,80 €, 1 commande pro à 240 €, 3 devis à 900 €, 2 comptes. */

const DEPUIS = "2026-10-08";
const JUSQUA = "2026-11-06";

const audience = (par_jour) => ({
  vues: par_jour.reduce((s, l) => s + l.vues, 0),
  sessions: par_jour.reduce((s, l) => s + l.sessions, 0),
  par_jour,
  par_chemin: [{ chemin: "/boutique/", vues: 30, sessions: 10 }],
  par_source: [{ source: "google", vues: 42, sessions: 15 }],
  par_pays: [{ pays: "BE", vues: 42, sessions: 15 }],
  par_appareil: [{ appareil: "mobile", vues: 42, sessions: 15 }],
  par_segment: [{ segment: "boutique", vues: 30, sessions: 10 },
                { segment: "pro", vues: 12, sessions: 5 }],
});

const JOURS_AUDIENCE = [
  { jour: "2026-10-20", vues: 30, sessions: 10 },
  { jour: "2026-11-05", vues: 12, sessions: 5 },
];

function reponse(periode) {
  const a = audience(JOURS_AUDIENCE);
  const vide = { vues: 0, sessions: 0, par_jour: [], par_chemin: [], par_source: [],
                 par_pays: [], par_appareil: [], par_segment: [] };
  const boutique = {
    cote: "boutique", commandes: 2, chiffre: 59.8, panier_moyen: 29.9, abandons: 1,
    par_jour: [{ jour: "2026-10-20", commandes: 2, chiffre: 59.8 }],
    par_etape: [], taux_transformation: 20,
  };
  const pro = {
    cote: "pro", commandes: 1, chiffre: 240, panier_moyen: 240, abandons: 0,
    par_jour: [{ jour: "2026-11-05", commandes: 1, chiffre: 240 }],
    par_etape: [], taux_transformation: 20,
  };
  /* La vue d'ensemble additionne les deux côtés — c'est le contrat de
     l'API depuis le 7 novembre. Les totaux restent vérifiables à la
     main : 2 + 1 = 3 commandes, 59,80 + 240 = 299,80 €. */
  const tout = {
    cote: "tout", commandes: 3, chiffre: 299.8, panier_moyen: 99.93, abandons: 1,
    par_jour: [{ jour: "2026-10-20", commandes: 2, chiffre: 59.8 },
               { jour: "2026-11-05", commandes: 1, chiffre: 240 }],
    par_etape: [], taux_transformation: 20,
  };
  const avant = { audience: { vues: 20, sessions: 8, par_segment: [] },
                  commerce: { commandes: 1, chiffre: 30, panier_moyen: 30,
                              taux_transformation: 12.5 } };

  return {
    ok: true,
    periode,
    periode_precedente: { depuis: "2026-09-08", jusqua: "2026-10-07" },
    campagnes: { par_campagne: [], atterrissage: [] },
    audience: a,
    commerce: tout,
    precedent: avant,
    boutique: { audience: a, commerce: boutique, precedent: avant },
    pro: { audience: vide, commerce: pro, precedent: avant },
    clients: {
      nouveaux: 2, total: 37, nouveaux_avant: 1,
      par_pays: [{ pays: "BE", n: 30 }],
      par_jour: [{ jour: "2026-10-20", n: 2 }],
    },
    devis: {
      total: 3, montant: 900, total_avant: 2,
      par_jour: [{ jour: "2026-10-20", n: 3, montant: 900 }],
      liste: [
        { ref: "S00301", client: "Studio 621", email: "a@b.c", pays: "BE",
          montant: "400.00", retrait: 0, lignes: 12, cree_le: "2026-10-20T10:00:00Z" },
        { ref: "S00302", client: "Barber Mons", email: "d@e.f", pays: "FR",
          montant: "300.00", retrait: 1, lignes: 8, cree_le: "2026-10-20T11:00:00Z" },
        { ref: "S00303", client: "Salon Liège", email: "g@h.i", pays: "LU",
          montant: "200.00", retrait: 0, lignes: 5, cree_le: "2026-10-20T12:00:00Z" },
      ],
    },
    commandes_liste: [
      { ref: "r1", odoo_nom: "S00401", cree_le: "2026-11-05T09:00:00Z", montant: "240.00",
        statut: "paye", etape: "fini", client: "Barber Mons", suivi: "", cote: "pro" },
      { ref: "r2", odoo_nom: "S00402", cree_le: "2026-10-20T09:00:00Z", montant: "29.90",
        statut: "paye", etape: "etiquette", client: "Jean Dupont", suivi: "", cote: "boutique" },
      { ref: "r3", odoo_nom: "", cree_le: "2026-10-20T08:00:00Z", montant: "29.90",
        statut: "ouvert", etape: "rien", client: "Panier laissé", suivi: "", cote: "boutique" },
    ],
    portes: { "porte-pro": 4, "porte-boutique": 6 },
    en_souffrance: [],
    date: new Date().toISOString(),
  };
}

/* --- Le harnais --------------------------------------------------------- */

let echecs = 0;
const vus = [];

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
const contexte = await navigateur.newContext();

/* L'API est simulée ; tout ce qui sortirait vers l'extérieur est coupé,
   la page ne doit dépendre de personne pour s'afficher. */
await contexte.route("**/*", (route) => {
  const url = route.request().url();
  if (url.includes("/api/stats")) {
    vus.push(url);
    const u = new URL(url);
    const depuis = u.searchParams.get("depuis");
    const jusqua = u.searchParams.get("jusqua");
    const jours = Number(u.searchParams.get("jours") || 30);
    const periode = depuis && jusqua
      ? { depuis, jusqua,
          jours: Math.round((Date.parse(jusqua) - Date.parse(depuis)) / 86400000) + 1 }
      : { depuis: DEPUIS, jusqua: JUSQUA, jours };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reponse(periode)),
    });
  }
  if (/fonts\.|facebook|googletagmanager|google-analytics|doubleclick/.test(url)) {
    return route.abort();
  }
  return route.continue();
});

const page = await contexte.newPage();
const erreursJs = [];
page.on("pageerror", (e) => erreursJs.push(String(e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  /* Les requêtes coupées plus haut — polices, pixels — remontent ici en
     « Failed to load resource ». C'est l'essai qui les a coupées : les
     compter comme des défauts de la page ferait échouer un essai propre
     et, pire, apprendrait à ignorer la ligne. */
  if (/Failed to load resource/i.test(m.text())) return;
  erreursJs.push(m.text());
});

await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: "networkidle" });
await page.waitForSelector("#st-corps:not([hidden])", { timeout: 5000 });

console.log("\nAu chargement");
verifier("la page s'affiche sans erreur JavaScript", erreursJs.length === 0,
  erreursJs.join("\n         "));
verifier("six cartes de chiffres", await page.locator(".st-carte").count() === 6);
verifier("les deux champs de date reprennent la période",
  (await page.locator("#st-du").inputValue()) === DEPUIS
  && (await page.locator("#st-au").inputValue()) === JUSQUA);

/* LA VUE D'ENSEMBLE ANNONCE LA SOMME DES DEUX CÔTÉS.
 *
 * Le 6 novembre, le site a encaissé cinq commandes et 1 242 € et cette
 * vue affichait zéro : elle reprenait la boutique seule. Un tableau de
 * bord qui annonce zéro un jour de chiffre est un tableau de bord qu'on
 * cesse de croire, et c'est le genre de défaut qui revient sans un test
 * pour le retenir. */
const cartes = await page.locator(".st-carte").allTextContents();
const cartesTexte = cartes.join(" | ");
verifier("la vue d'ensemble compte les commandes des deux côtés",
  /Commandes du site3[^0-9]/.test(cartesTexte),
  "lu « " + cartesTexte + " »");
verifier("la vue d'ensemble additionne le chiffre des deux côtés",
  /Chiffre du site/.test(cartesTexte) && /299,80/.test(cartesTexte),
  "lu « " + cartesTexte + " »");

console.log("\nLe journal jour par jour");
const nbLignes = await page.locator("#st-journal-corps tbody tr").count();
verifier("une ligne par jour de la période, trous compris", nbLignes === 30,
  "reçu " + nbLignes);

const premiere = await page.locator("#st-journal-corps tbody tr").first()
  .locator("td").first().textContent();
verifier("la plus récente en premier", /06\/11/.test(premiere), "lu « " + premiere + " »");

const pied = await page.locator("#st-journal-corps tfoot th").allTextContents();
verifier("total des visites", pied[1] === "15", "lu « " + pied[1] + " »");
verifier("total des pages vues", pied[2] === "42", "lu « " + pied[2] + " »");
verifier("total des commandes boutique", pied[3] === "2", "lu « " + pied[3] + " »");
verifier("total du chiffre boutique", pied[4].replace(/ | /g, " ") === "59,80 €",
  "lu « " + pied[4] + " »");
verifier("total des commandes pro", pied[5] === "1", "lu « " + pied[5] + " »");
verifier("total du chiffre pro", pied[6].replace(/ | /g, " ") === "240,00 €",
  "lu « " + pied[6] + " »");
verifier("total des devis", pied[7] === "3", "lu « " + pied[7] + " »");
verifier("total des comptes créés", pied[8] === "2", "lu « " + pied[8] + " »");

console.log("\nLes commandes réalisées");
verifier("les trois commandes sont listées",
  await page.locator("#st-commandes-corps tbody tr").count() === 3);
await page.locator('#st-cmd-filtres button[data-statut="paye"]').click();
verifier("le filtre « payées » n'en garde que deux",
  await page.locator("#st-commandes-corps tbody tr").count() === 2);
await page.locator('#st-cmd-filtres button[data-statut="autre"]').click();
verifier("le filtre « non abouties » n'en garde qu'une",
  await page.locator("#st-commandes-corps tbody tr").count() === 1);
await page.locator('#st-cmd-filtres button[data-statut="tout"]').click();

console.log("\nLes devis émis");
verifier("les trois devis sont listés",
  await page.locator("#st-devis-corps tbody tr").count() === 3);
verifier("le numéro de devis est affiché",
  (await page.locator("#st-devis-corps tbody tr").first().textContent()).includes("S00301"));
verifier("retrait et livraison sont distingués",
  (await page.locator("#st-devis-corps").textContent()).includes("Retrait"));

console.log("\nLa vue change ce qui est montré");
await page.locator('#st-vues button[data-vue="boutique"]').click();
verifier("la boutique ne montre pas de devis",
  await page.locator("#st-devis").isHidden());
verifier("la boutique ne liste que ses commandes",
  await page.locator("#st-commandes-corps tbody tr").count() === 2);
await page.locator('#st-vues button[data-vue="pro"]').click();
verifier("le côté pro ne liste que les siennes",
  await page.locator("#st-commandes-corps tbody tr").count() === 1);
verifier("le côté pro remontre les devis", await page.locator("#st-devis").isVisible());
await page.locator('#st-vues button[data-vue="tout"]').click();

console.log("\nLe choix de la période");
vus.length = 0;
await page.locator('#st-filtres button[data-jours="7"]').click();
await page.waitForTimeout(500);
verifier("un raccourci demande bien ce nombre de jours",
  vus.length === 1 && vus[0].includes("jours=7"), vus.join(" "));

vus.length = 0;
await page.locator("#st-du").fill("2026-09-14");
await page.locator("#st-au").fill("2026-09-20");
await page.locator("#st-au").dispatchEvent("change");
await page.waitForTimeout(600);
verifier("une période saisie à la main est transmise telle quelle",
  vus.length >= 1 && vus[vus.length - 1].includes("depuis=2026-09-14")
  && vus[vus.length - 1].includes("jusqua=2026-09-20"), vus.join(" "));
verifier("le journal suit la période servie",
  await page.locator("#st-journal-corps tbody tr").count() === 7);

vus.length = 0;
await page.locator("#st-journee").click();
await page.waitForTimeout(600);
verifier("« une seule journée » ramène la fin sur le début",
  vus.length >= 1 && vus[vus.length - 1].includes("depuis=2026-09-14")
  && vus[vus.length - 1].includes("jusqua=2026-09-14"), vus.join(" "));
verifier("le journal n'affiche plus qu'une ligne",
  await page.locator("#st-journal-corps tbody tr").count() === 1);
verifier("l'intitulé dit « journée », pas « 1 jours »",
  /Journée du/.test(await page.locator("#st-periode").textContent()));

console.log("\nL'export CSV");
await page.locator('#st-filtres button[data-jours="30"]').click();
await page.waitForTimeout(600);
const telechargement = page.waitForEvent("download", { timeout: 5000 });
await page.locator("#st-export").click();
const fichier = await telechargement;
verifier("le fichier porte les dates de la période",
  /nishman-chiffres-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv/.test(fichier.suggestedFilename()),
  fichier.suggestedFilename());
const flux = await fichier.createReadStream();
let csv = "";
for await (const bout of flux) csv += bout.toString("utf8");
const lignesCsv = csv.trim().split("\r\n");
verifier("le CSV porte le BOM pour que le tableur lise les accents",
  csv.charCodeAt(0) === 0xfeff);
verifier("une ligne d'en-tête et trente lignes de données", lignesCsv.length === 31,
  "reçu " + lignesCsv.length);
verifier("les colonnes sont séparées par des points-virgules",
  lignesCsv[0].split(";").length === 9, lignesCsv[0]);
verifier("les montants utilisent la virgule décimale",
  lignesCsv.some((l) => l.includes(";59,80;")),
  lignesCsv.find((l) => l.includes("2026-10-20")) || "ligne du 20 absente");

console.log("\nAucune erreur en cours de route");
verifier("la console est restée muette", erreursJs.length === 0,
  erreursJs.join("\n         "));

await navigateur.close();
serveur.close();

console.log(echecs === 0
  ? "\nLe tableau de bord est conforme : chiffres justes, filtres fidèles, export propre.\n"
  : "\n" + echecs + " vérification(s) en échec.\n");
process.exit(echecs === 0 ? 0 : 1);
