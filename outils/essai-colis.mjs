/* ==========================================================================
   ESSAI DE L'AVERTISSEMENT « PLUSIEURS COLIS »

   À lancer après toute modification de l'avertissement dans
   functions/_etiquette.js :

       node outils/essai-colis.mjs

   Pourquoi cet essai existe.

   Le 5 novembre 2026, la commande de Studio 621 est partie avec une seule
   étiquette pour 22,78 kg, parce que le connecteur SendCloud d'Odoo ne
   sait pas faire plusieurs colis. NBD a fixé la règle : vingt kilos par
   colis. Tant que le site ne crée pas lui-même les étiquettes des
   livraisons à l'adresse, l'avertissement est tout ce qui évite de s'en
   apercevoir une fois l'étiquette imprimée.

   Ce qui se vérifie ici tient en trois points, et chacun s'est déjà
   trompé ailleurs dans ce genre de code :
     - la limite exacte. 20 kg pile ne font pas deux colis ;
     - la note existante est conservée, pas remplacée. Le champ porte
       déjà « Demande web … » et « ECART DE PORT … » ;
     - un second passage n'empile pas un second avertissement.

   Odoo et SendCloud sont remplacés par des doublures. Rien d'autre n'est
   modifié : c'est le fichier du dépôt qui est exécuté.
   ========================================================================== */

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), "essai-colis-"));

try {
  writeFileSync(join(dossier, "_etiquette.js"),
    readFileSync(join(ICI, "..", "functions", "_etiquette.js"), "utf8"));

  // La doublure d'Odoo : elle retient la note et compte les écritures.
  writeFileSync(join(dossier, "_odoo.js"), `
export let commande = { note: "" };
export let lignes = [];
export let produits = {};
export let ecritures = 0;
export function preparer(l, p, note) { lignes = l; produits = p; commande = { note: note }; ecritures = 0; }
export async function appel(env, modele, methode, args) {
  if (modele === 'sale.order.line' && methode === 'search_read') return lignes;
  if (modele === 'product.product' && methode === 'read') return args[0].map((id) => produits[id]);
  if (modele === 'sale.order' && methode === 'read') return [{ id: 1, note: commande.note }];
  if (modele === 'sale.order' && methode === 'search_read') return [{ id: 1 }];
  if (modele === 'sale.order' && methode === 'write') { ecritures++; commande.note = args[1].note; return true; }
  return [];
}
`);

  // SendCloud n'est pas sollicité ici, mais le module l'importe.
  writeFileSync(join(dossier, "_sendcloud.js"), `
export function configureSendcloud() { return false; }
export function adresseExpediteur() { return {}; }
export async function optionsVersPointRelais() { return []; }
export async function annoncerEnvoi() { return {}; }
export function suiviDansReponse() { return ""; }
export async function pointRelais() { return null; }
export async function etiquettePdf() { return null; }
`);

  const m = await import(pathToFileURL(join(dossier, "_etiquette.js")).href);
  const odoo = await import(pathToFileURL(join(dossier, "_odoo.js")).href);

  let echecs = 0;
  const verifier = (nom, reel, attendu) => {
    const ok = JSON.stringify(reel) === JSON.stringify(attendu);
    if (!ok) echecs++;
    console.log((ok ? "  ok    " : "  ÉCHEC ") + nom + " → " + JSON.stringify(reel)
      + (ok ? "" : "   (attendu " + JSON.stringify(attendu) + ")"));
  };

  console.log("\nAvertissement « plusieurs colis » — seuil " + m.COLIS_MAX_KG + " kg\n");

  // Le découpage, et surtout ses bornes.
  verifier("0 kg → 1 colis", m.colisNecessaires(0), 1);
  verifier("19,9 kg → 1 colis", m.colisNecessaires(19.9), 1);
  verifier("20 kg pile → 1 colis", m.colisNecessaires(20), 1);
  verifier("20,1 kg → 2 colis", m.colisNecessaires(20.1), 2);
  verifier("22,78 kg (Studio 621) → 2 colis", m.colisNecessaires(22.78), 2);
  verifier("40 kg → 2 colis", m.colisNecessaires(40), 2);
  verifier("41 kg → 3 colis", m.colisNecessaires(41), 3);

  // Sous le seuil : on n'écrit rien du tout.
  odoo.preparer([{ product_id: [7, "p"], product_uom_qty: 10 }],
    { 7: { id: 7, weight: 1, type: "product" } }, "<p>Demande web</p>");
  let r = await m.avertirSiPlusieursColis({}, 1);
  verifier("10 kg : aucun avertissement, aucune écriture",
    { pose: r.pose, ecritures: odoo.ecritures }, { pose: false, ecritures: 0 });

  // Au-dessus : la note est complétée, jamais remplacée.
  odoo.preparer([{ product_id: [7, "p"], product_uom_qty: 30 }],
    { 7: { id: 7, weight: 1, type: "product" } }, "<p>ECART DE PORT</p>");
  r = await m.avertirSiPlusieursColis({}, 1);
  verifier("30 kg : avertissement posé", r.pose, true);
  verifier("30 kg : 2 colis annoncés", r.colis, 2);
  verifier("30 kg : l'ancienne note est conservée",
    odoo.commande.note.indexOf("ECART DE PORT") >= 0, true);
  verifier("30 kg : le poids figure dans la note",
    odoo.commande.note.indexOf("30.2 kg") >= 0, true);

  // Un second passage ne doit pas empiler un second avertissement.
  const avant = odoo.commande.note;
  r = await m.avertirSiPlusieursColis({}, 1);
  verifier("second passage : rien n'est réécrit",
    { pose: r.pose, identique: odoo.commande.note === avant }, { pose: false, identique: true });

  // Le port est une ligne de service : il ne pèse rien.
  odoo.preparer(
    [{ product_id: [7, "p"], product_uom_qty: 10 }, { product_id: [9, "port"], product_uom_qty: 1 }],
    { 7: { id: 7, weight: 1, type: "product" }, 9: { id: 9, weight: 50, type: "service" } }, "");
  r = await m.avertirSiPlusieursColis({}, 1);
  verifier("une ligne de service ne compte pas dans le poids", r.pose, false);

  // Un numéro qui n'en est pas un ne doit rien déclencher.
  r = await m.avertirSiPlusieursColisParNom({}, "pas un numéro");
  verifier("numéro de commande inexploitable : rien n'est fait", r.pose, false);

  console.log(echecs
    ? "\n" + echecs + " ÉCHEC(S) — ne pas déployer en l'état.\n"
    : "\nTous les contrôles passent.\n");
  process.exit(echecs ? 1 : 0);
} finally {
  try { rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* peu importe */ }
}
