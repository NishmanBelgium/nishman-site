/* ==========================================================================
   ESSAI — LE RATTRAPAGE DE TVA.

   Ce module décide si une facture porte la TVA ou non. C'est le seul
   endroit du site où une erreur se compte en euros dus à l'État, dans un
   sens comme dans l'autre, et il n'avait aucun test.

   Le défaut d'origine, le 6 novembre 2026 : Hair bodega, numéro français
   FR68934168154 parfaitement valide, interrogation refusée par le nœud
   français avec MS_MAX_CONCURRENT_REQ, commande facturée TVA comprise à
   17h25, et personne averti. NBD l'a découvert le lendemain en relisant
   la facture.

   Les vérifications ci-dessous portent sur les deux fautes symétriques :
     - une société exonérable facturée TVA comprise doit apparaître dans la
       liste des notes de crédit à émettre ;
     - une société sans numéro valide ne doit JAMAIS y apparaître, sous
       aucun prétexte — une note de crédit émise à tort est une facture
       fausse de plus.

   La base est un vrai SQLite en mémoire, pas un faux objet : les requêtes
   du module sont exécutées telles quelles, et une faute de SQL se voit.
   ========================================================================== */

import { DatabaseSync } from "node:sqlite";

/* --- Le harnais ---------------------------------------------------------- */

let faits = 0, rates = 0;
function verifier(nom, condition, detail) {
  faits++;
  if (condition) { console.log("  ok   " + nom); return; }
  rates++;
  console.log("  ÉCHEC " + nom + (detail ? "\n         " + detail : ""));
}

/** L'interface D1 de Cloudflare, posée sur SQLite. Juste ce qu'utilise le
 *  module : exec, prepare().bind().run()/all()/first(). */
function baseD1() {
  const sql = new DatabaseSync(":memory:");
  return {
    sql,
    exec(requete) { sql.exec(requete); return Promise.resolve(); },
    prepare(requete) {
      let valeurs = [];
      const api = {
        bind(...v) { valeurs = v.map((x) => (x === undefined ? null : x)); return api; },
        run() { sql.prepare(requete).run(...valeurs); return Promise.resolve({ success: true }); },
        all() { return Promise.resolve({ results: sql.prepare(requete).all(...valeurs) }); },
        first() { return Promise.resolve(sql.prepare(requete).get(...valeurs) || null); },
      };
      return api;
    },
  };
}

/** La table des comptes, telle que le site la connaît — réduite aux
 *  colonnes que le contrôle de TVA lit et écrit. */
function creerComptes(db) {
  db.sql.exec(`CREATE TABLE comptes (
    id INTEGER PRIMARY KEY, email TEXT, salon TEXT, pays TEXT,
    tva TEXT, siret TEXT, tva_valide INTEGER DEFAULT 0, tva_statut TEXT,
    tva_verifiee_le TEXT, tva_preuve TEXT, tva_nom TEXT, tva_motif TEXT)`);
}

function poserCompte(db, c) {
  db.sql.prepare(
    "INSERT INTO comptes (id, email, salon, pays, tva, tva_valide, tva_statut, tva_motif) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(c.id, c.email || "a@b.c", c.salon || "Salon", c.pays,
        c.tva || null, c.tva_valide ? 1 : 0, c.tva_statut || null, c.tva_motif || null);
  return { ...c, email: c.email || "a@b.c", salon: c.salon || "Salon" };
}

/* --- Le registre européen, simulé ---------------------------------------
 *
 * On ne touche pas au vrai VIES depuis un test : il est lent, il tombe, et
 * un test qui dépend d'un service administratif européen n'est pas un
 * test. On remplace donc fetch, en rendant exactement les formes de
 * réponse que _vies.js sait lire. */

let reponseVies = null;
let appelsVies = 0;

globalThis.fetch = async () => {
  appelsVies++;
  return {
    ok: reponseVies.ok !== false,
    status: reponseVies.status || 200,
    json: async () => reponseVies.corps,
    text: async () => JSON.stringify(reponseVies.corps),
  };
};

const VIES_VALIDE = {
  corps: { valid: true, name: "HAIR BODEGA", address: "RUE X",
           requestIdentifier: "WAPIAAAAXnAO0Hv0", requestDate: "2026-11-07T08:00:00Z" },
};
const VIES_INCONNU = {
  corps: { valid: false, requestDate: "2026-11-07T08:00:00Z" },
};
const VIES_SATURE = {
  corps: { actionSucceed: false, errorWrappers: [{ error: "MS_MAX_CONCURRENT_REQ" }] },
};

const { rattraperApresVente, aRegulariser, encoreMuettes, marquerReglee,
        nonTranche, transitoire } = await import("../functions/_tva_rattrapage.js");

const ENV = { TVA_NBD: "BE0817750283" };

/* --- Les règles de tri, d'abord ------------------------------------------ */

console.log("Ce qui mérite une seconde interrogation");
verifier("un registre muet n'a pas tranché", nonTranche("indisponible"));
verifier("un compte jamais contrôlé n'a pas tranché", nonTranche("jamais"));
verifier("une confirmation a tranché", !nonTranche("valide"));
verifier("un démenti a tranché", !nonTranche("invalide"));
verifier("une saturation de l'État membre est transitoire",
  transitoire("MS_MAX_CONCURRENT_REQ"));
verifier("une panne réseau est transitoire", transitoire("reseau"));
verifier("une erreur 503 est transitoire", transitoire("http_503"));
verifier("un numéro inconnu du registre est définitif",
  !transitoire("inconnu_du_registre"));
verifier("un format refusé est définitif", !transitoire("format"));
verifier("un motif inconnu est traité comme transitoire — une interrogation "
  + "de trop coûte moins qu'une facture fausse",
  transitoire("MOTIF_QUE_NOUS_NE_CONNAISSONS_PAS_ENCORE"));

/* --- Le cas de Hair bodega, rejoué -------------------------------------- */

console.log("\nLe cas du 6 novembre 2026, rejoué");
{
  const db = baseD1();
  creerComptes(db);
  const compte = poserCompte(db, {
    id: 1, salon: "Hair bodega", pays: "FR", tva: "FR68934168154",
    tva_valide: 0, tva_statut: "indisponible", tva_motif: "MS_MAX_CONCURRENT_REQ",
  });

  // Au second contrôle, le registre français répond enfin.
  reponseVies = VIES_VALIDE; appelsVies = 0;
  await rattraperApresVente(db, ENV, compte, {
    ref: "CMD-20261106-4ON", odoo_nom: "S00285", client: "Hair bodega",
    montant: "108.23", statut_vente: "indisponible",
    motif_vente: "MS_MAX_CONCURRENT_REQ",
  });

  verifier("le registre a bien été réinterrogé après la vente", appelsVies >= 1,
    "appels : " + appelsVies);

  const liste = await aRegulariser(db);
  verifier("la vente apparaît dans les notes de crédit à émettre",
    liste.length === 1, "reçu " + liste.length + " ligne(s)");
  const l = liste[0] || {};
  verifier("elle porte le numéro Odoo de la facture", l.odoo_nom === "S00285",
    "lu « " + l.odoo_nom + " »");
  verifier("elle porte le montant encaissé TVA comprise", l.montant === "108.23",
    "lu « " + l.montant + " »");
  verifier("elle garde le motif du refus initial",
    l.motif_vente === "MS_MAX_CONCURRENT_REQ", "lu « " + l.motif_vente + " »");
  verifier("le second contrôle est enregistré comme concluant",
    l.statut_apres === "valide", "lu « " + l.statut_apres + " »");
  verifier("la preuve du registre est conservée — c'est elle qui justifie "
    + "l'autoliquidation", l.preuve_apres === "WAPIAAAAXnAO0Hv0",
    "lu « " + l.preuve_apres + " »");
  verifier("elle ne figure pas parmi les numéros non tranchés",
    (await encoreMuettes(db)).length === 0);

  // Le compte lui-même doit être exonéré pour la commande suivante : sans
  // cela, le client repaierait la TVA demain.
  const c = db.sql.prepare("SELECT tva_statut, tva_valide FROM comptes WHERE id = 1").get();
  verifier("le compte est désormais exonéré pour ses prochaines commandes",
    c.tva_statut === "valide" && c.tva_valide === 1,
    "statut « " + c.tva_statut + " », valide " + c.tva_valide);

  verifier("une fois la note de crédit émise, la ligne quitte la liste",
    (await marquerReglee(db, "CMD-20261106-4ON"))
    && (await aRegulariser(db)).length === 0);
}

/* --- La faute symétrique, celle qu'il ne faut jamais commettre ---------- */

console.log("\nCe qui ne doit JAMAIS réclamer de note de crédit");
{
  const db = baseD1();
  creerComptes(db);
  const compte = poserCompte(db, {
    id: 2, salon: "Barber by Ari", pays: "FR", tva: "FR00988674727",
    tva_valide: 0, tva_statut: "indisponible", tva_motif: "reseau",
  });

  reponseVies = VIES_INCONNU;
  await rattraperApresVente(db, ENV, compte, {
    ref: "CMD-X", odoo_nom: "S00300", montant: "200.00",
    statut_vente: "indisponible", motif_vente: "reseau",
  });

  verifier("un numéro que le registre finit par démentir ne donne aucune "
    + "note de crédit", (await aRegulariser(db)).length === 0);
  verifier("il ne reste pas non plus dans les numéros à vérifier à la main — "
    + "le registre a répondu", (await encoreMuettes(db)).length === 0);
  verifier("la TVA facturée était donc la bonne, et rien n'est à corriger",
    db.sql.prepare("SELECT tva_valide FROM comptes WHERE id = 2").get().tva_valide === 0);
}

{
  const db = baseD1();
  creerComptes(db);
  reponseVies = VIES_VALIDE;

  // Une vente intérieure : la TVA belge est due, quoi que dise le registre.
  const belge = poserCompte(db, {
    id: 3, salon: "Salon de Binche", pays: "BE", tva: "BE0817750283",
    tva_statut: "indisponible", tva_motif: "reseau",
  });
  await rattraperApresVente(db, ENV, belge, {
    ref: "CMD-BE", statut_vente: "indisponible", motif_vente: "reseau" });
  verifier("une société belge n'entre jamais dans le rattrapage : la vente "
    + "est intérieure", (await aRegulariser(db)).length === 0
    && (await encoreMuettes(db)).length === 0);

  // Sans numéro, il n'y a rien à exonérer.
  const sansNumero = poserCompte(db, {
    id: 4, salon: "Sans numéro", pays: "FR", tva: null, tva_statut: "jamais" });
  await rattraperApresVente(db, ENV, sansNumero, {
    ref: "CMD-SN", statut_vente: "jamais", motif_vente: "" });
  verifier("un compte sans numéro de TVA n'entre pas dans le rattrapage",
    (await aRegulariser(db)).length === 0
    && (await encoreMuettes(db)).length === 0);

  // Déjà exonéré au moment de la vente : il n'y a rien à rattraper.
  const dejaValide = poserCompte(db, {
    id: 5, salon: "Déjà validé", pays: "LU", tva: "LU12345678",
    tva_valide: 1, tva_statut: "valide" });
  await rattraperApresVente(db, ENV, dejaValide, {
    ref: "CMD-OK", statut_vente: "valide", motif_vente: "" });
  verifier("une vente déjà exonérée n'entre pas dans le rattrapage",
    (await aRegulariser(db)).length === 0);

  // Démenti franc au moment de la vente : insister serait absurde.
  const dementi = poserCompte(db, {
    id: 6, salon: "Numéro inventé", pays: "FR", tva: "FR99999999999",
    tva_statut: "invalide", tva_motif: "inconnu_du_registre" });
  await rattraperApresVente(db, ENV, dementi, {
    ref: "CMD-NON", statut_vente: "invalide", motif_vente: "inconnu_du_registre" });
  verifier("un numéro déjà démenti par le registre n'est pas réinterrogé",
    (await aRegulariser(db)).length === 0
    && (await encoreMuettes(db)).length === 0);
}

/* --- Quand le registre reste muet --------------------------------------- */

console.log("\nQuand le registre ne répond toujours pas");
{
  const db = baseD1();
  creerComptes(db);
  const compte = poserCompte(db, {
    id: 7, salon: "Coiffure Platine", pays: "FR", tva: "FR12345678901",
    tva_valide: 0, tva_statut: "indisponible", tva_motif: "MS_MAX_CONCURRENT_REQ",
  });

  reponseVies = VIES_SATURE;
  await rattraperApresVente(db, ENV, compte, {
    ref: "CMD-MUET", odoo_nom: "S00310", montant: "490.05",
    statut_vente: "indisponible", motif_vente: "MS_MAX_CONCURRENT_REQ",
  });

  verifier("aucune note de crédit n'est réclamée sans confirmation",
    (await aRegulariser(db)).length === 0);
  const muettes = await encoreMuettes(db);
  verifier("la vente est signalée comme à vérifier à la main",
    muettes.length === 1, "reçu " + muettes.length + " ligne(s)");
  verifier("elle nomme le client et son numéro, sans quoi la vérification "
    + "manuelle est impossible",
    (muettes[0] || {}).client === "Coiffure Platine"
    && (muettes[0] || {}).numero === "FR12345678901");
}

/* --- Et si tout casse --------------------------------------------------- */

console.log("\nLe rattrapage ne doit jamais faire échouer une vente");
{
  const compteSansBase = { id: 9, pays: "FR", tva: "FR68934168154", salon: "X" };
  let leve = false;
  try {
    await rattraperApresVente(null, ENV, compteSansBase, {
      ref: "CMD-Z", statut_vente: "indisponible", motif_vente: "reseau" });
  } catch (e) { leve = true; }
  verifier("sans base de données, il se taît au lieu de lever", !leve);

  const dbCassee = { exec: () => { throw new Error("disque plein"); },
                     prepare: () => { throw new Error("disque plein"); } };
  leve = false;
  try {
    await rattraperApresVente(dbCassee, ENV, compteSansBase, {
      ref: "CMD-Z", statut_vente: "indisponible", motif_vente: "reseau" });
  } catch (e) { leve = true; }
  verifier("une base en panne ne remonte pas jusqu'au client", !leve);

  leve = false;
  try { await rattraperApresVente(baseD1(), ENV, compteSansBase, null); }
  catch (e) { leve = true; }
  verifier("un appel sans référence ne lève pas", !leve);
}

console.log("\nLe rattrapage de TVA est conforme : la bonne facture est "
  + "réclamée, la mauvaise jamais.");

/* ==========================================================================
   LE SECOND CHEMIN DU REGISTRE.

   Relevé le 7 novembre 2026 : pour un numéro français, POST
   /check-vat-number renvoie MS_MAX_CONCURRENT_REQ à chaque appel, avec ou
   sans champs requérant, tandis que GET /ms/FR/vat/{n} répond du premier
   coup. Quatre sociétés aux numéros valides en étaient taxées.

   Les vérifications ci-dessous portent sur la bascule : la bonne porte
   d'abord, pour la preuve ; l'autre quand l'État membre referme la
   première ; et jamais de confusion entre les deux formes de réponse —
   l'une nomme son champ « valid », l'autre « isValid », et lire le mauvais
   rendrait undefined, donc jamais d'exonération.
   ========================================================================== */

const vies = await import("../functions/_vies.js");
const tvaMod = await import("../functions/_tva.js");

/* Le faux registre : on choisit, par méthode, ce que chaque porte répond. */
let porteePost = null, porteeGet = null, vus = [];
globalThis.fetch = async (url, init) => {
  const methode = (init && init.method) || "GET";
  vus.push(methode + " " + String(url).replace(
    "https://ec.europa.eu/taxation_customs/vies/rest-api", ""));
  const corps = methode === "POST" ? porteePost : porteeGet;
  return { ok: corps.ok !== false, status: corps.status || 200,
           json: async () => corps.corps, text: async () => JSON.stringify(corps.corps) };
};

const POST_SATURE = { corps: { actionSucceed: false,
  errorWrappers: [{ error: "MS_MAX_CONCURRENT_REQ" }] } };
const POST_VALIDE = { corps: { valid: true, name: "SARL HAIR BODEGA",
  address: "3 AV DE PARIS", requestIdentifier: "WAPIAAAAXnAO0Hv0",
  requestDate: "2026-11-07T08:00:00Z" } };
const GET_VALIDE = { corps: { isValid: true, userError: "VALID",
  name: "SARL HAIR BODEGA", address: "3 AV DE PARIS\n28400 ARCISSES",
  requestIdentifier: "", requestDate: "2026-11-07T08:00:00Z" } };
const GET_INVALIDE = { corps: { isValid: false, userError: "INVALID",
  name: "", address: "", requestDate: "2026-11-07T08:00:00Z" } };
const GET_SATURE = { corps: { actionSucceed: false,
  errorWrappers: [{ error: "MS_UNAVAILABLE" }] } };

console.log("\nLes deux portes du registre européen");
{
  porteePost = POST_VALIDE; porteeGet = GET_VALIDE; vus = [];
  const r = await vies.verifier("FR68934168154", "FR", "BE0817750283", { tentatives: 1 });
  verifier("quand la bonne porte répond, on s'en contente", r.statut === "valide",
    "lu « " + r.statut + " »");
  verifier("et on garde son numéro de consultation, qui fait la preuve",
    r.preuve === "WAPIAAAAXnAO0Hv0", "lu « " + r.preuve + " »");
  verifier("la seconde porte n'a même pas été sollicitée",
    vus.filter((v) => v.indexOf("GET /ms/") === 0).length === 0,
    "appels : " + vus.join(", "));
}
{
  porteePost = POST_SATURE; porteeGet = GET_VALIDE; vus = [];
  const r = await vies.verifier("FR68934168154", "FR", "BE0817750283", { tentatives: 1 });
  verifier("quand l'État membre referme la bonne porte, on frappe à l'autre",
    vus.some((v) => v.indexOf("GET /ms/FR/vat/68934168154") === 0),
    "appels : " + vus.join(", "));
  verifier("le numéro est reconnu valide au lieu d'être taxé",
    r.statut === "valide_sans_preuve", "lu « " + r.statut + " »");
  verifier("le nom de la société est bien relu — la réponse nomme son champ "
    + "« isValid », pas « valid »", r.nom === "SARL HAIR BODEGA",
    "lu « " + r.nom + " »");
  verifier("et l'absence de numéro de consultation est dite, pas cachée",
    r.preuve === "" && /consultation/.test(r.motif || ""),
    "preuve « " + r.preuve + " », motif « " + r.motif + " »");
}
{
  /* LA RÈGLE QUI A COÛTÉ CHER, ET QU'IL FAUT RETENIR ICI.
   *
   * Le 7 novembre 2026, la seconde porte interrogée depuis Cloudflare a
   * répondu « inconnu » pour quatre numéros français que la même porte,
   * interrogée depuis un navigateur quelques minutes plus tôt,
   * confirmait tous les quatre. Le site les a marqués invalides : un
   * correctif censé cesser de taxer des clients à tort avait commencé
   * par les déclarer en faute.
   *
   * La seconde porte peut donc confirmer, jamais condamner. Son rôle est
   * de sauver un numéro valide que la porte principale n'a pas pu
   * confirmer ; un démenti ne vaut que de la porte principale. */
  porteePost = POST_SATURE; porteeGet = GET_INVALIDE;
  const r = await vies.verifier("FR00988674727", "FR", "BE0817750283", { tentatives: 1 });
  verifier("la seconde porte ne peut JAMAIS condamner un numéro : un démenti "
    + "d'elle seule laisse « indisponible », pas « invalide »",
    r.statut === "indisponible", "lu « " + r.statut + " »");
  verifier("et son motif dit lequel des deux chemins a parlé en dernier",
    r.motif === "seconde_porte_dement_sans_confirmer",
    "lu « " + r.motif + " »");
}
{
  // Un démenti de la porte principale, lui, fait foi.
  porteePost = { corps: { valid: false, requestDate: "2026-11-07T08:00:00Z" } };
  porteeGet = GET_VALIDE;
  const r = await vies.verifier("FR00988674727", "FR", "BE0817750283", { tentatives: 1 });
  verifier("un démenti de la porte principale, lui, tranche",
    r.statut === "invalide" && r.motif === "inconnu_du_registre",
    "lu « " + r.statut + " / " + r.motif + " »");
}
{
  porteePost = POST_SATURE; porteeGet = GET_SATURE;
  const r = await vies.verifier("FR68934168154", "FR", "BE0817750283", { tentatives: 1 });
  verifier("les deux portes fermées donnent bien « indisponible », et non "
    + "une exonération par défaut", r.statut === "indisponible",
    "lu « " + r.statut + " »");
}

console.log("\nCe que le nouveau statut vaut pour la facture");
verifier("« valide_sans_preuve » exonère un client français",
  tvaMod.ouvreDroitAExoneration("FR", "valide_sans_preuve"));
verifier("il exonère aussi un client luxembourgeois",
  tvaMod.ouvreDroitAExoneration("LU", "valide_sans_preuve"));
verifier("il n'exonère pas un client belge — la vente est intérieure",
  !tvaMod.ouvreDroitAExoneration("BE", "valide_sans_preuve"));
verifier("un numéro indisponible n'exonère jamais",
  !tvaMod.ouvreDroitAExoneration("FR", "indisponible"));
verifier("un numéro démenti n'exonère jamais",
  !tvaMod.ouvreDroitAExoneration("FR", "invalide"));
verifier("il est revérifié au bout d'un jour, pas d'une semaine : c'est en "
  + "repassant par la bonne porte qu'on obtiendra la preuve",
  vies.aRevalider(new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
                  "valide_sans_preuve")
  && !vies.aRevalider(new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
                      "valide_sans_preuve"));


console.log("\nQuand faut-il frapper à la seconde porte ?");
{
  /* La première version listait les refus connus de l'État membre et
   * laissait passer « reseau » — le cas où la requête n'est même pas
   * revenue, qui est pourtant celui où changer de porte sert le plus.
   * Observé dès la mise en production. */
  porteePost = { ok: false, status: 0, corps: {} };
  porteeGet = GET_VALIDE;
  globalThis.fetch = async (url, init) => {
    const methode = (init && init.method) || "GET";
    if (methode === "POST") throw new Error("coupure réseau");
    return { ok: true, status: 200, json: async () => GET_VALIDE.corps,
             text: async () => JSON.stringify(GET_VALIDE.corps) };
  };
  const r = await vies.verifier("FR68934168154", "FR", "BE0817750283", { tentatives: 1 });
  verifier("une coupure réseau sur la porte principale fait basculer aussi — "
    + "c'est le cas où changer de porte sert le plus",
    r.statut === "valide_sans_preuve", "lu « " + r.statut + " »");
}
{
  // Une saisie que le registre refuse de lire ne sera pas mieux lue ailleurs.
  let getAppele = false;
  globalThis.fetch = async (url, init) => {
    const methode = (init && init.method) || "GET";
    if (methode !== "POST") { getAppele = true; }
    const corps = methode === "POST"
      ? { actionSucceed: false, errorWrappers: [{ error: "INVALID_INPUT" }] }
      : GET_VALIDE.corps;
    return { ok: true, status: 200, json: async () => corps,
             text: async () => JSON.stringify(corps) };
  };
  const r = await vies.verifier("FRnimportequoi", "FR", "BE0817750283", { tentatives: 1 });
  verifier("une saisie illisible s'arrête à la première porte",
    r.statut === "invalide" && r.motif === "format" && !getAppele,
    "lu « " + r.statut + " / " + r.motif + " », seconde porte appelée : " + getAppele);
}

console.log("");
if (rates) {
  console.log(rates + " vérification(s) en échec sur " + faits + ".");
  process.exit(1);
}
console.log("La bascule entre les deux portes est réglée. "
  + faits + " vérifications au total.");
