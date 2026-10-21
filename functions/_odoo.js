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
     ["name", "product_uom_qty", "price_unit", "discount", "price_subtotal"]],
    { limit: 300 });
}

export async function facturesDuClient(env, partnerId, limite = 50) {
  return appel(env, "account.move", "search_read",
    [[["partner_id", "=", partnerId], ["move_type", "=", "out_invoice"]],
     ["name", "invoice_date", "invoice_date_due", "state", "payment_state",
      "amount_total", "amount_residual"]],
    { limit: limite, order: "invoice_date desc" });
}
