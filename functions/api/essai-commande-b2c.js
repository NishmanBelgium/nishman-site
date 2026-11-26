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

   LES TROIS PAYS, DEPUIS LE 26 NOVEMBRE 2026.

   Cet essai ne portait que sur la Belgique : « pays: "BE" » écrit en dur.
   C'est ce qui a laissé la boutique française tomber et rester tombée six
   jours. Le 20 novembre à 18 h 46, la position fiscale « OSS B2C France » a
   été renommée « Intra » dans Odoo ; le site cherche ses positions par nom
   exact, donc plus aucune commande française n'aboutissait. Dix clientes,
   dix-sept tentatives, zéro commande — et tous les contrôles au vert, parce
   qu'ils regardaient la Belgique et que la Belgique allait bien.

   Une panne qui ne touche qu'un pays ne se voit que si on éprouve chaque
   pays. Les trois régimes sont trois chemins distincts dans Odoo : une taxe,
   une position fiscale et un mode de livraison par pays, chacun retrouvé
   par son nom. Chacun peut tomber seul.

   Réservé au compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin, origineSure } from "../_commun.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";
import { calculerB2C } from "../_calcul_b2c.js";
import { catalogue } from "../_boutique.js";
import { creerCommandeB2C } from "../_commande_b2c.js";
import { nettoyerBrouillon } from "../_apres_paiement.js";

const sou = (n) => Math.round(Number(n) * 100) / 100;

/* Les trois pays que la boutique sert. Dans cet ordre : la Belgique
   d'abord, parce qu'un échec dès celle-là désigne une cause commune et non
   un régime particulier. */
const PAYS = ["BE", "FR", "LU"];

/* LE PLAFOND DE SOUS-REQUÊTES, appris à la première exécution.
 *
 * Un cycle complet — chercher la taxe, la position, le mode de livraison,
 * la fiche, créer le devis, le relire, le retirer, vérifier le retrait —
 * coûte une douzaine d'appels à Odoo. Cloudflare en autorise cinquante par
 * invocation. Trois pays × deux quantités, c'est donc le plafond crevé au
 * quatrième cycle : « Too many subrequests by single Worker invocation ».
 *
 * Le piège est qu'un essai qui s'épuise lui-même RESSEMBLE à une panne du
 * site. La première exécution a répondu « ON NE PEUT PAS COMMANDER DEPUIS
 * FR, LU » alors que la France venait de passer son premier cycle sans une
 * anomalie. Un contrôle doit tenir dans son budget, sinon il fabrique les
 * pannes qu'il est censé trouver.
 *
 * D'où deux régimes, qui tiennent tous deux largement sous cinquante :
 *
 *   sans paramètre  — les trois pays, QUATRE articles chacun. « Tout le
 *                     monde peut-il commander ? » C'est la question du
 *                     lundi matin, et quatre articles est la quantité qui
 *                     éprouve le plus : port offert, et c'est là que
 *                     l'ancien calcul dérivait d'un centime.
 *   ?pays=FR        — un seul pays, UN puis QUATRE articles. La question
 *                     qu'on pose quand ce pays-là a bronché.
 */
const QUANTITES_UN_PAYS = [1, 4];
const QUANTITES_BALAYAGE = [4];

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
  // particulier fantôme dans Odoo pour un essai. Elle existe déjà, donc
  // ficheNeeConforme() ne lui écrit rien — un essai ne doit jamais changer
  // la position fiscale d'un compte réel, et surtout pas six fois de suite.
  const identite = {
    email: compte.email,
    prenom: compte.prenom || "Essai",
    nom: compte.nom || "Site",
    telephone: "",
    adresse: compte.adresse || "",
    code_postal: compte.code_postal || "",
    ville: compte.ville || "",
  };

  const demande = String(new URL(request.url).searchParams.get("pays") || "").trim().toUpperCase();
  const aEprouver = PAYS.includes(demande) ? [demande] : PAYS;
  const quantites = aEprouver.length === 1 ? QUANTITES_UN_PAYS : QUANTITES_BALAYAGE;

  let toutVaBien = true;
  const paysEnPanne = [];

  for (const pays of aEprouver) {
    const client = { ...identite, pays };
    let paysOk = true;

    for (const q of quantites) {
      const titre = pays + " · " + q + " article" + (q > 1 ? "s" : "");
      const resultat = calculerB2C({ selection: { [cobaye.ean]: q }, produits, pays });

      const attendu = sou(Number(cobaye.ttc) * q);
      const conforme = resultat.sous_total === attendu;
      if (!conforme) { toutVaBien = false; paysOk = false; }
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
        paysOk = false;
        noter(titre + " — création du devis", false,
          (e && e.code ? "[" + e.code + "] " : "") + String(e && e.message)
          + (e && e.detail ? " — " + JSON.stringify(e.detail) : ""));
        continue;
      }

      // LE POINT DE TOUTE LA MANŒUVRE.
      const concorde = commande.ecart === 0;
      if (!concorde) { toutVaBien = false; paysOk = false; }
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
      if (!supprime) { toutVaBien = false; paysOk = false; }

      if (supprime) {
        try {
          const reste = await appelOdoo(env, "sale.order", "search_count",
            [[["id", "=", commande.id]]], {});
          if (Number(reste) > 0) {
            toutVaBien = false;
            paysOk = false;
            noter(titre + " — vérification du retrait", false,
              "LE DEVIS " + (commande.nom || commande.id) + " EST ENCORE DANS ODOO");
          }
        } catch (e) {
          noter(titre + " — vérification du retrait", false,
            "impossible de vérifier : " + String(e && e.message));
        }
      }
    }

    if (!paysOk) paysEnPanne.push(pays);
  }

  /* Le résumé nomme les pays en panne. C'est la phrase que lira quelqu'un
     qui ouvre le rapport en vitesse, et « un contrôle au moins ne passe
     pas » ne lui aurait pas appris que la France était coupée. */
  return json({
    ok: toutVaBien,
    pays_eprouves: aEprouver,
    quantites,
    pays_en_panne: paysEnPanne,
    resume: toutVaBien
      ? (aEprouver.length === 1
          ? "Le " + aEprouver[0] + " peut commander : prix affiché respecté et "
            + "Odoo au même centime, pour 1 et 4 articles."
          : "Les trois pays peuvent commander : prix affiché respecté et Odoo "
            + "au même centime pour BE, FR et LU.")
      : "ON NE PEUT PAS COMMANDER DEPUIS : " + paysEnPanne.join(", ")
        + ". Voir le détail — et si celui-ci parle de « subrequests », c'est "
        + "l'essai qui s'épuise, pas le site : reprendre pays par pays avec "
        + "?pays=FR.",
    etapes,
  }, 200);
}
