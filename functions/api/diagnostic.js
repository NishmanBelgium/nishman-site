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

  const [base, portier, vies] = await Promise.all([
    etatBase(env.DB),
    etatPortier(env).catch((e) => ({ ok: false, detail: "Contrôle impossible : " + (e && e.message) })),
    etatVies(env).catch((e) => ({ ok: false, detail: "Contrôle impossible : " + (e && e.message) })),
  ]);

  const liaisons = {
    base_de_donnees: base,
    script_google: portier,
    registre_tva: vies,
  };

  // Ce que la panne empêche concrètement, dit en clair.
  const consequences = [];
  if (!base.ok) consequences.push("Personne ne peut se connecter ni commander.");
  if (!portier.ok) {
    consequences.push("Les prix ne s'affichent pas : le panier montre un total vide.");
    consequences.push("Les devis et les commandes ne partent pas dans Odoo.");
  }
  if (!vies.ok) consequences.push("Les nouveaux clients FR et LU sont facturés avec TVA au lieu de l'exonération.");

  const tout = base.ok && portier.ok && vies.ok;

  return json({
    ok: true,
    tout_va_bien: tout,
    resume: tout
      ? "Les trois liaisons du site répondent normalement."
      : "Une liaison au moins ne répond pas. Voir le détail ci-dessous.",
    liaisons: liaisons,
    consequences: consequences,
    adresse_du_script: adressePortier(env).replace(/\/[^/]{12,}\/exec$/, "/…/exec"),
    date: new Date().toISOString(),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
