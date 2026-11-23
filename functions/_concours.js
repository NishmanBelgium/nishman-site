/* ==========================================================================
   CONCOURS — inscriptions au tirage au sort des salons, et le tirage.

   Le principe, et il n'est pas technique : ON NE CONTRÔLE PAS À L'ENTRÉE,
   ON CONTRÔLE À LA SORTIE. Personne au stand n'a le temps de valider une
   participation pendant qu'il vend. Le participant déclare donc lui-même
   combien de produits il a achetés, et c'est au moment du tirage que le
   gagnant doit présenter son ticket. Gonfler son nombre de chances ne sert
   alors à rien : ça ne fait que se faire éliminer au tirage.

   Conséquence juridique utile : l'inscription est ouverte à tous, sans
   achat (une chance). L'achat ne fait qu'ajouter des chances, ce qui évite
   la loterie à obligation d'achat.

   Ce qui est vraiment bloqué ici, c'est le spam : un téléphone ne peut
   s'inscrire qu'une fois, une adresse e-mail non plus, et une même adresse
   réseau est freinée. Ça n'arrête pas un fraudeur déterminé — rien ne
   l'arrêterait sans vérification humaine — mais ça arrête quelqu'un qui
   recharge la page cent fois, et c'est le besoin réel.
   ========================================================================== */

import { chiffresSeuls, cleEmail } from "./_commun.js";

export const CHANCES_MAX = 6;
export const INSTAGRAM = "https://www.instagram.com/nishman.be.fr/";

/* Les tables se créent toutes seules au premier appel, comme partout
   ailleurs sur ce site : pas de migration à lancer à la main un dimanche
   de salon. */
export async function preparer(db) {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS concours_participants (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "cree_le TEXT NOT NULL," +
      "edition TEXT NOT NULL," +
      "prenom TEXT NOT NULL," +
      "nom TEXT NOT NULL," +
      "email TEXT NOT NULL," +
      "email_cle TEXT NOT NULL," +
      "telephone TEXT NOT NULL," +
      "telephone_cle TEXT NOT NULL," +
      "chances INTEGER NOT NULL," +
      "instagram INTEGER NOT NULL DEFAULT 0," +
      "salon TEXT," +
      "ip TEXT," +
      "gagnant INTEGER NOT NULL DEFAULT 0," +
      "tire_le TEXT)"
    ),
    /* L'unicité est posée par la base, pas par le code : deux inscriptions
       simultanées du même numéro ne peuvent pas passer toutes les deux.

       ELLE EST JOURNALIÈRE, ET C'EST UNE CORRECTION DU 23 NOVEMBRE 2026.
       La première version rendait le numéro unique pour toujours. Sur un
       salon de deux jours, tous ceux qui s'étaient inscrits la veille se
       voyaient répondre « tu es déjà inscrit » et ne participaient pas à
       la seconde journée. Une personne par jour, c'est la bonne règle :
       ça bloque le spam sans interdire de revenir. */
    db.prepare("DROP INDEX IF EXISTS concours_tel"),
    db.prepare("DROP INDEX IF EXISTS concours_mail"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS concours_tel_jour ON concours_participants (edition, telephone_cle)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS concours_mail_jour ON concours_participants (edition, email_cle)"),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS concours_tirages (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "fait_le TEXT NOT NULL," +
      "fait_par TEXT," +
      "edition TEXT," +
      "participant_id INTEGER," +
      "nom TEXT," +
      "telephone TEXT," +
      "chances INTEGER," +
      "participants_total INTEGER," +
      "chances_total INTEGER)"
    ),
  ]);
}

/**
 * La clé d'un numéro de téléphone.
 *
 * 0470 12 34 56, +32 470 12 34 56 et 0032470123456 sont le même numéro.
 * Sans cette normalisation, la même personne s'inscrit trois fois sans
 * même le faire exprès. On garde les neuf derniers chiffres : c'est ce
 * qui reste identique quelle que soit la façon d'écrire l'indicatif.
 */
export function cleTelephone(valeur) {
  let d = chiffresSeuls(valeur);
  if (!d) return "";
  if (d.indexOf("00") === 0) d = d.slice(2);
  for (const indicatif of ["352", "33", "32"]) {
    if (d.indexOf(indicatif) === 0 && d.length > indicatif.length + 6) {
      d = d.slice(indicatif.length);
      break;
    }
  }
  d = d.replace(/^0+/, "");
  return d.length >= 8 ? d.slice(-9) : "";
}

export function cleCourriel(valeur) {
  return cleEmail(String(valeur || "").trim());
}

/**
 * L'édition du jour : un salon dure deux jours, chaque journée a la sienne.
 *
 * La date est celle de Bruxelles, pas celle de Greenwich. Avec l'heure
 * universelle, une inscription prise à minuit et demie au stand serait
 * comptée dans la journée du lendemain, et le tirage du soir l'aurait
 * oubliée. Une heure d'écart suffit à faire rater un gagnant.
 */
export function editionDuJour(maintenant) {
  const d = maintenant || new Date();
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/**
 * Le tirage, pondéré par le nombre de chances.
 *
 * On ne tire pas un participant au hasard : on tire un BILLET au hasard
 * parmi tous les billets. Quelqu'un qui a quatre chances occupe quatre
 * billets. C'est la seule façon que « une chance par produit » veuille
 * dire quelque chose.
 *
 * Le hasard vient de crypto.getRandomValues et non de Math.random :
 * sur un tirage public, un générateur prévisible serait contestable.
 */
export function tirerUnBillet(lignes) {
  const total = lignes.reduce((s, l) => s + Math.max(1, l.chances | 0), 0);
  if (total <= 0) return null;
  const tampon = new Uint32Array(1);
  crypto.getRandomValues(tampon);
  /* Rejet du reste : sans ça, les premiers billets seraient très
     légèrement plus probables que les derniers. */
  const limite = Math.floor(4294967296 / total) * total;
  let brut = tampon[0];
  while (brut >= limite) {
    crypto.getRandomValues(tampon);
    brut = tampon[0];
  }
  let curseur = brut % total;
  for (const l of lignes) {
    curseur -= Math.max(1, l.chances | 0);
    if (curseur < 0) return l;
  }
  return lignes[lignes.length - 1];
}

/** Le décompte public : combien de monde, combien de billets. */
export async function etat(db, edition) {
  const r = await db
    .prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(chances),0) AS c FROM concours_participants WHERE edition = ?"
    )
    .bind(edition)
    .first();
  return { participants: (r && r.n) || 0, chances: (r && r.c) || 0 };
}
