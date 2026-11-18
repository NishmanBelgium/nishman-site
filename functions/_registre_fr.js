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

/* --------------------------------------------------------------------------
   CE QUE LE CLIENT A LE DROIT DE TAPER.

   La question de Dilhan, mot pour mot : « comment faire en sorte que le
   client puisse mettre la bonne info, mais qu'il ne soit pas bloqué non
   plus ». La réponse tient en une phrase : on accepte les trois formes
   sous lesquelles un professionnel français connaît son entreprise, et
   c'est le registre qui tranche ensuite.

     14 chiffres          le SIRET, ce que presque tous connaissent
      9 chiffres          le SIREN, ce que portent les documents officiels
     FR + clé + 9 chiffres le numéro intracommunautaire, pour qui l'a sous
                          les yeux — clé alphanumérique comprise, c'est
                          elle qui a coûté 20 492,70 € de factures assises
                          sur un numéro faux

   On ne refuse que ce qui ne ressemble à aucune des trois. Et on ne
   refuse jamais sur la clé de contrôle : une clé qui ne tombe pas juste
   est signalée, pas bloquée. Un dimanche soir, un coiffeur qui se trompe
   d'un chiffre doit pouvoir finir son inscription.
   -------------------------------------------------------------------------- */
export function identifiantFrancais(saisie) {
  const brut = String(saisie || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

  if (/^FR[0-9A-Z]{2}[0-9]{9}$/.test(brut)) {
    const siren = brut.slice(4);
    return { siret: null, siren, tva: null, tva_saisie: brut,
             coherent: sirenCoherent(siren) };
  }

  const n = brut.replace(/[^0-9]/g, "");
  if (n.length === 14 && n === brut) {
    return { siret: n, siren: n.slice(0, 9), tva: null, tva_saisie: null,
             coherent: siretCoherentLocal(n) };
  }
  if (n.length === 9 && n === brut) {
    return { siret: null, siren: n, tva: null, tva_saisie: null,
             coherent: sirenCoherent(n) };
  }

  return {
    erreur: "Indiquez votre SIRET (14 chiffres), votre SIREN (9 chiffres) "
          + "ou votre numéro de TVA intracommunautaire. Vous avez saisi "
          + brut.length + " caractère" + (brut.length > 1 ? "s" : "") + ".",
    code: "identifiant_fr_forme",
  };
}

/* La clé du SIRET, pour ne pas dépendre de _commun.js — ce fichier doit
 * rester sans importation, puisque _commun.js importe celui-ci. */
function siretCoherentLocal(num) {
  if (!/^[0-9]{14}$/.test(num)) return false;
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let c = Number(num[i]);
    if (i % 2 === 0) { c *= 2; if (c > 9) c -= 9; }
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

  /* LE REGISTRE COMPTE LES APPELS, ET IL LE DIT EN 429.
   *
   * Relevé en production le 18 novembre 2026 : un passage sur les comptes
   * français a reçu 47 refus 429 sur 61 appels enchaînés. Le module a eu
   * raison de ne rien écrire — un 429 rend « indisponible », donc « ne
   * touche à rien » — mais le passage se lisait comme complet alors qu'il
   * n'avait examiné que 14 comptes.
   *
   * On ressaie donc une fois, après la pause que le registre demande s'il
   * la précise. Une seule fois : un travailleur Cloudflare n'a pas la
   * soirée, et l'appelant sait repasser. Ce qui compte est qu'un refus
   * passager ne compte pas comme une réponse. */
  let donnees;
  for (let essai = 0; essai < 2; essai++) {
    try {
      const r = await fetch(`${RACINE}?q=${encodeURIComponent(siren)}&per_page=1`, {
        headers: { Accept: "application/json", "User-Agent": "nishman.be" },
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (r.status === 429 && essai === 0) {
        const dit = Number(r.headers.get("retry-after"));
        const attente = Number.isFinite(dit) && dit > 0 ? Math.min(dit * 1000, 4000) : 1500;
        await new Promise((ok) => setTimeout(ok, attente));
        continue;
      }
      if (r.status !== 200) {
        return { etat: "indisponible", siren, motif: "http_" + r.status };
      }
      donnees = await r.json();
      break;
    } catch (e) {
      return { etat: "indisponible", siren, motif: String((e && e.name) || e).slice(0, 40) };
    }
  }
  if (!donnees) return { etat: "indisponible", siren, motif: "http_429" };

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

/**
 * LE CHEMIN COMPLET, celui que l'inscription et le profil appellent.
 *
 * Lit ce que le client a tapé, demande à la France, et rend ce qu'il faut
 * écrire en base. Ne lève jamais et ne bloque jamais : au pire le compte
 * se crée avec la TVA, et se régularise.
 *
 * UNE RÈGLE TIENT TOUT LE RESTE : ce qui sort d'ici ne vaut JAMAIS
 * exonération. « a_verifier » veut dire « numéro connu, pas encore
 * confirmé », et seul le registre européen fait passer un compte en
 * « valide ». C'est ce qui rend l'erreur impossible dans le sens coûteux :
 * au pire on facture une TVA qu'on rembourse, jamais on exonère à tort.
 *
 * @returns {Promise<{erreur?, code?, siret, siren, tva, statut, message, nom}>}
 */
export async function resoudreFrance(saisie) {
  const forme = identifiantFrancais(saisie);
  if (forme.erreur) return forme;

  const registre = await chercherEntreprise(forme.siren);
  const k = consigne(registre);

  /* LE CLIENT AFFIRME UN NUMÉRO QUE LA FRANCE NE DÉCLARE PAS.
   *
   * Deux explications possibles, et elles demandent la même prudence.
   * Soit le numéro vient d'être attribué et n'a pas encore atteint le
   * registre — ça arrive, quelques semaines. Soit le client l'a recopié
   * d'un annuaire en ligne qui, comme Le Figaro ou Pappers, AFFICHE le
   * numéro calculé par la même formule que celle qu'on vient de retirer.
   * C'est le cas le plus probable, et il est indétectable d'ici.
   *
   * On ne l'écrit donc PAS dans le champ « tva ». Ce champ-là voyage : il
   * part dans la fiche Odoo à la première commande, et une fiche Odoo qui
   * porte un numéro ouvre l'exonération à la facturation manuelle. C'est
   * précisément par là que les 850,02 € de TVA due sont passés.
   *
   * Ce que le client a tapé n'est pas perdu pour autant : il part dans le
   * motif, visible par NBD, et le message invite à nous écrire. Un
   * numéro réel se confirme en deux minutes par le registre européen, et
   * se pose alors à la main depuis /pro/tva/ — qui exige, lui, une
   * preuve. Mieux vaut un client à rappeler qu'un faux numéro en base. */
  if (k.suite === "sans_numero" && forme.tva_saisie) {
    return {
      siret: forme.siret, siren: forme.siren,
      tva: null, statut: "sans_numero",
      nom: k.nom || "", coherent: forme.coherent,
      revendique: forme.tva_saisie,
      message: "Le registre français ne déclare aucun numéro de TVA "
             + "intracommunautaire pour cette entreprise, alors que vous en "
             + "indiquez un. La TVA s'applique donc à vos commandes pour "
             + "l'instant. Si ce numéro est bien le vôtre, écrivez-nous : "
             + "nous le confirmons auprès du registre européen et nous "
             + "régularisons.",
    };
  }

  return {
    siret: forme.siret, siren: forme.siren,
    tva: k.tva || null,
    statut: k.suite,
    nom: k.nom || "",
    coherent: forme.coherent,
    message: k.message,
  };
}
