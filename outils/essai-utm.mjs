/* ==========================================================================
   ESSAI DE L'ATTRIBUTION — l'origine d'une commande, sans Odoo.

   À lancer après toute modification de functions/_utm.js :

       node outils/essai-utm.mjs

   Pourquoi cet essai existe.

   Ce module écrit sur chaque commande d'où vient le client. C'est un
   chiffre que personne ne recoupe : si une campagne est mal étiquetée,
   le rapport Odoo aura l'air parfaitement normal et dira simplement le
   faux. Un bug ici ne se voit pas, il se croit.

   Trois choses s'y vérifient, et les trois ont déjà mal tourné ailleurs
   dans ce genre de code :

     - LE NETTOYAGE. Odoo apparie ces étiquettes par leur nom. « Meta »,
       « meta » et « meta  » deviendraient trois sources distinctes, et
       le rapport serait illisible au bout de deux mois. Les valeurs
       viennent d'une adresse publique, donc de n'importe qui.

     - LA COMMANDE PASSE AVANT L'ÉTIQUETTE. Si Odoo refuse, si le réseau
       tombe, si un nom est aberrant, champsOrigine doit rendre un objet
       vide — jamais lever. Une commande mal étiquetée se rattrape à la
       main ; une commande perdue se perd.

     - LA COURSE À LA CRÉATION. Deux commandes simultanées portant une
       campagne neuve la créent en même temps ; la seconde se fait
       refuser par Odoo. Ce n'est pas une erreur, et il ne faut pas
       perdre l'étiquette pour autant.

   Odoo est remplacé par une doublure. Rien d'autre n'est modifié : c'est
   le fichier du dépôt qui est exécuté.
   ========================================================================== */

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), "essai-utm-"));

try {
  writeFileSync(join(dossier, "_utm.js"),
    readFileSync(join(ICI, "..", "functions", "_utm.js"), "utf8"));

  // La doublure d'Odoo : elle retient les étiquettes et sait refuser.
  writeFileSync(join(dossier, "_odoo.js"), `
export let base = {};
export let creations = 0;
export let lectures = 0;
export let refuserCreation = false;
export let planter = false;
export function preparer(initial) {
  base = JSON.parse(JSON.stringify(initial || {}));
  creations = 0; lectures = 0; refuserCreation = false; planter = false;
}
export function regler(o) { if ('refuserCreation' in o) refuserCreation = o.refuserCreation;
                            if ('planter' in o) planter = o.planter; }
export async function appel(env, modele, methode, args) {
  if (planter) throw new Error('Odoo a répondu 503');
  base[modele] = base[modele] || [];
  if (methode === 'search_read') {
    lectures++;
    const cherche = String(args[0][0][2]).toLowerCase();
    const t = base[modele].find((x) => x.name.toLowerCase() === cherche);
    return t ? [{ id: t.id }] : [];
  }
  if (methode === 'create') {
    const nom = args[0].name;
    const existe = base[modele].find((x) => x.name.toLowerCase() === String(nom).toLowerCase());
    if (existe && refuserCreation) throw new Error('doublon');
    if (refuserCreation) { base[modele].push({ id: 900 + base[modele].length, name: nom }); throw new Error('doublon'); }
    creations++;
    const id = 900 + base[modele].length;
    base[modele].push({ id, name: nom });
    return id;
  }
  return [];
}
`);

  const m = await import(pathToFileURL(join(dossier, "_utm.js")).href);
  const odoo = await import(pathToFileURL(join(dossier, "_odoo.js")).href);

  let echecs = 0;
  const verifier = (nom, reel, attendu) => {
    const ok = JSON.stringify(reel) === JSON.stringify(attendu);
    if (!ok) echecs++;
    console.log((ok ? "  ok    " : "  ÉCHEC ") + nom + " → " + JSON.stringify(reel)
      + (ok ? "" : "   (attendu " + JSON.stringify(attendu) + ")"));
  };

  console.log("\nAttribution des commandes — nettoyage, résistance, course\n");

  /* --- 1. Le nettoyage ------------------------------------------------ */
  verifier("la casse est uniformisée", m.nettoyer("Meta"), "meta");
  verifier("les espaces en trop disparaissent", m.nettoyer("  salons   novembre "), "salons novembre");
  verifier("un nom d'un seul caractère est rejeté", m.nettoyer("x"), "");
  verifier("le vide reste vide", m.nettoyer(null), "");
  verifier("les chevrons sont jetés", m.nettoyer("meta<script>"), "metascript");
  verifier("les caractères de contrôle sont jetés", m.nettoyer("me\u0000ta"), "meta");
  verifier("un nom trop long est coupé à 60", m.nettoyer("a".repeat(200)).length, 60);
  verifier("les tirets et points sont gardés", m.nettoyer("nov-2026.salons"), "nov-2026.salons");
  verifier("un nom entièrement illégal ne passe pas", m.nettoyer("<<<>>>"), "");

  /* --- 2. Ce que le navigateur envoie --------------------------------- */
  verifier("un corps sans origine ne rend rien",
    m.origineDuCorps({ selection: {} }), null);
  verifier("seules les trois clés attendues sont retenues",
    m.origineDuCorps({ origine: { source: "Meta", medium: "CPC",
      campagne: "Salons", vol: "donnees", __proto__: {} } }),
    { source: "meta", medium: "cpc", campagne: "salons" });
  verifier("une origine entièrement illisible ne rend rien",
    m.origineDuCorps({ origine: { source: "!", medium: "", campagne: "<>" } }), null);

  /* --- 3. La résolution dans Odoo ------------------------------------- */
  odoo.preparer({ "utm.source": [{ id: 1, name: "Google" }],
                  "utm.medium": [{ id: 3, name: "Direct" }],
                  "utm.campaign": [] });

  let r = await m.champsOrigine({}, { source: "google", medium: "direct" });
  verifier("une étiquette existante est retrouvée malgré la casse",
    r, { source_id: 1, medium_id: 3 });
  verifier("rien n'a été créé pour autant", odoo.creations, 0);

  r = await m.champsOrigine({}, { source: "meta", medium: "cpc", campagne: "salons-novembre" });
  verifier("trois étiquettes neuves sont créées",
    { s: !!r.source_id, m: !!r.medium_id, c: !!r.campaign_id }, { s: true, m: true, c: true });
  verifier("exactement trois créations", odoo.creations, 3);

  const avant = odoo.lectures;
  await m.champsOrigine({}, { source: "meta", medium: "cpc", campagne: "salons-novembre" });
  verifier("le second passage ne relit pas Odoo", odoo.lectures, avant);
  verifier("le second passage ne recrée rien", odoo.creations, 3);

  verifier("une origine vide ne touche pas Odoo",
    await m.champsOrigine({}, {}), {});
  verifier("une origine absente ne touche pas Odoo",
    await m.champsOrigine({}, null), {});

  /* --- 4. LE CONTRÔLE QUI COMPTE : la commande passe avant l'étiquette */
  odoo.preparer({});
  odoo.regler({ planter: true });
  let leve = null;
  try { r = await m.champsOrigine({}, { source: "meta", campagne: "x-novembre" }); }
  catch (e) { leve = e.message; }
  verifier("Odoo en panne : aucune exception ne remonte", leve, null);
  verifier("Odoo en panne : objet vide, la commande peut partir", r, {});

  /* --- 5. La course à la création ------------------------------------- */
  odoo.preparer({});
  odoo.regler({ refuserCreation: true });
  r = await m.champsOrigine({}, { campagne: "course-novembre" });
  verifier("création refusée pour cause de doublon : l'étiquette est quand même retrouvée",
    typeof r.campaign_id === "number", true);

  console.log(echecs
    ? "\n" + echecs + " ÉCHEC(S) — ne pas déployer en l'état.\n"
    : "\nTous les contrôles passent.\n");
  process.exit(echecs ? 1 : 0);
} finally {
  try { rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* peu importe */ }
}
