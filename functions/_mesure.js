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

/** Les totaux d'une période, et le détail par dimension. */
export async function lireMesure(db, depuis, jusqua) {
  await preparerMesure(db);
  const bornes = [depuis, jusqua];

  const un = async (sql) => {
    const r = await db.prepare(sql).bind(...bornes).all();
    return (r && r.results) || [];
  };

  const [totaux, parJour, parChemin, parSource, parPays, parAppareil] = await Promise.all([
    un("SELECT SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites WHERE jour BETWEEN ? AND ?"),
    un("SELECT jour, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
       "WHERE jour BETWEEN ? AND ? GROUP BY jour ORDER BY jour"),
    un("SELECT chemin, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
       "WHERE jour BETWEEN ? AND ? GROUP BY chemin ORDER BY vues DESC LIMIT 25"),
    un("SELECT source, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
       "WHERE jour BETWEEN ? AND ? GROUP BY source ORDER BY vues DESC"),
    un("SELECT pays, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
       "WHERE jour BETWEEN ? AND ? GROUP BY pays ORDER BY vues DESC LIMIT 15"),
    un("SELECT appareil, SUM(vues) AS vues, SUM(sessions) AS sessions FROM visites " +
       "WHERE jour BETWEEN ? AND ? GROUP BY appareil ORDER BY vues DESC"),
  ]);

  return {
    vues: Number((totaux[0] && totaux[0].vues) || 0),
    sessions: Number((totaux[0] && totaux[0].sessions) || 0),
    par_jour: parJour,
    par_chemin: parChemin,
    par_source: parSource,
    par_pays: parPays,
    par_appareil: parAppareil,
  };
}
