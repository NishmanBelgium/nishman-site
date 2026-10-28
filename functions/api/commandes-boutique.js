/* ==========================================================================
   COMMANDES BOUTIQUE — ce que la chaîne a fait, et ce qui l'a arrêtée.

   Il manquait une fenêtre. Quand la suite après paiement s'interrompt, elle
   écrit soigneusement pourquoi dans le registre — et personne ne pouvait
   lire cette note. Côté professionnel, /api/paiement la rend au client
   connecté ; côté boutique, le client n'a pas de compte, et la page
   publique ne lui renvoie délibérément pas les détails internes.

   Résultat : une commande dont l'étiquette échoue laissait un bon de
   livraison vide dans Odoo et aucune explication nulle part. On cherchait
   dans le mauvais fichier.

   Cette page-ci est la fenêtre manquante, réservée à NBD. Elle montre les
   dernières commandes de la boutique avec leur état, l'étape atteinte, la
   note laissée par la chaîne, et le numéro de suivi quand il existe.
   ========================================================================== */

import { json, erreur, compteAdmin, origineSure } from "../_commun.js";
import { preparerTable, ETAPES, lireParRef, noterEtape,
         prendreLaMain, rendreLaMain, lire } from "../_paiements.js";
import { poursuivre } from "../_apres_paiement.js";
import { configure as configureOdoo } from "../_odoo.js";
import { envoyerConfirmation } from "../_confirmation.js";


/* Ce que chaque étape veut dire, en français et sans jargon. */
const SENS = {
  rien: "paiement enregistré, rien d'autre n'a encore été fait",
  confirmee: "commande confirmée dans Odoo",
  facturee: "facture émise et comptabilisée",
  lettree: "paiement lettré sur la facture",
  envoyee: "facture envoyée au client",
  expediee: "étiquette traitée",
  fini: "terminé",
  abandon: "paiement abandonné, devis retiré",
};

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  const url = new URL(request.url);
  const combien = Math.min(50, Math.max(1, Number(url.searchParams.get("n")) || 15));
  const ref = String(url.searchParams.get("ref") || "").trim();
  const retenter = String(url.searchParams.get("retenter") || "").trim();
  const renvoyer = String(url.searchParams.get("confirmation") || "").trim();

  try { await preparerTable(env.DB); }
  catch (e) { return erreur("Registre indisponible.", 503, "registre"); }

  /* Reprendre une commande dont l'étiquette a échoué.
   *
   * L'échec d'étiquette ne bloque pas la chaîne — c'est voulu — mais il la
   * laisse donc à « fini » sans étiquette, et rien ne la reprendra jamais.
   * Ici on la ramène d'un cran en arrière, à « envoyee », et la suite
   * refait le dernier geste. Les étapes d'avant ne sont pas rejouées :
   * elles vérifient toutes l'état réel dans Odoo avant d'agir, donc une
   * facture déjà émise ne sera pas émise deux fois.
   */

  /* Renvoyer la confirmation consommateur.
   *
   * Celle qui porte les conditions de vente et le formulaire de
   * rétractation. Un client qui l'a supprimée a le droit de la
   * redemander, et NBD doit pouvoir prouver qu'elle est partie. On force
   * l'envoi : ici, c'est voulu. */
  // Les deux gestes qui suivent agissent (un courriel, une étiquette
  // payante) : ils ne partent pas sur un lien venu d'un autre site.
  if ((renvoyer || retenter) && !origineSure(request)) {
    return erreur("Ouvrez cette adresse directement, pas depuis un lien extérieur.", 403, "origine");
  }

  if (renvoyer) {
    const p = await lireParRef(env.DB, renvoyer, 0);
    if (!p) return erreur("Commande introuvable.", 404, "inconnue");
    if (!p.client) {
      return json({ ok: false, message: "Cette commande n'est pas une commande de la boutique : "
        + "la confirmation consommateur ne la concerne pas." });
    }
    if (!configureOdoo(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

    const journal = [];
    try {
      await envoyerConfirmation(env, p, journal, { forcer: true });
    } catch (e) {
      return json({ ok: false, journal,
        message: "La confirmation n'a pas pu être envoyée : " + String(e && e.message).slice(0, 240) });
    }
    return json({ ok: true, journal,
      message: "Confirmation renvoyée : conditions de vente et formulaire de rétractation inclus." });
  }

  if (retenter) {
    const p = await lireParRef(env.DB, retenter, 0);
    if (!p) return erreur("Commande introuvable.", 404, "inconnue");
    if (String(p.statut) !== "paye") {
      return json({ ok: false, message: "Cette commande n'est pas payée : rien à reprendre." });
    }
    if (p.suivi) {
      return json({ ok: false, message: "Cette commande a déjà un suivi : " + p.suivi });
    }
    if (!configureOdoo(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

    await noterEtape(env.DB, p.mollie_id, "envoyee",
      { note: "Reprise manuelle de l'étiquette, demandée depuis le site." });

    let aLaMain = false;
    try { aLaMain = await prendreLaMain(env.DB, p.mollie_id); } catch (e) {}
    if (!aLaMain) {
      return json({ ok: false, message: "Une autre reprise est déjà en cours. Réessayez dans deux minutes." });
    }

    let resultat;
    try {
      const frais = await lire(env.DB, p.mollie_id);
      resultat = await poursuivre(env, env.DB, { ...(frais || p), statut: "paye" });
    } catch (e) {
      resultat = { erreur: String(e && e.message).slice(0, 240), journal: [] };
    } finally {
      try { await rendreLaMain(env.DB, p.mollie_id); } catch (e2) {}
    }

    const apres = await lire(env.DB, p.mollie_id);
    return json({
      ok: true,
      reprise: retenter,
      suivi: (apres && apres.suivi) || "",
      note: (apres && apres.note) || "",
      journal: (resultat && resultat.journal) || [],
      message: (apres && apres.suivi)
        ? "Étiquette créée, suivi " + apres.suivi
        : "L'étiquette n'a toujours pas pu être créée. La note dit pourquoi.",
    });
  }

  let lignes;
  try {
    const r = ref
      ? await env.DB.prepare("SELECT * FROM paiements WHERE ref = ? LIMIT 1").bind(ref).all()
      : await env.DB.prepare(
          "SELECT * FROM paiements ORDER BY cree_le DESC LIMIT ?").bind(combien).all();
    lignes = (r && r.results) || [];
  } catch (e) {
    return json({ ok: false, souci: String(e && e.message).slice(0, 240) }, 500);
  }

  const commandes = lignes.map((p) => {
    const etape = String(p.etape || "rien");
    // Une suite interrompue se reconnaît à deux signes : une note qui le dit,
    // et une étape qui n'est pas terminale.
    const interrompue = /interrompue|NON CRÉÉE|DIVERGENT/i.test(String(p.note || ""));
    return {
      ref: p.ref,
      boutique: Number(p.compte_id) === 0,
      commande_odoo: p.odoo_nom || "",
      montant: p.montant + " " + (p.devise || "EUR"),
      statut: p.statut,
      etape,
      etape_lisible: SENS[etape] || etape,
      terminee: etape === "fini",
      interrompue,
      facture: p.facture_nom || "",
      suivi: p.suivi || "",
      point_relais: p.relais_id || null,
      // La note est l'essentiel : c'est là que la chaîne explique ce qui
      // l'a arrêtée, en toutes lettres.
      note: p.note || "",
      cree_le: p.cree_le,
      vu_le: p.vu_le,
    };
  });

  const bloquees = commandes.filter((c) => c.interrompue || (c.statut === "paye" && !c.terminee));

  return json({
    ok: true,
    nombre: commandes.length,
    etapes_possibles: ETAPES,
    a_regarder: bloquees.length
      ? bloquees.length + " commande(s) payée(s) dont la suite n'est pas allée au bout. "
        + "Leur note dit pourquoi."
      : "Aucune commande bloquée.",
    commandes,
    date: new Date().toISOString(),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
