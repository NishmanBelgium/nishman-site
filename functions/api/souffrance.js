/* ==========================================================================
   SOUFFRANCE — reprendre les chaînes interrompues, sans attendre le client.

   Pourquoi cette page existe.

   La suite d'après-paiement est conçue pour reprendre là où elle s'est
   arrêtée : confirmer, facturer, lettrer, envoyer, expédier. Elle est
   relancée à trois endroits — la notification de Mollie, la page de retour
   du client, la page de suivi d'une commande boutique. Les trois ont le
   même défaut : il faut que quelque chose arrive de l'extérieur. Si la
   notification se perd ET que le client ne revient jamais regarder où en
   est sa commande, la chaîne reste là où elle est tombée.

   Le 27 octobre 2026, une commande professionnelle payée s'est arrêtée à
   l'étape « rien ». Elle y est restée treize jours. Le tableau de bord
   l'affichait chaque matin dans « en souffrance », et personne ne pouvait
   la relancer : la reprise professionnelle vit derrière le compte du
   client, et un administrateur n'y a pas accès.

   Cette page est le déclencheur qui manquait. Elle ne contient aucune
   logique métier : elle appelle poursuivre(), la même fonction que les
   trois autres chemins, avec le même verrou. Tout ce qu'elle ajoute, c'est
   la possibilité de la lancer depuis l'extérieur de la commande — donc
   depuis le rapport quotidien, chaque matin, sans que personne n'y pense.

   GET  : l'état des chaînes arrêtées, en lecture seule, avec pour chacune
          ce que Mollie et Odoo en disent réellement aujourd'hui. C'est le
          diagnostic : une note du registre peut dater de treize jours.
   POST : la reprise. Toutes, ou une seule avec ?ref=.
          Avec &classer=oui&motif=..., l'autre issue : sortir de la liste un
          cas que la reprise ne peut pas traiter. Un essai à 1,33 € dont la
          commande a été supprimée n'est pas un incident à surveiller, et le
          laisser sonner chaque matin devant les vrais problèmes est la plus
          sûre façon qu'on finisse par ne plus lire l'alarme du tout. Le
          motif est obligatoire et s'écrit au registre : classer, ce n'est
          pas effacer.

   Réservée au compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin, origineSure } from "../_commun.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";
import { configureMollie, appelMollie } from "../_mollie.js";
import {
  preparerTable, lire, prendreLaMain, rendreLaMain, montantConcorde, noterEtape,
} from "../_paiements.js";
import { poursuivre } from "../_apres_paiement.js";

/* Les deux étapes terminales. « fini » est l'aboutissement, « abandon »
   l'autre issue : un paiement annulé dont le devis a été retiré. Ni l'une
   ni l'autre n'a quoi que ce soit à reprendre. */
const TERMINALES = ["fini", "abandon"];

/* Une chaîne vient de tomber il y a trois minutes : ce n'est pas une
   chaîne en souffrance, c'est une chaîne en cours. La reprise automatique
   laisse donc passer un délai avant de s'en mêler, pour ne jamais courir
   contre la notification de Mollie qui arrive peut-être à l'instant. */
const DELAI_MS = 10 * 60 * 1000;

async function arretees(db) {
  await preparerTable(db);
  const r = await db.prepare(
    "SELECT mollie_id, ref, compte_id, odoo_order_id, odoo_nom, montant, devise, " +
    "statut, etape, facture_nom, suivi, note, cree_le, vu_le " +
    "FROM paiements WHERE statut = 'paye' AND etape NOT IN ('fini', 'abandon') " +
    "ORDER BY cree_le ASC LIMIT 50"
  ).all();
  return (r && r.results) || [];
}

/**
 * Ce que les deux sources disent de ce paiement aujourd'hui.
 *
 * C'est le cœur du diagnostic, et il tient à une distinction : la note du
 * registre raconte la dernière tentative, pas l'état actuel. Une note qui
 * dit « commande S00184 confirmée dans Odoo » reste lisible des semaines
 * après que cette commande a été supprimée. On va donc regarder.
 */
async function constater(env, p) {
  const c = { mollie: null, odoo: null, souci: null };

  if (configureMollie(env)) {
    try {
      const m = await appelMollie(env, "/payments/" + encodeURIComponent(p.mollie_id));
      c.mollie = String((m && m.status) || "inconnu");
      // Le registre dit « payé » : si Mollie ne le dit plus, c'est la
      // première chose à savoir, avant toute reprise.
      if (c.mollie === "paid" && !montantConcorde(m, p)) {
        c.souci = "montant divergent chez Mollie";
      }
    } catch (e) {
      c.mollie = "injoignable";
    }
  }

  if (configureOdoo(env) && p.odoo_order_id) {
    try {
      const lu = await appelOdoo(env, "sale.order", "read",
        [[p.odoo_order_id], ["name", "state", "invoice_status"]], {});
      if (!lu || !lu[0]) {
        c.odoo = "disparue";
        /* Le cas grave, et le seul que cette page ne peut pas réparer :
           l'argent est encaissé et la commande n'est plus dans Odoo. Elle
           a été supprimée comme un devis abandonné, ou effacée à la main.
           Refaire la commande engage un prix, une TVA et un stock : c'est
           une décision humaine, pas une reprise automatique. */
        c.souci = "payé, mais la commande n'existe plus dans Odoo";
      } else {
        c.odoo = String(lu[0].state || "");
        if (c.odoo === "cancel") c.souci = "payé, mais la commande est annulée dans Odoo";
      }
    } catch (e) {
      c.odoo = "injoignable";
    }
  }

  return c;
}

/** Les jours écoulés depuis l'encaissement, arrondis vers le bas. */
function jours(iso) {
  const t = Date.parse(iso || "");
  if (!t) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  let lignes;
  try { lignes = await arretees(env.DB); }
  catch (e) { return erreur("Registre indisponible.", 503, "registre"); }

  const liste = [];
  for (const p of lignes) {
    const c = await constater(env, p);
    liste.push({
      ref: p.ref,
      cote: Number(p.compte_id) === 0 ? "boutique" : "pro",
      etape: p.etape,
      montant: p.montant,
      devise: p.devise || "EUR",
      commande: p.odoo_nom || "",
      facture: p.facture_nom || "",
      suivi: p.suivi || "",
      jours: jours(p.cree_le),
      cree_le: p.cree_le,
      note: p.note || "",
      mollie: c.mollie,
      odoo: c.odoo,
      souci: c.souci,
      // Une reprise n'a de sens que si les deux bouts tiennent encore.
      reprenable: c.mollie !== "injoignable" && !c.souci,
    });
  }

  return json({
    ok: true,
    total: liste.length,
    a_trancher: liste.filter((l) => l.souci).length,
    liste,
    date: new Date().toISOString(),
  });
}

export async function onRequestPost({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!origineSure(request)) return erreur("Origine refusée.", 403, "origine");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");
  if (!configureOdoo(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

  const url = new URL(request.url);
  const seule = String(url.searchParams.get("ref") || "").trim();
  const classer = url.searchParams.get("classer") === "oui";
  const motif = String(url.searchParams.get("motif") || "").trim();

  let lignes;
  try { lignes = await arretees(env.DB); }
  catch (e) { return erreur("Registre indisponible.", 503, "registre"); }

  if (seule) lignes = lignes.filter((p) => String(p.ref) === seule);

  /* Le classement. Une référence à la fois, un motif obligatoire, et
     seulement sur un cas que la reprise a déjà déclaré hors de sa portée :
     une chaîne encore reprenable se reprend, elle ne se classe pas. */
  if (classer) {
    if (!seule) return erreur("Classer demande une référence précise.", 400, "ref");
    if (motif.length < 8) return erreur("Classer demande un motif écrit.", 400, "motif");
    if (!lignes.length) return erreur("Référence inconnue parmi les chaînes arrêtées.", 404, "inconnue");

    const p = lignes[0];
    const c = await constater(env, p);
    if (!c.souci) {
      return json({ ok: false, message:
        "Cette chaîne est encore reprenable : reprenez-la plutôt que de la classer." });
    }

    await noterEtape(env.DB, p.mollie_id, "abandon", {
      note: "Classé sans suite — " + motif + " (constat : " + c.souci + ").",
    });
    return json({
      ok: true, classe: p.ref, montant: p.montant, etait: p.etape, motif,
      message: "Sortie de la liste des chaînes arrêtées. Le motif est au registre.",
    });
  }
  if (!lignes.length) {
    return json({ ok: true, reprises: [], message: seule
      ? "Aucune chaîne arrêtée sous cette référence."
      : "Aucune chaîne arrêtée : il n'y a rien à reprendre." });
  }

  const reprises = [];
  for (const p of lignes) {
    const age = Date.now() - (Date.parse(p.cree_le || "") || 0);
    // La reprise d'une seule référence est toujours demandée par un humain
    // qui regarde : elle n'attend pas. La reprise en bloc, elle, laisse sa
    // chance à la notification de Mollie.
    if (!seule && age < DELAI_MS) {
      reprises.push({ ref: p.ref, etape: p.etape, resultat: "trop récente, laissée en place" });
      continue;
    }

    const c = await constater(env, p);
    if (c.souci) {
      reprises.push({ ref: p.ref, etape: p.etape, resultat: "à trancher : " + c.souci });
      continue;
    }

    let main = false;
    try { main = await prendreLaMain(env.DB, p.mollie_id); } catch (e) {}
    if (!main) {
      reprises.push({ ref: p.ref, etape: p.etape, resultat: "déjà en cours ailleurs" });
      continue;
    }

    let r;
    try {
      const frais = await lire(env.DB, p.mollie_id);
      r = await poursuivre(env, env.DB, { ...(frais || p), statut: "paye" });
    } catch (e) {
      r = { erreur: String((e && e.message) || e).slice(0, 240), etape: p.etape };
    } finally {
      try { await rendreLaMain(env.DB, p.mollie_id); } catch (e2) {}
    }

    const apres = await lire(env.DB, p.mollie_id);
    reprises.push({
      ref: p.ref,
      avant: p.etape,
      etape: (apres && apres.etape) || (r && r.etape) || p.etape,
      facture: (apres && apres.facture_nom) || "",
      suivi: (apres && apres.suivi) || "",
      resultat: (r && r.fini) ? "terminée"
        : (r && r.erreur) ? "arrêtée : " + r.erreur
        : "avancée",
      note: (apres && apres.note) || "",
    });
  }

  const finies = reprises.filter((r) => r.resultat === "terminée").length;
  const bloquees = reprises.filter((r) => String(r.resultat).indexOf("à trancher") === 0);

  return json({
    ok: true,
    reprises,
    finies,
    a_trancher: bloquees.length,
    message: finies
      ? finies + " chaîne(s) menée(s) à terme."
      : "Aucune chaîne n'a pu aboutir. Le détail dit pourquoi, pour chacune.",
    date: new Date().toISOString(),
  });
}
