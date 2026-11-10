/* ==========================================================================
   INCIDENTS — ce qui s'est mal passé chez le client, écrit quelque part.

   Le 5 novembre 2026, une cliente a envoyé la photo de son écran : au bas
   du tunnel de commande, en rouge, « Connexion interrompue. Votre panier
   est conservé : réessayez. » Impossible d'en dire plus. Le site ne gardait
   aucune trace d'une commande qui échoue — ni l'heure, ni le compte, ni ce
   que le serveur avait réellement répondu. Les sept contrôles du
   diagnostic étaient au vert une heure plus tard, et c'est tout ce qu'on
   savait.

   Le défaut n'était pas la panne, c'était l'aveuglement. Une panne
   transitoire est inévitable ; ne rien pouvoir en dire ne l'est pas.

   D'où ce registre. Deux principes :

   1) C'est le NAVIGATEUR qui signale. Quand la fonction Cloudflare plante,
      elle ne peut évidemment pas écrire qu'elle a planté : la seule partie
      encore debout est la page du client. C'est donc elle qui raconte, et
      ce point d'entrée est écrit en partant du principe que n'importe qui
      peut l'appeler avec n'importe quoi.

   2) On distingue les causes. « La connexion a lâché » et « le serveur a
      répondu 502 » produisaient le même message rouge. Ce sont deux
      problèmes opposés : l'un ne nous regarde pas, l'autre est le nôtre.

   La table est créée à la volée, comme celle des paiements : le site ne
   doit pas dépendre d'une migration lancée à la main.
   ========================================================================== */

let tablePrete = false;

/* Les moments du parcours où une commande peut échouer. Liste fermée :
   le point d'entrée est public, et un nom libre laisserait n'importe qui
   remplir la base de texte choisi. */
const ETAPES = [
  "paiement",        // tunnel pro, bouton « Aller au paiement »
  "devis",           // tunnel pro, « Recevoir un devis à payer par virement »
  "panier",          // recalcul du panier pro
  "boutique",        // caisse grand public
  "reinitialisation", // lien de mot de passe oublié, envoyé par le portier
];

/* Ce qu'on a compris de l'échec. Liste fermée elle aussi. */
const CAUSES = [
  "reseau",          // la requête n'est jamais partie ou jamais revenue
  "reponse-illisible", // le serveur a répondu autre chose que du JSON
  "serveur",         // le serveur a répondu une erreur en bonne et due forme
  "delai",           // la requête a dépassé le délai que la page s'accorde
];

export function etapeValide(brut) {
  const e = String(brut || "").trim().toLowerCase();
  return ETAPES.includes(e) ? e : null;
}

export function causeValide(brut) {
  const c = String(brut || "").trim().toLowerCase();
  return CAUSES.includes(c) ? c : null;
}

export async function preparerIncidents(db) {
  if (tablePrete || !db) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS incidents (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "quand TEXT NOT NULL, " +
      "etape TEXT NOT NULL, " +
      "cause TEXT NOT NULL, " +
      // Le code HTTP quand il y en a un. 0 signifie « aucune réponse ».
      "statut INTEGER NOT NULL DEFAULT 0, " +
      // Le compte connecté, s'il l'était. C'est ce qui permet de rappeler
      // la bonne personne au lieu d'attendre qu'elle se manifeste.
      "compte_id INTEGER, " +
      "pays TEXT, " +
      "appareil TEXT, " +
      // Le début de ce que le serveur a renvoyé, tronqué. Sert à
      // reconnaître une page d'erreur Cloudflare d'un vrai JSON abîmé.
      "detail TEXT)"
  );
  await db.exec("CREATE INDEX IF NOT EXISTS idx_incidents_quand ON incidents(quand)");
  tablePrete = true;
}

/* Combien de jours on garde. Un incident de trois mois n'apprend plus
   rien, et cette table ne doit pas grossir indéfiniment dans une base
   qu'on ne surveille pas. */
const JOURS_GARDES = 60;

export async function noterIncident(db, info) {
  if (!db) return;
  const etape = etapeValide(info && info.etape);
  const cause = causeValide(info && info.cause);
  if (!etape || !cause) return;

  await preparerIncidents(db);

  // Le code HTTP, ramené de force à un entier plausible.
  let statut = Math.floor(Number((info && info.statut) || 0));
  if (!(statut >= 0 && statut <= 599)) statut = 0;

  const coupe = (v, n) => {
    const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    return s ? s.slice(0, n) : null;
  };

  await db.prepare(
    "INSERT INTO incidents (quand, etape, cause, statut, compte_id, pays, appareil, detail) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    new Date().toISOString(),
    etape, cause, statut,
    info && info.compte_id ? Math.floor(Number(info.compte_id)) : null,
    coupe(info && info.pays, 2),
    coupe(info && info.appareil, 20),
    coupe(info && info.detail, 300)
  ).run();

  // Le ménage, fait ici plutôt que par une tâche que personne ne lancera.
  try {
    const limite = new Date(Date.now() - JOURS_GARDES * 86400000).toISOString();
    await db.prepare("DELETE FROM incidents WHERE quand < ?").bind(limite).run();
  } catch (e) { /* la purge peut attendre le prochain incident */ }
}

export async function lireIncidents(db, limite = 100) {
  if (!db) return [];
  await preparerIncidents(db);
  const n = Math.min(500, Math.max(1, Math.floor(Number(limite) || 100)));
  const r = await db.prepare(
    "SELECT quand, etape, cause, statut, compte_id, pays, appareil, detail " +
    "FROM incidents ORDER BY quand DESC LIMIT ?"
  ).bind(n).all();
  return (r && r.results) || [];
}
