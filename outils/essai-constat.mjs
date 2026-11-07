/* ==========================================================================
   ESSAI — LE CONSTAT DE REGISTRE.

   Décidé le 7 novembre 2026 : faute de pouvoir obtenir le numéro de
   consultation, que la France refuse de délivrer, NBD peut exonérer un
   client sur la foi d'un constat horodaté portant la raison sociale et
   l'adresse rendues par le registre européen.

   Ce fichier ne teste pas la confiance — rien, depuis ce serveur, ne peut
   prouver que l'interrogation a bien eu lieu. Il teste les fautes
   d'inattention, qui elles arrivent vraiment, et dont chacune ferait
   partir une exonération au mauvais endroit.
   ========================================================================== */

const { lireConstat, CONSTAT_FRAICHEUR_H } =
  await import("../functions/api/tva-manuel.js");

let faits = 0, rates = 0;
function verifier(nom, condition, detail) {
  faits++;
  if (condition) { console.log("  ok   " + nom); return; }
  rates++;
  console.log("  ÉCHEC " + nom + (detail ? "\n         " + detail : ""));
}

const maintenant = () => new Date().toISOString();
const ilYA = (h) => new Date(Date.now() - h * 3600000).toISOString();

const BON = {
  interroge: "FR68934168154",
  nom: "SARL HAIR BODEGA",
  adresse: "3 AV DE PARIS\n28400 ARCISSES",
  verifie_le: maintenant(),
};

console.log("Un constat recevable");
{
  const r = lireConstat(BON, "FR68934168154");
  verifier("il passe", !r.refus, r.refus);
  verifier("la raison sociale est conservée", r.nom === "SARL HAIR BODEGA");
  verifier("l'adresse est mise au propre sur une ligne",
    r.adresse === "3 AV DE PARIS 28400 ARCISSES", "lu « " + r.adresse + " »");
}
{
  // Le numéro du compte peut être écrit autrement — espaces, points,
  // minuscules. C'est le même numéro.
  const r = lireConstat({ ...BON, interroge: "fr 68 934.168.154" }, "FR68934168154");
  verifier("la mise en forme du numéro ne fait pas obstacle", !r.refus, r.refus);
}

console.log("\nLes fautes qui feraient exonérer le mauvais client");
{
  const r = lireConstat({ ...BON, interroge: "FR85104647763" }, "FR68934168154");
  verifier("un constat portant sur UN AUTRE numéro est refusé — c'est la "
    + "faute qui enverrait l'exonération au mauvais client", !!r.refus);
  verifier("et le refus nomme les deux numéros, sinon il est incompréhensible",
    /FR85104647763/.test(r.refus) && /FR68934168154/.test(r.refus),
    "lu « " + r.refus + " »");
}
{
  verifier("un constat sans numéro interrogé est refusé",
    !!lireConstat({ ...BON, interroge: "" }, "FR68934168154").refus);
  verifier("un constat sans raison sociale est refusé : c'est elle qui "
    + "distingue un constat d'une affirmation",
    !!lireConstat({ ...BON, nom: "" }, "FR68934168154").refus);
  verifier("un constat vide est refusé",
    !!lireConstat(null, "FR68934168154").refus);
  verifier("un constat qui n'est pas un objet est refusé",
    !!lireConstat("oui c'est bon", "FR68934168154").refus);
}

console.log("\nLa fraîcheur, parce que l'autoliquidation se justifie au moment de la vente");
{
  verifier("un constat d'il y a deux heures passe",
    !lireConstat({ ...BON, verifie_le: ilYA(2) }, "FR68934168154").refus);
  verifier("un constat d'il y a trente heures passe encore",
    !lireConstat({ ...BON, verifie_le: ilYA(30) }, "FR68934168154").refus);
  const vieux = lireConstat({ ...BON, verifie_le: ilYA(72) }, "FR68934168154");
  verifier("un constat d'il y a trois jours est refusé", !!vieux.refus);
  verifier("et le refus dit quoi faire", /Refaites/.test(vieux.refus || ""),
    "lu « " + vieux.refus + " »");
  verifier("une date illisible est refusée",
    !!lireConstat({ ...BON, verifie_le: "avant-hier" }, "FR68934168154").refus);
  verifier("une date manquante est refusée",
    !!lireConstat({ ...BON, verifie_le: "" }, "FR68934168154").refus);
  verifier("une date dans le futur est refusée — une horloge déréglée ne doit "
    + "pas prolonger indéfiniment un constat",
    !!lireConstat({ ...BON, verifie_le: ilYA(-24) }, "FR68934168154").refus);
}

console.log("\nLes débordements");
{
  const r = lireConstat({ ...BON, nom: "X".repeat(500), adresse: "Y".repeat(900) },
                        "FR68934168154");
  verifier("une raison sociale démesurée est coupée, pas refusée",
    !r.refus && r.nom.length === 160, "longueur " + (r.nom || "").length);
  verifier("une adresse démesurée est coupée aussi",
    r.adresse.length === 240, "longueur " + (r.adresse || "").length);
}

console.log("");
if (rates) {
  console.log(rates + " vérification(s) en échec sur " + faits + ".");
  process.exit(1);
}
console.log("Le constat de registre refuse ce qu'il faut refuser. "
  + faits + " vérifications.");
