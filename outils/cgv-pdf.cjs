/* Extrait les CGV de assets/js/cgv.js vers du JSON.
   But : le PDF téléchargeable est engendré depuis la même source que la
   page, pour qu'ils ne puissent plus diverger — c'est ainsi qu'une ancienne
   adresse de siège a pu survivre six mois dans le PDF. */
const fs = require("fs"), path = require("path");
const racine = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(racine, "assets/js/cgv.js"), "utf8");

function tranche(debut, finApres) {
  const i = src.indexOf(debut);
  if (i < 0) throw new Error("introuvable : " + debut);
  const j = src.indexOf(finApres, i);
  if (j < 0) throw new Error("fin introuvable après : " + debut);
  return src.slice(i, j + finApres.length);
}

const bloc = tranche("const UI = {", "};") + "\n" +
             tranche("const CGV = {};", "CGV.tr = [") .replace(/CGV\.tr = \[$/, "") +
             tranche("CGV.tr = [", "\n  ];") + "\n" +
             "return { UI: UI, CGV: CGV };";

const donnees = new Function(bloc)();
process.stdout.write(JSON.stringify(donnees, null, 1));
