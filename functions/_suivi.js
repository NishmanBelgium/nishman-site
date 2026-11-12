/* ==========================================================================
   SUIVI — où en est chaque commande, et ce qu'il reste à faire dessus.

   LE PROBLÈME QUE CE FICHIER RÉSOUT. La vie d'une commande traverse quatre
   outils : Odoo pour la commande, Odoo encore pour le bon de livraison,
   SendCloud pour l'étiquette, Mollie ou la banque pour l'argent. Chacun
   répond bien à sa question, aucun ne répond à la seule qui compte le
   matin : « qu'est-ce qui attend quelque chose de moi ? »

   Résultat, le 12 novembre 2026 : dix-neuf bons de livraison ouverts dont
   neuf étaient des brouillons vides abandonnés depuis le 21 août, une
   commande livrée avec 71 jours de retard, et neuf commandes payées dont
   la marchandise n'était pas partie. Rien de tout cela n'était caché —
   c'était seulement réparti sur quatre écrans, donc invisible.

   CE QUE FAIT CE MODULE. Il relit les trois sources dans Odoo, recompose
   le parcours de chaque commande, et rend pour chacune UNE étape et UNE
   action suivante. Pas un état technique — « assigned », « to invoice »
   ne veulent rien dire à 7 h du matin — mais une phrase qui dit quoi
   faire.

   CE QU'IL NE FAIT PAS. Il ne touche à rien. Aucune écriture, aucune
   étiquette, aucune facture, aucun courriel. C'est une lecture, et c'est
   volontaire : un écran de pilotage doit pouvoir être ouvert cent fois
   par jour sans conséquence. Les boutons qui agissent viendront après, et
   séparément.
   ========================================================================== */

import { appel, configure } from "./_odoo.js";

/* --- Les transporteurs, et le piège des « LIVRAISON » -------------------
 *
 * Odoo connaît deux familles de transporteurs, et elles se ressemblent
 * assez pour qu'on s'y trompe — on s'y est trompé le 11 novembre 2026.
 *
 * Les vrais : bpost, DPD, les points relais. Ils passent par SendCloud,
 * produisent une étiquette et un numéro de suivi.
 *
 * Les faux : « LIVRAISON BELGIQUE », « LIVRAISON france », « LIVRAISON
 * Luxembourg ». Ce sont des lignes de facturation (delivery_type
 * « fixed »), pas des moyens d'expédition. Elles servent à porter des
 * frais de port sur la commande, rien de plus.
 *
 * Et parmi ces faux, il y a encore deux cas distincts :
 *   - BELGIQUE, c'est une livraison que NBD fait elle-même, en voiture.
 *     Il n'y a aucune étiquette à attendre : la commande est normale.
 *   - france et Luxembourg, c'est juste le port facturé. Le colis doit
 *     quand même partir, et son étiquette reste à créer à la main. C'est
 *     exactement ce qui est arrivé à FIRST CUT et à Barber King.
 *
 * On distingue donc sur le nom, faute de mieux : Odoo ne porte nulle part
 * l'information « cette ligne de port correspond à une tournée ». Si un
 * jour un transporteur fixe est renommé, c'est ici qu'il faut revenir. */
function natureTransporteur(nom, type) {
  const n = String(nom || "");
  if (!n) return "aucun";
  if (type && type !== "fixed") return "reel";
  if (/belgique/i.test(n)) return "tournee";   // NBD livre elle-même
  return "port_seul";                          // frais facturés, colis à expédier
}

/* La limite au-delà de laquelle un colis doit être scindé, reprise de
 * _etiquette.js pour que les deux écrans disent la même chose. */
const COLIS_MAX_KG = 20;

function jours(depuis) {
  const t = Date.parse(String(depuis || "").replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function nom(valeur) {
  return Array.isArray(valeur) ? String(valeur[1] || "") : "";
}

/* --- L'étape et l'action -------------------------------------------------
 *
 * Une commande avance dans un ordre fixe : devis → expédition →
 * facturation → encaissement. On la place à la première étape qui n'est
 * pas franchie, et l'action décrit ce qui débloque CETTE étape — jamais
 * la suivante, pour qu'il n'y ait jamais deux choses à faire sur la même
 * ligne. */
function classer(c, bons) {
  const bon = bons.length ? bons[bons.length - 1] : null;   // le plus récent
  const retard = jours(c.date_order);
  /* « facturée » n'est PAS « payée » — vérifié le 12 novembre 2026 : sur
     quatre commandes portant invoice_status « invoiced », trois factures
     étaient encore not_paid. L'encaissement réel se lit sur la facture,
     et il est ajouté après coup par `suivi`. */
  const facture = c.invoice_status === "invoiced";

  /* 1. LE DEVIS. Tant qu'il n'est pas confirmé, rien d'autre ne compte. */
  if (c.state === "draft") {
    return { etape: "devis", rang: 6,
      action: "Devis non envoyé — à finir ou à supprimer",
      alerte: retard !== null && retard > 30 };
  }
  if (c.state === "sent") {
    return { etape: "devis", rang: 5,
      action: retard !== null && retard > 7
        ? "Devis envoyé il y a " + retard + " jours, sans réponse — à relancer"
        : "Devis envoyé, en attente de réponse du client",
      alerte: retard !== null && retard > 14 };
  }

  /* 2. L'EXPÉDITION. C'est ici que se cachent presque tous les blocages,
   *    et chacun a une cause différente qu'il faut nommer. */
  if (c.delivery_status !== "full") {
    if (!bon) {
      return { etape: "expedition", rang: 0,
        action: "Aucun bon de livraison — commande confirmée mais rien à préparer",
        alerte: true, facture };
    }

    /* L'ÉTIQUETTE D'ABORD, ET AVANT LE TRANSPORTEUR. Ce test était plus bas
       dans la première version, et il s'est trompé immédiatement : Almir
       Klica (S00325) portait un numéro de suivi réel — l'étiquette DPD
       créée à la main le 12 novembre — mais aucun transporteur dans la
       case d'Odoo, parce qu'une étiquette faite dans SendCloud ne remplit
       pas ce champ-là. L'écran réclamait donc de choisir un transporteur
       pour un colis déjà étiqueté.

       Un numéro de suivi est une preuve : l'étiquette existe. Ce qui reste
       à faire est de remettre le colis, rien d'autre. */
    if (bon.suivi) {
      return { etape: "expedition", rang: 4,
        action: "Étiquette créée — colis à remettre au transporteur",
        alerte: false, facture };
    }

    if (bon.state === "draft" || bon.state === "waiting" || bon.state === "confirmed") {
      return { etape: "expedition", rang: 1,
        action: "Marchandise pas encore réservée dans le stock"
          + (bon.poids > 0 ? "" : ", et colis à peser"),
        alerte: retard !== null && retard > 7, facture };
    }
    /* bon.state === "assigned" : prêt à partir. Qu'est-ce qui manque ? */
    if (!(bon.poids > 0)) {
      return { etape: "expedition", rang: 1,
        action: "Colis à peser — sans poids, aucune étiquette n'est possible",
        alerte: true, facture };
    }
    if (bon.nature === "aucun") {
      return { etape: "expedition", rang: 1,
        action: "Transporteur à choisir (" + bon.poids.toFixed(1) + " kg)",
        alerte: true, facture };
    }
    if (bon.nature === "tournee") {
      return { etape: "expedition", rang: 3,
        action: "À livrer en personne (" + bon.poids.toFixed(1) + " kg) — pas d'étiquette à créer",
        alerte: retard !== null && retard > 14, facture };
    }
    if (bon.nature === "port_seul") {
      return { etape: "expedition", rang: 1,
        action: "Port facturé mais aucune étiquette — à créer dans SendCloud ("
          + bon.poids.toFixed(1) + " kg)",
        alerte: true, facture };
    }
    return { etape: "expedition", rang: 2,
      action: "Étiquette à créer — " + bon.transporteur + ", "
        + bon.poids.toFixed(1) + " kg"
        + (bon.poids > COLIS_MAX_KG ? " (plusieurs colis)" : ""),
      alerte: true, facture };
  }

  /* 3. LA FACTURATION. Livrée, donc le travail physique est fait ; ce qui
   *    reste est de l'argent qui n'est pas encore demandé. */
  if (c.invoice_status === "to invoice") {
    return { etape: "facturation", rang: 2,
      action: "Livrée mais pas facturée — facture à établir",
      alerte: retard !== null && retard > 14 };
  }

  /* 4. Tout est fait. Le reste (l'encaissement) se suit sur les factures,
   *    qui ont leur propre liste : une commande dont la facture traîne
   *    n'est plus une commande à traiter, c'est une créance. */
  return { etape: "fini", rang: 9, action: "", alerte: false };
}

/**
 * Le tableau de suivi complet.
 *
 * Trois lectures seulement, pour que la page reste rapide :
 *   - les commandes qui ne sont pas closes,
 *   - les bons de livraison encore ouverts,
 *   - les factures de vente non soldées.
 *
 * Ne lève jamais : une page de pilotage qui tombe quand une source tousse
 * ne pilote plus rien. Les soucis sont rendus avec les données.
 */
export async function suivi(env) {
  if (!configure(env)) {
    return { pret: false, souci: "Le pont vers Odoo n'est pas configuré." };
  }

  const sortie = {
    pret: true,
    genere_le: new Date().toISOString(),
    commandes: [],
    bons_orphelins: [],
    factures: [],
    rapprochement: [],
    compteurs: {},
    soucis: [],
  };

  /* --- Les commandes ---------------------------------------------------- */
  let brut = [];
  try {
    brut = await appel(env, "sale.order", "search_read",
      [[["state", "in", ["draft", "sent", "sale"]]],
       ["name", "partner_id", "date_order", "amount_total", "state",
        "delivery_status", "invoice_status", "picking_ids", "invoice_ids"]],
      { limit: 1000, order: "date_order asc" }) || [];
  } catch (e) {
    sortie.soucis.push("Commandes illisibles : " + String(e.message || e).slice(0, 120));
  }

  /* --- Les bons de livraison encore ouverts ----------------------------- */
  let bruts = [];
  try {
    bruts = await appel(env, "stock.picking", "search_read",
      [[["picking_type_code", "=", "outgoing"], ["state", "not in", ["done", "cancel"]]],
       ["name", "state", "scheduled_date", "weight", "carrier_id",
        "carrier_tracking_ref", "origin", "partner_id", "sale_id"]],
      { limit: 500, order: "scheduled_date asc" }) || [];
  } catch (e) {
    sortie.soucis.push("Bons de livraison illisibles : " + String(e.message || e).slice(0, 120));
  }

  /* Le type du transporteur n'est pas sur le bon : il faut une quatrième
     lecture, mais minuscule — il y a moins de dix transporteurs. */
  const types = {};
  const idsTransporteurs = [...new Set(bruts.map((b) => b.carrier_id && b.carrier_id[0]).filter(Boolean))];
  if (idsTransporteurs.length) {
    try {
      for (const t of await appel(env, "delivery.carrier", "read",
            [idsTransporteurs, ["delivery_type"]]) || []) {
        types[t.id] = t.delivery_type;
      }
    } catch (e) { /* sans le type, natureTransporteur se rabat sur le nom */ }
  }

  const bons = bruts.map((b) => {
    const idTransporteur = b.carrier_id && b.carrier_id[0];
    const nomTransporteur = nom(b.carrier_id);
    return {
      id: b.id,
      reference: String(b.name || ""),
      etat: b.state,
      prevu_le: String(b.scheduled_date || "").slice(0, 10),
      poids: Number(b.weight || 0),
      transporteur: nomTransporteur,
      nature: natureTransporteur(nomTransporteur, types[idTransporteur]),
      suivi: !!b.carrier_tracking_ref,
      origine: String(b.origin || ""),
      client: nom(b.partner_id),
      commande_id: (b.sale_id && b.sale_id[0]) || null,
    };
  });

  /* On rattache par identifiant quand Odoo le porte, par le texte
     d'origine sinon — les deux existent selon la façon dont le bon a été
     créé, et se fier à un seul en perdrait la moitié. */
  const parCommande = new Map();
  const orphelins = [];
  const refVersId = new Map(brut.map((c) => [String(c.name), c.id]));
  for (const b of bons) {
    const id = b.commande_id || refVersId.get(b.origine) || null;
    if (!id) { orphelins.push(b); continue; }
    if (!parCommande.has(id)) parCommande.set(id, []);
    parCommande.get(id).push(b);
  }

  for (const c of brut) {
    const mes = parCommande.get(c.id) || [];
    const cl = classer(c, mes);
    if (cl.etape === "fini") continue;
    sortie.commandes.push({
      id: c.id,
      reference: String(c.name || ""),
      client: nom(c.partner_id),
      date: String(c.date_order || "").slice(0, 10),
      jours: jours(c.date_order),
      total: Number(c.amount_total || 0),
      etape: cl.etape,
      rang: cl.rang,
      action: cl.action,
      alerte: !!cl.alerte,
      /* Renseignés juste après, quand on connaîtra l'état réel des
         paiements : ici on ne sait que si une facture existe. */
      facture_non_livree: !!cl.facture && cl.etape === "expedition",
      payee_non_livree: false,
      factures: cl.etape === "expedition" ? (c.invoice_ids || []) : [],
      bon: mes.length ? mes[mes.length - 1].reference : "",
      poids: mes.length ? mes[mes.length - 1].poids : 0,
    });
  }

  /* --- Payée, ou seulement facturée ? ----------------------------------
   *
   * La distinction décide de l'ordre dans lequel on travaille : une
   * commande dont l'argent est arrivé et dont la marchandise dort est le
   * pire cas possible, bien plus grave qu'une facture simplement émise.
   *
   * Et Odoo ne la donne pas sur la commande : `invoice_status` dit
   * seulement qu'une facture existe. Relevé le 12 novembre 2026 : sur
   * quatre commandes « invoiced », trois factures étaient `not_paid`. Une
   * lecture de plus, sur quelques factures seulement, évite donc de crier
   * au feu là où il n'y en a pas — et de le taire là où il y en a. */
  const idsFactures = [...new Set(
    sortie.commandes.flatMap((c) => c.factures).filter(Boolean))];
  if (idsFactures.length) {
    try {
      const etats = {};
      for (const f of await appel(env, "account.move", "read",
            [idsFactures, ["payment_state"]]) || []) {
        etats[f.id] = f.payment_state;
      }
      /* « in_payment » compte comme encaissé : l'argent est parti de chez
         le client, c'est le rapprochement bancaire qui n'a pas suivi. */
      const encaisse = (e) => e === "paid" || e === "in_payment";
      for (const c of sortie.commandes) {
        if (!c.factures.length) continue;
        if (!c.factures.some((id) => encaisse(etats[id]))) continue;
        c.payee_non_livree = true;
        /* Le drapeau est un fait, l'alerte est un ordre de marche : on ne
           les confond pas. Une commande payée dont l'étiquette est déjà
           créée, ou que NBD livre elle-même, n'est bloquée par rien — la
           signaler en rouge en haut de liste, c'est user le rouge pour
           rien et finir par ne plus le voir. On ne remonte donc que ce
           qui attend vraiment une décision (rang 2 ou moins). */
        if (c.rang <= 2) { c.alerte = true; c.rang = -1; }
      }
    } catch (e) {
      sortie.soucis.push("État des paiements illisible : "
        + String(e.message || e).slice(0, 120));
    }
  }
  for (const c of sortie.commandes) delete c.factures;

  /* Les plus urgents d'abord, puis les plus anciens : c'est l'ordre dans
     lequel on veut les traiter, donc l'ordre dans lequel on les lit. */
  sortie.commandes.sort((a, b) =>
    a.rang - b.rang || (b.jours || 0) - (a.jours || 0));

  /* --- Les bons sans commande ------------------------------------------
   *
   * Un bon de livraison sans commande d'origine n'est presque jamais une
   * expédition réelle : c'est un brouillon créé à la main puis abandonné.
   * Ils ne méritent pas une place dans la liste de travail, mais les
   * taire serait pire — ils restent comptés à part, pour être nettoyés. */
  sortie.bons_orphelins = orphelins.map((b) => ({
    reference: b.reference, etat: b.etat, prevu_le: b.prevu_le,
    poids: b.poids, client: b.client,
    jours: b.prevu_le ? jours(b.prevu_le + " 00:00:00") : null,
  }));

  /* --- Les factures non soldées ----------------------------------------
   *
   * LE PIÈGE DU « IN_PAYMENT », relevé le 12 novembre 2026. Une première
   * version comptait comme créance tout ce qui n'était pas « paid » :
   * elle annonçait 115 factures ouvertes et 53 976 € à encaisser, dont
   * 111 échues. Faux, et faux d'une manière qui aurait discrédité l'écran
   * dès le premier matin.
   *
   * Sur ces 115, quarante-six étaient à « in_payment » pour 8 805 € :
   * l'argent du client EST arrivé, par Mollie, et c'est le rapprochement
   * bancaire qui n'a pas encore été fait. C'est le même phénomène que la
   * facture Zanacoiff 00130, qui affichait 361,79 € de « restant dû »
   * sans que personne ne doive quoi que ce soit.
   *
   * Les deux listes sont donc séparées, parce que ce ne sont pas deux
   * degrés d'un même problème mais deux problèmes différents : l'une se
   * règle en relançant un client, l'autre en rapprochant un relevé. */
  try {
    const f = await appel(env, "account.move", "search_read",
      [[["move_type", "=", "out_invoice"], ["state", "=", "posted"],
        ["payment_state", "in", ["not_paid", "partial", "in_payment"]]],
       ["name", "partner_id", "invoice_date", "invoice_date_due",
        "amount_total", "amount_residual", "payment_state"]],
      { limit: 400, order: "invoice_date_due asc" }) || [];
    const toutes = f.map((x) => ({
      reference: String(x.name || ""),
      client: nom(x.partner_id),
      date: String(x.invoice_date || "").slice(0, 10),
      echeance: String(x.invoice_date_due || "").slice(0, 10),
      total: Number(x.amount_total || 0),
      reste: Number(x.amount_residual || 0),
      etat: x.payment_state,
      retard: x.invoice_date_due ? jours(x.invoice_date_due + " 00:00:00") : null,
    }));
    sortie.factures = toutes.filter((x) => x.etat !== "in_payment");
    sortie.rapprochement = toutes.filter((x) => x.etat === "in_payment");
  } catch (e) {
    sortie.soucis.push("Factures illisibles : " + String(e.message || e).slice(0, 120));
  }

  /* --- Les compteurs du haut de page ------------------------------------ */
  const par = (p) => sortie.commandes.filter(p).length;
  sortie.compteurs = {
    total_commandes: brut.length,
    a_traiter: sortie.commandes.length,
    expedition: par((c) => c.etape === "expedition"),
    payee_non_livree: par((c) => c.payee_non_livree),
    facture_non_livree: par((c) => c.facture_non_livree && !c.payee_non_livree),
    facturation: par((c) => c.etape === "facturation"),
    devis: par((c) => c.etape === "devis"),
    alertes: par((c) => c.alerte),
    bons_orphelins: sortie.bons_orphelins.length,
    factures_ouvertes: sortie.factures.length,
    reste_a_encaisser: Math.round(
      sortie.factures.reduce((s, f) => s + f.reste, 0) * 100) / 100,
    en_retard: sortie.factures.filter((f) => (f.retard || 0) > 0).length,
    /* Encaissé mais pas rapproché : ni une créance, ni rien. */
    rapprochement_nb: sortie.rapprochement.length,
    rapprochement_montant: Math.round(
      sortie.rapprochement.reduce((s, f) => s + f.reste, 0) * 100) / 100,
  };

  return sortie;
}
