/* ==========================================================================
   VIES — la vérification des numéros de TVA intracommunautaires.

   L'autoliquidation n'est pas une faveur qu'on accorde sur parole : si le
   numéro du client est invalide, c'est NBD Distribution qui doit la TVA à
   l'État belge. Ce fichier interroge donc le registre européen, et son
   principe est d'échouer du bon côté : tout ce qui n'est pas un « valide »
   explicite est traité comme non validé, donc avec TVA.

   Une panne de VIES — fréquente, chaque État membre répondant pour
   lui-même — ne doit jamais bloquer une inscription ni une commande. Elle
   rend simplement un statut « indisponible », et la vérification sera
   refaite plus tard.
   ========================================================================== */

const RACINE = "https://ec.europa.eu/taxation_customs/vies/rest-api";
const DELAI_MS = 8000;

/** Les trois seuls États où nous vendons. */
const PAYS_SERVIS = { BE: 1, FR: 1, LU: 1 };

/**
 * Sépare un numéro en code pays + corps, quelle que soit la façon dont il a
 * été saisi : « BE 0817.750.283 », « be0817750283 », « 0817750283 ».
 */
export function decouper(numero, paysCompte) {
  const brut = String(numero || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!brut) return null;

  const prefixe = brut.slice(0, 2);
  if (/^[A-Z]{2}$/.test(prefixe)) {
    return { pays: prefixe, numero: brut.slice(2) };
  }
  // Sans préfixe, on se fie au pays du compte plutôt que de deviner.
  if (paysCompte && PAYS_SERVIS[paysCompte]) {
    return { pays: paysCompte, numero: brut };
  }
  return null;
}

/**
 * Interroge VIES.
 *
 * @param numero      le numéro tel qu'il est enregistré
 * @param paysCompte  le pays du compte, pour les numéros sans préfixe
 * @param requerant   notre propre numéro de TVA, facultatif mais précieux :
 *                    quand il est fourni, VIES renvoie un numéro de
 *                    consultation qui PROUVE que la vérification a eu lieu
 *                    ce jour-là. C'est la pièce à garder avec une facture
 *                    en autoliquidation, en cas de contrôle.
 *
 * Ne lève jamais. Renvoie toujours un statut exploitable :
 *   valide        le registre confirme
 *   invalide      le registre dément
 *   indisponible  on n'a pas pu savoir — on ne tranche pas à sa place
 */
export async function verifier(numero, paysCompte, requerant) {
  const part = decouper(numero, paysCompte);
  if (!part || !part.numero) {
    return { statut: "invalide", motif: "format", verifie_le: new Date().toISOString() };
  }

  // Un numéro belge n'ouvre droit à rien : la vente est nationale, TVA belge.
  // On le vérifie quand même, c'est une information utile sur le client.
  const corps = {
    countryCode: part.pays,
    vatNumber: part.numero,
  };
  const req = decouper(requerant, "BE");
  if (req) {
    corps.requesterMemberStateCode = req.pays;
    corps.requesterNumber = req.numero;
  }

  let reponse, donnees;
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), DELAI_MS);
  try {
    reponse = await fetch(RACINE + "/check-vat-number", {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(corps),
      signal: stop.signal,
    });
  } catch (e) {
    clearTimeout(minuteur);
    return indisponible("reseau", e);
  }
  clearTimeout(minuteur);

  if (!reponse.ok) return indisponible("http_" + reponse.status);

  try { donnees = await reponse.json(); }
  catch (e) { return indisponible("illisible", e); }

  if (!donnees || typeof donnees !== "object") return indisponible("vide");

  // VIES signale les pannes d'un État membre dans un tableau d'erreurs
  // plutôt que par un code HTTP. Une panne n'est pas un démenti.
  const souci = premiereErreur(donnees);
  if (souci) {
    if (souci === "INVALID_INPUT") {
      return { statut: "invalide", motif: "format", verifie_le: new Date().toISOString() };
    }
    return indisponible(souci);
  }

  // Seul un vrai « true » vaut validation. Ni "true", ni 1, ni un champ
  // absent : on ne devine pas sur un sujet qui engage la TVA.
  if (donnees.valid === true) {
    return {
      statut: "valide",
      nom: texte(donnees.name),
      adresse: texte(donnees.address),
      preuve: texte(donnees.requestIdentifier),
      verifie_le: dateDe(donnees.requestDate),
    };
  }
  if (donnees.valid === false) {
    return { statut: "invalide", motif: "inconnu_du_registre", verifie_le: dateDe(donnees.requestDate) };
  }

  return indisponible("reponse_inattendue");
}

/* --- Outils ------------------------------------------------------------- */

function indisponible(motif) {
  return { statut: "indisponible", motif: String(motif || ""), verifie_le: new Date().toISOString() };
}

function texte(v) {
  const t = String(v == null ? "" : v).trim();
  // VIES rend « --- » quand l'État membre ne communique pas le détail.
  return t === "---" || t === "N/A" ? "" : t.slice(0, 300);
}

function dateDe(v) {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toISOString() : new Date().toISOString();
}

function premiereErreur(d) {
  const liste = d.errorWrappers || d.errors || null;
  if (Array.isArray(liste) && liste.length) {
    const e = liste[0];
    return String((e && (e.error || e.code || e.message)) || "erreur").toUpperCase();
  }
  if (typeof d.error === "string" && d.error) return d.error.toUpperCase();
  return "";
}

/**
 * Faut-il refaire la vérification ?
 *
 * L'autoliquidation se justifie au moment de la vente, pas six mois plus
 * tôt : un numéro radié entre-temps n'ouvre plus aucun droit. On revérifie
 * donc avant chaque commande dès que le contrôle date d'une semaine.
 */
export function aRevalider(verifieLe, jours = 7) {
  if (!verifieLe) return true;
  const d = new Date(verifieLe);
  if (isNaN(d)) return true;
  return (Date.now() - d.getTime()) > jours * 24 * 3600 * 1000;
}
