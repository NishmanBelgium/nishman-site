/* ==========================================================================
   LE STOCK RÉEL — une seule source, et c'est Odoo.

   Ce qui existait avant : la boutique n'avait aucun stock, seulement un
   drapeau « bientôt » écrit à la main dans le catalogue, posé sur deux
   références sur cent vingt-cinq. Et le catalogue professionnel limitait
   bien les quantités, mais dans le navigateur seulement — le serveur ne
   vérifiait rien au moment de créer la commande. Un onglet resté ouvert
   une heure, deux salons sur le dernier carton, un panier modifié, et la
   commande passait.

   Trois décisions, et il faut les expliciter parce qu'elles ne vont pas
   de soi :

   1. ON COMPTE LE DISPONIBLE, PAS LE PHYSIQUE. Odoo distingue ce qui est
      sur l'étagère de ce qui y est encore libre : une pièce réservée pour
      une commande en cours est physiquement là, mais elle est vendue.
      Compter le physique, c'est vendre deux fois la même pièce.

   2. UN SEUL EMPLACEMENT, WH/Stock. Le showroom (WH/PRESENTATION) porte
      près de sept mille pièces qui servent à la démonstration. Elles
      existent, elles ne sont pas à vendre.

   3. UNE MARGE DE DEUX PIÈCES. Une référence à deux ou moins passe en
      rupture. L'inventaire du 29 octobre a trouvé 1 058 pièces d'écart
      avec Odoo, dans les deux sens : un stock informatique n'est jamais
      exact à la pièce près, et la marge est ce qui évite qu'une erreur de
      comptage devienne une commande impossible à honorer.
   ========================================================================== */

import { appel, produitsParEan } from "./_odoo.js";

export const MARGE = 2;
const EMPLACEMENT = "WH/Stock";
const CACHE_MS = 45 * 1000;

let cache = null;
let cacheExpire = 0;
let cacheEmplacement = null;

/* --- Le cache partagé ---------------------------------------------------
 *
 * Le cache ci-dessus vit dans la mémoire d'UNE instance Cloudflare. Il y
 * en a beaucoup, elles sont courtes, et chacune démarre à vide : mesuré le
 * 5 novembre 2026, le premier appel à /api/prix prenait 7,1 secondes, les
 * suivants 90 millisecondes. Avec notre volume, la plupart des visiteurs
 * tombaient sur une instance froide — et attendaient sept secondes avant
 * de voir un prix. Sur un téléphone en 4G, davantage.
 *
 * On range donc le résultat dans D1, que toutes les instances partagent.
 * Le calcul complet n'est plus fait qu'une fois par minute pour tout le
 * monde, au lieu d'une fois par visiteur.
 *
 * Une règle, et elle compte : SEUL un relevé portant sur une large part
 * du catalogue est écrit dans le cache partagé. Un panier de trois
 * articles le lit, ne l'écrit jamais. Sans cette règle, un petit relevé
 * remplacerait le grand et prolongerait l'âge de valeurs anciennes de
 * proche en proche, sans que rien ne le signale.
 */
const CACHE_PARTAGE_MS = 60 * 1000;
const ASSEZ_LARGE = 50;
let tableCache = false;

async function preparerCache(db) {
  if (tableCache || !db) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS cache_stock (" +
      "cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, pose_le INTEGER NOT NULL)"
  );
  tableCache = true;
}

/* Rend { table, age } — l'âge en millisecondes — ou null si rien n'est
 * lisible. On rend le relevé QUEL QUE SOIT son âge : c'est l'appelant qui
 * décide s'il s'en contente, parce que la réponse dépend de ce qu'il en
 * fait. */
async function lireCachePartage(db) {
  if (!db) return null;
  try {
    await preparerCache(db);
    const r = await db.prepare(
      "SELECT valeur, pose_le FROM cache_stock WHERE cle = 'vendable'"
    ).first();
    if (!r) return null;
    const v = JSON.parse(r.valeur);
    if (!v || typeof v !== "object") return null;
    return { table: v, age: Date.now() - Number(r.pose_le) };
  } catch (e) { return null; }
}

async function ecrireCachePartage(db, table) {
  if (!db) return;
  try {
    await preparerCache(db);
    await db.prepare(
      "INSERT INTO cache_stock (cle, valeur, pose_le) VALUES ('vendable', ?, ?) " +
      "ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur, pose_le = excluded.pose_le"
    ).bind(JSON.stringify(table), Date.now()).run();
  } catch (e) { /* un cache perdu, jamais un stock faux */ }
}

/** L'identifiant de l'emplacement de vente, cherché par son nom complet. */
async function idEmplacement(env) {
  if (cacheEmplacement) return cacheEmplacement;
  const l = await appel(env, "stock.location", "search_read",
    [[["complete_name", "=", EMPLACEMENT], ["usage", "=", "internal"]], ["id"]], { limit: 1 });
  if (!l || !l.length) throw new Error("emplacement " + EMPLACEMENT + " introuvable");
  cacheEmplacement = l[0].id;
  return cacheEmplacement;
}

/**
 * Le stock vendable, par code-barres.
 *
 * On lit les quants et non le champ `free_qty` du produit : ce dernier
 * additionne tous les emplacements internes, showroom compris. Les quants
 * permettent de n'en retenir qu'un.
 *
 * @returns { [ean]: nombre }  déjà net de la marge, jamais négatif.
 */
/** Le relevé, demandé à Odoo pour de bon. Rend { ean: pièces nettes }. */
async function relever(env, codes) {
  // Les deux premières questions ne dépendent pas l'une de l'autre :
  // posées ensemble, elles coûtent un aller-retour au lieu de deux.
  const [lieu, produits] = await Promise.all([
    idEmplacement(env),
    produitsParEan(env, codes),
  ]);
  const ids = Object.values(produits).map((p) => p.id);
  const parProduit = {};
  const PAQUET = 150;

  // Les lots de quants non plus ne dépendent pas les uns des autres. En
  // file, deux cents références coûtaient plusieurs secondes ; en
  // parallèle, le temps du lot le plus lent.
  const lots = [];
  for (let i = 0; i < ids.length; i += PAQUET) lots.push(ids.slice(i, i + PAQUET));
  const reponses = await Promise.all(lots.map((lot) =>
    appel(env, "stock.quant", "search_read",
      [[["product_id", "in", lot], ["location_id", "=", lieu]],
       ["product_id", "quantity", "reserved_quantity"]], { limit: 2000 })
  ));

  for (const quants of reponses) {
    for (const q of quants || []) {
      const pid = q.product_id && q.product_id[0];
      if (!pid) continue;
      // Une même référence peut porter plusieurs lignes de quant au même
      // endroit — Odoo les fusionne avec le temps, pas tout de suite.
      parProduit[pid] = (parProduit[pid] || 0) +
        (Number(q.quantity) || 0) - (Number(q.reserved_quantity) || 0);
    }
  }

  const table = {};
  for (const ean of codes) {
    const p = produits[ean];
    // Une référence inconnue d'Odoo vaut zéro : on ne vend pas ce qu'on ne
    // sait pas compter.
    const brut = p ? (parProduit[p.id] || 0) : 0;
    table[ean] = Math.max(0, Math.floor(brut - MARGE));
  }
  return table;
}

/* Jusqu'à quel âge on se contente de ce qu'on a.
 *
 * En deçà de FRAIS_MS, le relevé est servi tel quel et on ne dérange
 * personne. Entre FRAIS_MS et PERIME_MS, il est servi TOUT DE SUITE et le
 * rafraîchissement part en arrière-plan : c'est là que se joue tout
 * l'intérêt de ce module, parce que c'est le cas de figure le plus
 * fréquent et que plus aucun client n'y attend Odoo. Au-delà de
 * PERIME_MS, on ne sert plus : un chiffre d'un quart d'heure servi comme
 * s'il valait quelque chose serait pire qu'une seconde d'attente.
 *
 * Quinze minutes supposent que deux commandes du dernier carton ne
 * tombent pas dans le même quart d'heure — ce que NBD a confirmé le
 * 5 novembre — et la marge de deux pièces couvre le reste. */
const FRAIS_MS = 60 * 1000;
const PERIME_MS = 15 * 60 * 1000;

/**
 * @param options.attendre  le waitUntil de Cloudflare, quand l'appelant
 *   en dispose. C'est lui qui permet de rendre la réponse sans attendre
 *   le rafraîchissement : la plateforme laisse le travail finir après que
 *   le client est servi. Sans lui, on se contente du relevé connu et le
 *   rafraîchissement attendra le prochain appel qui, lui, l'aura.
 */
export async function stockVendable(env, eans, options) {
  const codes = [...new Set((eans || []).map((e) => String(e || "").trim()).filter(Boolean))];
  if (!codes.length) return {};

  const attendre = options && typeof options.attendre === "function"
    ? options.attendre : null;
  const maintenant = Date.now();

  /* LA MÉMOIRE PÉRIMÉE EST JETÉE, PAS SEULEMENT IGNORÉE.
   *
   * Elle n'était qu'ignorée, et un essai l'a prise en faute : une
   * instance dont la fenêtre avait expiré gardait ses anciens chiffres
   * en mémoire. Quand le relevé partagé devenait périmé à son tour, le
   * calcul de ce qui manque ne trouvait rien à demander — puisque tout
   * était là — et l'instance servait indéfiniment des chiffres dont elle
   * venait pourtant de décider qu'ils étaient trop vieux. Exactement ce
   * qu'un cache ne doit jamais faire. */
  if (cache && maintenant >= cacheExpire) cache = null;

  const rendre = () => {
    const sortie = {};
    for (const c of codes) sortie[c] = cache && cache[c] !== undefined ? cache[c] : 0;
    return sortie;
  };
  const poser = (table) => {
    if (!cache || maintenant >= cacheExpire) { cache = {}; cacheExpire = maintenant + CACHE_MS; }
    for (const k of Object.keys(table)) if (cache[k] === undefined) cache[k] = table[k];
  };
  const couvert = () => cache && codes.every((c) => cache[c] !== undefined);

  // 1) La mémoire de cette instance, si elle est encore fraîche.
  if (cache && maintenant < cacheExpire && couvert()) return rendre();

  // 2) Le relevé partagé, écrit par n'importe quelle instance.
  const partage = await lireCachePartage(env && env.DB);
  const utilisable = partage
    && partage.age <= PERIME_MS
    && codes.every((c) => partage.table[c] !== undefined);

  // L'ordre compte : on ne charge en mémoire que ce qu'on a décidé de
  // servir. Charger d'abord et trancher ensuite reviendrait à servir un
  // relevé périmé, puisque plus rien ne manquerait au moment de le
  // constater.
  if (utilisable) {
    poser(partage.table);

    if (partage.age > FRAIS_MS && attendre) {
      // Le cœur du dispositif : on sert, puis on rafraîchit derrière.
      const aRelever = Object.keys(partage.table);
      attendre((async () => {
        try {
          const neuf = await relever(env, aRelever);
          if (aRelever.length >= ASSEZ_LARGE) {
            await ecrireCachePartage(env && env.DB, neuf);
          }
        } catch (e) { /* le relevé suivant réessaiera */ }
      })());
    }
    return rendre();
  }

  // 3) Rien d'utilisable : il faut demander à Odoo, et attendre.
  const manquants = codes.filter((c) => !cache || cache[c] === undefined);
  if (manquants.length) {
    const table = await relever(env, manquants);
    poser(table);
    // On ne publie que les relevés larges : voir plus haut.
    if (codes.length >= ASSEZ_LARGE) {
      await ecrireCachePartage(env && env.DB, cache);
    }
  }

  return rendre();
}

/**
 * Ramène une sélection dans les limites du stock.
 *
 * Ne lève pas : une commande dont tout dépasse revient vide, et c'est à
 * l'appelant de le dire au client. Une exception ici ferait échouer un
 * paiement déjà engagé.
 *
 * @param selection  { ean: quantité }
 * @returns { selection, retires, reduits, rupture }
 */
export async function limiterAuStock(env, selection, options) {
  const eans = Object.keys(selection || {});
  if (!eans.length) return { selection: {}, retires: [], reduits: [], rupture: false };

  const dispo = await stockVendable(env, eans, options);
  const propre = {};
  const retires = [];
  const reduits = [];

  for (const ean of eans) {
    const voulu = Math.floor(Number(selection[ean]) || 0);
    if (!(voulu > 0)) continue;
    const libre = dispo[ean] || 0;
    if (libre <= 0) { retires.push(ean); continue; }
    if (voulu > libre) { reduits.push({ ean, voulu, servi: libre }); propre[ean] = libre; continue; }
    propre[ean] = voulu;
  }

  return {
    selection: propre,
    retires,
    reduits,
    rupture: retires.length > 0 || reduits.length > 0,
  };
}

/**
 * Le même contrôle, pour le panier professionnel.
 *
 * Il ne compte pas en unités mais en cartons ET en pièces : { u, b }. Le
 * nombre de pièces réellement demandées est u + b × box_qty.
 *
 * On ne rogne pas une commande de salon en silence. Un professionnel qui
 * a commandé trois cartons et en reçoit deux sans qu'on le lui dise
 * refera la commande, ou pire, la croira complète. On refuse, on nomme ce
 * qui manque, et on le laisse réviser son panier.
 *
 * @param selection  { ean: {u, b} }
 * @param produits   le catalogue, pour connaître box_qty
 * @returns { rupture, manquants: [{ean, nom, demande, restant}] }
 */
export async function verifierStockPro(env, selection, produits, options) {
  const eans = Object.keys(selection || {});
  if (!eans.length) return { rupture: false, manquants: [] };

  const parEan = new Map();
  for (const p of produits || []) if (p && p.ean) parEan.set(String(p.ean), p);

  const demande = {};
  for (const ean of eans) {
    const q = selection[ean] || {};
    const p = parEan.get(String(ean));
    const parCarton = Math.max(0, Math.floor(Number(p && p.box_qty) || 0));
    const pieces = Math.max(0, Math.floor(Number(q.u) || 0)) +
                   Math.max(0, Math.floor(Number(q.b) || 0)) * parCarton;
    if (pieces > 0) demande[ean] = pieces;
  }
  if (!Object.keys(demande).length) return { rupture: false, manquants: [] };

  const dispo = await stockVendable(env, Object.keys(demande), options);
  const manquants = [];
  for (const ean of Object.keys(demande)) {
    const libre = dispo[ean] || 0;
    if (demande[ean] > libre) {
      const p = parEan.get(String(ean));
      manquants.push({
        ean,
        nom: (p && (p.name || p.nom)) || "",
        demande: demande[ean],
        restant: libre,
      });
    }
  }
  return { rupture: manquants.length > 0, manquants };
}
