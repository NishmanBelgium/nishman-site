/* ==========================================================================
   LE POINT D'ENTRÉE DE LA MESURE

   Le navigateur annonce une page vue. Il n'envoie que deux choses : le
   chemin, et le domaine d'où il vient. Le pays et la classe d'appareil
   sont ajoutés ici, à partir de ce que Cloudflare et l'en-tête de
   requête nous disent déjà — pas la peine de le demander au visiteur.

   Ce point d'entrée est public par nécessité : il est appelé par chaque
   page. Il est donc écrit en partant du principe que n'importe qui peut
   l'appeler n'importe comment.

   - rien de ce que le navigateur envoie n'est écrit tel quel ;
   - le corps est borné avant d'être lu ;
   - un plafond par connexion empêche de gonfler un compteur à la main ;
   - la réponse est toujours vide et toujours 204, succès ou non. Une
     mesure n'a rien à répondre, et un échec ne doit pas s'afficher chez
     le visiteur.
   ========================================================================== */

import { freinerIp } from "../_commun.js";
import {
  noterVisite, cheminPropre, sourcePropre, appareilPropre, estRobot, paysPropre,
} from "../_mesure.js";

/* Un corps de mesure fait cent octets. Au-delà de deux kilos, ce n'est
   plus une mesure, c'est autre chose. */
const TAILLE_MAX = 2048;

/* Trois cents pages vues par heure et par connexion. Un visiteur très
   actif en consulte trente ; un script qui veut fausser les chiffres
   s'arrête ici. */
const PLAFOND = 300;

const RIEN = () => new Response(null, {
  status: 204,
  headers: { "cache-control": "no-store" },
});

export async function onRequestPost({ request, env }) {
  if (!env.DB) return RIEN();

  const ua = request.headers.get("user-agent") || "";
  if (estRobot(ua)) return RIEN();

  let brut;
  try {
    brut = await request.text();
    if (brut.length > TAILLE_MAX) return RIEN();
  } catch (e) { return RIEN(); }

  let corps;
  try { corps = JSON.parse(brut || "{}"); } catch (e) { return RIEN(); }
  if (!corps || typeof corps !== "object") return RIEN();

  if (await freinerIp(env.DB, request, "mesure", PLAFOND, 60)) return RIEN();

  let hoteDuSite = "";
  try { hoteDuSite = new URL(request.url).hostname; } catch (e) {}

  try {
    await noterVisite(env.DB, {
      chemin: cheminPropre(corps.chemin),
      pays: paysPropre(request.headers.get("CF-IPCountry")),
      source: sourcePropre(corps.source, hoteDuSite),
      appareil: appareilPropre(ua),
      nouvelle: corps.nouvelle === true,
    });
  } catch (e) {
    /* La mesure ne doit jamais abîmer l'expérience : si la base bronche,
       on perd un compteur, pas une visite. */
  }

  return RIEN();
}

export async function onRequest() {
  return new Response(null, { status: 405 });
}
