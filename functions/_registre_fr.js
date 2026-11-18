/* ==========================================================================
   LE REGISTRE FRANÇAIS DES ENTREPRISES — la source qu'il nous manquait.

   POURQUOI CE FICHIER EXISTE

   Jusqu'au 18 novembre 2026, le site CALCULAIT le numéro de TVA français à
   partir du SIRET : clé = (12 + 3 × (SIREN modulo 97)) modulo 97. L'intention
   était bonne — un coiffeur connaît son SIRET, rarement son numéro
   intracommunautaire — mais la formule est un contrôle, pas un annuaire.

   Elle se trompe de deux façons, et les deux ont coûté :

   1. CERTAINES CLÉS NE SONT PAS NUMÉRIQUES. B.M. BARBER porte le numéro
      FR0F943141192. La formule produisait FR33943141192, que le registre
      européen refuse. Deux factures exonérées pour 20 492,70 € reposaient
      sur ce numéro faux, alors que l'exonération était parfaitement due.

   2. ELLE INVENTE UN NUMÉRO À QUI N'EN A PAS. Un coiffeur en franchise en
      base n'a pas de numéro intracommunautaire. La formule lui en fabriquait
      un, la fiche client le portait, et l'exonération suivait la fiche —
      au site comme à la saisie manuelle dans Odoo. Neuf factures exonérées
      à tort, 850,02 € de TVA due.

   LA SOURCE

   L'API publique « Recherche d'entreprises » de data.gouv.fr, alimentée par
   l'INSEE et la DGFiP. Gratuite, sans clé, et surtout : elle distingue les
   quatre cas qui nous intéressent, ce qu'aucun calcul ne peut faire.

     tva: ["FR0F943141192"]  → l'entreprise a un numéro, le voici
     tva: null, état "A"     → entreprise active, PAS de numéro (franchise)
     tva: null, état "C"     → entreprise cessée
     aucun résultat          → ce SIREN n'existe pas

   Mesuré depuis Cloudflare le 18/11/2026 : 200, 567 ms, contenu exact.
   À comparer au registre européen, qui depuis Cloudflare répond en 74 ms
   « MS_MAX_CONCURRENT_REQ » — un refus, assorti d'un isValid à false qui
   ressemble à un verdict. Voir _vies.js.

   CE QUE CE MODULE NE FAIT PAS

   Il ne dit pas qu'un numéro est VALIDE. Seul le registre européen le dit,
   et lui seul fonde l'exonération (condition de fond depuis les quick fixes
   de 2020). Ce module dit ce que la France déclare : l'entreprise existe,
   elle est active, et voici son numéro — ou elle n'en a pas. La
   confirmation VIES se fait ailleurs, depuis une adresse à qui le registre
   européen répond.
   ========================================================================== */

const RACINE = "https://recherche-entreprises.api.gouv.fr/search";
const DELAI_MS = 6000;

function chiffres(s) {
  return String(s || "").replace(/[^0-9]/g, "");
}

/** Vrai si le SIREN passe la clé de Luhn. Un SIRET valide commence par un
 *  SIREN valide ; on refuse la frappe manifestement fausse avant d'aller
 *  déranger le registre. */
export function sirenCoherent(siren) {
  const n = chiffres(siren);
  if (n.length !== 9) return false;
  let somme = 0;
  for (let i = 0; i < 9; i++) {
    let c = Number(n[8 - i]);
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
    somme += c;
  }
  return somme % 10 === 0;
}

/**
 * Interroge le registre pour un SIRET ou un SIREN.
 *
 * Ne lève jamais. Une panne du registre ne doit bloquer ni une inscription
 * ni une commande : elle rend { etat: "indisponible" }, et l'appelant
 * applique la règle prudente — on facture la TVA, on ne devine pas.
 *
 * @returns {Promise<{
 *   etat: "trouve"|"inconnu"|"indisponible",
 *   siren: string,
 *   nom?: string,
 *   actif?: boolean,
 *   tva?: string|null,      // le numéro déclaré, ou null s'il n'y en a pas
 *   adresse?: string,
 *   motif?: string
 * }>}
 */
export async function chercherEntreprise(identifiant) {
  const n = chiffres(identifiant);
  const siren = n.slice(0, 9);

  if (siren.length !== 9) {
    return { etat: "inconnu", siren, motif: "longueur" };
  }
  if (!sirenCoherent(siren)) {
    return { etat: "inconnu", siren, motif: "cle_siren" };
  }

  let donnees;
  try {
    const r = await fetch(`${RACINE}?q=${encodeURIComponent(siren)}&per_page=1`, {
      headers: { Accept: "application/json", "User-Agent": "nishman.be" },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (r.status !== 200) {
      return { etat: "indisponible", siren, motif: "http_" + r.status };
    }
    donnees = await r.json();
  } catch (e) {
    return { etat: "indisponible", siren, motif: String((e && e.name) || e).slice(0, 40) };
  }

  const e = (donnees && Array.isArray(donnees.results) ? donnees.results[0] : null);
  if (!e || String(e.siren) !== siren) {
    // Le registre a répondu, et ce SIREN n'y est pas. Ce n'est pas une
    // panne : c'est un numéro qui n'existe pas. Deux clients l'ont prouvé.
    return { etat: "inconnu", siren, motif: "absent_du_registre" };
  }

  // Le champ « tva » est un tableau : on prend le premier, s'il existe.
  const liste = Array.isArray(e.tva) ? e.tva.filter(Boolean) : (e.tva ? [e.tva] : []);
  const siege = e.siege || {};

  return {
    etat: "trouve",
    siren,
    nom: String(e.nom_raison_sociale || e.nom_complet || "").trim(),
    actif: String(e.etat_administratif || "") === "A",
    tva: liste.length ? String(liste[0]).toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
    adresse: String(siege.adresse || "").trim(),
  };
}

/**
 * Traduit la réponse du registre en consigne pour la suite.
 *
 * C'est ici, et nulle part ailleurs, qu'on décide si un client français
 * PEUT prétendre à l'exonération. La confirmation VIES viendra après et
 * pourra encore dire non ; elle ne pourra jamais dire oui à la place du
 * registre.
 *
 * @returns {{ suite: string, tva: string|null, message: string, nom?: string }}
 *   suite = "a_verifier"   → numéro déclaré, à confirmer au VIES
 *           "sans_numero"  → franchise en base : TVA due, et c'est normal
 *           "a_corriger"   → SIRET faux, cessé, ou registre muet
 */
export function consigne(resultat) {
  if (!resultat || resultat.etat === "indisponible") {
    return {
      suite: "a_corriger", tva: null,
      message: "Le registre des entreprises ne répond pas. Votre commande "
             + "passe avec la TVA ; nous régularisons dès qu'il répond.",
    };
  }
  if (resultat.etat === "inconnu") {
    return {
      suite: "a_corriger", tva: null,
      message: resultat.motif === "absent_du_registre"
        ? "Ce SIRET n'existe pas au registre des entreprises. Vérifiez la saisie."
        : "Ce SIRET ne semble pas valide. Vérifiez la saisie.",
    };
  }
  if (!resultat.actif) {
    return {
      suite: "a_corriger", tva: null, nom: resultat.nom,
      message: `Le registre indique que ${resultat.nom} a cessé son activité. `
             + "Contactez-nous pour mettre votre compte à jour.",
    };
  }
  if (!resultat.tva) {
    return {
      suite: "sans_numero", tva: null, nom: resultat.nom,
      message: "Le registre indique que votre entreprise n'a pas de numéro de "
             + "TVA intracommunautaire — c'est le cas en franchise en base. "
             + "La TVA s'applique donc à votre commande. Si vous en avez "
             + "obtenu un depuis, indiquez-le ci-dessous.",
    };
  }
  return {
    suite: "a_verifier", tva: resultat.tva, nom: resultat.nom,
    message: `Numéro trouvé au registre : ${resultat.tva}. Nous le confirmons `
           + "auprès du registre européen.",
  };
}
