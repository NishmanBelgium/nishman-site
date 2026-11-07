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
export async function verifier(numero, paysCompte, requerant, options) {
  let dernier = null;

  /* LE BUDGET DE TEMPS, parce que trois essais ne valent pas partout.
   *
   * Trois tentatives de huit secondes, pauses comprises, font vingt-cinq
   * secondes. C'est raisonnable pour une inscription ou pour un contrôle
   * lancé depuis une page d'administration : on attend, et on a la bonne
   * réponse.
   *
   * C'est intenable au milieu d'une commande. Le 5 novembre 2026, une
   * cliente française dont la TVA n'était pas validée est restée bloquée
   * sur « Connexion interrompue » : chacun de ses clics relançait cette
   * interrogation, et quand le registre européen est engorgé — ce qui est
   * précisément la raison pour laquelle son numéro n'était pas validé —
   * la requête dépassait le délai de Cloudflare avant d'avoir fini.
   *
   * D'où ce réglage. L'appelant qui a le temps garde les trois essais ;
   * celui qui tient un client en ligne en demande un seul, et court. */
  const essaisMax = Math.max(1, Math.min(TENTATIVES,
    Math.floor(Number(options && options.tentatives) || TENTATIVES)));
  const delai = Math.max(500, Math.min(DELAI_MS,
    Math.floor(Number(options && options.delaiMs) || DELAI_MS)));

  for (let essai = 0; essai < essaisMax; essai++) {
    const pause = ATTENTE_MS[essai];
    if (pause) await attendre(pause);

    const r = await interroger(numero, paysCompte, requerant, delai);

    // Une réponse claire, dans un sens ou dans l'autre, met fin aux essais :
    // seule l'absence de réponse mérite d'insister.
    if (r.statut !== "indisponible") return r;

    // Une saisie refusée ne deviendra pas correcte en réessayant.
    if (r.motif === "INVALID_INPUT") return r;

    dernier = r;

    /* L'État membre a refusé l'appel. Insister sur la même porte n'y
     * changera rien — c'est ce que les trois tentatives nous ont appris à
     * nos frais. On passe à l'autre, qui répond. */
    if (vautLaSecondePorte(r.motif)) {
      const part = decouper(numero, paysCompte);
      if (part) {
        const b = await interrogerSansPreuve(part, delai);
        if (b.statut !== "indisponible") return { ...b, essais: essai + 1 };
        /* La seconde porte n'a rien tranché non plus. On garde SON motif
         * plutôt que celui de la première : c'est elle qui a parlé en
         * dernier, et sans cela on ne saurait jamais lequel des deux
         * chemins a échoué. Le diagnostic du 7 novembre a buté là-dessus
         * pendant une demi-heure. */
        dernier = { ...b, chemin: "seconde porte" };
      }
    }
  }

  return { ...dernier, essais: essaisMax };
}

/** Un aller-retour avec le registre. Ne lève jamais. */
async function interroger(numero, paysCompte, requerant, delaiMs) {
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
  const minuteur = setTimeout(() => stop.abort(), delaiMs || DELAI_MS);
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

/* --- LE SECOND CHEMIN, QUAND LE PREMIER EST FERMÉ ------------------------
 *
 * Le registre européen expose deux portes pour la même question.
 *
 *   POST /check-vat-number  accepte un requérant et rend, en échange, un
 *                           NUMÉRO DE CONSULTATION — la preuve qu'on a bien
 *                           vérifié, à telle date. C'est la bonne porte.
 *   GET  /ms/{pays}/vat/{n} répond oui ou non, avec le nom et l'adresse de
 *                           la société, mais sans numéro de consultation.
 *
 * Relevé le 7 novembre 2026, et reproductible à volonté : pour un numéro
 * français, la porte POST renvoie MS_MAX_CONCURRENT_REQ à chaque appel,
 * avec ou sans champs requérant, tandis que la porte GET répond du premier
 * coup. Ce n'est donc pas la saturation passagère que nous avions supposée
 * — c'est la France qui limite durement cette variante de l'appel.
 *
 * La conséquence était chère : quatre sociétés françaises aux numéros
 * parfaitement valides — Hair bodega, Maison Haussmann, Oz barber, SAS
 * Lumia — étaient facturées TVA comprise, et la commande S00285 l'a été
 * pour de bon.
 *
 * On garde donc la bonne porte en premier, pour la preuve. Mais quand
 * l'État membre la referme, on frappe à l'autre plutôt que de taxer un
 * client à tort. Le résultat porte alors un statut distinct,
 * « valide_sans_preuve » : il exonère, parce que le registre officiel a
 * confirmé la conformité du numéro, et il se signale, parce que le numéro
 * de consultation reste à obtenir. */

async function interrogerSansPreuve(part, delaiMs) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), delaiMs || DELAI_MS);
  let reponse;
  try {
    reponse = await fetch(
      RACINE + "/ms/" + encodeURIComponent(part.pays)
             + "/vat/" + encodeURIComponent(part.numero),
      { headers: { accept: "application/json" }, signal: stop.signal });
  } catch (e) {
    clearTimeout(minuteur);
    return indisponible("reseau_get");
  }
  clearTimeout(minuteur);

  if (!reponse.ok) return indisponible("http_get_" + reponse.status);

  let d;
  try { d = await reponse.json(); }
  catch (e) { return indisponible("illisible_get"); }
  if (!d || typeof d !== "object") return indisponible("vide_get");

  const souci = premiereErreur(d);
  if (souci) return indisponible(souci);

  /* Cette porte nomme le champ « isValid », et non « valid » comme
   * l'autre. Le piège est discret et il coûterait cher : lire « valid »
   * ici rendrait toujours undefined, donc jamais d'exonération. */
  if (d.isValid === true) {
    return {
      statut: "valide_sans_preuve",
      chemin: "seconde porte",
      nom: texte(d.name),
      adresse: texte(d.address),
      preuve: "",
      motif: "confirmé par le registre, numéro de consultation à obtenir",
      verifie_le: dateDe(d.requestDate),
    };
  }
  /* LA SECONDE PORTE PEUT CONFIRMER, JAMAIS CONDAMNER.
   *
   * Écrit après coup, et la leçon a coûté. Le 7 novembre 2026, cette
   * porte a été interrogée depuis Cloudflare pour quatre numéros
   * français que la même porte, interrogée depuis un navigateur
   * ordinaire quelques minutes plus tôt, confirmait tous les quatre.
   * Elle a répondu « inconnu » aux quatre, et le site les a marqués
   * invalides — c'est-à-dire qu'un correctif censé cesser de taxer des
   * clients à tort a commencé par les déclarer en faute.
   *
   * On ne sait pas pourquoi la réponse dépend de l'appelant, et tant
   * qu'on ne le sait pas, on n'en tire pas de conclusion défavorable.
   * Le rôle de cette porte est de SAUVER des numéros valides que la
   * porte principale n'a pas pu confirmer ; il n'est pas de condamner.
   * Un démenti ne vaut que de la porte principale, celle qui engage le
   * registre avec un requérant identifié.
   *
   * Asymétrie assumée : le pire qu'elle produise est une vérification
   * remise à plus tard. L'inverse produisait une facture fausse. */
  return indisponible(d.isValid === false
    ? "seconde_porte_dement_sans_confirmer"
    : "reponse_inattendue_get");
}

/** Faut-il essayer l'autre porte ?
 *
 * La première version listait les refus connus de l'État membre —
 * MS_MAX_CONCURRENT_REQ et consorts. Elle a laissé passer « reseau »,
 * c'est-à-dire le cas où la requête n'est même pas revenue, qui est
 * pourtant celui où changer de porte sert le plus. Observé dès la mise
 * en production : la porte principale rendait tantôt un refus de l'État
 * membre, tantôt une coupure réseau, et seul le premier déclenchait la
 * bascule.
 *
 * La règle est donc renversée. Si la porte principale n'a RIEN tranché,
 * on frappe à l'autre, quelle qu'en soit la raison. La seule exception
 * est une saisie que le registre refuse de lire : celle-là ne sera pas
 * mieux lue ailleurs. Une liste de cas connus se trompe toujours sur le
 * cas suivant ; une règle générale, non. */
function vautLaSecondePorte(motif) {
  return String(motif || "") !== "INVALID_INPUT";
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

  // Validé à la main par NBD, registre muet (étape 214). On laisse trois
  // mois : assez pour ne pas harceler le registre, assez peu pour qu'un
  // numéro radié entre-temps finisse par être repris.
  valide_manuel: 90 * 24 * 60,

  /* Confirmé par la porte sans preuve. Un jour, et non une semaine comme
   * un « valide » : la confirmation est solide, mais le numéro de
   * consultation manque, et c'est en repassant par la porte principale
   * qu'on finira par l'obtenir, le jour où l'État membre la rouvrira. */
  valide_sans_preuve: 24 * 60,

  // Validation ancienne conservée faute de réponse : à retenter dès que
  // possible, d'où l'absence volontaire de délai.
  valide_ancien: 0,
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

  /* LE PLANCHER, et pourquoi il a fallu l'ajouter.
   *
   * Les statuts à zéro minute — « indisponible », « jamais »,
   * « valide_ancien » — voulaient dire « retente dès que possible ».
   * Lus à la lettre, ils voulaient dire « retente À CHAQUE REQUÊTE » :
   * chaque affichage du panier, chaque changement de mode de livraison,
   * chaque clic sur Payer repartait interroger le registre européen.
   *
   * Le cercle vicieux saute aux yeux une fois écrit : un compte se
   * retrouve en « indisponible » précisément parce que le registre était
   * engorgé, et c'est ce compte-là qu'on renvoie le harceler le plus
   * souvent. Les clients les plus lents à servir étaient exactement ceux
   * dont la vérification avait déjà échoué.
   *
   * Dix minutes. Assez pour qu'un client qui navigue ne déclenche qu'une
   * interrogation, assez peu pour qu'un numéro fraîchement enregistré
   * soit reconnu dans la minute où il revient.
   *
   * Les deux chemins où l'on veut un contrôle immédiat — l'inscription et
   * le bouton de revérification — appellent controlerEtEnregistrer en
   * direct et ne passent pas par ici. Ce plancher ne les gêne pas. */
  const PLANCHER_MINUTES = 10;
  const attente = minutes === 0 ? PLANCHER_MINUTES : minutes;

  return (Date.now() - d.getTime()) > attente * 60 * 1000;
}
