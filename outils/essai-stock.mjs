/* ==========================================================================
   ESSAI DU CACHE DE STOCK — la mécanique, éprouvée sans Odoo.

   À lancer après toute modification de functions/_stock.js :

       node outils/essai-stock.mjs

   Ce que cet essai défend, et pourquoi il existe.

   Le module _stock.js décide de ce que le site accepte de vendre. Il le
   fait à partir de trois sources d'âges différents — la mémoire de
   l'instance, le relevé partagé dans D1, Odoo — et c'est précisément le
   genre de code où une erreur ne se voit pas : il ne plante pas, il
   répond un chiffre. Un chiffre faux fait vendre de la marchandise qui
   n'existe pas, et on l'apprend par un client mécontent.

   Écrit le 5 novembre 2026, il a trouvé un défaut dans l'heure : une
   instance dont la fenêtre mémoire avait expiré gardait ses anciens
   chiffres, et quand le relevé partagé périmait à son tour, elle les
   servait indéfiniment — le calcul de ce qui manque ne trouvait rien à
   demander, puisque tout était là.

   Odoo et D1 sont remplacés par des doublures, et la fenêtre mémoire est
   ramenée de quarante-cinq secondes à cinquante millisecondes pour que
   l'essai tienne en une seconde. Rien d'autre n'est modifié : c'est bien
   le fichier du dépôt qui est exécuté.
   ========================================================================== */

import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), "essai-stock-"));

try {
  // Le vrai module, avec la seule fenêtre mémoire raccourcie.
  const source = readFileSync(join(ICI, "..", "functions", "_stock.js"), "utf8")
    .replace(/^const CACHE_MS = .*$/m, "const CACHE_MS = 50;");
  if (source.indexOf("const CACHE_MS = 50;") === -1) {
    throw new Error("CACHE_MS introuvable dans _stock.js : l'essai ne mesure plus ce qu'il croit.");
  }
  writeFileSync(join(dossier, "_stock.js"), source);

  // La doublure d'Odoo : elle compte les interrogations et rend ce qu'on
  // lui dit de rendre.
  writeFileSync(join(dossier, "_odoo.js"), `
export let releves = 0;
export let quantite = 100;
export function reinitialiser(q) { releves = 0; if (q !== undefined) quantite = q; }
export async function appel(env, modele, methode, args) {
  if (modele === "stock.location") return [{ id: 7 }];
  if (modele === "stock.quant") {
    releves++;
    return args[0][0][2].map((id) => ({
      product_id: [id, "p"], quantity: quantite, reserved_quantity: 0,
    }));
  }
  return [];
}
export async function produitsParEan(env, eans) {
  const t = {};
  eans.forEach((e, i) => { t[e] = { id: 1000 + i, nom: "P" + i, ref: "A-" + i }; });
  return t;
}
`);

  const { stockVendable } = await import(pathToFileURL(join(dossier, "_stock.js")).href);
  const odoo = await import(pathToFileURL(join(dossier, "_odoo.js")).href);

  // La doublure de D1 : une seule ligne, comme la vraie table.
  let ligne = null;
  const DB = {
    exec: async () => {},
    prepare(sql) {
      return {
        bind(...v) { this.v = v; return this; },
        async first() { return ligne; },
        async run() {
          if (sql.indexOf("INSERT INTO cache_stock") === 0) {
            ligne = { valeur: this.v[0], pose_le: this.v[1] };
          }
          return {};
        },
      };
    },
  };
  const env = { DB };
  const codes = Array.from({ length: 60 }, (_, i) => "EAN" + i);

  let echecs = 0;
  const verifier = (nom, reel, attendu) => {
    const ok = JSON.stringify(reel) === JSON.stringify(attendu);
    if (!ok) echecs++;
    console.log((ok ? "  ok    " : "  ÉCHEC ") + nom + " → " + JSON.stringify(reel)
      + (ok ? "" : "   (attendu " + JSON.stringify(attendu) + ")"));
  };

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  // Vieillir le relevé partagé, et laisser la fenêtre mémoire expirer.
  const vieillir = async (ms) => { if (ligne) ligne.pose_le -= ms; await dormir(70); };
  const differes = [];
  const attendre = (p) => differes.push(p);

  console.log("\nCache de stock — " + codes.length + " références\n");

  // 1) Rien en cache : Odoo est interrogé, la marge est retirée.
  odoo.reinitialiser(100);
  let r = await stockVendable(env, codes, { attendre });
  verifier("relevé initial : 100 pièces moins la marge de 2", r.EAN0, 98);
  verifier("Odoo interrogé une seule fois", odoo.releves, 1);
  verifier("relevé publié dans la base partagée", ligne !== null, true);

  // 2) Cache frais : Odoo ne doit pas être redérangé.
  odoo.reinitialiser(100);
  await stockVendable(env, codes, { attendre });
  verifier("cache frais : aucun appel à Odoo", odoo.releves, 0);

  // 3) Cache tiède : servi immédiatement, rafraîchi en arrière-plan.
  await vieillir(5 * 60 * 1000);
  odoo.reinitialiser(40);                       // le stock a bougé chez Odoo
  const t0 = Date.now();
  r = await stockVendable(env, codes, { attendre });
  verifier("tiède : réponse en moins de 50 ms", Date.now() - t0 < 50, true);
  verifier("tiède : sert l'ancien chiffre sans attendre", r.EAN0, 98);
  verifier("tiède : un rafraîchissement part en arrière-plan", differes.length, 1);
  await Promise.all(differes.splice(0));
  verifier("tiède : la base partagée porte ensuite le chiffre neuf",
    JSON.parse(ligne.valeur).EAN0, 38);

  // 4) Cache périmé : on refuse de servir et on recalcule pour de bon.
  await vieillir(20 * 60 * 1000);
  odoo.reinitialiser(10);
  r = await stockVendable(env, codes, { attendre });
  verifier("périmé : Odoo est réellement interrogé", odoo.releves >= 1, true);
  verifier("périmé : le chiffre rendu est le neuf", r.EAN0, 8);

  // 5) Sans waitUntil — une plateforme qui ne l'offre pas — rien ne casse.
  await vieillir(5 * 60 * 1000);
  odoo.reinitialiser(60);
  r = await stockVendable(env, codes);
  verifier("sans waitUntil : une réponse est rendue quand même", typeof r.EAN0, "number");

  // 6) Un petit panier lit le relevé partagé mais ne l'écrase jamais.
  const avant = ligne.valeur;
  odoo.reinitialiser(1);
  await stockVendable(env, ["EAN0", "EAN1"], { attendre });
  verifier("petit panier : la base partagée est intacte", ligne.valeur === avant, true);

  // 7) Une pièce en stock, marge de deux : zéro, jamais un négatif.
  ligne = null;
  await dormir(70);
  odoo.reinitialiser(1);
  const r7 = await stockVendable(env, ["Z1", "Z2"], { attendre });
  verifier("1 pièce moins la marge de 2 ne donne pas −1", r7.Z1, 0);

  console.log(echecs
    ? "\n" + echecs + " ÉCHEC(S) — ne pas déployer en l'état.\n"
    : "\nTous les contrôles passent.\n");
  process.exit(echecs ? 1 : 0);
} finally {
  try { rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* peu importe */ }
}
