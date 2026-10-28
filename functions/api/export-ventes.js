/* ==========================================================================
   EXPORT DES VENTES — tout ce qui a été vendu, ligne par ligne.

   Odoo sait exporter, mais en colonnes brutes et un modèle à la fois : les
   commandes d'un côté, les lignes de l'autre, à recoller soi-même. Cette
   page rend les deux déjà joints, avec le client, le pays, la facture et
   l'état, prêts à être mis en tableau.

   Elle sort du texte séparé par des points-virgules plutôt que du JSON :
   c'est trois fois plus compact à transporter, et directement lisible par
   un tableur si NBD veut s'en servir seule.

   Pagination par ?page= : une centaine de commandes font plusieurs milliers
   de lignes, et une réponse qui dépasse la mémoire d'une fonction ne rend
   rien du tout plutôt que de rendre la moitié.

   Réservé au compte de NBD.
   ========================================================================== */

import { erreur, compteConnecte } from "../_commun.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";

const ADMIN_DEFAUT = "contact@nishman.be";
/* 250 et pas 400 : la réponse voyage par le navigateur, qui tronque au-delà
   d'une cinquantaine de milliers de caractères. Une page qu'on ne peut pas
   lire en entier ne sert à rien. */
const PAR_PAGE = 250;

function csv(v) {
  const s = String(v === null || v === undefined ? "" : v);
  // Le point-virgule et le retour à la ligne casseraient les colonnes ;
  // les guillemets casseraient l'échappement. On les neutralise plutôt que
  // de produire un fichier que personne ne pourra relire.
  return s.replace(/[;\r\n"]/g, " ").trim();
}

export async function onRequestGet({ request, env }) {
  const compte = env.DB ? await compteConnecte(request, env.DB) : null;
  const admins = String(env.EMAIL_ADMIN || ADMIN_DEFAUT)
    .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const moi = String((compte && compte.email) || "").trim().toLowerCase();
  if (!moi || admins.indexOf(moi) === -1) return erreur("Page réservée.", 404, "reservee");
  if (!configureOdoo(env)) return erreur("Odoo n'est pas configuré.", 503, "odoo");

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const resume = url.searchParams.get("resume") === "1";

  // On part des LIGNES, pas des commandes : c'est l'unité de l'export, et
  // c'est ce qui permet de paginer sans couper une commande en deux.
  const filtre = [
    ["order_id.state", "in", ["sale", "done"]],
    ["display_type", "=", false],          // écarte les sections et notes
  ];

  let total = 0;
  try { total = await appelOdoo(env, "sale.order.line", "search_count", [filtre], {}); }
  catch (e) {
    return erreur("Odoo n'a pas répondu : " + String(e && e.message).slice(0, 200), 502, "odoo");
  }

  /* Les totaux, calculés par Odoo plutôt que recomposés ici.
   *
   * read_group fait le regroupement côté serveur : une dizaine de lignes
   * en retour au lieu de plusieurs milliers. C'est ce qui permet d'avoir
   * les chiffres clés sans transporter tout le détail. */
  if (resume) {
    const bloc = [];
    const demander = async (champs, titre, cles) => {
      const g = await appelOdoo(env, "sale.order.line", "read_group",
        [filtre, ["price_subtotal", "price_total", "product_uom_qty"], champs],
        { lazy: false });
      bloc.push("# " + titre);
      bloc.push(cles.join(";") + ";quantite;total_ht;total_ttc");
      for (const r of g || []) {
        const vals = champs.map((c) => {
          const v = r[c];
          return csv(Array.isArray(v) ? v[1] : (v === false ? "" : v));
        });
        bloc.push([...vals,
          Number(r.product_uom_qty || 0),
          Number(r.price_subtotal || 0).toFixed(2),
          Number(r.price_total || 0).toFixed(2)].join(";"));
      }
      bloc.push("");
    };

    try {
      await demander(["product_id"], "PAR PRODUIT", ["produit"]);
      await demander(["order_partner_id"], "PAR CLIENT", ["client"]);
    } catch (e) {
      return erreur("Odoo n'a pas répondu : " + String(e && e.message).slice(0, 200), 502, "odoo");
    }

    bloc.push("# lignes au total : " + total);
    bloc.push("# pages de detail : " + Math.ceil(total / PAR_PAGE));
    return new Response(bloc.join("\n"), {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  let lignes;
  try {
    lignes = await appelOdoo(env, "sale.order.line", "search_read",
      [filtre, ["order_id", "product_id", "product_uom_qty", "price_unit",
                "discount", "price_subtotal", "price_total"]],
      { limit: PAR_PAGE, offset: (page - 1) * PAR_PAGE, order: "order_id asc, id asc" });
  } catch (e) {
    return erreur("Odoo n'a pas répondu : " + String(e && e.message).slice(0, 200), 502, "odoo");
  }

  // Les commandes concernées, en une seule demande plutôt qu'une par ligne.
  const idsCommandes = [...new Set((lignes || [])
    .map((l) => Array.isArray(l.order_id) ? l.order_id[0] : l.order_id).filter(Boolean))];
  const commandes = idsCommandes.length ? await appelOdoo(env, "sale.order", "read",
    [idsCommandes, ["name", "date_order", "partner_id", "state", "amount_total",
                    "invoice_status", "client_order_ref"]], {}) : [];
  const parCommande = {};
  for (const c of commandes || []) parCommande[c.id] = c;

  // Le pays du client, pour distinguer Belgique, France et Luxembourg.
  const idsClients = [...new Set((commandes || [])
    .map((c) => Array.isArray(c.partner_id) ? c.partner_id[0] : c.partner_id).filter(Boolean))];
  const clients = idsClients.length ? await appelOdoo(env, "res.partner", "read",
    [idsClients, ["name", "country_id", "is_company", "city"]], {}) : [];
  const parClient = {};
  for (const p of clients || []) parClient[p.id] = p;

  // Les codes-barres, pour que l'export se recoupe avec le catalogue.
  const idsProduits = [...new Set((lignes || [])
    .map((l) => Array.isArray(l.product_id) ? l.product_id[0] : l.product_id).filter(Boolean))];
  const produits = idsProduits.length ? await appelOdoo(env, "product.product", "read",
    [idsProduits, ["name", "barcode", "default_code"]], {}) : [];
  const parProduit = {};
  for (const p of produits || []) parProduit[p.id] = p;

  const sortie = [];
  if (page === 1) {
    sortie.push([
      "date", "commande", "reference_client", "client", "type_client", "pays", "ville",
      "produit", "code_barres", "reference_interne",
      "quantite", "prix_unitaire_ht", "remise_pct", "total_ht", "total_ttc",
      "etat_commande", "etat_facturation",
    ].join(";"));
  }

  for (const l of lignes || []) {
    const cid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id;
    const c = parCommande[cid] || {};
    const pid = Array.isArray(c.partner_id) ? c.partner_id[0] : c.partner_id;
    const cl = parClient[pid] || {};
    const prid = Array.isArray(l.product_id) ? l.product_id[0] : l.product_id;
    const pr = parProduit[prid] || {};
    const pays = Array.isArray(cl.country_id) ? cl.country_id[1] : "";

    sortie.push([
      csv(String(c.date_order || "").slice(0, 10)),
      csv(c.name),
      csv(c.client_order_ref),
      csv(cl.name),
      cl.is_company === false ? "particulier" : "professionnel",
      csv(pays),
      csv(cl.city),
      csv(pr.name),
      csv(pr.barcode),
      csv(pr.default_code),
      Number(l.product_uom_qty || 0),
      Number(l.price_unit || 0).toFixed(2),
      Number(l.discount || 0),
      Number(l.price_subtotal || 0).toFixed(2),
      Number(l.price_total || 0).toFixed(2),
      csv(c.state),
      csv(c.invoice_status),
    ].join(";"));
  }

  const pages = Math.ceil(total / PAR_PAGE);
  sortie.push("");
  sortie.push("# page " + page + " sur " + pages + " — " + (lignes || []).length
    + " ligne(s) ici, " + total + " au total");

  return new Response(sortie.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
