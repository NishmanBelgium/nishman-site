/* ==========================================================================
   ESSAI DU PONT ODOO — la file d'attente et les réessais, sans Odoo.

   À lancer après toute modification de functions/_odoo.js :

       node outils/essai-odoo.mjs

   Pourquoi cet essai existe.

   Le 5 novembre 2026, les lots de références ont été lancés en parallèle
   pour accélérer le relevé de stock. Le relevé est devenu quatre fois
   plus rapide, et Odoo s'est mis à répondre 429 — « trop de requêtes ».
   Le catalogue retombait alors, en silence, sur les limites
   approximatives du script Google : le stock réel n'était plus servi du
   tout. Une optimisation qui casse ce qu'elle accélère, et qui ne le
   dit pas.

   La correction a introduit deux guichets et des réessais. C'est du code
   dont une erreur ne se voit pas non plus : un sémaphore mal rendu ne
   ralentit pas le site, il le fige — toutes les pages qui parlent à Odoo
   attendent un jeton qui ne reviendra jamais. D'où ces contrôles, dont
   le dernier vérifie précisément qu'une erreur ne laisse pas un guichet
   fermé derrière elle.

   fetch est remplacé par une doublure qui compte les appels simultanés
   et sait refuser à la demande. Rien d'autre n'est modifié : c'est bien
   le fichier du dépôt qui est exécuté.
   ========================================================================== */

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), "essai-odoo-"));

try {
  writeFileSync(join(dossier, "_odoo.js"),
    readFileSync(join(ICI, "..", "functions", "_odoo.js"), "utf8"));

  let enVolMax = 0, enVol = 0, appels = 0, refusRestants = 0;
  globalThis.fetch = async (url, init) => {
    appels++;
    enVol++; enVolMax = Math.max(enVolMax, enVol);
    await new Promise((r) => setTimeout(r, 25));
    enVol--;
    if (refusRestants > 0) {
      refusRestants--;
      return { status: 429, ok: false, headers: { get: () => null } };
    }
    const corps = JSON.parse(init.body);
    const resultat = corps.params.service === "common" ? 7 : [{ id: 1 }];
    return {
      status: 200, ok: true, headers: { get: () => null },
      json: async () => ({ result: resultat }),
    };
  };

  const { appel } = await import(pathToFileURL(join(dossier, "_odoo.js")).href);
  const env = { ODOO_URL: "https://exemple.test", ODOO_DB: "d", ODOO_USER: "u", ODOO_KEY: "k" };

  let echecs = 0;
  const verifier = (nom, reel, attendu) => {
    const ok = JSON.stringify(reel) === JSON.stringify(attendu);
    if (!ok) echecs++;
    console.log((ok ? "  ok    " : "  ÉCHEC ") + nom + " → " + JSON.stringify(reel)
      + (ok ? "" : "   (attendu " + JSON.stringify(attendu) + ")"));
  };

  console.log("\nPont Odoo — file d'attente et réessais\n");

  // 1) Dix appels lancés d'un coup : jamais plus de deux en vol, et une
  //    seule connexion pour tout le monde.
  await Promise.all(Array.from({ length: 10 }, () =>
    appel(env, "m", "search_read", [[]], {})));
  verifier("10 appels simultanés : jamais plus de 2 en vol", enVolMax <= 2, true);
  verifier("une seule connexion pour les 10 (1 login + 10 lectures)", appels, 11);

  // 2) Un refus passager est réessayé.
  refusRestants = 1; appels = 0;
  const r = await appel(env, "m", "search_read", [[]], {});
  verifier("429 passager : réessayé puis abouti", r, [{ id: 1 }]);
  verifier("429 passager : exactement deux tentatives", appels, 2);

  // 3) Un refus qui dure finit par lever, sans boucler indéfiniment.
  refusRestants = 10;
  let leve = "";
  try { await appel(env, "m", "search_read", [[]], {}); }
  catch (e) { leve = e.message; }
  verifier("429 persistant : une erreur claire est levée", leve, "Odoo a répondu 429");
  refusRestants = 0;

  // 4) LE CONTRÔLE QUI COMPTE : une erreur ne doit pas laisser un guichet
  //    fermé. Si celui-ci échoue, le site se fige dès la première panne.
  const t = Date.now();
  await Promise.all(Array.from({ length: 4 }, () =>
    appel(env, "m", "search_read", [[]], {})));
  verifier("aucun guichet resté fermé après une erreur", Date.now() - t < 3000, true);

  console.log(echecs
    ? "\n" + echecs + " ÉCHEC(S) — ne pas déployer en l'état.\n"
    : "\nTous les contrôles passent.\n");
  process.exit(echecs ? 1 : 0);
} finally {
  try { rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* peu importe */ }
}
