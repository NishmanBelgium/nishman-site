/* ==========================================================================
   LE GARDE-FOU DES RÉPONSES — pour qu'une panne dise son nom.

   Écrit le 26 novembre 2026, après six jours d'aveuglement.

   CE QUI S'EST PASSÉ. Le 20 novembre à 18 h 46, une position fiscale a été
   renommée dans Odoo. Le site cherche ses positions par nom exact : plus
   aucune commande française n'aboutissait, ni sur la boutique, ni au
   tunnel professionnel pour un salon français sans numéro de TVA. Dix
   clientes de la boutique et cinq salons français ont essayé — en vain,
   pendant six jours.

   Le code faisait pourtant son travail : il levait « position_introuvable »
   et répondait un JSON clair, avec le motif, en 502. Mais ce motif n'est
   jamais arrivé. Le journal d'incidents n'a gardé que ça, 294 fois le même
   texte :

       <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" …

   C'est la page d'erreur de Cloudflare. **Cloudflare remplace le corps
   d'une réponse 502 par la sienne.** La cliente voyait « notre serveur n'a
   pas répondu correctement », le journal enregistrait « reponse-illisible »,
   et le motif que le site avait pris soin de nommer mourait entre les deux.

   DEUX TROUS, DEUX PARADES.

   1) Le 502 avalé. Les réponses d'échec des chemins de paiement passent en
      503, qui traverse intact. C'est fait dans chaque fichier concerné, pas
      ici : le statut appartient à la décision, pas au tuyau.

   2) L'exception qui s'échappe. Il n'y avait AUCUN garde global sur /api :
      tout ce qui était levé hors des try internes finissait en 500 opaque.
      Le journal en compte — 9 fois le 26 novembre sur la boutique, 10 fois
      le 19 sur le panier — et de celles-là on ne sait toujours rien.
      C'est ce que ce fichier répare.

   PORTÉE VOLONTAIREMENT ÉTROITE. Ce garde est posé sur `/api/`, pas à la
   racine de `functions/`. À la racine il verrait passer chaque page et
   chaque image du site, et un défaut ici éteindrait tout. Toutes les pannes
   relevées sont des appels d'API : c'est là qu'il sert, et nulle part
   ailleurs.

   IL NE DÉCIDE RIEN. Il laisse passer la réponse telle quelle, quel que
   soit son statut. Il ne parle que lorsqu'une exception est arrivée
   jusqu'ici — c'est-à-dire lorsque, sans lui, il n'y aurait eu aucune
   réponse du tout.
   ========================================================================== */

export async function onRequest(ctx) {
  try {
    return await ctx.next();
  } catch (e) {
    /* On est le dernier filet. Rien ici ne doit pouvoir lever à son tour :
       pas d'appel réseau, pas de base de données, pas de dépendance — juste
       une réponse construite à la main.

       503 et non 500 : le corps arrive alors intact chez la cliente, et
       c'est tout l'objet de ce fichier. Le message reste celui qu'on lui
       doit — rien n'a été débité, son panier est gardé — et le détail
       technique voyage à côté, pour le journal. */
    const nom = (e && e.name) || "Error";
    const message = String((e && e.message) || e || "inconnue").slice(0, 300);
    const code = (e && e.code) ? String(e.code).slice(0, 60) : "";

    let chemin = "";
    try { chemin = new URL(ctx.request.url).pathname; } catch (_) { /* tant pis */ }

    /* La trace part dans les journaux Cloudflare, où elle est lisible en
       direct ; elle ne part pas au navigateur, qui n'a que faire d'une
       pile d'appels. */
    try {
      console.log("[api] exception non rattrapée sur " + chemin
        + " — " + nom + " : " + message
        + (e && e.stack ? "\n" + String(e.stack).slice(0, 1200) : ""));
    } catch (_) { /* tant pis */ }

    return new Response(JSON.stringify({
      ok: false,
      motif: code || "exception",
      exception: nom,
      message: "Une erreur inattendue est survenue de notre côté. Rien ne vous "
             + "a été débité et votre panier est conservé. Réessayez dans un "
             + "instant : l'incident a été enregistré avec son motif.",
      detail: message,
      chemin: chemin,
    }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  }
}
