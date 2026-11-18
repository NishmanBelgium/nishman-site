/* ==========================================================================
   VEILLE TVA — le balayage qui regarde TOUTES les commandes, pas seulement
   celles que le site vient de créer.

   _controle_tva.js surveille le devis au moment où il part. C'est
   nécessaire et ce n'est pas suffisant : la plupart des commandes de NBD
   ne naissent pas du site. Elles sont saisies à la main dans Odoo, ou
   créées du site puis complétées à la main — S00299 est née du site avec
   trois lignes et NBD en a ajouté neuf dans la minute. Un filet posé
   seulement à la naissance laisse passer tout ce qui est modifié ensuite.

   D'où ce second regard, qui ne demande à aucun code d'avoir été prévenu :
   il relit les commandes et cherche trois incohérences qui sont toujours
   des erreurs, quel que soit le client et quelle que soit la main qui a
   saisi.

   1) UNE LIGNE SANS AUCUNE TAXE. Toujours faux. Même à 0 %, la ligne doit
      porter une taxe à 0 % : c'est elle qui dit POURQUOI il n'y a pas de
      TVA, et c'est elle qui alimente les grilles de la déclaration. Une
      ligne nue ne se déclare nulle part. Deux cas trouvés le 10 novembre
      2026 (S00269, S00174), tous deux sur le même article dont la fiche
      avait été créée sans taxe.

   2) DES TAUX MÉLANGÉS SUR UNE MÊME COMMANDE. Une commande relève d'un
      seul régime : son client est belge, ou il ne l'est pas. Deux taux sur
      une même commande, c'est qu'une partie des lignes a été calculée sous
      une hypothèse et le reste sous une autre. C'est le cas S00299, et
      c'est aussi ce qui dédoublait la remise — Odoo crée une ligne de
      remise par groupe de TVA.

   3) UN TAUX UNIFORME MAIS FAUX. Le piège le plus discret, parce que rien
      ne détonne : toutes les lignes sont d'accord entre elles, et toutes
      ont tort. C'est le cas S00304, sortie à 0 % de bout en bout pour un
      client de Frameries, et facturée ainsi. Rien dans Odoo ne l'aurait
      jamais signalé.

   Le taux attendu se déduit de la position fiscale, pas du pays : c'est la
   position qui engage la déclaration, et c'est elle qu'un comptable
   regarde. Les noms sont comparés en minuscules et sans accent, parce que
   le modèle comptable belge est installé en anglais et traduit à
   l'affichage — « National » est stocké « Domestic ».

   CE QUE CETTE VEILLE REGARDE, CORRIGÉ LE 18 NOVEMBRE 2026. Elle ne lisait
   que les bons de commande. C'est la mauvaise pièce : le bon est un
   brouillon de vente, la facture est l'acte comptable — c'est elle qui part
   au client, elle qui entre dans la déclaration, et les deux peuvent dire
   des choses différentes.

   Relevé par Dilhan sur S00131 : le bon portait 21 %, la facture
   INV/2026/00066 qui en est sortie est à 0 %. La veille annonçait donc
   « 105 € facturés en trop » là où il manquait en réalité 100 € de TVA
   française. Elle se trompait de pièce, donc de montant, donc de sens — et
   un signalement qui désigne le mauvais responsable est pire qu'un silence.

   D'où deux parcours, et un seul jugement :
     1. les factures comptabilisées — ce qui fait foi ;
     2. les commandes PAS ENCORE facturées — le filet préventif, qui attrape
        la faute au seul moment où elle se corrige sans note de crédit.
   Une commande déjà facturée n'est plus relue : sa facture l'est.
   ========================================================================== */

import { appel, configure } from "./_odoo.js";

/* Combien de commandes on remonte. La veille doit rester bon marché : elle
   est appelée par le diagnostic, qui doit répondre vite. Les commandes plus
   anciennes ont été facturées et déclarées ; les rouvrir n'est plus du
   ressort d'un contrôle automatique. */
const COMBIEN = 150;

/* Combien de factures comptabilisées on relit. C'est la pièce qui fait foi,
   donc celle qu'on regarde en premier et le plus largement. */
const FACTURES = 150;

/* Le taux attendu selon la position fiscale. Toute position inconnue ou
   absente est traitée comme nationale : c'est le cas de 71 commandes sur
   173 chez NBD, où la TVA belge s'applique par défaut.

   LES POSITIONS OSS, AJOUTÉES LE 18 NOVEMBRE 2026. Sans elles, cette
   fonction attendait 21 % sur « OSS B2C France » et criait à l'anomalie
   sur chaque commande française correcte. Relevé dans le diagnostic dans
   la minute qui a suivi la bascule : « taux uniforme de 20 % là où la
   position OSS B2C France appelle 21 % » — c'est la veille qui se
   trompait, pas la commande.

   Une alarme qui crie au loup sur des cas justes finit par ne plus être
   lue du tout, et c'est exactement ce qui a laissé une commande payée
   dormir treize jours le 27 octobre. */
function tauxAttendu(nomPosition) {
  const n = String(nomPosition || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!n) return 21;
  if (n.indexOf("intra") !== -1) return 0;       // Intracommunautaire / Intra-Community
  if (n.indexOf("extra") !== -1) return 0;       // hors UE
  if (n.indexOf("cocont") !== -1) return 0;      // cocontractant
  /* L'OSS : la TVA du pays d'arrivée. On reconnaît le pays dans le nom de
   * la position plutôt que de tenir une seconde table de taux — une table
   * de plus est une table qui divergera de _oss.js. */
  if (n.indexOf("oss") !== -1) {
    if (n.indexOf("france") !== -1) return 20;
    if (n.indexOf("luxembourg") !== -1) return 17;
    return null;                                  // OSS d'un pays qu'on ne connaît pas encore
  }
  return 21;                                      // National / Domestic / UE B2C / EU B2C
}

/* Le jugement d'UNE pièce, à partir de ses lignes. Rendu séparé du
   parcours, parce que deux objets très différents — un bon de commande et
   une facture comptabilisée — se jugent exactement de la même façon : par
   les taxes posées sur leurs lignes, comparées au taux que leur position
   fiscale appelle.

   Rend { nonEvaluee: true } si la position est inconnue, sinon
   { motifs: [...], enJeu } — motifs vide signifiant « rien à dire ». */
function juger(nomPosition, lignes, tauxDe) {
  const attendu = tauxAttendu(nomPosition);
  if (attendu === null) return { nonEvaluee: true };

  const nues = lignes.filter((l) => !l.tax_ids || !l.tax_ids.length);
  const tauxDeLaLigne = (l) => {
    let s = 0;
    for (const id of l.tax_ids) s += Number(tauxDe[id] || 0);
    return s;
  };
  const tauxVus = new Set();
  for (const l of lignes) {
    if (!l.tax_ids || !l.tax_ids.length) continue;
    tauxVus.add(tauxDeLaLigne(l));
  }

  const motifs = [];
  let enJeu = 0;
  const base = (ls) => ls.reduce((s, l) => s + Math.abs(Number(l.price_subtotal || 0)), 0);

  if (nues.length) {
    motifs.push(nues.length + " ligne(s) sans aucune taxe");
    enJeu += base(nues) * (attendu / 100);
  }
  if (tauxVus.size > 1) {
    motifs.push("taux mélangés (" + [...tauxVus].sort((a, b) => a - b).join(" % et ") + " %)");
    const bas = lignes.filter((l) => l.tax_ids && l.tax_ids.length && tauxDeLaLigne(l) < attendu);
    enJeu += base(bas) * (attendu / 100);
  } else if (tauxVus.size === 1) {
    const vu = [...tauxVus][0];
    if (Math.abs(vu - attendu) > 0.5) {
      motifs.push("taux uniforme de " + vu + " % là où la position « "
        + (nomPosition || "aucune") + " » appelle " + attendu + " %");
      enJeu += base(lignes) * ((attendu - vu) / 100);
    }
  }

  return { motifs, enJeu, attendu };
}

/**
 * Relit les dernières factures comptabilisées et les commandes pas encore
 * facturées, et rend la liste de celles dont la TVA ne tient pas debout. Ne
 * lève jamais : une veille muette ne doit pas faire tomber le diagnostic
 * qui l'appelle.
 *
 * @returns { lisible, examinees, anomalies: [...], non_evaluees: [...], detail }
 *
 * `examinees` ne compte que les pièces réellement jugées. Celles dont la
 * position fiscale est inconnue de tauxAttendu() sortent dans
 * `non_evaluees` : elles ne sont ni saines ni fautives, elles n'ont pas été
 * regardées, et c'est ce qu'il faut pouvoir lire.
 */
export async function veillerSurLaTva(env) {
  if (!configure(env)) {
    return { lisible: false, examinees: 0, anomalies: [], non_evaluees: [],
             deja_extournees: 0, detail: "Odoo non configuré" };
  }

  try {
    // Les taux, une fois pour toutes : on compare des pourcentages, jamais
    // des identifiants. Une taxe renumérotée ne doit pas casser la veille.
    const taxes = await appel(env, "account.tax", "search_read",
      [[["type_tax_use", "=", "sale"]], ["id", "amount"]], { limit: 60});
    const tauxDe = {};
    for (const t of taxes || []) tauxDe[t.id] = Number(t.amount);

    const anomalies = [];
    /* Les pièces qu'on n'a pas su juger, et pourquoi on les compte. Une
     * position fiscale inconnue de tauxAttendu() ne doit surtout pas passer
     * pour une pièce saine : elle n'a pas été examinée. Même discipline que
     * le compteur « muets » du rattrapage — un contrôle incomplet qui se lit
     * comme complet est pire qu'un contrôle qui échoue franchement. */
    const nonEvaluees = [];
    let examinees = 0;

    /* ----- 1. LES FACTURES COMPTABILISÉES. Ce qui fait foi. -----
     *
     * SAUF LES EXTOURNES. Une note de crédit qui annule une facture doit
     * porter EXACTEMENT la taxe de la facture annulée, juste ou fausse :
     * c'est tout son objet. La juger au taux attendu aujourd'hui, c'est
     * crier à l'anomalie sur une correction en train de se faire.
     *
     * Vérifié avant d'écrire ce filtre : RINV/2026/00004 extourne
     * INV/2026/00150 (la belge sortie à 0 %) et porte donc 0 % sur une
     * position « Domestic ». Sans ce filtre, elle serait signalée comme
     * 60 € de TVA manquante, alors qu'elle est la réparation de ces 60 €.
     *
     * reversed_entry_id est renseigné par Odoo sur toute note de crédit
     * créée par le bouton « Ajouter une note de crédit ». Une note de
     * crédit autonome, elle, reste examinée — rien ne justifie son taux. */
    const factures = await appel(env, "account.move", "search_read",
      [[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"],
        ["reversed_entry_id", "=", false]],
       ["id", "name", "move_type", "state", "invoice_date", "partner_id",
        "fiscal_position_id", "payment_state", "invoice_origin"]],
      { limit: FACTURES, order: "id desc" });

    /* ET LES FACTURES DÉJÀ EXTOURNÉES. Une facture fausse qui a reçu sa note
     * de crédit est une affaire réglée : la signaler encore, c'est faire
     * sonner l'alarme sur du travail déjà fait. On ne peut pas le lire depuis
     * la facture — reversal_move_id n'existe pas dans cet Odoo, vérifié le
     * 18 novembre — alors on le lit depuis les notes de crédit, qui disent
     * toutes quelle facture elles annulent. Elles sont comptées, pas
     * masquées : un contrôle qui tait ce qu'il écarte ne se relit pas. */
    const extournes = await appel(env, "account.move", "search_read",
      [[["move_type", "=", "out_refund"], ["state", "=", "posted"],
        ["reversed_entry_id", "!=", false]], ["reversed_entry_id"]],
      { limit: 400 });
    const annulees = new Set();
    for (const e of extournes || []) {
      const r = e.reversed_entry_id;
      if (Array.isArray(r)) annulees.add(r[0]);
    }
    let dejaExtournees = 0;

    const lignesF = [];
    const idsF = (factures || []).map((f) => f.id);
    for (let i = 0; i < idsF.length; i += 50) {
      const bout = await appel(env, "account.move.line", "search_read",
        [[["move_id", "in", idsF.slice(i, i + 50)], ["display_type", "in", ["product", false]]],
         ["move_id", "tax_ids", "price_subtotal", "name"]], { limit: 3000 });
      if (bout && bout.length) lignesF.push(...bout);
    }
    const parFacture = {};
    for (const l of lignesF) {
      const k = Array.isArray(l.move_id) ? l.move_id[0] : l.move_id;
      (parFacture[k] = parFacture[k] || []).push(l);
    }

    for (const f of factures || []) {
      const ls = parFacture[f.id] || [];
      if (!ls.length) continue;
      const pos = f.fiscal_position_id ? f.fiscal_position_id[1] : "aucune";
      const v = juger(pos, ls, tauxDe);
      if (v.nonEvaluee) { nonEvaluees.push({ piece: "facture", commande: f.name, position: pos }); continue; }
      examinees++;
      if (!v.motifs.length) continue;
      if (annulees.has(f.id)) { dejaExtournees++; continue; }
      anomalies.push({
        piece: f.move_type === "out_refund" ? "note de crédit" : "facture",
        commande: f.name,
        date: f.invoice_date || "",
        etat: f.state,
        facturation: f.payment_state || "",
        bon: f.invoice_origin || "",
        client: Array.isArray(f.partner_id) ? String(f.partner_id[1]).slice(0, 40) : "",
        position: pos,
        motifs: v.motifs,
        /* Combien d'euros de TVA sont en jeu. Le signe compte : positif, la
         * TVA manque et c'est NBD qui la devra ; négatif, elle a été
         * facturée en trop et c'est le client qui y a perdu. */
        tva_en_jeu: Math.round(v.enJeu * 100) / 100,
      });
    }

    /* ----- 2. LES COMMANDES PAS ENCORE FACTURÉES. Le filet préventif. -----
     *
     * Volontairement limité à ce qui n'a pas encore produit de facture. Une
     * commande déjà facturée se juge sur sa facture, et seulement sur elle :
     * les deux peuvent dire des choses différentes. Relevé le 18 novembre
     * sur S00131 — le bon portait 21 %, la facture INV/2026/00066 qui en est
     * sortie est à 0 %. La veille annonçait donc 105 € facturés en trop là
     * où il manquait 100 € de TVA française : elle se trompait de pièce, et
     * donc de sens. */
    const cmds = await appel(env, "sale.order", "search_read",
      [[["state", "in", ["draft", "sent", "sale", "done"]],
        ["invoice_status", "!=", "invoiced"]],
       ["id", "name", "state", "partner_id", "fiscal_position_id", "invoice_status"]],
      { limit: COMBIEN, order: "id desc" });

    const lignesC = [];
    const idsC = (cmds || []).map((c) => c.id);
    for (let i = 0; i < idsC.length; i += 50) {
      const bout = await appel(env, "sale.order.line", "search_read",
        [[["order_id", "in", idsC.slice(i, i + 50)], ["display_type", "=", false]],
         ["order_id", "tax_ids", "price_subtotal", "name"]], { limit: 3000 });
      if (bout && bout.length) lignesC.push(...bout);
    }
    const parCommande = {};
    for (const l of lignesC) {
      const k = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id;
      (parCommande[k] = parCommande[k] || []).push(l);
    }

    for (const c of cmds || []) {
      const ls = parCommande[c.id] || [];
      if (!ls.length) continue;
      const pos = c.fiscal_position_id ? c.fiscal_position_id[1] : "aucune";
      const v = juger(pos, ls, tauxDe);
      if (v.nonEvaluee) { nonEvaluees.push({ piece: "bon", commande: c.name, position: pos }); continue; }
      examinees++;
      if (!v.motifs.length) continue;
      anomalies.push({
        piece: "bon",
        commande: c.name,
        date: "",
        etat: c.state,
        facturation: c.invoice_status || "",
        bon: "",
        client: Array.isArray(c.partner_id) ? String(c.partner_id[1]).slice(0, 40) : "",
        position: pos,
        motifs: v.motifs,
        tva_en_jeu: Math.round(v.enJeu * 100) / 100,
      });
    }

    return {
      lisible: true,
      examinees,
      anomalies,
      non_evaluees: nonEvaluees,
      /* Fausses, mais déjà réparées par une note de crédit. Écartées des
       * anomalies, jamais du compte. */
      deja_extournees: dejaExtournees,
      detail: "",
    };
  } catch (e) {
    return {
      lisible: false, examinees: 0, anomalies: [], non_evaluees: [], deja_extournees: 0,
      detail: String((e && e.message) || "illisible").slice(0, 160),
    };
  }
}
