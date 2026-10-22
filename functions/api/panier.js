/* ==========================================================================
   PANIER — ce que coûte réellement une sélection.

   Le navigateur envoie des références et des quantités. Il ne décide ni des
   prix, ni de la remise, ni du port, ni de la TVA : c'est ici que tout est
   recalculé, à partir du catalogue, de la table de prix et du compte.

   C'est la pièce sur laquelle viendront se brancher la page de commande et
   le paiement : le montant débité sera celui que ce point d'entrée a rendu,
   jamais celui qu'un navigateur aura annoncé.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { calculer } from "../_calcul.js";

const PAYS_CONNUS = { BE: 1, FR: 1, LU: 1 };

const PORTIER_DEFAUT =
  "https://script.google.com/macros/s/AKfycbxGO1OpyvQVYdEKwuDr-TZgkD7Z9zL8Ly0PNZSMJZDnf_mfIHgz0GOGOMOPCzBAQTWMWw/exec";

function extraireJson(texte) {
  const debut = texte.indexOf("(");
  const fin = texte.lastIndexOf(")");
  if (debut === -1 || fin <= debut) return null;
  try { return JSON.parse(texte.slice(debut + 1, fin)); } catch (e) { return null; }
}

// Le catalogue et les prix changent rarement à l'échelle d'une poignée de
// requêtes : on les garde le temps de vie de l'isolat, pas au-delà.
let cacheCatalogue = null;
let cachePrix = null;
let cachePrixExpire = 0;
const PRIX_DUREE_MS = 60 * 1000;

async function catalogue(request) {
  if (cacheCatalogue) return cacheCatalogue;
  const r = await fetch(new URL("/assets/data/products.json", request.url));
  if (!r.ok) throw new Error("catalogue injoignable");
  const d = await r.json();
  cacheCatalogue = Array.isArray(d) ? d : (d.products || []);
  return cacheCatalogue;
}

async function tableDePrix(env) {
  if (cachePrix && Date.now() < cachePrixExpire) return cachePrix;
  const code = env.PORTIER_CODE;
  if (!code) throw new Error("portier non configuré");

  const url = (env.PORTIER_URL || PORTIER_DEFAUT)
    + "?action=unlock&callback=p&code=" + encodeURIComponent(code);
  const r = await fetch(url, { headers: { accept: "*/*" } });
  if (!r.ok) throw new Error("portier injoignable");

  const d = extraireJson(await r.text());
  if (!d || !d.ok || !d.prices) throw new Error("portier sans prix");

  cachePrix = d.prices;
  cachePrixExpire = Date.now() + PRIX_DUREE_MS;
  return cachePrix;
}

export async function onRequestPost({ request, env }) {
  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const selection = (corps && corps.selection) || {};
  if (typeof selection !== "object" || Array.isArray(selection)) {
    return erreur("Requête illisible.", 400, "illisible");
  }

  // Le compte donne le pays et la validité du numéro de TVA : deux choses
  // qu'un visiteur ne peut pas s'attribuer lui-même. Sans session, on
  // calcule quand même — pour afficher un panier — mais on le dit.
  const compte = env.DB ? await compteConnecte(request, env.DB) : null;

  const pays = compte ? compte.pays : (PAYS_CONNUS[corps.pays] ? corps.pays : null);
  const tvaValide = compte ? !!compte.tva_valide : false;

  let produits, prix;
  try {
    [produits, prix] = await Promise.all([catalogue(request), tableDePrix(env)]);
  } catch (e) {
    return json({ ok: false, raison: "indisponible", souci: String(e.message || e) });
  }

  const resultat = calculer({
    selection, produits, prix,
    pays: pays || "BE",
    tvaValide,
    mode: corps.mode === "retrait" ? "retrait" : "livraison",
    promo: corps.promo,
  });

  return json({
    ok: true,
    connecte: !!compte,
    // Sans session, le pays est une hypothèse : le montant affiché est
    // indicatif et la page doit le dire. Avec session, il fait foi.
    pays_certain: !!compte,
    pays: pays || "BE",
    ...resultat,
  });
}


export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
