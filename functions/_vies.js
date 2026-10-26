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

// Chaque État membre répond pour lui-même, et certains saturent — la France
// surtout. Une saturation dure rarement plus de quelques secondes, alors
// qu'un abandon immédiat fait payer la TVA à un client qui n'aurait pas dû.
// On insiste donc, brièvement, avant de conclure à l'indisponibilité.
const TENTATIVES = 3;
const ATTENTE_MS = [0, 400, 1200];   // croissante : on n'aggrave pas l'engorgement

const attendre = (ms) => ms > 0 ? new Promise((r) => setTimeout(r, ms)) : null;

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
  let dernier = null;

  for (let essai = 0; essai < TENTATIVES; essai++) {
    const pause = ATTENTE_MS[essai];
    if (pause) await attendre(pause);

    const r = await interroger(numero, paysCompte, requerant);

    // Une réponse claire, dans un sens ou dans l'autre, met fin aux essais :
    // seule l'absence de réponse mérite d'insister.
    if (r.statut !== "indisponible") return r;

    // Une saisie refusée ne deviendra pas correcte en réessayant.
    if (r.motif === "INVALID_INPUT") return r;

    dernier = r;
  }

  return { ...dernier, essais: TENTATIVES };
}

/** Un aller-retour avec le registre. Ne lève jamais. */
async function interroger(numero, paysCompte, requerant) {
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
 * Combien de temps un résultat reste-t-il valable, selon ce qu'il dit.
 *
 * Un délai unique était une erreur : une saturation de trente secondes du
 * service français taxait le client pendant une semaine entière. Un contrôle
 * qui a abouti peut attendre ; un contrôle qui n'a pas pu se faire doit être
 * retenté tout de suite.
 */
const VALIDITE_MINUTES = {
  valide: 7 * 24 * 60,     // le registre a confirmé : une semaine suffit
  invalide: 24 * 60,       // le registre a démenti : un jour, le temps qu'un
                           // numéro fraîchement attribué soit enregistré
  indisponible: 0,         // le registre n'a pas répondu : on retente
  jamais: 0,
};

/**
 * Faut-il refaire la vérification ?
 *
 * L'autoliquidation se justifie au moment de la vente, pas six mois plus
 * tôt : un numéro radié entre-temps n'ouvre plus aucun droit.
 *
 * @param verifieLe  date du dernier contrôle
 * @param statut     ce qu'il avait donné — c'est lui qui fixe le délai
 */
export function aRevalider(verifieLe, statut) {
  if (!verifieLe) return true;
  const d = new Date(verifieLe);
  if (isNaN(d)) return true;

  const minutes = VALIDITE_MINUTES[String(statut || "")];
  // Statut inconnu : on reste prudent et on revérifie.
  if (minutes === undefined) return true;
  if (minutes === 0) return true;

  return (Date.now() - d.getTime()) > minutes * 60 * 1000;
}
