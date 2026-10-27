/* ==========================================================================
   DIAGNOSTIC — l'état des trois liaisons du site, en une page.

   Le 26 octobre 2026, les prix ne s'affichaient plus et les devis ne
   partaient plus. La cause était unique — le code interne de Cloudflare ne
   correspondait plus à celui du script Google — mais aucune page ne le
   disait : la boutique annonçait un total vide, le devis « vérifiez votre
   connexion ». Il a fallu interroger les points d'entrée un par un.

   Cette page fait ce travail toute seule, en lecture seule : elle ne crée
   aucun devis, n'écrit rien, ne déclenche aucun envoi.

   Elle est réservée au compte de NBD : l'état de la configuration n'a pas
   à être lisible par un client. Aucun secret n'y figure — seulement la
   longueur du code et la présence d'espaces autour, ce qui suffit à
   repérer un copier-coller malheureux sans révéler la valeur.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { interrogerPortier, codePortier, adressePortier } from "../_portier.js";
import { verifier as verifierTva } from "../_vies.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";
import { configureMollie, modeMollie, appelMollie } from "../_mollie.js";

const ADMIN_DEFAUT = "contact@nishman.be";

function etatBase(db) {
  if (!db) return { ok: false, detail: "La base D1 n'est pas reliée à ce déploiement." };
  return db.prepare("SELECT COUNT(*) AS n FROM comptes").first()
    .then((r) => ({ ok: true, detail: (r && r.n != null ? r.n : "?") + " compte(s) enregistré(s)." }))
    .catch((e) => ({ ok: false, detail: "La base répond mal : " + (e && e.message ? e.message : "erreur") }));
}

async function etatPortier(env) {
  const brut = String((env && env.PORTIER_CODE) || "");
  const code = codePortier(env);

  if (!code) {
    return {
      ok: false,
      detail: "Le code interne (PORTIER_CODE) n'est pas renseigné chez Cloudflare.",
      longueur: 0, espaces_autour: false,
    };
  }

  const info = { longueur: code.length, espaces_autour: brut !== code };
  const appel = await interrogerPortier(env, "action=unlock&callback=p");

  if (appel.etat === "code") {
    return {
      ...info, ok: false,
      detail: "Le script Google a répondu, et a refusé le code interne. "
            + "La valeur de PORTIER_CODE chez Cloudflare et celle de "
            + "CODE_INTERNE dans le script ne sont pas identiques.",
    };
  }
  if (appel.etat !== "ok") {
    return {
      ...info, ok: false,
      detail: "Le script Google n'a pas pu être joint (" + (appel.motif || "cause inconnue") + ").",
    };
  }

  const prix = appel.donnees && appel.donnees.prices;
  const nb = prix ? Object.keys(prix).length : 0;
  if (!nb) {
    return { ...info, ok: false, detail: "Le script a répondu et accepté le code, mais n'a renvoyé aucun prix." };
  }
  return { ...info, ok: true, detail: "Code accepté, " + nb + " tarif(s) reçu(s)." };
}

async function etatVies(env) {
  const nous = String(env.TVA_NBD || "BE0817750283").trim();
  const r = await verifierTva(nous, "BE", nous);
  if (r.statut === "valide") return { ok: true, detail: "Le registre européen répond et confirme " + nous + "." };
  if (r.statut === "indisponible") {
    return { ok: false, detail: "Le registre européen n'a pas répondu (" + (r.motif || "cause inconnue")
           + "). Les clients français et luxembourgeois gardent leur exonération acquise ; "
           + "les nouveaux comptes sont facturés avec TVA jusqu'au rétablissement." };
  }
  return { ok: false, detail: "Réponse inattendue du registre européen pour notre propre numéro (" + r.statut + ")." };
}

/**
 * Odoo en direct. C'est par ce chemin que passeront les commandes payées,
 * sans le détour par le script Google : il doit répondre avant qu'on s'y
 * appuie. Lecture seule — un comptage de fiches, rien de plus.
 */
async function etatOdoo(env) {
  if (!configureOdoo(env)) {
    return { ok: false, detail: "Les identifiants Odoo ne sont pas tous renseignés chez Cloudflare "
           + "(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_KEY)." };
  }
  try {
    const n = await appelOdoo(env, "res.partner", "search_count", [[["is_company", "=", true]]], {});
    return { ok: true, detail: "Odoo répond en direct : " + n + " société(s) au carnet d'adresses." };
  } catch (e) {
    return { ok: false, detail: "Odoo n'a pas répondu correctement : " + String(e && e.message || "erreur").slice(0, 200) };
  }
}

/**
 * Mollie. On ne montre jamais la clé — seulement sa longueur, la présence
 * d'espaces autour (le copier-coller malheureux), et surtout le monde dans
 * lequel elle nous place. Le contrôle est une simple lecture des moyens de
 * paiement : aucun paiement n'est créé.
 */
async function etatMollie(env) {
  const brut = String((env && env.MOLLIE_KEY) || "");
  const cle = brut.trim();
  const mode = modeMollie(env);

  if (!configureMollie(env)) {
    return { ok: false, mode: "absente", longueur: 0, espaces_autour: false,
             detail: "La clé Mollie (MOLLIE_KEY) n'est pas renseignée chez Cloudflare." };
  }

  const info = { mode, longueur: cle.length, espaces_autour: brut !== cle };

  if (mode === "inconnu") {
    return { ...info, ok: false,
             detail: "La valeur enregistrée ne ressemble pas à une clé Mollie : "
                   + "elle devrait commencer par « test_ » ou « live_ »." };
  }

  try {
    const r = await appelMollie(env, "/methods");
    const moyens = (r && r._embedded && Array.isArray(r._embedded.methods)) ? r._embedded.methods : [];
    const noms = moyens.map((m) => m && m.description).filter(Boolean);
    return { ...info, ok: true, moyens: noms,
             detail: "Mollie accepte la clé. " + moyens.length + " moyen(s) de paiement actif(s)"
                   + (noms.length ? " : " + noms.join(", ") : "") + "." };
  } catch (e) {
    if (e && e.statut === 401) {
      return { ...info, ok: false, detail: "Mollie refuse cette clé. Vérifiez qu'elle a été copiée en entier." };
    }
    return { ...info, ok: false,
             detail: "Mollie n'a pas pu être interrogé : " + String(e && e.message || "erreur").slice(0, 200) };
  }
}

export async function onRequestGet({ request, env }) {
  const compte = env.DB ? await compteConnecte(request, env.DB) : null;
  // EMAIL_ADMIN accepte plusieurs adresses séparées par des virgules :
  // vous pouvez vous ajouter une seconde adresse sans toucher au code.
  const admins = String(env.EMAIL_ADMIN || ADMIN_DEFAUT)
    .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const moi = String((compte && compte.email) || "").trim().toLowerCase();
  if (!moi || admins.indexOf(moi) === -1) {
    return erreur("Page réservée.", 404, "reservee");
  }

  const impossible = (e) => ({ ok: false, detail: "Contrôle impossible : " + (e && e.message) });

  const [base, portier, vies, odoo, mollie] = await Promise.all([
    etatBase(env.DB),
    etatPortier(env).catch(impossible),
    etatVies(env).catch(impossible),
    etatOdoo(env).catch(impossible),
    etatMollie(env).catch(impossible),
  ]);

  const liaisons = {
    base_de_donnees: base,
    script_google: portier,
    registre_tva: vies,
    odoo_direct: odoo,
    mollie: mollie,
  };

  // Ce que la panne empêche concrètement, dit en clair.
  const consequences = [];
  if (!base.ok) consequences.push("Personne ne peut se connecter ni commander.");
  if (!portier.ok) {
    consequences.push("Les prix ne s'affichent pas : le panier montre un total vide.");
    consequences.push("Les devis et les commandes ne partent pas dans Odoo.");
  }
  if (!vies.ok) consequences.push("Les nouveaux clients FR et LU sont facturés avec TVA au lieu de l'exonération.");
  if (!odoo.ok) consequences.push("Le site ne peut pas créer de commande directement dans Odoo.");
  if (!mollie.ok) consequences.push("Aucun paiement en ligne ne peut être encaissé.");

  // Un avertissement, pas une panne : la clé réelle fonctionne parfaitement,
  // mais elle déplace de l'argent. Tant que la chaîne n'est pas éprouvée de
  // bout en bout, elle n'a rien à faire là.
  const alertes = [];
  if (mollie.ok && mollie.mode === "reel") {
    alertes.push("La clé Mollie installée est la clé RÉELLE : tout paiement déclenché depuis le site "
               + "débitera vraiment le client. Tant que la chaîne n'a pas été éprouvée, "
               + "remplacez-la par la clé de test (préfixe « test_ »).");
  }

  const tout = base.ok && portier.ok && vies.ok && odoo.ok && mollie.ok;

  return json({
    ok: true,
    tout_va_bien: tout,
    resume: tout
      ? "Les cinq liaisons du site répondent normalement."
      : "Une liaison au moins ne répond pas. Voir le détail ci-dessous.",
    liaisons: liaisons,
    consequences: consequences,
    alertes: alertes,
    // Les NOMS des variables que ce déploiement reçoit réellement. Jamais
    // les valeurs. Quand une variable est bien posée chez Cloudflare mais
    // que le site jure ne pas la voir, c'est la seule façon de trancher
    // entre « mal nommée », « mauvais environnement » et « pas déployée ».
    variables_vues: Object.keys(env || {}).sort(),
    adresse_du_script: adressePortier(env).replace(/\/[^/]{12,}\/exec$/, "/…/exec"),
    date: new Date().toISOString(),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
