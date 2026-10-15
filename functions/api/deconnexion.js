/* ==========================================================================
   DÉCONNEXION — ferme la session en cours, côté serveur et côté navigateur.
   ========================================================================== */

import { json, lireCookie, fermerSession, cookieEfface } from "../_commun.js";

export async function onRequestPost({ request, env }) {
  await fermerSession(env.DB, lireCookie(request));
  return json({ ok: true }, 200, { "set-cookie": cookieEfface() });
}

export async function onRequest({ request, env }) {
  await fermerSession(env.DB, lireCookie(request));
  return json({ ok: true }, 200, { "set-cookie": cookieEfface() });
}
