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

// Empreinte factice, utilisée par la page de connexion quand l'adresse
// saisie n'existe pas : on vérifie quand même un mot de passe contre elle,
// pour qu'une adresse inconnue mette le même temps à répondre qu'une adresse
// connue. Elle suit TOURS : si le nombre de tours change, elle reste valide.
export const EMPREINTE_FACTICE = `pbkdf2$${TOURS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

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
    SELECT c.id, c.email, c.salon, c.prenom, c.nom, c.pays,
           c.tva, c.siret, c.tva_valide, c.tva_verifiee_le, c.etat,
           c.telephone, c.adresse, c.code_postal, c.ville,
           c.odoo_partner_id, c.cree_le, s.jeton, s.expire_le
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

// Session glissante. Sans cela, un compte ouvert le 1er janvier se fermait
// le 31, même pour quelqu'un venu tous les jours — et le coiffeur devait
// ressaisir son mot de passe sans comprendre pourquoi. On repousse donc
// l'échéance dès qu'il reste moins d'une semaine, pas à chaque appel :
// inutile d'écrire dans la base à chaque page affichée.
const SEUIL_PROLONGATION_JOURS = 7;

export async function prolongerSiBesoin(db, ligne) {
  const reste = new Date(ligne.expire_le).getTime() - Date.now();
  if (reste > (DUREE_JOURS - SEUIL_PROLONGATION_JOURS) * 864e5) return null;

  const fin = new Date(Date.now() + DUREE_JOURS * 864e5).toISOString();
  await db.prepare("UPDATE sessions SET expire_le = ? WHERE jeton = ?")
    .bind(fin, ligne.jeton).run();
  await db.prepare("UPDATE comptes SET vu_le = ? WHERE id = ?")
    .bind(new Date().toISOString(), ligne.id).run();

  // Le navigateur garde sa propre échéance : il faut lui renvoyer le cookie,
  // sinon il oublierait la session alors que le serveur la tient encore.
  return cookieSession(ligne.jeton);
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

/* --- Identité de l'entreprise ------------------------------------------- */

export const PAYS_SERVIS = ["BE", "FR", "LU"];

export function paysValide(p) {
  return PAYS_SERVIS.indexOf(String(p || "").toUpperCase()) !== -1;
}

// On retire espaces, points et tirets, et le préfixe pays s'il a été retapé :
// « BE 0817.750.283 », « be0817750283 » et « 0817750283 » donnent la même chose.
export function chiffresSeuls(valeur) {
  const brut = String(valeur || "").replace(/[\s.\-/]/g, "").toUpperCase();
  const sansPrefixe = /^[A-Z]{2}/.test(brut) ? brut.slice(2) : brut;
  return sansPrefixe.replace(/[^0-9]/g, "");
}

// Clé de contrôle belge : les deux derniers chiffres valent
// 97 moins le reste des huit premiers divisés par 97.
export function tvaBelgeCoherente(num) {
  if (!/^[01][0-9]{9}$/.test(num)) return false;
  const base = Number(num.slice(0, 8));
  const cle = Number(num.slice(8));
  return 97 - (base % 97) === cle;
}

// Clé de contrôle luxembourgeoise : les deux derniers chiffres valent
// le reste des six premiers divisés par 89.
export function tvaLuxCoherente(num) {
  if (!/^[0-9]{8}$/.test(num)) return false;
  return Number(num.slice(0, 6)) % 89 === Number(num.slice(6));
}

// Un SIRET est validé par la formule de Luhn, comme un numéro de carte.
// Exception connue : les établissements de La Poste commencent par 356000000
// et ne la respectent pas. On les laisse passer.
export function siretCoherent(num) {
  if (!/^[0-9]{14}$/.test(num)) return false;
  if (num.startsWith("356000000")) return true;
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let c = Number(num[i]);
    if (i % 2 === 0) { c *= 2; if (c > 9) c -= 9; }
    somme += c;
  }
  return somme % 10 === 0;
}

// Le numéro de TVA français se reconstitue à partir du SIREN : la clé vaut
// (12 + 3 × (SIREN modulo 97)) modulo 97. Un coiffeur connaît son SIRET,
// rarement son numéro intracommunautaire ; on le calcule pour lui, ce qui
// permettra la vérification VIES sans rien lui redemander.
export function tvaDepuisSiret(siret) {
  if (!/^[0-9]{14}$/.test(siret)) return null;
  const siren = siret.slice(0, 9);
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return "FR" + String(cle).padStart(2, "0") + siren;
}

// Renvoie { tva, siret, coherent } ou { erreur } si la longueur est
// manifestement fausse. On refuse la longueur, jamais la clé de contrôle :
// une clé fausse est signalée à l'importateur, mais n'empêche pas de
// s'inscrire — trop de professionnels resteraient bloqués sur une faute
// de frappe un dimanche soir.
export function identifiantFiscal(pays, saisie) {
  const num = chiffresSeuls(saisie);
  if (pays === "FR") {
    if (num.length !== 14) {
      return { erreur: "Le SIRET compte 14 chiffres. Vous en avez saisi " + num.length + "." };
    }
    return { siret: num, tva: tvaDepuisSiret(num), coherent: siretCoherent(num) };
  }
  if (pays === "BE") {
    const n = num.length === 9 ? "0" + num : num;   // beaucoup oublient le zéro de tête
    if (n.length !== 10) {
      return { erreur: "Le numéro d'entreprise compte 10 chiffres. Vous en avez saisi " + num.length + "." };
    }
    return { siret: null, tva: "BE" + n, coherent: tvaBelgeCoherente(n) };
  }
  if (num.length !== 8) {
    return { erreur: "Le numéro de TVA luxembourgeois compte 8 chiffres. Vous en avez saisi " + num.length + "." };
  }
  return { siret: null, tva: "LU" + num, coherent: tvaLuxCoherente(num) };
}

export function texteValide(v, min, max) {
  const t = String(v || "").trim();
  return t.length >= min && t.length <= max ? t : null;
}

/* --- Réinitialisation du mot de passe ----------------------------------- */

// Le jeton envoyé par e-mail n'est jamais stocké tel quel : on garde son
// empreinte. Quelqu'un qui lirait la base ne pourrait pas s'en servir pour
// réinitialiser un mot de passe — il lui manquerait le jeton d'origine.
export async function empreinteJeton(jeton) {
  const bits = await crypto.subtle.digest("SHA-256", enc.encode(jeton));
  return [...new Uint8Array(bits)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

export const DUREE_LIEN_MINUTES = 60;

export async function creerLienReinit(db, compteId) {
  const jeton = nouveauJeton();
  const maintenant = new Date();
  const fin = new Date(maintenant.getTime() + DUREE_LIEN_MINUTES * 60000);

  // Un nouveau lien annule les précédents : sinon un ancien courriel
  // oublié dans une boîte resterait une porte ouverte.
  await db.prepare("DELETE FROM reinitialisations WHERE compte_id = ?")
    .bind(compteId).run();

  await db.prepare(`
    INSERT INTO reinitialisations (empreinte, compte_id, cree_le, expire_le)
    VALUES (?, ?, ?, ?)
  `).bind(await empreinteJeton(jeton), compteId,
          maintenant.toISOString(), fin.toISOString()).run();

  return jeton;
}
