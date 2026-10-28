/* ==========================================================================
   VÉRIFIE LES NUMÉROS DE VERSION DES FICHIERS STATIQUES.

   Le défaut qu'il attrape, pour l'avoir vécu : on modifie un fichier .js,
   on le déploie, et les navigateurs continuent de servir l'ancien pendant
   des jours parce que le « ?v=… » de la page n'a pas bougé. Le site est
   corrigé, le client voit l'ancien, et on cherche le bug dans le mauvais
   fichier.

   Principe : pour chaque fichier CSS ou JS modifié depuis une référence
   git, on vérifie que CHAQUE page qui le charge a vu son « ?v=… » changer
   dans le même intervalle.

   Usage :  node outils/verif-versions.cjs [référence git, défaut HEAD~1]
   ========================================================================== */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "HEAD~1";
const racine = execSync("git rev-parse --show-toplevel").toString().trim();

function git(cmd) {
  return execSync("git " + cmd, { cwd: racine }).toString();
}

const modifies = git("diff --name-only " + base + " HEAD")
  .split("\n").map((s) => s.trim()).filter(Boolean);

const actifs = modifies.filter((f) => /^assets\/(js|css)\/.+\.(js|css)$/.test(f));
if (!actifs.length) {
  console.log("Aucun fichier JS ou CSS modifié depuis " + base + ".");
  process.exit(0);
}

// Toutes les pages du site, pour savoir qui charge quoi.
const pages = [];
(function parcourir(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (e.name.endsWith(".html")) pages.push(path.relative(racine, p));
  }
})(racine);

let fautes = 0;

for (const fichier of actifs) {
  const nom = fichier.replace(/^assets\//, "");
  for (const page of pages) {
    const maintenant = fs.readFileSync(path.join(racine, page), "utf8");
    const motif = new RegExp("/assets/" + nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=(\\d+)");
    const ici = maintenant.match(motif);
    if (!ici) continue;

    let avant = null;
    try { avant = git("show " + base + ":" + page); } catch (e) { continue; }  // page nouvelle
    const la = avant.match(motif);
    if (!la) continue;                                   // la page ne le chargeait pas avant

    if (la[1] === ici[1]) {
      fautes++;
      console.log("  FAUX  " + fichier + " a changé, mais " + page
        + " le charge toujours en ?v=" + ici[1]
        + "\n        -> les navigateurs serviront l'ancien fichier. Montez le numéro.");
    } else {
      console.log("  ok    " + fichier + " : " + page + " passe de ?v=" + la[1] + " à ?v=" + ici[1]);
    }
  }
}

console.log(fautes ? "\n" + fautes + " version(s) oubliée(s)" : "\ntoutes les versions ont été montées");
process.exit(fautes ? 1 : 0);
