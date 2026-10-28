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

/**
 * Crée un colis et demande son étiquette.
 *
 * Le poids est une chaîne en kilogrammes, comme SendCloud l'attend. Le
 * numéro de commande voyage avec : c'est ce qui permet de retrouver
 * l'expédition depuis Odoo, et inversement, sans table de correspondance
 * supplémentaire.
 *
 * `nombre_colis` au-delà de 1 crée un envoi multi-colis. C'est là que le
 * connecteur d'Odoo échouait ; ici le contenu n'est pas déclaré article par
 * article, donc l'incohérence qui le faisait annuler ne peut pas se
 * produire — un envoi intracommunautaire n'a pas besoin de détail douanier.
 */
export async function creerColis(env, { destinataire, poids, reference, methode, nombre_colis }) {
  const colis = {
    name: String(destinataire.nom || "").slice(0, 75),
    company_name: String(destinataire.societe || "").slice(0, 75) || undefined,
    address: String(destinataire.adresse || "").slice(0, 75),
    house_number: String(destinataire.numero || "n/a").slice(0, 20),
    city: String(destinataire.ville || "").slice(0, 75),
    postal_code: String(destinataire.code_postal || "").slice(0, 20),
    country: String(destinataire.pays || "BE").toUpperCase(),
    email: String(destinataire.email || "") || undefined,
    telephone: String(destinataire.telephone || "") || undefined,
    order_number: String(reference || "").slice(0, 50),
    weight: (Math.round(Number(poids) * 1000) / 1000).toFixed(3),
    request_label: true,
  };
  if (methode) colis.shipment = { id: Number(methode) };
  const n = Math.max(1, Math.floor(Number(nombre_colis) || 1));
  if (n > 1) colis.quantity = n;

  const d = await appelSendcloud(env, "/parcels", { method: "POST", body: { parcel: colis } });
  return (d && d.parcel) || null;
}
