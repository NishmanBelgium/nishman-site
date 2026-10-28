/* ==========================================================================
   PANIER PUBLIC — ce que coûte une sélection, pour un particulier.

   Aucune session n'est demandée : c'est une boutique grand public, et on
   n'oblige personne à créer un compte pour voir son total. Mais l'absence
   de compte ne change rien à la règle : le navigateur envoie des
   codes-barres et des quantités, le serveur répond avec des montants, et
   c'est ce total-là qui sera encaissé.

   La réponse porte aussi la clé PUBLIQUE SendCloud. Elle sert au sélecteur
   de points relais, qui tourne dans le navigateur et ne peut pas
   fonctionner sans. SendCloud la conçoit pour cet usage et le dit dans sa
   documentation : seule la clé secrète doit rester sur le serveur. Elle
   est servie depuis ici plutôt qu'écrite dans la page, pour qu'une rotation
   de clé ne demande pas de modifier le code du site.
   ========================================================================== */

import { json, erreur } from "../_commun.js";
import { catalogue } from "../_boutique.js";
import { calculerB2C, REGLES, paysValideB2C } from "../_calcul_b2c.js";
import { configureSendcloud } from "../_sendcloud.js";

export async function onRequestPost({ request, env }) {
  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const selection = (corps && corps.selection) || {};
  if (typeof selection !== "object" || Array.isArray(selection)) {
    return erreur("Requête illisible.", 400, "illisible");
  }

  const pays = paysValideB2C(corps.pays) ? String(corps.pays).toUpperCase() : "BE";

  let produits;
  try { produits = await catalogue(request); }
  catch (e) { return json({ ok: false, raison: "indisponible" }); }

  const resultat = calculerB2C({ selection, produits, pays });

  return json({
    ok: true,
    ...resultat,
    regles: {
      port: REGLES.port,
      franco: REGLES.franco,
      pays: REGLES.pays,
    },
    // De quoi ouvrir le sélecteur de points relais. Si les clés ne sont pas
    // configurées, la boutique le saura et dira au client que la livraison
    // est momentanément indisponible, plutôt que d'ouvrir une fenêtre vide.
    relais: {
      disponible: configureSendcloud(env),
      cle: String((env && env.SENDCLOUD_PUBLIC) || "").trim(),
    },
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
