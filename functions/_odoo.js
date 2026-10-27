/* ==========================================================================
   ODOO — le pont vers votre gestion.
   Les identifiants viennent des variables d'environnement Cloudflare et ne
   figurent jamais dans le code : ODOO_URL, ODOO_DB, ODOO_USER, ODOO_KEY.
   Tant qu'elles ne sont pas renseignées, configure() répond false et les
   pages affichent proprement « bientôt disponible » au lieu de planter.
   ========================================================================== */

export function configure(env) {
  return !!(env.ODOO_URL && env.ODOO_DB && env.ODOO_USER && env.ODOO_KEY);
}

async function rpc(env, params) {
  const r = await fetch(env.ODOO_URL.replace(/\/+$/, "") + "/jsonrpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
  });
  if (!r.ok) throw new Error("Odoo a répondu " + r.status);
  const data = await r.json();
  if (data.error) {
    const m = data.error.data?.message || data.error.message || "erreur Odoo";
    throw new Error(m);
  }
  return data.result;
}

let uidCache = null;

async function uid(env) {
  if (uidCache) return uidCache;
  uidCache = await rpc(env, {
    service: "common", method: "login",
    args: [env.ODOO_DB, env.ODOO_USER, env.ODOO_KEY],
  });
  if (!uidCache) throw new Error("Odoo refuse ces identifiants.");
  return uidCache;
}

export async function appel(env, modele, methode, args, kwargs) {
  return rpc(env, {
    service: "object", method: "execute_kw",
    args: [env.ODOO_DB, await uid(env), env.ODOO_KEY, modele, methode, args, kwargs || {}],
  });
}

/* --- Lectures utiles ---------------------------------------------------- */

// Retrouve la fiche client par e-mail. Odoo reste la source de vérité :
// le site ne recopie pas les clients, il pointe vers eux.
export async function partenaireParEmail(env, email) {
  const r = await appel(env, "res.partner", "search_read",
    [[["email", "=ilike", email]], ["id", "name", "vat"]], { limit: 1 });
  return r && r[0] ? r[0] : null;
}

// Retrouve la fiche client par son numéro de TVA. Odoo n'impose aucun
// format : « BE0817750283 », « BE 0817.750.283 » et « 0817750283 » désignent
// la même entreprise. On essaie les écritures courantes, puis les chiffres
// seuls.
//
// Si DEUX fiches portent le même numéro, on ne rapproche rien : mieux vaut un
// historique vide qu'un client qui lit les commandes d'un autre.
export async function partenaireParTva(env, tva) {
  if (!tva) return null;
  const brut = String(tva).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (brut.length < 8) return null;
  const sansPays = brut.replace(/^[A-Z]{2}/, "");

  const formes = [...new Set([brut, sansPays, "BE" + sansPays, "FR" + sansPays, "LU" + sansPays])];
  let r = await appel(env, "res.partner", "search_read",
    [[["vat", "in", formes]], ["id", "name", "vat", "email"]], { limit: 3 });

  if (!r || !r.length) {
    r = await appel(env, "res.partner", "search_read",
      [[["vat", "ilike", sansPays]], ["id", "name", "vat", "email"]], { limit: 3 });
  }
  if (!r || r.length !== 1) return null;
  return r[0];
}

export async function commandesDuClient(env, partnerId, limite = 50) {
  return appel(env, "sale.order", "search_read",
    [[["partner_id", "=", partnerId]],
     ["id", "name", "date_order", "state", "amount_untaxed", "amount_total",
      "delivery_status", "invoice_status"]],
    { limit: limite, order: "date_order desc" });
}

// Relit une commande en exigeant qu'elle soit AU client demandé. Le filtre
// porte sur les deux critères à la fois : une commande qui n'est pas la
// sienne ne revient pas, plutôt que de revenir et d'être écartée ensuite.
// C'est ce qui empêche de lire le devis du voisin en changeant un numéro
// dans l'adresse.
export async function commandeDuClient(env, partnerId, commandeId) {
  const r = await appel(env, "sale.order", "search_read",
    [[["id", "=", commandeId], ["partner_id", "=", partnerId]],
     ["id", "name", "date_order", "state", "amount_untaxed", "amount_total"]],
    { limit: 1 });
  return r && r[0] ? r[0] : null;
}

export async function lignesDeCommande(env, commandeId) {
  return appel(env, "sale.order.line", "search_read",
    [[["order_id", "=", commandeId]],
     ["name", "product_id", "product_uom_qty", "price_unit", "discount", "price_subtotal"]],
    { limit: 300 });
}

// Le site parle EAN, Odoo parle identifiants internes. Sans cette table de
// correspondance, « commander à nouveau » ne saurait pas quels produits
// remettre au panier.
export async function codesBarres(env, produitIds) {
  const ids = [...new Set(produitIds.filter(Boolean))];
  if (!ids.length) return {};
  const r = await appel(env, "product.product", "read",
    [ids, ["barcode"]], {});
  const table = {};
  for (const p of r || []) if (p.barcode) table[p.id] = String(p.barcode);
  return table;
}

// La correspondance inverse : d'un code EAN du site vers la fiche produit
// d'Odoo. C'est la fondation de la création de commande — une ligne sans
// produit identifié n'existe pas pour Odoo, et une commande à laquelle il
// manque une ligne est pire qu'une commande refusée.
//
// Interrogé par paquets : une liste de deux cents codes dans un seul domaine
// finit par se faire refuser, et le jour où le catalogue doublera, personne
// ne se souviendra pourquoi.
export async function produitsParEan(env, eans) {
  const codes = [...new Set((eans || []).map((e) => String(e || "").trim()).filter(Boolean))];
  if (!codes.length) return {};

  const table = {};
  const PAQUET = 100;
  for (let i = 0; i < codes.length; i += PAQUET) {
    const lot = codes.slice(i, i + PAQUET);
    const r = await appel(env, "product.product", "search_read",
      [[["barcode", "in", lot]], ["id", "barcode", "name"]], { limit: lot.length });
    for (const p of r || []) {
      if (p && p.barcode) table[String(p.barcode).trim()] = { id: p.id, nom: p.name };
    }
  }
  return table;
}

export async function facturesDuClient(env, partnerId, limite = 50) {
  return appel(env, "account.move", "search_read",
    [[["partner_id", "=", partnerId], ["move_type", "=", "out_invoice"]],
     ["name", "invoice_date", "invoice_date_due", "state", "payment_state",
      "amount_total", "amount_residual"]],
    { limit: limite, order: "invoice_date desc" });
}
