/* ==========================================================================
   LA MESURE D'AUDIENCE — compter sans suivre personne.

   NBD veut savoir ce que le site produit : combien de visites, d'où elles
   viennent, quelles pages tiennent, et combien finissent par une commande.
   Ce sont des chiffres de direction, et ils n'exigent pas de savoir QUI
   est venu.

   La différence n'est pas théorique. Un outil de mesure ordinaire pose un
   identifiant sur l'appareil du visiteur pour le reconnaître demain : dès
   cet instant, il faut un bandeau de consentement, une base légale, une
   ligne de plus dans la politique de confidentialité, et une partie des
   visiteurs refusent — ce qui fausse les chiffres qu'on voulait justement
   obtenir.

   Ici, rien n'est posé et rien n'est conservé qui désigne quelqu'un :

   - aucun cookie, aucun identifiant, aucune empreinte d'appareil ;
   - l'adresse IP n'est jamais écrite : Cloudflare nous donne le pays,
     on garde le pays et on jette le reste ;
   - rien n'est stocké ligne à ligne. Chaque visite incrémente un
     compteur déjà agrégé — il n'existe donc aucun journal à recouper,
     même pour nous ;
   - la page d'où vient le visiteur est réduite à son domaine : « google »,
     « instagram ». L'adresse complète, qui peut contenir une recherche
     ou un identifiant, est jetée avant d'arriver en base.

   Ce qui reste est un tableau de comptes. C'est exactement ce dont on a
   besoin pour piloter, et cela tient dans la catégorie des traitements
   dispensés de consentement.
   ========================================================================== */

let tablePrete = false;
let tableEvenements = false;

export async function preparerMesure(db) {
  if (tablePrete || !db) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS visites (" +
      "jour TEXT NOT NULL, " +
      "chemin TEXT NOT NULL, " +
      "pays TEXT NOT NULL, " +
      "source TEXT NOT NULL, " +
      "appareil TEXT NOT NULL, " +
      "vues INTEGER NOT NULL DEFAULT 0, " +
      "sessions INTEGER NOT NULL DEFAULT 0, " +
      "PRIMARY KEY (jour, chemin, pays, source, appareil))"
  );
  try {
    await db.exec("CREATE INDEX IF NOT EXISTS visites_jour ON visites (jour)");
  } catch (e) { /* l'index existe déjà */ }
  tablePrete = true;
}

/* --- Les gestes qu'une page vue ne raconte pas --------------------------- */

/* La porte d'entrée mène à deux endroits. Savoir combien de visiteurs
   partent d'un côté ou de l'autre ne se déduit d'aucune page vue : il
   faudrait relier les pages d'un même visiteur, donc le reconnaître,
   donc poser un identifiant — et reprendre le bandeau de consentement
   qu'on a justement évité.
   
   Un compteur par geste coûte moins cher et ne désigne personne : on
   sait que la porte professionnelle a été poussée trois cents fois, pas
   qui l'a poussée.
   
   Table à part, pour que les visites restent des visites : mêlés aux
   pages vues, ces compteurs gonfleraient les totaux d'audience. */
const GESTES = [
  "porte-pro",        // depuis l'accueil, vers les tarifs professionnels
  "porte-boutique",   // depuis l'accueil, vers la boutique
];

export function gesteValide(brut) {
  const g = String(brut || "").trim().toLowerCase();
  return GESTES.includes(g) ? g : null;
}

export async function preparerEvenements(db) {
  if (tableEvenements || !db) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS evenements (" +
      "jour TEXT NOT NULL, " +
      "geste TEXT NOT NULL, " +
      "n INTEGER NOT NULL DEFAULT 0, " +
      "PRIMARY KEY (jour, geste))"
  );
  tableEvenements = true;
}

export async function noterGeste(db, geste) {
  const g = gesteValide(geste);
  if (!g) return;
  await preparerEvenements(db);
  const jour = new Date().toISOString().slice(0, 10);
  await db.prepare(
    "INSERT INTO evenements (jour, geste, n) VALUES (?, ?, 1) " +
    "ON CONFLICT (jour, geste) DO UPDATE SET n = n + 1"
  ).bind(jour, g).run();
}

export async function lireGestes(db, depuis, jusqua) {
  await preparerEvenements(db);
  const r = await db.prepare(
    "SELECT geste, SUM(n) AS n FROM evenements WHERE jour BETWEEN ? AND ? " +
    "GROUP BY geste"
  ).bind(depuis, jusqua).all();
  const lignes = (r && r.results) || [];
  const par = {};
  for (const g of GESTES) par[g] = 0;
  for (const l of lignes) par[l.geste] = Number(l.n || 0);
  return par;
}

/* --- Normalisation ------------------------------------------------------ */

/* Le chemin, ramené à ce qui a un sens dans un tableau de bord.
 *
 * On coupe la chaîne de requête : elle peut porter une référence de
 * commande ou un terme de recherche, et ni l'un ni l'autre n'a sa place
 * dans un compteur. On borne la longueur, parce qu'une adresse inventée
 * ne doit pas pouvoir gonfler la base. */
export function cheminPropre(brut) {
  let c = String(brut || "/").split("?")[0].split("#")[0];
  if (!c.startsWith("/")) c = "/" + c;
  c = c.replace(/\/{2,}/g, "/");
  if (c.length > 120) c = c.slice(0, 120);
  return c || "/";
}

/* Les sources qu'on sait nommer. Tout le reste tombe dans « autre » :
   une liste fermée empêche la table de grossir au rythme des sites qui
   nous citent, et personne ne pilote un commerce à partir de la longue
   traîne des référents. */
const SOURCES = [
  [/google\./i, "google"],
  [/bing\.|duckduckgo\.|ecosia\.|qwant\./i, "autre moteur"],
  [/instagram\./i, "instagram"],
  [/facebook\.|fb\./i, "facebook"],
  [/tiktok\./i, "tiktok"],
  [/youtube\.|youtu\.be/i, "youtube"],
  [/linkedin\./i, "linkedin"],
  [/pinterest\./i, "pinterest"],
  [/mail\.|gmail\.|outlook\.|webmail/i, "courriel"],
];

export function sourcePropre(referent, hoteDuSite) {
  const r = String(referent || "").trim();
  if (!r) return "direct";
  let hote;
  try { hote = new URL(r).hostname.toLowerCase(); } catch (e) { return "direct"; }
  if (!hote) return "direct";
  // Une page du site qui renvoie vers une autre page du site n'est pas
  // une source : c'est de la navigation interne.
  if (hoteDuSite && hote === String(hoteDuSite).toLowerCase()) return "interne";
  for (const [motif, nom] of SOURCES) if (motif.test(hote)) return nom;
  return "autre";
}

/* Trois classes d'appareil, pas davantage. On ne cherche pas à
   reconnaître un modèle — ce serait une empreinte — mais à savoir s'il
   faut soigner l'affichage sur petit écran. */
export function appareilPropre(ua) {
  const u = String(ua || "");
  if (/iPad|Tablet|PlayBook|Silk/i.test(u)) return "tablette";
  if (/Mobi|Android.*Mobile|iPhone|iPod|Windows Phone/i.test(u)) return "mobile";
  return "ordinateur";
}

/* Les robots ne sont pas des visiteurs. Les compter donnerait des
   courbes flatteuses et fausses — et c'est précisément le genre de
   chiffre sur lequel on prend ensuite de mauvaises décisions. */
export function estRobot(ua) {
  return /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|headless|lighthouse|pingdom|gtmetrix/i
    .test(String(ua || ""));
}

export function paysPropre(code) {
  const p = String(code || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(p) ? p : "??";
}

/* --- Les deux moitiés du site ------------------------------------------- */

/* Le site sert deux clientèles qui n'ont rien à voir : des salons qui
   achètent au carton hors TVA, et des particuliers qui achètent une cire.
   Un chiffre global mélange les deux et ne pilote rien — « 400 visites »
   ne dit pas s'il faut travailler la boutique ou le catalogue.
   
   Le chemin suffit à trancher, et il est déjà en base : rien de nouveau
   n'est collecté pour obtenir cette répartition. Les règles vivent ici,
   une seule fois, et servent aussi bien au JavaScript qu'au SQL — deux
   listes séparées finiraient par diverger, et le tableau de bord
   mentirait sans prévenir. */
const SEGMENTS = [
  ["accueil",  (c) => c === "/",                 "chemin = '/'"],
  ["boutique", (c) => c.startsWith("/boutique"), "chemin LIKE '/boutique%'"],
  ["pro",      (c) => c.startsWith("/produits")
                   || c.startsWith("/pro/")
                   || c === "/pro"
                   || c.startsWith("/devis")
                   || c.startsWith("/commander"),
               "chemin LIKE '/produits%' OR chemin LIKE '/pro/%' OR chemin = '/pro' "
               + "OR chemin LIKE '/devis%' OR chemin LIKE '/commander%'"],
];

/* Tout le reste — contact, mentions légales, conditions de vente — est
   « commun » : ces pages servent les deux clientèles, et les attribuer à
   l'une fausserait sa part. */
export function segmentDe(chemin) {
  const c = String(chemin || "/");
  for (const [nom, teste] of SEGMENTS) if (teste(c)) return nom;
  return "commun";
}

/* La même règle, écrite pour SQLite. Construite à partir de la liste
   ci-dessus : impossible qu'elle s'en écarte. */
export const SQL_SEGMENT =
  "CASE " + SEGMENTS.map(([nom, , sql]) => `WHEN ${sql} THEN '${nom}'`).join(" ")
  + " ELSE 'commun' END";

/* --- Écriture ----------------------------------------------------------- */

/**
 * Enregistre une visite dans le compteur du jour.
 *
 * Une seule écriture, qui crée la ligne ou l'incrémente. Pas de lecture
 * préalable : deux visiteurs simultanés sur la même page ne peuvent pas
 * se perdre l'un l'autre.
 */
export async function noterVisite(db, { chemin, pays, source, appareil, nouvelle }) {
  await preparerMesure(db);
  const jour = new Date().toISOString().slice(0, 10);
  await db.prepare(
    "INSERT INTO visites (jour, chemin, pays, source, appareil, vues, sessions) " +
    "VALUES (?, ?, ?, ?, ?, 1, ?) " +
    "ON CONFLICT (jour, chemin, pays, source, appareil) DO UPDATE SET " +
    "vues = vues + 1, sessions = sessions + excluded.sessions"
  ).bind(jour, chemin, pays, source, appareil, nouvelle ? 1 : 0).run();
}

/* --- Lecture ------------------------------------------------------------ */

/* Les noms de segment acceptés. Une liste fermée : le nom arrive d'une
   adresse publique, et il ne doit jamais atteindre le SQL autrement que
   comme une valeur liée. */
export function segmentValide(brut) {
  const s = String(brut || "").trim().toLowerCase();
  return ["accueil", "boutique", "pro", "commun"].includes(s) ? s : null;
}

/** Les totaux d'une période, et le détail par dimension.
 *
 * Avec un segment, tout est restreint à cette moitié du site. Sans, on
 * lit l'ensemble et la répartition par segment vient en plus. */
export async function lireMesure(db, depuis, jusqua, segment) {
  await preparerMesure(db);
  const seg = segmentValide(segment);
  const ou = seg ? ` AND (${SQL_SEGMENT}) = ?` : "";
  const bornes = seg ? [depuis, jusqua, seg] : [depuis, jusqua];

  const un = async (sql) => {
    const r = await db.prepare(sql).bind(...bornes).all();
    return (r && r.results) || [];
  };

  const [totaux, parJour, parChemin, parSource, parPays, parAppareil, parSegment] =
    await Promise.all([
      un("SELECT SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
         "WHERE jour BETWEEN ? AND ?" + ou),
      un("SELECT jour, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
         "WHERE jour BETWEEN ? AND ?" + ou + " GROUP BY jour ORDER BY jour"),
      un("SELECT chemin, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
         "WHERE jour BETWEEN ? AND ?" + ou + " GROUP BY chemin ORDER BY vues DESC LIMIT 25"),
      un("SELECT source, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
         "WHERE jour BETWEEN ? AND ?" + ou + " GROUP BY source ORDER BY vues DESC"),
      un("SELECT pays, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
         "WHERE jour BETWEEN ? AND ?" + ou + " GROUP BY pays ORDER BY vues DESC LIMIT 15"),
      un("SELECT appareil, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
         "WHERE jour BETWEEN ? AND ?" + ou + " GROUP BY appareil ORDER BY vues DESC"),
      /* La répartition par moitié de site. C'est le chiffre qui dit s'il
         faut travailler la boutique ou le catalogue, et il ne coûte rien :
         le chemin est déjà en base, on ne mesure rien de nouveau. */
      un("SELECT (" + SQL_SEGMENT + ") AS segment, SUM(vues) AS vues, " +
         "SUM(sessions) AS sessions FROM visites " +
         "WHERE jour BETWEEN ? AND ?" + ou + " GROUP BY segment ORDER BY vues DESC"),
    ]);

  return {
    segment: seg || "tout",
    vues: Number((totaux[0] && totaux[0].vues) || 0),
    sessions: Number((totaux[0] && totaux[0].sessions) || 0),
    par_jour: parJour,
    par_chemin: parChemin,
    par_source: parSource,
    par_pays: parPays,
    par_appareil: parAppareil,
    par_segment: parSegment,
  };
}
