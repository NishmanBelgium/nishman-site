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
   ========================================================================== */

import { appel, configure } from "./_odoo.js";

/* Combien de commandes on remonte. La veille doit rester bon marché : elle
   est appelée par le diagnostic, qui doit répondre vite. Les commandes plus
   anciennes ont été facturées et déclarées ; les rouvrir n'est plus du
   ressort d'un contrôle automatique. */
const COMBIEN = 150;

/* Le taux attendu selon la position fiscale. Toute position inconnue ou
   absente est traitée comme nationale : c'est le cas de 71 commandes sur
   173 chez NBD, où la TVA belge s'applique par défaut. */
function tauxAttendu(nomPosition) {
  const n = String(nomPosition || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!n) return 21;
  if (n.indexOf("intra") !== -1) return 0;       // Intracommunautaire / Intra-Community
  if (n.indexOf("extra") !== -1) return 0;       // hors UE
  if (n.indexOf("cocont") !== -1) return 0;      // cocontractant
  return 21;                                      // National / Domestic / UE B2C / EU B2C
}

/**
 * Relit les dernières commandes et rend la liste de celles dont la TVA ne
 * tient pas debout. Ne lève jamais : une veille muette ne doit pas faire
 * tomber le diagnostic qui l'appelle.
 *
 * @returns { lisible, examinees, anomalies: [...], detail }
 */
export async function veillerSurLaTva(env) {
  if (!configure(env)) {
    return { lisible: false, examinees: 0, anomalies: [], detail: "Odoo non configuré" };
  }

  try {
    const cmds = await appel(env, "sale.order", "search_read",
      [[["state", "in", ["draft", "sent", "sale", "done"]]],
       ["id", "name", "state", "partner_id", "fiscal_position_id", "invoice_status"]],
      { limit: COMBIEN, order: "id desc" });
    if (!cmds || !cmds.length) {
      return { lisible: true, examinees: 0, anomalies: [], detail: "" };
    }

    // Les taux, une fois pour toutes : on compare des pourcentages, jamais
    // des identifiants. Une taxe renumérotée ne doit pas casser la veille.
    const taxes = await appel(env, "account.tax", "search_read",
      [[["type_tax_use", "=", "sale"]], ["id", "amount"]], { limit: 60});
    const tauxDe = {};
    for (const t of taxes || []) tauxDe[t.id] = Number(t.amount);

    const ids = cmds.map((c) => c.id);
    const lignes = [];
    for (let i = 0; i < ids.length; i += 50) {
      const bout = await appel(env, "sale.order.line", "search_read",
        [[["order_id", "in", ids.slice(i, i + 50)], ["display_type", "=", false]],
         ["order_id", "tax_ids", "price_subtotal", "name"]], { limit: 3000 });
      if (bout && bout.length) lignes.push(...bout);
    }

    const parCommande = {};
    for (const l of lignes) {
      const k = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id;
      (parCommande[k] = parCommande[k] || []).push(l);
    }

    const anomalies = [];
    for (const c of cmds) {
      const ls = parCommande[c.id] || [];
      if (!ls.length) continue;

      const attendu = tauxAttendu(c.fiscal_position_id ? c.fiscal_position_id[1] : "");
      const nues = ls.filter((l) => !l.tax_ids || !l.tax_ids.length);
      const tauxVus = new Set();
      for (const l of ls) {
        if (!l.tax_ids || !l.tax_ids.length) continue;
        let somme = 0;
        for (const id of l.tax_ids) somme += Number(tauxDe[id] || 0);
        tauxVus.add(somme);
      }

      const motifs = [];
      let enJeu = 0;

      if (nues.length) {
        motifs.push(nues.length + " ligne(s) sans aucune taxe");
        enJeu += nues.reduce((s, l) => s + Number(l.price_subtotal || 0), 0) * (attendu / 100);
      }
      if (tauxVus.size > 1) {
        motifs.push("taux mélangés (" + [...tauxVus].sort((a, b) => a - b).join(" % et ") + " %)");
        const bas = ls.filter((l) => {
          if (!l.tax_ids || !l.tax_ids.length) return false;
          let s = 0; for (const id of l.tax_ids) s += Number(tauxDe[id] || 0);
          return s < attendu;
        });
        enJeu += bas.reduce((s, l) => s + Number(l.price_subtotal || 0), 0) * (attendu / 100);
      } else if (tauxVus.size === 1) {
        const vu = [...tauxVus][0];
        if (Math.abs(vu - attendu) > 0.5) {
          motifs.push("taux uniforme de " + vu + " % là où la position « "
            + (c.fiscal_position_id ? c.fiscal_position_id[1] : "aucune")
            + " » appelle " + attendu + " %");
          enJeu += ls.reduce((s, l) => s + Number(l.price_subtotal || 0), 0)
            * ((attendu - vu) / 100);
        }
      }

      if (motifs.length) {
        anomalies.push({
          commande: c.name,
          etat: c.state,
          facturation: c.invoice_status || "",
          client: Array.isArray(c.partner_id) ? String(c.partner_id[1]).slice(0, 40) : "",
          position: c.fiscal_position_id ? c.fiscal_position_id[1] : "aucune",
          motifs: motifs,
          /* Combien d'euros de TVA sont en jeu. Le signe compte : positif,
           * la TVA manque et c'est NBD qui la devra ; négatif, elle a été
           * facturée en trop et c'est le client qui y a perdu. */
          tva_en_jeu: Math.round(enJeu * 100) / 100,
        });
      }
    }

    return { lisible: true, examinees: cmds.length, anomalies, detail: "" };
  } catch (e) {
    return {
      lisible: false, examinees: 0, anomalies: [],
      detail: String((e && e.message) || "illisible").slice(0, 160),
    };
  }
}
