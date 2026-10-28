/* ==========================================================================
   ÉTIQUETTE — le colis vers le point relais choisi par le client.

   C'est le geste qui a échoué sept fois le 27 octobre, par le connecteur
   SendCloud d'Odoo. Son défaut : sur un envoi en plusieurs colis, il
   recopiait TOUS les articles dans CHAQUE colis tout en déclarant un poids
   partiel. SendCloud refusait l'incohérence et le connecteur annulait les
   étiquettes qu'il venait de créer.

   Ici, trois choix écartent ce défaut par construction.

   UN SEUL COLIS. Une commande de particulier, c'est deux ou trois flacons.
   Il n'y a pas de multi-colis à gérer, donc pas d'incohérence possible
   entre ce qu'on déclare et ce qu'on envoie. Le jour où une commande
   dépassera le poids maximal, on refusera l'étiquette automatique et on le
   dira — plutôt que de bricoler une répartition.

   AUCUN CONTENU DÉCLARÉ. Un envoi à l'intérieur de l'Union n'exige aucun
   détail douanier. On déclare un colis et son poids, pas une liste
   d'articles. C'est précisément cette liste qui faisait tout échouer.

   DEUX TEMPS. On crée d'abord le colis SANS demander l'étiquette, on relit
   ce que SendCloud a enregistré, et on ne demande l'étiquette qu'une fois
   le point relais et le transporteur vérifiés. Un colis sans étiquette ne
   coûte rien ; une étiquette vers la mauvaise adresse coûte le prix de
   l'envoi et celui du litige.
   ========================================================================== */

import { appel } from "./_odoo.js";
import { appelSendcloud, configureSendcloud } from "./_sendcloud.js";

/* Poids d'emballage : le carton, le calage, le ruban. Sous-déclarer fait
   refuser le colis au centre de tri, sur-déclarer fait payer la tranche
   au-dessus. Deux cents grammes est une valeur prudente pour un carton de
   boutique. */
const EMBALLAGE_KG = 0.2;

/* Quand Odoo n'a pas de poids pour un article. Un flacon de 150 ml plein
   pèse environ 220 g ; on prend cette valeur plutôt que zéro, parce qu'un
   colis déclaré à zéro est un colis refusé. */
const POIDS_DEFAUT_KG = 0.25;

/* Au-delà, on ne crée plus d'étiquette tout seul : c'est qu'il faut
   plusieurs colis, et c'est un jugement humain. */
const POIDS_MAX_KG = 20;

/**
 * Le poids de la commande, d'après les fiches produits d'Odoo.
 *
 * @returns { kg, estime, detail }  estime = true si au moins un article
 *          n'avait pas de poids renseigné et a dû être approximé.
 */
export async function poidsCommande(env, orderId) {
  const lignes = await appel(env, "sale.order.line", "search_read",
    [[["order_id", "=", orderId]], ["product_id", "product_uom_qty"]], { limit: 200 });

  const ids = [...new Set((lignes || [])
    .map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : l.product_id))
    .filter(Boolean))];
  if (!ids.length) throw new Error("commande sans ligne");

  const produits = await appel(env, "product.product", "read",
    [ids, ["weight", "name", "type"]], {});
  const parId = {};
  for (const p of produits || []) parId[p.id] = p;

  let kg = 0;
  let approximes = 0;
  let articles = 0;

  for (const l of lignes || []) {
    const pid = Array.isArray(l.product_id) ? l.product_id[0] : l.product_id;
    const p = parId[pid];
    if (!p) continue;
    // Les lignes de service — le port, par exemple — ne pèsent rien et
    // n'ont rien à faire dans le poids du colis.
    if (p.type === "service") continue;

    const q = Number(l.product_uom_qty) || 0;
    const unitaire = Number(p.weight) || 0;
    if (unitaire > 0) kg += unitaire * q;
    else { kg += POIDS_DEFAUT_KG * q; approximes += q; }
    articles += q;
  }

  const total = Math.round((kg + EMBALLAGE_KG) * 1000) / 1000;
  return {
    kg: total,
    estime: approximes > 0,
    detail: articles + " article(s), " + (kg).toFixed(3) + " kg de marchandise"
          + " + " + EMBALLAGE_KG + " kg d'emballage"
          + (approximes ? " — dont " + approximes + " article(s) sans poids dans Odoo, "
             + "approximés à " + POIDS_DEFAUT_KG + " kg pièce" : ""),
  };
}

/**
 * La méthode d'expédition la moins chère qui accepte ce poids vers ce point
 * relais précis.
 *
 * La liste est demandée POUR LE POINT, pas pour le pays : c'est le point
 * relais qui détermine le transporteur, et le transporteur qui détermine
 * ce qui est possible. Une méthode prise dans la liste du point est
 * compatible avec lui par construction — c'est ce qui rend l'étiquette sûre
 * sans avoir à deviner.
 */
export async function choisirMethode(env, pays, pointId, poidsKg) {
  const d = await appelSendcloud(env,
    "/shipping_methods?to_country=" + encodeURIComponent(String(pays).toUpperCase())
    + "&service_point_id=" + encodeURIComponent(pointId));

  const toutes = (d && Array.isArray(d.shipping_methods)) ? d.shipping_methods : [];
  if (!toutes.length) throw new Error("aucune méthode d'expédition vers ce point relais");
  return meilleureMethode(toutes, poidsKg);
}

/**
 * Le choix proprement dit, séparé de l'appel réseau pour pouvoir être
 * éprouvé sur de vraies listes sans rien demander à SendCloud.
 *
 * Les tranches de poids de SendCloud se chevauchent d'un gramme — 0,251 à
 * 0,501, puis 0,501 à 1,001 — donc la comparaison est stricte d'un côté et
 * large de l'autre, sans quoi un colis pile sur la borne tomberait dans
 * deux tranches ou dans aucune.
 */
export function meilleureMethode(brutes, poidsKg) {
  const valables = (brutes || [])
    .map((m) => ({
      id: m.id, nom: m.name, transporteur: m.carrier,
      min: Number(m.min_weight), max: Number(m.max_weight),
      prix: (Array.isArray(m.countries) && m.countries[0]) ? Number(m.countries[0].price) : null,
    }))
    .filter((m) => Number.isFinite(m.min) && Number.isFinite(m.max)
                && poidsKg > m.min && poidsKg <= m.max);

  if (!valables.length) {
    throw new Error("aucune méthode n'accepte " + poidsKg + " kg vers ce point relais");
  }

  // Le moins cher d'abord ; à prix égal, la tranche la plus serrée, qui est
  // celle que le transporteur attend vraiment. À tranche égale, le plus
  // petit identifiant, pour que deux appels successifs donnent le même
  // résultat — un choix qui varie d'un envoi à l'autre est impossible à
  // expliquer quand une facture transporteur arrive.
  valables.sort((a, b) => {
    const pa = a.prix === null ? 1e9 : a.prix;
    const pb = b.prix === null ? 1e9 : b.prix;
    if (pa !== pb) return pa - pb;
    const la = a.max - a.min, lb = b.max - b.min;
    if (la !== lb) return la - lb;
    return a.id - b.id;
  });
  return valables[0];
}

/**
 * Crée le colis et obtient l'étiquette, en deux temps.
 *
 * @returns { parcelId, suivi, transporteur, methode, prix, etiquette_url }
 */
export async function creerEtiquetteRelais(env, { destinataire, relais, poidsKg, reference, pays }) {
  if (!configureSendcloud(env)) throw new Error("clés SendCloud absentes");
  if (!(poidsKg > 0)) throw new Error("poids nul");
  if (poidsKg > POIDS_MAX_KG) {
    throw new Error("colis de " + poidsKg + " kg : au-delà de " + POIDS_MAX_KG
      + " kg il faut plusieurs colis, ce qui demande une décision humaine");
  }

  const methode = await choisirMethode(env, pays, relais.id, poidsKg);

  const colis = {
    name: String(destinataire.nom || "").slice(0, 75),
    address: String(destinataire.adresse || "").slice(0, 75),
    house_number: String(destinataire.numero || "n/a").slice(0, 20),
    city: String(destinataire.ville || "").slice(0, 75),
    postal_code: String(destinataire.code_postal || "").slice(0, 20),
    country: String(pays).toUpperCase(),
    email: String(destinataire.email || "") || undefined,
    telephone: String(destinataire.telephone || "") || undefined,
    order_number: String(reference || "").slice(0, 50),
    weight: poidsKg.toFixed(3),
    to_service_point: Number(relais.id),
    shipment: { id: methode.id },
    quantity: 1,
    // Premier temps : pas d'étiquette. On vérifie avant d'acheter.
    request_label: false,
  };
  if (relais.post_number) colis.to_post_number = String(relais.post_number);

  const cree = await appelSendcloud(env, "/parcels", { method: "POST", body: { parcel: colis } });
  const p = (cree && cree.parcel) || null;
  if (!p || !p.id) throw new Error("SendCloud n'a pas créé le colis");

  // Second temps : vérifier, puis seulement demander l'étiquette.
  const pointRetenu = Number(p.to_service_point || 0);
  if (pointRetenu !== Number(relais.id)) {
    throw new Error("SendCloud a enregistré le point relais " + (pointRetenu || "aucun")
      + " au lieu de " + relais.id + " : aucune étiquette n'a été achetée");
  }

  const avec = await appelSendcloud(env, "/parcels", {
    method: "PUT",
    body: { parcel: { id: p.id, request_label: true } },
  });
  const f = (avec && avec.parcel) || null;
  if (!f) throw new Error("SendCloud n'a pas rendu le colis après la demande d'étiquette");

  const suivi = f.tracking_number || "";
  if (!suivi) {
    throw new Error("colis " + p.id + " créé mais sans numéro de suivi — "
      + "à terminer à la main dans SendCloud");
  }

  return {
    parcelId: f.id,
    suivi,
    lien_suivi: f.tracking_url || "",
    transporteur: (f.carrier && f.carrier.code) || methode.transporteur || "",
    methode: methode.nom,
    prix: methode.prix,
    etiquette_url: (f.label && f.label.normal_printer
                    && (Array.isArray(f.label.normal_printer)
                        ? f.label.normal_printer[0] : f.label.normal_printer)) || "",
  };
}

/**
 * Écrit le numéro de suivi sur le bon de livraison d'Odoo.
 *
 * Sans ça, l'étiquette existe chez SendCloud et Odoo l'ignore : la
 * préparation ne sait pas que le colis est prêt, et le client qui demande
 * où en est sa commande n'obtient rien. C'est exactement l'état dans lequel
 * le connecteur laissait les commandes du 27 — « numéro de suivi : False ».
 */
export async function noterSuiviDansOdoo(env, orderId, suivi, detail) {
  const bons = await appel(env, "stock.picking", "search_read",
    [[["sale_id", "=", orderId], ["state", "not in", ["cancel"]]], ["id", "name", "state"]],
    { limit: 5 });
  if (!bons || !bons.length) return { ok: false, motif: "aucun bon de livraison" };

  const cible = bons[0];
  try {
    await appel(env, "stock.picking", "write",
      [[cible.id], { carrier_tracking_ref: suivi }], {});
  } catch (e) {
    return { ok: false, motif: "écriture refusée : " + String(e && e.message).slice(0, 160) };
  }

  // Et une trace lisible dans le fil de discussion, pour NBD.
  try {
    await appel(env, "stock.picking", "message_post",
      [[cible.id]], { body: String(detail || "").slice(0, 1000) });
  } catch (e) { /* la trace est un confort, pas une obligation */ }

  return { ok: true, bon: cible.name };
}
