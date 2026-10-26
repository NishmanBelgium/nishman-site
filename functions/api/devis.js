/* ==========================================================================
   DEVIS — le relais entre la page de devis et le script Google.

   Jusqu'ici la page envoyait la demande directement au script, dont
   l'adresse figurait en clair dans config.js. Le script, lui, acceptait
   n'importe quel envoi sans vérifier qui appelait : n'importe qui lisant le
   code source du site pouvait injecter de faux devis dans Odoo.

   La demande passe désormais par ici. Le code interne qui authentifie
   l'appel ne quitte jamais Cloudflare, et la réponse du script est lue pour
   de vrai — le visiteur ne verra plus « envoyé » quand rien n'est parti.

   Une session est exigée, parce que la page de devis l'exige déjà depuis
   l'étape 202 : sans cela, le point d'entrée resterait ouvert alors que la
   page ne l'est pas. Si vous rouvrez un jour le devis aux prospects, c'est
   le contrôle ci-dessous qu'il faudra retirer, et lui seul.
   ========================================================================== */

import { json, erreur, emailValide, texteValide, compteConnecte } from "../_commun.js";

const PORTIER_DEFAUT =
  "https://script.google.com/macros/s/AKfycbxGO1OpyvQVYdEKwuDr-TZgkD7Z9zL8Ly0PNZSMJZDnf_mfIHgz0GOGOMOPCzBAQTWMWw/exec";

// Garde-fous de volume : un devis honnête tient largement dessous, et une
// tentative d'inondation s'arrête ici plutôt que dans votre Odoo.
const LIGNES_MAX = 300;
const TAILLE_MAX = 120 * 1024;

/**
 * La réponse du script est du texte. On en tire un statut plutôt que de
 * supposer que tout s'est bien passé.
 */
function lireReponse(texte) {
  const t = String(texte || "");
  if (!t) return { ok: false, motif: "muet" };
  if (/^error:/i.test(t)) return { ok: false, motif: "refus" };
  if (t.indexOf("CODE REFUSE") >= 0) return { ok: false, motif: "code" };
  if (t.indexOf("ERREUR ODOO") >= 0) return { ok: false, motif: "odoo" };
  const m = t.match(/\bS\d{5,}\b/);
  return { ok: true, devis: m ? m[0] : "" };
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");
  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous pour envoyer votre demande.", 401, "session");

  const brut = await request.text();
  if (!brut || brut.length > TAILLE_MAX) {
    return erreur("Demande illisible.", 400, "illisible");
  }

  let corps;
  try { corps = JSON.parse(brut); }
  catch (e) { return erreur("Demande illisible.", 400, "illisible"); }

  // Validation de forme : on ne juge pas le contenu commercial, qui reste
  // sous votre contrôle dans Odoo, mais on refuse ce qui n'a pas de sens.
  const client = (corps && corps.client) || {};
  if (!emailValide(client.email || "")) {
    return erreur("Adresse e-mail invalide.", 400, "email");
  }
  if (!texteValide(client.company || "", 2, 120)) {
    return erreur("Nom de société manquant.", 400, "societe");
  }
  if (!Array.isArray(corps.lines) || !corps.lines.length) {
    return erreur("Aucun produit dans la demande.", 400, "vide");
  }
  if (corps.lines.length > LIGNES_MAX) {
    return erreur("Demande trop volumineuse.", 400, "volume");
  }

  const code = env.PORTIER_CODE;
  if (!code) return erreur("Service indisponible.", 503, "portier");

  const url = env.PORTIER_URL || env.ORDER_LOG_URL || PORTIER_DEFAUT;

  let reponse;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // Le code voyage dans la charge utile, jamais jusqu'au navigateur.
      body: JSON.stringify({ ...corps, code }),
    });
    reponse = lireReponse(await r.text());
  } catch (e) {
    reponse = { ok: false, motif: "injoignable" };
  }

  if (!reponse.ok) {
    return json({ ok: false, motif: reponse.motif }, 502);
  }
  return json({ ok: true, devis: reponse.devis || "" });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
