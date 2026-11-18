/* ==========================================================================
   SONDE — le relais de vérification TVA répond-il DEPUIS CLOUDFLARE ?

   Le registre européen éconduit les appels venus des centres de données.
   Mesuré le 18 novembre : depuis Cloudflare, MS_MAX_CONCURRENT_REQ en 75 ms ;
   depuis Google, idem en 430 ms, y compris pour le numéro belge de NBD ;
   depuis une connexion ordinaire, la réponse complète en 3 à 9 secondes.

   Un relais commercial appelle le registre depuis sa propre infrastructure et
   expose une API normale. S'il répond depuis Cloudflare, le site peut vérifier
   un numéro AU MOMENT DE L'INSCRIPTION, et plus aucun client exonérable ne
   paiera une TVA qu'il faudra lui rembourser. C'est ce que cette page mesure,
   et rien d'autre : elle n'écrit nulle part.

   CE QU'ELLE VÉRIFIE, parce que « ça répond » ne suffit pas :
     1. le temps de réponse depuis Cloudflare ;
     2. la présence du NUMÉRO DE CONSULTATION officiel — la preuve qui manque
        aux trente constats faits à la main aujourd'hui ;
     3. la justesse, sur des numéros dont on connaît déjà la réponse ;
     4. ce qui se passe sans clé : il faut que ça échoue franchement, parce
        que la règle est « pas de réponse, on facture la TVA ».

   RÉSERVÉE AU COMPTE DE NBD. Les deux sondes du 18 novembre matin ont été
   retirées parce qu'elles exposaient des numéros clients sans
   authentification. Celle-ci ne prend ses numéros que dans l'adresse, ne
   renvoie que des oui, des non et des millisecondes, et ne montre jamais la
   clé — seulement si elle est présente.
   ========================================================================== */

import { json, erreur, compteAdmin } from "../_commun.js";

/* Le demandeur, c'est NBD : c'est son numéro qui fait délivrer le numéro de
   consultation par le registre. Il figure sur chaque facture, il n'a rien de
   secret. */
const DEMANDEUR = "BE0817750283";

const RELAIS = "https://api.vatsense.com/1.0/validate";

async function interroger(numero, cle) {
  const t0 = Date.now();
  const url = RELAIS + "?vat_number=" + encodeURIComponent(numero)
            + "&requester_vat_number=" + encodeURIComponent(DEMANDEUR);
  const entetes = {};
  if (cle) entetes["Authorization"] = "Basic " + btoa("user:" + cle);

  try {
    const r = await fetch(url, { headers: entetes });
    const ms = Date.now() - t0;
    let corps = null;
    try { corps = await r.json(); } catch (e) { corps = null; }
    const d = (corps && corps.data) || {};
    const soc = d.company || {};
    return {
      numero: numero,
      http: r.status,
      ok: !!(corps && corps.success),
      valide: typeof d.valid === "boolean" ? d.valid : null,
      /* On ne renvoie PAS la raison sociale : elle n'ajoute rien à la mesure
         et c'est une donnée client. On dit seulement si elle est arrivée. */
      nom_recu: !!(soc.company_name && String(soc.company_name).trim()
                   && String(soc.company_name).trim() !== "---"),
      /* LA PIÈCE QUI COMPTE. */
      consultation_recue: !!(d.consultation_number
                             && String(d.consultation_number).trim()),
      /* Sa longueur, pour voir qu'il ressemble à un vrai numéro, sans le
         montrer — il désigne une consultation faite au nom de NBD. */
      consultation_taille: d.consultation_number
        ? String(d.consultation_number).trim().length : 0,
      titre_erreur: (corps && (corps.title || corps.message)) || "",
      ms: ms,
    };
  } catch (e) {
    return {
      numero: numero, http: 0, ok: false, valide: null,
      nom_recu: false, consultation_recue: false, consultation_taille: 0,
      titre_erreur: String((e && e.message) || "injoignable").slice(0, 120),
      ms: Date.now() - t0,
    };
  }
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");

  const url = new URL(request.url);

  /* Les numéros viennent de l'adresse, jamais du dépôt : ce dépôt est public
     et aucun numéro client n'a à y figurer. */
  const numeros = String(url.searchParams.get("n") || "")
    .split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
  if (!numeros.length) {
    return erreur("Ajoutez ?n=FR... pour mesurer. Séparez par des virgules.",
                  400, "numeros_manquants");
  }

  const cle = String((env && env.CLE_VATSENSE) || "");
  /* L'essai « sans clé » existe pour vérifier la règle de sécurité : une
     authentification qui tombe doit faire échouer franchement, jamais
     répondre « valide ». */
  const sansCle = url.searchParams.get("sans_cle") === "oui";

  if (!cle && !sansCle) {
    return json({
      ok: false, code: "cle_absente",
      detail: "CLE_VATSENSE n'est pas renseignée chez Cloudflare pour cet "
            + "environnement. C'est elle qui porte l'authentification du relais.",
    });
  }

  const releves = [];
  for (const n of numeros) {
    releves.push(await interroger(n, sansCle ? "" : cle));
    /* Un relais payant n'a pas de raison de nous limiter, mais une sonde ne
       doit pas marteler un service qu'on évalue. */
    await new Promise((s) => setTimeout(s, 400));
  }

  const avecConsultation = releves.filter((r) => r.consultation_recue).length;
  const repondus = releves.filter((r) => r.http === 200).length;
  const temps = releves.map((r) => r.ms).sort((a, b) => a - b);

  return json({
    ok: true,
    cle_presente: !!cle,
    essai_sans_cle: sansCle,
    demandeur: DEMANDEUR,
    examines: releves.length,
    repondus: repondus,
    avec_numero_de_consultation: avecConsultation,
    ms_median: temps.length ? temps[Math.floor(temps.length / 2)] : null,
    ms_max: temps.length ? temps[temps.length - 1] : null,
    releves: releves,
    /* Ce que la sonde ne dit pas, et qu'il ne faut pas lui faire dire : elle
       mesure le relais, pas le droit à l'exonération. La décision d'exonérer
       reste dans _tva.js, et elle reste négative tant qu'une preuve n'est pas
       posée. */
    avertissement: "Mesure du relais uniquement. Aucune écriture, aucun compte "
                 + "modifié.",
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
