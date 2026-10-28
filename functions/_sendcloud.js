/* ==========================================================================
   SENDCLOUD — les étiquettes, par l'API, sans passer par Odoo.

   Le connecteur SendCloud d'Odoo est inutilisable pour NBD : dès qu'une
   commande fait plus d'un colis, il recopie la totalité des articles dans
   CHAQUE colis tout en déclarant un poids partiel. SendCloud refuse
   l'incohérence, et le connecteur annule les étiquettes qu'il vient de
   créer. Constaté le 27 octobre 2026 sur sept étiquettes successives.

   On ne construit donc pas sur lui. Le site parlera directement à
   SendCloud, et écrira le numéro de suivi dans Odoo.

   Les deux clés vivent dans les variables secrètes SENDCLOUD_PUBLIC et
   SENDCLOUD_SECRET. Elles ne figurent ni dans le dépôt, ni dans les
   réponses du site.
   ========================================================================== */

const BASE = "https://panel.sendcloud.sc/api/v2";

export function configureSendcloud(env) {
  return !!(String((env && env.SENDCLOUD_PUBLIC) || "").trim()
         && String((env && env.SENDCLOUD_SECRET) || "").trim());
}

function autorisation(env) {
  const pub = String((env && env.SENDCLOUD_PUBLIC) || "").trim();
  const sec = String((env && env.SENDCLOUD_SECRET) || "").trim();
  return "Basic " + btoa(pub + ":" + sec);
}

/**
 * Un appel à SendCloud. L'erreur porte le statut HTTP : 401 distingue
 * « clés refusées » de « SendCloud est en panne », et les deux n'appellent
 * pas la même conduite.
 */
export async function appelSendcloud(env, chemin, options) {
  if (!configureSendcloud(env)) {
    const e = new Error("Les clés SendCloud ne sont pas configurées.");
    e.statut = 0;
    throw e;
  }

  const o = options || {};
  let r;
  try {
    r = await fetch(BASE + chemin, {
      method: o.method || "GET",
      headers: {
        authorization: autorisation(env),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
  } catch (e) {
    const err = new Error("SendCloud est injoignable.");
    err.statut = 0;
    throw err;
  }

  const texte = await r.text();
  let donnees = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch (e) { /* réponse non JSON */ }

  if (!r.ok) {
    const m = donnees && donnees.error ? (donnees.error.message || donnees.error.code) : null;
    const err = new Error(String(m || ("HTTP " + r.status)).slice(0, 300));
    err.statut = r.status;
    throw err;
  }
  return donnees;
}

/** Le compte auquel ces clés donnent accès — de quoi vérifier sans rien créer. */
export async function compteSendcloud(env) {
  const d = await appelSendcloud(env, "/user");
  return (d && d.user) || null;
}

/**
 * La fiche d'un point relais, par son identifiant SendCloud.
 *
 * Elle est demandée à SendCloud et jamais reprise du navigateur. Le
 * sélecteur tourne côté client : son résultat peut être modifié avant de
 * nous parvenir, et une adresse de livraison qu'on accepterait sans la
 * vérifier serait un colis envoyé où quelqu'un d'autre a décidé.
 *
 * L'API des points relais vit sur son propre hôte et sa propre version.
 */
export async function pointRelais(env, id) {
  if (!configureSendcloud(env)) {
    const e = new Error("Les clés SendCloud ne sont pas configurées.");
    e.statut = 0;
    throw e;
  }
  const n = Math.floor(Number(id));
  if (!(n > 0)) throw new Error("identifiant de point relais invalide");

  let r;
  try {
    r = await fetch("https://servicepoints.sendcloud.sc/api/v2/service-points/" + n, {
      headers: {
        authorization: autorisation(env),
        accept: "application/json",
      },
    });
  } catch (e) {
    const err = new Error("SendCloud est injoignable.");
    err.statut = 0;
    throw err;
  }

  const texte = await r.text();
  let d = null;
  try { d = texte ? JSON.parse(texte) : null; } catch (e) { /* réponse non JSON */ }

  if (!r.ok) {
    const err = new Error("Point relais introuvable (HTTP " + r.status + ")");
    err.statut = r.status;
    throw err;
  }
  return d;
}

/** Les méthodes d'expédition disponibles, pour un pays donné. */
export async function methodesSendcloud(env, pays) {
  const q = pays ? ("?to_country=" + encodeURIComponent(String(pays).toUpperCase())) : "";
  const d = await appelSendcloud(env, "/shipping_methods" + q);
  return (d && Array.isArray(d.shipping_methods)) ? d.shipping_methods : [];
}

/* ==========================================================================
   LA VERSION 3 DE L'API

   Le compte de NBD refuse la création de colis par l'ancienne API :
   « Creating parcels via API v2 is not available for this account. Please
   use API v3. » C'est la chaîne elle-même qui l'a dit, lors de la première
   vraie commande — aucune documentation ne l'annonçait.

   La v3 raisonne en « envois » plutôt qu'en colis, et en « codes d'option
   d'expédition » (mondial_relay:point-relais, par exemple) plutôt qu'en
   identifiants numériques de méthode. Le reste de l'authentification est
   identique.
   ========================================================================== */

const BASE3 = "https://panel.sendcloud.sc/api/v3";

export async function appelSendcloud3(env, chemin, options) {
  if (!configureSendcloud(env)) {
    const e = new Error("Les clés SendCloud ne sont pas configurées.");
    e.statut = 0;
    throw e;
  }
  const o = options || {};
  let r;
  try {
    r = await fetch(BASE3 + chemin, {
      method: o.method || "GET",
      headers: {
        authorization: autorisation(env),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
  } catch (e) {
    const err = new Error("SendCloud est injoignable.");
    err.statut = 0;
    throw err;
  }

  const texte = await r.text();
  let donnees = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch (e) { /* non JSON */ }

  if (!r.ok) {
    // La v3 décrit ses refus dans un tableau « errors ». Les reprendre tels
    // quels vaut mieux qu'un « HTTP 400 » : c'est ce message-là qui nous a
    // appris qu'il fallait passer en v3.
    let motif = "HTTP " + r.status;
    if (donnees && Array.isArray(donnees.errors) && donnees.errors.length) {
      // « Field required » tout seul ne sert à rien : c'est l'endroit qui
      // compte. La v3 le range dans source.pointer ou dans un champ voisin,
      // et on le reprend tel quel plutôt que de deviner lequel.
      motif = donnees.errors.map((e) => {
        const ou = (e.source && (e.source.pointer || e.source.parameter))
                 || e.pointer || e.field || e.parameter || "";
        const quoi = e.detail || e.title || e.code || "erreur";
        return ou ? quoi + " [" + ou + "]" : quoi;
      }).filter(Boolean).join(" | ");
    } else if (donnees && (donnees.detail || donnees.message)) {
      motif = donnees.detail || donnees.message;
    } else if (texte) {
      motif = texte.slice(0, 200);
    }
    const err = new Error(String(motif).slice(0, 300));
    err.statut = r.status;
    throw err;
  }
  return donnees;
}

/**
 * L'adresse d'expéditeur du compte.
 *
 * La v3 l'exige par identifiant. On la demande au compte plutôt que de
 * l'écrire en dur : une adresse change, et une adresse écrite dans le code
 * ne change jamais avec elle. SENDCLOUD_EXPEDITEUR permet de forcer le
 * choix si NBD en enregistre plusieurs.
 */
let expediteurCache = null;
export async function adresseExpediteur(env) {
  if (expediteurCache) return expediteurCache;

  const d = await appelSendcloud(env, "/user/addresses/sender");
  const liste = (d && d.sender_addresses) || [];
  if (!liste.length) throw new Error("aucune adresse d'expéditeur dans le compte SendCloud");

  const force = Number(String((env && env.SENDCLOUD_EXPEDITEUR) || "").trim());
  const choisie = (force > 0 && liste.find((x) => x.id === force)) || liste[0];

  // On garde le pays et le code postal, pas seulement l'identifiant : le
  // calcul des options d'expédition part de l'origine réelle, et la v3
  // refuse la demande sans pays de départ.
  expediteurCache = {
    id: choisie.id,
    pays: String(choisie.country || "BE").toUpperCase(),
    code_postal: String(choisie.postal_code || ""),
    ville: String(choisie.city || ""),
    nom: choisie.company_name || choisie.contact_name || "",
  };
  return expediteurCache;
}

/**
 * Les options d'expédition possibles vers un point relais précis, pour un
 * poids précis.
 *
 * Demander les options POUR CE POINT et CE POIDS est ce qui rend l'envoi
 * sûr : tout ce que SendCloud renvoie ici est, par construction, compatible
 * avec la destination. On ne devine rien.
 */
export async function optionsVersPointRelais(env, { expediteur, destinataire, pointId, poidsKg }) {
  const corps = {
    // Pour CHERCHER les options, la v3 veut l'adresse décrite — pays et
    // code postal — et refuse qu'on y joigne l'identifiant : « Provide
    // either sender_address_id or address fields, not both ». Au moment
    // d'ANNONCER l'envoi, c'est l'inverse : l'identifiant seul.
    from_address: {
      country_code: expediteur.pays,
      postal_code: expediteur.code_postal,
    },
    to_address: adresseV3(destinataire),
    to_service_point: { id: String(pointId) },
    parcels: [{ weight: { value: Number(poidsKg).toFixed(3), unit: "kg" } }],
  };
  const d = await appelSendcloud3(env, "/shipping-options", { method: "POST", body: corps });
  const liste = (d && Array.isArray(d.data)) ? d.data : [];
  return liste;
}

function adresseV3(d) {
  const a = {
    name: String(d.nom || "").slice(0, 75),
    address_line_1: String(d.adresse || "").slice(0, 75),
    house_number: String(d.numero || "").slice(0, 20),
    postal_code: String(d.code_postal || "").slice(0, 20),
    city: String(d.ville || "").slice(0, 75),
    country_code: String(d.pays || "BE").toUpperCase(),
  };
  if (d.email) a.email = String(d.email);
  if (d.telephone) a.phone_number = String(d.telephone);
  if (d.post_number) a.po_box = String(d.post_number);
  return a;
}

/**
 * Crée l'envoi et l'annonce au transporteur — c'est ce geste qui produit
 * l'étiquette et le numéro de suivi.
 */
export async function annoncerEnvoi(env, { expediteur, destinataire, pointId, poidsKg, code, reference }) {
  const corps = {
    from_address: { sender_address_id: Number(expediteur.id) },
    to_address: adresseV3(destinataire),
    to_service_point: { id: String(pointId) },
    ship_with: {
      type: "shipping_option_code",
      properties: { shipping_option_code: String(code) },
    },
    parcels: [{ weight: { value: Number(poidsKg).toFixed(3), unit: "kg" } }],
  };
  if (reference) corps.order_number = String(reference).slice(0, 50);

  const d = await appelSendcloud3(env, "/shipments/announce", { method: "POST", body: corps });
  return (d && d.data) || d;
}

/**
 * Retrouve le numéro de suivi dans la réponse, quel que soit l'endroit où
 * la v3 le range.
 *
 * La documentation ne nomme pas ce champ, et une réponse qu'on n'arrive pas
 * à lire vaut un envoi perdu : on cherche donc aux endroits plausibles
 * plutôt que de parier sur un seul.
 */
export function suiviDansReponse(d) {
  if (!d) return { suivi: "", lien: "", etiquette: "" };
  const colis = Array.isArray(d.parcels) ? d.parcels : [];
  const premier = colis[0] || {};
  const suivi = d.tracking_number || premier.tracking_number
             || (d.tracking && d.tracking.number) || "";
  const lien = d.tracking_url || premier.tracking_url
            || (d.tracking && d.tracking.url) || "";
  const etiquette = (d.label && (d.label.url || d.label.href))
                 || (premier.label && (premier.label.url || premier.label.href))
                 || (d.documents && Array.isArray(d.documents) && d.documents[0]
                     && (d.documents[0].url || d.documents[0].href))
                 || "";
  return { suivi: String(suivi || ""), lien: String(lien || ""), etiquette: String(etiquette || "") };
}
