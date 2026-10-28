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

import { json, erreur, compteConnecte } from "../_commun.js";
import { preparerTable, ETAPES } from "../_paiements.js";

const ADMIN_DEFAUT = "contact@nishman.be";

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
  const compte = env.DB ? await compteConnecte(request, env.DB) : null;
  const admins = String(env.EMAIL_ADMIN || ADMIN_DEFAUT)
    .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const moi = String((compte && compte.email) || "").trim().toLowerCase();
  if (!moi || admins.indexOf(moi) === -1) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  const url = new URL(request.url);
  const combien = Math.min(50, Math.max(1, Number(url.searchParams.get("n")) || 15));
  const ref = String(url.searchParams.get("ref") || "").trim();

  try { await preparerTable(env.DB); }
  catch (e) { return erreur("Registre indisponible.", 503, "registre"); }

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
