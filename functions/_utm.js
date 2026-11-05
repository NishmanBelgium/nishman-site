/* ==========================================================================
   L'ORIGINE D'UNE COMMANDE — de l'annonce cliquée jusqu'à la ligne Odoo.

   Pourquoi ce fichier existe.

   Le 5 novembre 2026, personne ne savait ce que la publicité rapportait.
   Près de deux mille euros étaient partis chez Meta, et la seule chose
   qu'on pouvait en dire était « cent trois formulaires remplis » — pas
   un euro de chiffre d'affaires rattaché à quoi que ce soit.

   Meta sait compter ses propres clics, mais il ne verra jamais une
   facture. Et il ne compte que les visiteurs qui ont accepté le bandeau
   de consentement, donc il sous-estimera toujours ce qu'il rapporte.
   L'inverse est vrai d'Odoo : il connaît chaque euro facturé et ignore
   d'où vient le client.

   Ce module fait le pont, et du bon côté : l'origine est écrite sur la
   COMMANDE, pas sur la personne. C'est ce détail qui rend la mesure à la
   fois juste et tranquille — un visiteur qui refuse le pixel est quand
   même attribué, parce qu'on n'a rien eu besoin de déposer sur son
   appareil pour y arriver ; il a simplement cliqué sur un lien qui
   portait son étiquette.

   Odoo sait déjà faire ça : le module UTM y est installé et `sale.order`
   porte `source_id`, `medium_id` et `campaign_id`. Personne ne les
   remplissait. Désormais le site les remplit.

   Trois décisions qui méritent d'être écrites.

   PREMIER CLIC, PAS LE DERNIER. Un barbier découvre NISHMAN par une
   publicité, revient trois semaines plus tard en tapant « nishman » dans
   Google, et commande. En dernier clic, c'est Google qui gagne et la
   publicité ne sert à rien — ce qui est faux : sans elle il n'aurait
   jamais tapé ce nom. On garde donc la première origine de la session.

   ON CRÉE LES ÉTIQUETTES MANQUANTES. Les campagnes changent de nom tous
   les mois. Une liste fermée obligerait à modifier le code à chaque
   campagne, et surtout : une campagne oubliée serait silencieusement
   rattachée à rien. Un nom inconnu crée donc son étiquette.

   UNE PANNE D'ÉTIQUETTE NE BLOQUE JAMAIS UNE COMMANDE. Tout ici est
   enveloppé : si Odoo refuse, si le réseau tombe, si un nom est
   aberrant, la commande part sans origine. Mieux vaut une commande mal
   étiquetée qu'une commande perdue — et c'est exactement le genre de
   code qu'on oublie de protéger parce qu'il « ne fait que du
   marquage ».
   ========================================================================== */

import { appel } from "./_odoo.js";

/* Odoo apparie ces étiquettes par leur nom. Sans normalisation, « Meta »,
   « meta » et « meta  » deviendraient trois sources distinctes et le
   rapport serait illisible au bout de deux mois. */
const LONGUEUR_MAX = 60;

export function nettoyer(brut) {
  const s = String(brut == null ? "" : brut)
    .trim()
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, "")  // caractères de contrôle
    .replace(/\s+/g, " ")
    .slice(0, LONGUEUR_MAX);
  /* Un paramètre d'URL est rempli par n'importe qui : on n'accepte que
     ce dont une étiquette a besoin. Le reste est jeté, pas échappé —
     il n'y a aucune raison légitime d'avoir un chevron dans un nom de
     campagne. */
  const propre = s.replace(/[^a-z0-9 ._\-+/]/g, "");
  return propre.length >= 2 ? propre : "";
}

/* Le cache vit le temps de l'isolat Cloudflare. Il évite de réinterroger
   Odoo pour « meta » à chaque commande, sans jamais être une source de
   vérité : au pire il est vide et on relit. */
const connus = new Map();

async function etiquette(env, modele, nom) {
  if (!nom) return null;
  const cle = modele + "::" + nom;
  if (connus.has(cle)) return connus.get(cle);

  /* Odoo n'impose pas la casse sur ces noms : on cherche sans la
     distinguer, pour tomber sur « Google » quand on cherche « google »
     plutôt que d'en créer un doublon. */
  let id = null;
  const trouves = await appel(env, modele, "search_read",
    [[["name", "=ilike", nom]], ["id"]], { limit: 1 });
  if (trouves && trouves[0]) id = trouves[0].id;

  if (!id) {
    try {
      id = await appel(env, modele, "create", [{ name: nom }], {});
    } catch (e) {
      /* Deux commandes simultanées portant une campagne neuve peuvent
         la créer en même temps ; la seconde se fait refuser. Ce n'est
         pas une erreur, c'est une course — on relit. */
      const relu = await appel(env, modele, "search_read",
        [[["name", "=ilike", nom]], ["id"]], { limit: 1 });
      id = relu && relu[0] ? relu[0].id : null;
    }
  }

  if (id) connus.set(cle, id);
  return id;
}

/* Rend les trois identifiants prêts à poser sur une commande Odoo.
   Ne lève jamais : un appel qui échoue rend simplement moins de champs. */
export async function champsOrigine(env, origine) {
  const o = origine || {};
  const source = nettoyer(o.source);
  const medium = nettoyer(o.medium);
  const campagne = nettoyer(o.campagne || o.campaign);
  if (!source && !medium && !campagne) return {};

  const champs = {};
  try {
    const [s, m, c] = await Promise.all([
      source ? etiquette(env, "utm.source", source) : null,
      medium ? etiquette(env, "utm.medium", medium) : null,
      campagne ? etiquette(env, "utm.campaign", campagne) : null,
    ]);
    if (s) champs.source_id = s;
    if (m) champs.medium_id = m;
    if (c) champs.campaign_id = c;
  } catch (e) {
    /* Volontairement muet : voir l'en-tête. Une commande non étiquetée
       se rattrape à la main, une commande non créée se perd. */
    return {};
  }
  return champs;
}

/* Ce que le navigateur envoie n'est pas digne de confiance : on ne garde
   que les trois clés attendues, chacune nettoyée, et rien d'autre. */
export function origineDuCorps(corps) {
  const u = (corps && corps.origine) || {};
  const source = nettoyer(u.source);
  const medium = nettoyer(u.medium);
  const campagne = nettoyer(u.campagne);
  if (!source && !medium && !campagne) return null;
  return { source, medium, campagne };
}
