/* ==========================================================================
   COMMUN — les briques partagées par toutes les fonctions du site.
   Mots de passe, sessions, réponses. Rien ici ne parle à Odoo.
   ========================================================================== */

/* --- Réponses ----------------------------------------------------------- */

export function json(donnees, statut = 200, entetes = {}) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...entetes,
    },
  });
}

export function erreur(message, statut = 400) {
  return json({ erreur: message }, statut);
}

/* --- Mots de passe ------------------------------------------------------ */

// 100 000 tours : c'est le maximum que le moteur de Cloudflare accepte
// pour PBKDF2 (au-delà, il refuse avec NotSupportedError). C'est
// volontairement lent : cela coûte quelques dizaines de millisecondes à
// la connexion, et des années à qui voudrait tester des millions de
// mots de passe sur une base volée.
//
// Le nombre de tours est inscrit dans chaque empreinte stockée
// (pbkdf2$<tours>$<sel>$<empreinte>), et verifier() le relit depuis
// l'empreinte : si ce plafond évolue un jour, les comptes déjà créés
// continueront de fonctionner sans aucune reprise de données.
const TOURS = 100000;

const enc = new TextEncoder();

function b64(octets) {
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

function deB64(texte) {
  const s = atob(texte);
  const t = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) t[i] = s.charCodeAt(i);
  return t;
}

async function derive(motdepasse, sel, tours) {
  const cle = await crypto.subtle.importKey(
    "raw", enc.encode(motdepasse), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sel, iterations: tours, hash: "SHA-256" }, cle, 256
  );
  return new Uint8Array(bits);
}

export async function hacher(motdepasse) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const empreinte = await derive(motdepasse, sel, TOURS);
  return `pbkdf2$${TOURS}$${b64(sel)}$${b64(empreinte)}`;
}

export async function verifier(motdepasse, stocke) {
  try {
    const [algo, tours, sel, empreinte] = String(stocke).split("$");
    if (algo !== "pbkdf2") return false;
    const calcule = await derive(motdepasse, deB64(sel), Number(tours));
    return egalite(calcule, deB64(empreinte));
  } catch (e) {
    return false;
  }
}

// Comparaison à temps constant : on parcourt toujours la totalité des
// octets, pour ne pas révéler par la durée où se situe la différence.
function egalite(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* --- Sessions ----------------------------------------------------------- */

const NOM_COOKIE = "nishman_session";
const DUREE_JOURS = 30;

export function nouveauJeton() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function cookieSession(jeton, jours = DUREE_JOURS) {
  const age = jours * 24 * 60 * 60;
  return `${NOM_COOKIE}=${jeton}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}

export function cookieEfface() {
  return `${NOM_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function lireCookie(requete) {
  const brut = requete.headers.get("cookie") || "";
  for (const part of brut.split(";")) {
    const [nom, ...reste] = part.trim().split("=");
    if (nom === NOM_COOKIE) return reste.join("=");
  }
  return null;
}

export async function ouvrirSession(db, compteId) {
  const jeton = nouveauJeton();
  const maintenant = new Date();
  const fin = new Date(maintenant.getTime() + DUREE_JOURS * 864e5);
  await db.prepare(
    "INSERT INTO sessions (jeton, compte_id, cree_le, expire_le) VALUES (?, ?, ?, ?)"
  ).bind(jeton, compteId, maintenant.toISOString(), fin.toISOString()).run();
  return jeton;
}

// Rend le compte connecté, ou null. Une session dont le compte a été
// suspendu entre-temps ne vaut plus rien : on vérifie l'état à chaque appel
// plutôt que de faire confiance au cookie.
export async function compteConnecte(requete, db) {
  const jeton = lireCookie(requete);
  if (!jeton) return null;

  const ligne = await db.prepare(`
    SELECT c.id, c.email, c.salon, c.tva, c.tva_valide, c.etat,
           c.odoo_partner_id, c.cree_le, s.expire_le
      FROM sessions s
      JOIN comptes  c ON c.id = s.compte_id
     WHERE s.jeton = ?
  `).bind(jeton).first();

  if (!ligne) return null;
  if (new Date(ligne.expire_le) < new Date()) {
    await db.prepare("DELETE FROM sessions WHERE jeton = ?").bind(jeton).run();
    return null;
  }
  if (ligne.etat !== "actif") return null;

  return ligne;
}

export async function fermerSession(db, jeton) {
  if (jeton) await db.prepare("DELETE FROM sessions WHERE jeton = ?").bind(jeton).run();
}

/* --- Validation --------------------------------------------------------- */

export function emailValide(email) {
  return typeof email === "string"
    && email.length <= 254
    && /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email);
}

export function cleEmail(email) {
  return String(email).trim().toLowerCase();
}

// Huit caractères minimum. On ne force ni majuscule ni chiffre : les règles
// alambiquées poussent aux mots de passe notés sur un papier à côté du poste.
export function motDePasseValide(mdp) {
  return typeof mdp === "string" && mdp.length >= 8 && mdp.length <= 200;
}

/* --- Freinage des tentatives -------------------------------------------- */

const MAX_TENTATIVES = 8;
const FENETRE_MINUTES = 15;

export async function tropDeTentatives(db, emailCle) {
  const depuis = new Date(Date.now() - FENETRE_MINUTES * 60000).toISOString();
  const r = await db.prepare(
    "SELECT COUNT(*) AS n FROM tentatives WHERE email_cle = ? AND quand > ?"
  ).bind(emailCle, depuis).first();
  return (r?.n || 0) >= MAX_TENTATIVES;
}

export async function noterTentative(db, emailCle) {
  await db.prepare("INSERT INTO tentatives (email_cle, quand) VALUES (?, ?)")
    .bind(emailCle, new Date().toISOString()).run();
  // Ménage opportuniste : on ne garde pas d'historique au-delà de la fenêtre.
  const vieux = new Date(Date.now() - FENETRE_MINUTES * 60000).toISOString();
  await db.prepare("DELETE FROM tentatives WHERE quand < ?").bind(vieux).run();
}

export async function effacerTentatives(db, emailCle) {
  await db.prepare("DELETE FROM tentatives WHERE email_cle = ?").bind(emailCle).run();
}
