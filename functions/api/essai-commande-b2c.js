/* ==========================================================================
   ESSAI DE COMMANDE GRAND PUBLIC — Odoo tombe-t-il sur le même centime ?

   Le pendant de essai-commande.js, mais pour la boutique. Il existe pour
   une raison précise : les prix affichés sont TTC, et c'est le prix affiché
   qui engage. Quatre articles à 7,90 € doivent coûter 31,60 €, pas 31,61 €.

   Ce chiffre ne se vérifie pas en lisant le code. Il faut qu'Odoo crée
   vraiment la commande, avec sa position fiscale et sa taxe, et qu'on relise
   le total qu'il en a tiré. Alors on essaie — puis on efface.

   Deux paniers sont éprouvés, parce qu'ils ne suivent pas le même chemin :
   un article (le port s'applique) et quatre (le port est offert, et c'est
   justement la quantité où l'ancien calcul dérivait d'un centime).

   Réservé au compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin, origineSure } from "../_commun.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";
import { calculerB2C } from "../_calcul_b2c.js";
import { catalogue } from "../_boutique.js";
import { creerCommandeB2C } from "../_commande_b2c.js";
import { nettoyerBrouillon } from "../_apres_paiement.js";

const sou = (n) => Math.round(Number(n) * 100) / 100;

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!origineSure(request)) {
    return erreur("Ouvrez cette adresse directement, pas depuis un lien extérieur.", 403, "origine");
  }
  if (!configureOdoo(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

  const etapes = [];
  const noter = (quoi, ok, detail) => etapes.push({ etape: quoi, ok, detail });

  let produits;
  try {
    produits = await catalogue(request);
    noter("catalogue", true, produits.length + " références");
  } catch (e) {
    noter("catalogue", false, String(e && e.message));
    return json({ ok: false, etapes }, 200);
  }

  // La référence cobaye : la moins chère qui soit réellement achetable.
  const achetables = produits
    .filter((p) => p && !p.bientot && /^\d{8,14}$/.test(String(p.ean || "")) && Number(p.ttc) > 0)
    .sort((a, b) => Number(a.ttc) - Number(b.ttc));
  if (!achetables.length) {
    noter("choix d'une référence", false, "aucune référence achetable");
    return json({ ok: false, etapes }, 200);
  }
  const cobaye = achetables[0];
  noter("choix d'une référence", true,
    (cobaye.nom_court || cobaye.nom) + " à " + Number(cobaye.ttc).toFixed(2) + " € TTC");

  // La fiche client est celle du compte connecté : on ne crée pas un
  // particulier fantôme dans Odoo pour un essai.
  const client = {
    email: compte.email,
    prenom: compte.prenom || "Essai",
    nom: compte.nom || "Site",
    telephone: "",
    adresse: compte.adresse || "",
    code_postal: compte.code_postal || "",
    ville: compte.ville || "",
    pays: "BE",
  };

  let toutVaBien = true;

  for (const q of [1, 4]) {
    const titre = q + " article" + (q > 1 ? "s" : "");
    const resultat = calculerB2C({ selection: { [cobaye.ean]: q }, produits, pays: "BE" });

    const attendu = sou(Number(cobaye.ttc) * q);
    const conforme = resultat.sous_total === attendu;
    if (!conforme) toutVaBien = false;
    noter(titre + " — prix affiché respecté", conforme,
      q + " × " + Number(cobaye.ttc).toFixed(2) + " = " + attendu.toFixed(2) + " €"
      + (conforme ? "" : ", mais le panier annonce " + resultat.sous_total.toFixed(2) + " €")
      + " · port " + resultat.port.toFixed(2) + " € · total " + resultat.total.toFixed(2) + " €");

    let commande = null;
    try {
      commande = await creerCommandeB2C(env, {
        client, relais: null, resultat, ref: "ESSAI-BOUTIQUE",
      });
      noter(titre + " — création du devis", true,
        "devis " + (commande.nom || commande.id) + " créé en brouillon");
    } catch (e) {
      toutVaBien = false;
      noter(titre + " — création du devis", false,
        (e && e.code ? "[" + e.code + "] " : "") + String(e && e.message)
        + (e && e.detail ? " — " + JSON.stringify(e.detail) : ""));
      continue;
    }

    // LE POINT DE TOUTE LA MANŒUVRE.
    const concorde = commande.ecart === 0;
    if (!concorde) toutVaBien = false;
    noter(titre + " — Odoo annonce le même total", concorde,
      concorde
        ? "notre panier et la commande Odoo disent tous deux "
          + resultat.total.toFixed(2) + " € TTC"
        : "ÉCART DE " + commande.ecart + " € — notre panier dit "
          + resultat.total.toFixed(2) + " €, Odoo dit " + commande.total_odoo + " €");

    // Le ménage, qu'on ne saute jamais.
    let supprime = false;
    try {
      const r = await nettoyerBrouillon(env, commande.id);
      supprime = r.fait;
      noter(titre + " — retrait du devis", r.fait,
        r.fait ? r.motif + " — aucune trace laissée"
               : "LE DEVIS " + (commande.nom || commande.id) + " EST RESTÉ DANS ODOO : " + r.motif);
    } catch (e) {
      noter(titre + " — retrait du devis", false,
        "LE DEVIS " + (commande.nom || commande.id) + " EST RESTÉ DANS ODOO : " + String(e && e.message));
    }
    if (!supprime) toutVaBien = false;

    if (supprime) {
      try {
        const reste = await appelOdoo(env, "sale.order", "search_count",
          [[["id", "=", commande.id]]], {});
        if (Number(reste) > 0) {
          toutVaBien = false;
          noter(titre + " — vérification du retrait", false,
            "LE DEVIS " + (commande.nom || commande.id) + " EST ENCORE DANS ODOO");
        }
      } catch (e) {
        noter(titre + " — vérification du retrait", false,
          "impossible de vérifier : " + String(e && e.message));
      }
    }
  }

  return json({
    ok: toutVaBien,
    resume: toutVaBien
      ? "Le prix affiché est respecté et Odoo tombe sur le même centime."
      : "Un contrôle au moins ne passe pas. Voir le détail.",
    etapes,
  }, 200);
}
