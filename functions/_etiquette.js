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
import { configureSendcloud, adresseExpediteur, optionsVersPointRelais,
         annoncerEnvoi, suiviDansReponse } from "./_sendcloud.js";

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
 * L'option d'expédition retenue parmi celles que SendCloud propose pour ce
 * point relais et ce poids.
 *
 * Toutes celles qu'il renvoie sont compatibles avec la destination : c'est
 * SendCloud qui l'affirme, pas nous. Il ne reste qu'à choisir, et le choix
 * doit être reproductible — deux colis identiques ne doivent pas partir par
 * deux options différentes, sans quoi une facture transporteur devient
 * impossible à justifier.
 */
export function meilleureOption(options) {
  const liste = (options || []).filter((o) => o && o.code);
  if (!liste.length) {
    throw new Error("aucune option d'expédition vers ce point relais pour ce poids");
  }

  const prix = (o) => {
    // La v3 ne garantit pas de prix dans cette réponse. Quand il y en a un,
    // il décide ; sinon on s'en remet à l'ordre alphabétique du code, qui
    // a le mérite d'être stable.
    const c = o.contract || {};
    const v = o.price || o.total_price || c.price;
    if (v && typeof v === "object") return Number(v.value ?? v.amount ?? NaN);
    return Number(v ?? NaN);
  };

  liste.sort((a, b) => {
    const pa = prix(a), pb = prix(b);
    const a1 = Number.isFinite(pa), b1 = Number.isFinite(pb);
    if (a1 && b1 && pa !== pb) return pa - pb;
    if (a1 !== b1) return a1 ? -1 : 1;
    return String(a.code).localeCompare(String(b.code));
  });

  const choisie = liste[0];
  return {
    code: choisie.code,
    nom: choisie.name || choisie.code,
    transporteur: (choisie.carrier && (choisie.carrier.name || choisie.carrier.code)) || "",
    prix: Number.isFinite(prix(choisie)) ? prix(choisie) : null,
    combien: liste.length,
  };
}

/**
 * Crée l'envoi et obtient l'étiquette.
 *
 * Le destinataire est le CLIENT, pas le point relais : c'est
 * to_service_point qui dévie la livraison. Mettre l'adresse du relais ici
 * donnerait un colis adressé à un commerce, sans nom de destinataire, que
 * personne ne pourrait réclamer.
 */
export async function creerEtiquetteRelais(env, { destinataire, relais, poidsKg, reference, pays }) {
  if (!configureSendcloud(env)) throw new Error("clés SendCloud absentes");
  if (!(poidsKg > 0)) throw new Error("poids nul");
  if (poidsKg > POIDS_MAX_KG) {
    throw new Error("colis de " + poidsKg + " kg : au-delà de " + POIDS_MAX_KG
      + " kg il faut plusieurs colis, ce qui demande une décision humaine");
  }

  const expediteur = await adresseExpediteur(env);
  const dest = { ...destinataire, pays, post_number: relais.post_number || "" };

  const options = await optionsVersPointRelais(env, {
    expediteur, destinataire: dest, pointId: relais.id, poidsKg,
  });
  const option = meilleureOption(options);

  const envoi = await annoncerEnvoi(env, {
    expediteur, destinataire: dest, pointId: relais.id,
    poidsKg, code: option.code, reference,
  });

  const retenu = envoi && envoi.to_service_point ? String(envoi.to_service_point.id || "") : "";
  if (retenu && retenu !== String(relais.id)) {
    throw new Error("SendCloud a retenu le point relais " + retenu
      + " au lieu de " + relais.id);
  }

  const { suivi, lien, etiquette } = suiviDansReponse(envoi);
  if (!suivi) {
    throw new Error("envoi " + ((envoi && envoi.id) || "?") + " créé mais sans numéro de suivi "
      + "— à terminer à la main dans SendCloud");
  }

  return {
    envoiId: (envoi && envoi.id) || null,
    suivi,
    lien_suivi: lien,
    transporteur: (envoi && envoi.carrier && (envoi.carrier.name || envoi.carrier.code))
                  || option.transporteur,
    methode: option.nom,
    prix: option.prix,
    etiquette_url: etiquette,
    options_proposees: option.combien,
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
/* Le transporteur à inscrire sur le bon de livraison.
 *
 * Un seul, pour toutes les commandes de la boutique : « Point relais ».
 * Ce n'est pas un raccourci, c'est la vérité commerciale — le client
 * achète une livraison en point relais à 4,95 €, et c'est ce mode-là que
 * le bon doit porter. Lequel de bpost, DPD ou Mondial Relay la réalise
 * dépend du commerce qu'il a choisi, et NBD a demandé que le travail
 * interne ne change pas d'un transporteur à l'autre.
 *
 * Le réseau réel n'est pas perdu pour autant : il est écrit dans le fil
 * de discussion du bon, juste en dessous, avec le coût et le suivi.
 *
 * On cherche par nom plutôt que par identifiant : un identifiant en dur
 * se tait le jour où la fiche change, un nom introuvable se signale. */
const TRANSPORTEUR_DEFAUT = "Point relais";
let transporteurCache = null;

async function transporteurRelais(env) {
  if (transporteurCache !== null) return transporteurCache;
  const voulu = String((env && env.ODOO_TRANSPORTEUR_RELAIS) || TRANSPORTEUR_DEFAUT).trim();
  try {
    const r = await appel(env, "delivery.carrier", "search_read",
      [[["name", "=ilike", voulu]], ["id", "name"]], { limit: 2 });
    // Deux transporteurs du même nom : on n'en choisit aucun plutôt que
    // d'en désigner un au hasard.
    transporteurCache = (r && r.length === 1) ? r[0].id : 0;
  } catch (e) {
    transporteurCache = 0;
  }
  return transporteurCache;
}

export async function noterSuiviDansOdoo(env, orderId, suivi, detail) {
  const bons = await appel(env, "stock.picking", "search_read",
    [[["sale_id", "=", orderId], ["state", "not in", ["cancel"]]], ["id", "name", "state"]],
    { limit: 5 });
  if (!bons || !bons.length) return { ok: false, motif: "aucun bon de livraison" };

  const cible = bons[0];
  const champs = { carrier_tracking_ref: suivi };
  const transporteur = await transporteurRelais(env);
  if (transporteur) champs.carrier_id = transporteur;

  try {
    await appel(env, "stock.picking", "write", [[cible.id], champs], {});
  } catch (e) {
    /* Le transporteur est un confort, le suivi ne l'est pas : si Odoo
     * refuse l'écriture groupée — fiche archivée, règle de validation —
     * on réessaie avec le seul champ qui compte vraiment. */
    try {
      await appel(env, "stock.picking", "write",
        [[cible.id], { carrier_tracking_ref: suivi }], {});
    } catch (e2) {
      return { ok: false, motif: "écriture refusée : " + String(e2 && e2.message).slice(0, 160) };
    }
  }

  // Et une trace lisible dans le fil de discussion, pour NBD.
  try {
    await appel(env, "stock.picking", "message_post",
      [[cible.id]], { body: String(detail || "").slice(0, 1000) });
  } catch (e) { /* la trace est un confort, pas une obligation */ }

  return { ok: true, bon: cible.name };
}
