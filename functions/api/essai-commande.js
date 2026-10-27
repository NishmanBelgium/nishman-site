/* ==========================================================================
   ESSAI DE COMMANDE — éprouver la création dans Odoo sans rien y laisser.

   Avant de brancher le paiement, il faut savoir si le site sait créer une
   commande chez NBD : retrouver le client, reconnaître les produits, poser
   la bonne position fiscale, et obtenir un total qui corresponde au nôtre.
   Le seul moyen honnête de le savoir est d'essayer pour de vrai.

   Alors on essaie, et on efface. Le devis est créé en brouillon, relu,
   puis supprimé dans la foulée. Si la suppression échoue, la page le dit
   et donne le numéro : un brouillon oublié dans Odoo doit être signalé,
   pas tu.

   Réservé au compte de NBD, en lecture pour tout le monde d'autre.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";
import { calculer } from "../_calcul.js";
import { catalogue, tableDePrix } from "../_tarifs.js";
import { creerCommandeOdoo } from "../_commande_odoo.js";
import { nettoyerBrouillon } from "../_apres_paiement.js";

const ADMIN_DEFAUT = "contact@nishman.be";

export async function onRequestGet({ request, env }) {
  const compte = env.DB ? await compteConnecte(request, env.DB) : null;
  const admins = String(env.EMAIL_ADMIN || ADMIN_DEFAUT)
    .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const moi = String((compte && compte.email) || "").trim().toLowerCase();
  if (!moi || admins.indexOf(moi) === -1) return erreur("Page réservée.", 404, "reservee");

  if (!configureOdoo(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

  const etapes = [];
  const noter = (quoi, ok, detail) => etapes.push({ etape: quoi, ok, detail });

  // 1) De quoi composer un panier d'essai : la référence la moins chère du
  //    catalogue, en un seul exemplaire. Le montant importe peu ; ce qui
  //    compte est que la chaîne aille jusqu'au bout.
  let produits, prix;
  try {
    [produits, prix] = await Promise.all([catalogue(request), tableDePrix(env)]);
    noter("catalogue et tarifs", true, produits.length + " références, " + Object.keys(prix).length + " tarifs");
  } catch (e) {
    noter("catalogue et tarifs", false, String(e && e.message));
    return json({ ok: false, etapes }, 200);
  }

  const candidats = produits
    .filter((p) => p && /^\d{8,14}$/.test(String(p.ean || "")) && prix[p.ean] > 0)
    .sort((a, b) => prix[a.ean] - prix[b.ean]);
  if (!candidats.length) {
    noter("choix d'une référence", false, "aucune référence tarifée exploitable");
    return json({ ok: false, etapes }, 200);
  }
  const cobaye = candidats[0];
  noter("choix d'une référence", true, cobaye.name + " (" + cobaye.ean + ") à " + prix[cobaye.ean] + " € HT");

  // 2) Le calcul, par le même chemin qu'une vraie commande.
  const resultat = calculer({
    selection: { [cobaye.ean]: { u: 1, b: 0 } },
    produits, prix,
    pays: compte.pays || "BE",
    tvaValide: !!compte.tva_valide,
    mode: "retrait",           // pas de port : on éprouve la commande, pas la livraison
    promo: "",
  });
  if (!resultat.lignes.length) {
    noter("calcul", false, "la ligne a été écartée");
    return json({ ok: false, etapes }, 200);
  }
  noter("calcul", true, "total HT " + resultat.marchandise + " €, régime " + resultat.regime);

  // 3) La création.
  let commande = null;
  try {
    commande = await creerCommandeOdoo(env, {
      compte,
      resultat,
      livraison: null,
      ref: "ESSAI-SITE",
      tva: { statut: compte.tva_statut || "", preuve: compte.tva_preuve || "" },
    });
    noter("client Odoo", true,
      (commande.client.cree ? "fiche créée : " : "fiche retrouvée : ") + commande.client.nom);
    noter("création du devis", true, "devis " + (commande.nom || commande.id) + " créé en brouillon");
  } catch (e) {
    noter("création du devis", false,
      (e && e.code ? "[" + e.code + "] " : "") + String(e && e.message)
      + (e && e.detail ? " — " + JSON.stringify(e.detail) : ""));
    return json({ ok: false, etapes }, 200);
  }

  // 4) La concordance des montants.
  const concorde = commande.ecart === 0;
  noter("concordance des montants", concorde,
    concorde
      ? "Odoo annonce le même total hors taxes que nous : " + commande.montant_odoo + " €"
      : "écart de " + commande.ecart + " € entre notre calcul et celui d'Odoo");

  // 5) Le ménage. C'est la partie qu'on ne saute jamais.
  //
  //    Et on le fait par la même fonction que celle qui nettoie un paiement
  //    abandonné : ce banc d'essai vérifie donc aussi, à chaque passage, que
  //    le site sait retirer un devis sans paiement. C'est du code qui ne
  //    tourne normalement que sur un panier abandonné — autrement dit, du
  //    code que personne ne regarde jamais tourner. Autant qu'il soit
  //    exercé ici, sur un devis qui n'intéresse personne.
  let supprime = false;
  try {
    const r = await nettoyerBrouillon(env, commande.id);
    supprime = r.fait;
    if (r.fait) noter("retrait du devis d'essai", true, r.motif + " — aucune trace laissée dans Odoo");
    else {
      noter("retrait du devis d'essai", false,
        "LE DEVIS " + (commande.nom || commande.id) + " EST RESTÉ DANS ODOO, à supprimer à la main : " + r.motif);
    }
  } catch (e) {
    noter("retrait du devis d'essai", false,
      "LE DEVIS " + (commande.nom || commande.id) + " EST RESTÉ DANS ODOO, à supprimer à la main : "
      + String(e && e.message));
  }

  // On vérifie que la suppression a bien eu lieu, au lieu de la croire : un
  // appel Odoo qui ne lève pas d'erreur n'est pas une preuve d'effet.
  if (supprime) {
    try {
      const reste = await appelOdoo(env, "sale.order", "search_count", [[["id", "=", commande.id]]], {});
      if (Number(reste) > 0) {
        noter("vérification du retrait", false,
          "LE DEVIS " + (commande.nom || commande.id) + " EST ENCORE DANS ODOO malgré la suppression annoncée");
        supprime = false;
      } else {
        noter("vérification du retrait", true, "Odoo ne connaît plus cette commande");
      }
    } catch (e) {
      noter("vérification du retrait", false, "impossible de vérifier : " + String(e && e.message));
    }
  }

  const tout = etapes.every((e) => e.ok);
  return json({
    ok: true,
    tout_va_bien: tout,
    resume: tout
      ? "Le site sait créer une commande dans Odoo, et le devis d'essai a été supprimé."
      : "La chaîne s'arrête quelque part. Voir les étapes.",
    etapes,
    devis_supprime: supprime,
    date: new Date().toISOString(),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
