/* ==========================================================================
   MAGNIFIC — le relais vers l'atelier d'images.

   Pourquoi ce fichier existe plutôt qu'un appel direct : la clé Magnific
   vit dans les secrets Cloudflare et ne doit jamais descendre dans un
   navigateur ni apparaître ailleurs. Le site la porte, le navigateur ne
   la voit pas, et seule l'administratrice peut déclencher un travail —
   chaque génération coûte des crédits.

   Trois gestes, et rien d'autre :

     POST /api/magnific { action: "upscale",  image, prompt? }
     POST /api/magnific { action: "video",    image, prompt?, duree? }
     GET  /api/magnific?tache=<id>&type=<video|upscale>

   Les travaux sont asynchrones : on reçoit un identifiant, on repasse le
   chercher. Pas de webhook pour l'instant — un webhook demande un secret
   de signature et une route publique, deux choses de plus à surveiller
   pour un gain nul tant qu'on génère à la demande.

   ATTENTION, dit par Magnific et vérifié ici : les liens de sortie
   expirent trente minutes après la génération. Ce qui n'est pas
   récupéré dans ce délai est perdu, et un crédit avec.
   ========================================================================== */

import { json, erreur, compteAdmin } from "../_commun.js";

const RACINE = "https://api.magnific.com/v1/ai";

/* Les chemins par type de travail. Un objet plutôt qu'une concaténation :
   une faute de frappe dans une URL d'API se paie en crédits. */
const CHEMINS = {
  video:   "/image-to-video/kling-v2",
  upscale: "/image-upscaler-creative",
};

function cle(env) {
  return String((env && env.MAGNIFIC_KEY) || "").trim();
}

async function appel(env, chemin, methode, corps) {
  const r = await fetch(RACINE + chemin, {
    method: methode,
    headers: {
      "x-magnific-api-key": cle(env),
      ...(corps ? { "Content-Type": "application/json" } : {}),
    },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });

  const texte = await r.text();
  let d = null;
  try { d = JSON.parse(texte); } catch (e) { /* laissé brut ci-dessous */ }

  if (!r.ok) {
    // On remonte le motif tel quel : « 401 » tout seul envoie chercher la
    // panne du mauvais côté. Le message de Magnific dit souvent si c'est
    // la clé, le quota, ou l'image qui ne convient pas.
    const motif = (d && (d.message || d.error || (d.data && d.data.message))) ||
                  texte.slice(0, 240) || ("HTTP " + r.status);
    const e = new Error(motif);
    e.statut = r.status;
    throw e;
  }
  return d;
}

export async function onRequestPost({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!cle(env)) {
    return erreur("La clé Magnific n'est pas configurée sur cet environnement.",
                  503, "magnific-absente");
  }

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const action = String((corps && corps.action) || "").trim();
  const chemin = CHEMINS[action];
  if (!chemin) return erreur("Action inconnue.", 400, "action");

  const image = String((corps && corps.image) || "").trim();
  if (!image) return erreur("Image manquante.", 400, "image");

  const charge = { image };
  if (corps.prompt) charge.prompt = String(corps.prompt).slice(0, 2500);
  if (corps.negatif) charge.negative_prompt = String(corps.negatif).slice(0, 2500);

  if (action === "video") {
    // Magnific n'accepte que 5 ou 10 secondes. Tout le reste est refusé
    // côté API : autant le dire ici, où l'erreur est lisible.
    const d = String(corps.duree || "5");
    charge.duration = d === "10" ? "10" : "5";
    if (typeof corps.cfg === "number") charge.cfg_scale = Math.min(1, Math.max(0, corps.cfg));
  }

  try {
    const d = await appel(env, chemin, "POST", charge);
    const tache = (d && d.data) || d || {};
    return json({ ok: true, action, tache: tache.task_id || null, etat: tache.status || null });
  } catch (e) {
    return json({ ok: false, motif: String(e.message || e).slice(0, 300),
                  statut: e.statut || null }, 502);
  }
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!cle(env)) {
    return erreur("La clé Magnific n'est pas configurée sur cet environnement.",
                  503, "magnific-absente");
  }

  const url = new URL(request.url);

  /* Sans paramètre, la page dit seulement si la clé répond. C'est la
     première chose qu'on veut savoir, et ça ne consomme aucun crédit. */
  const tache = String(url.searchParams.get("tache") || "").trim();
  if (!tache) {
    return json({ ok: true, configure: true,
                  actions: Object.keys(CHEMINS),
                  note: "Les liens de sortie de Magnific expirent après 30 minutes." });
  }

  const type = String(url.searchParams.get("type") || "video").trim();
  const chemin = CHEMINS[type];
  if (!chemin) return erreur("Type inconnu.", 400, "type");

  try {
    const d = await appel(env, chemin + "/" + encodeURIComponent(tache), "GET", null);
    const t = (d && d.data) || d || {};
    return json({ ok: true, etat: t.status || null,
                  sorties: t.generated || t.generated_images || t.result || null, brut: t });
  } catch (e) {
    return json({ ok: false, motif: String(e.message || e).slice(0, 300),
                  statut: e.statut || null }, 502);
  }
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
