/* ==========================================================================
   SANTÉ — la boutique peut-elle encore prendre une commande, oui ou non ?

   Du 12 au 15 novembre 2026, elle ne le pouvait plus. Le sélecteur de
   points relais refusait de s'ouvrir, le point relais est obligatoire pour
   valider, et donc plus personne ne pouvait acheter — en France comme en
   Belgique, trois jours durant, en plein Black Friday. Rien ne l'a dit.
   Aucune alerte, aucun tableau de bord : on l'a appris par un client qui a
   écrit pour demander comment faire.

   Odoo le confirme après coup, et c'est ce qui fait mal : 13 et 14
   novembre, zéro commande de particulier, contre une par jour avant. Puis
   le correctif part à 10h53 le 15, et six commandes tombent dans la
   journée, la première dix-sept minutes après.

   Une vente qui ne commence pas ne laisse aucune trace. C'est pour ça
   qu'il faut quelqu'un qui essaie, régulièrement, et qui crie quand ça ne
   marche plus. Cette page est ce quelqu'un.

   ELLE REFAIT LE PARCOURS, ELLE NE LE DEVINE PAS :
     - les prix professionnels arrivent-ils, et d'où ;
     - un panier de particulier se calcule-t-il, avec un total ;
     - le stock d'Odoo répond-il (c'est lui qui vidait les paniers) ;
     - reste-t-il un transporteur pour choisir un point relais.

   ELLE EST GRATUITE À APPELER. Pas d'analyse des 334 Ko du catalogue
   professionnel, pas de relevé de stock sur 223 références : le 13
   novembre, c'est précisément ce travail-là qui a tué la page des prix sur
   un isolat froid. Un veilleur qui épuise la maison qu'il surveille ne
   sert à rien.

   ELLE NE DIT RIEN DE PRIVÉ. Des oui, des non, des nombres. Aucun prix,
   aucun nom, aucun client. Elle peut donc être appelée par n'importe quel
   service de surveillance sans rien exposer.

   LE CODE HTTP EST LE SIGNAL : 200 si la boutique vend, 503 si elle ne
   vend plus. Un surveillant qui ne sait rien lire d'autre qu'un code
   saura quand même réveiller quelqu'un.
   ========================================================================== */

import { json } from "../_commun.js";
import { donneesPortier } from "../_tarifs.js";
import { catalogue as catalogueBoutique } from "../_boutique.js";
import { calculerB2C } from "../_calcul_b2c.js";
import { stockVendable } from "../_stock.js";
import { transporteursPointRelais, configureSendcloud } from "../_sendcloud.js";

/* Les transporteurs que le sélecteur de points relais ne sait pas ouvrir.
   La même liste que boutique-commander.js : si elle devait grandir, ce
   serait ici aussi, parce que c'est ici qu'on s'en apercevrait. */
const CASSENT_LA_CARTE = ["ups"];

/** Une épreuve : son nom, si elle passe, et ce qu'elle a vu. */
function epreuve(nom, ok, detail, vital) {
  return { nom, ok: !!ok, detail: String(detail || "").slice(0, 160), vital: vital !== false };
}

export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const attendre = (p) => { try { ctx.waitUntil(p); } catch (e) { /* tant pis */ } };
  const debut = Date.now();
  const faites = [];

  /* --- 1. Les prix professionnels ------------------------------------- */
  let prix = null;
  try {
    const d = await donneesPortier(env, { secoursDabord: true, attendre });
    prix = d && d.prices ? Object.keys(d.prices).length : 0;
    const age = Math.round(Number(d && d.age_s) || 0);
    const source = (d && d.source) || "portier";
    /* Moins de cinquante prix, ce n'est pas une table : c'est un reste.
       Et une copie de secours de plus de six heures veut dire que le
       portier ne répond plus depuis six heures — la vitrine tient encore,
       mais quelqu'un doit le savoir avant qu'elle ne s'éteigne. */
    faites.push(epreuve("prix", prix >= 50,
      prix + " prix · source " + source + (age ? " · " + age + " s" : "")));
    if (source === "secours" && age > 6 * 3600) {
      faites.push(epreuve("portier", false,
        "le script Google ne répond plus depuis " + Math.round(age / 3600) + " h", false));
    }
  } catch (e) {
    faites.push(epreuve("prix", false, "aucun prix : " + ((e && e.message) || e)));
  }

  /* --- 2. Un panier de particulier ------------------------------------ */
  /* On prend la première référence vendable du catalogue grand public
     plutôt qu'un code écrit en dur : une référence retirée du site ne doit
     pas faire sonner l'alarme pour rien. */
  let ean = "";
  try {
    const bou = await catalogueBoutique(request);
    const p = (bou || []).find((x) => x && x.ean && !x.bientot && Number(x.ttc) > 0);
    ean = p ? String(p.ean) : "";
    if (!ean) throw new Error("aucune référence vendable au catalogue");

    const r = calculerB2C({ selection: { [ean]: 2 }, produits: bou, pays: "FR" });
    const lignes = (r && r.lignes) || [];
    faites.push(epreuve("panier", lignes.length === 1 && Number(r.total) > 0,
      lignes.length + " ligne · total " + (r && r.total)));
  } catch (e) {
    faites.push(epreuve("panier", false, "calcul impossible : " + ((e && e.message) || e)));
  }

  /* --- 3. Le stock d'Odoo --------------------------------------------- */
  /* UNE SEULE RÉFÉRENCE. C'est assez pour savoir si Odoo répond, et c'est
     ce qui vidait les paniers : une référence qu'Odoo ne connaît pas vaut
     zéro, et la ligne disparaît sans un mot. */
  if (ean) {
    try {
      const s = await stockVendable(env, [ean], { attendre });
      const n = s && Object.prototype.hasOwnProperty.call(s, ean) ? Number(s[ean]) : null;
      faites.push(epreuve("stock", n !== null, n === null
        ? "Odoo n'a rien répondu pour la référence d'essai"
        : n + " pièce(s) vendable(s) sur la référence d'essai", false));
    } catch (e) {
      faites.push(epreuve("stock", false, "Odoo muet : " + ((e && e.message) || e), false));
    }
  }

  /* --- 4. Le point relais, sans lequel on ne commande pas -------------- */
  for (const pays of ["FR", "BE"]) {
    try {
      if (!configureSendcloud(env)) {
        faites.push(epreuve("relais " + pays, false, "clés SendCloud absentes"));
        continue;
      }
      const liste = await transporteursPointRelais(env, pays);
      /* null = SendCloud n'a pas répondu ; la boutique n'applique alors
         aucun filtre et la carte s'ouvre quand même. Ce n'est donc pas une
         panne de vente, mais ça se dit. */
      if (liste === null) {
        faites.push(epreuve("relais " + pays, true, "liste inconnue, carte ouverte sans filtre", false));
        continue;
      }
      const utilisables = liste.filter((t) => CASSENT_LA_CARTE.indexOf(String(t).toLowerCase()) === -1);
      faites.push(epreuve("relais " + pays, utilisables.length > 0,
        utilisables.length ? utilisables.join(", ")
          : "aucun transporteur utilisable — plus personne ne peut valider"));
    } catch (e) {
      faites.push(epreuve("relais " + pays, false, "SendCloud muet : " + ((e && e.message) || e)));
    }
  }

  const vitalesKo = faites.filter((f) => f.vital && !f.ok);
  const ok = vitalesKo.length === 0;

  return json({
    ok,
    verdict: ok
      ? "la boutique peut prendre une commande"
      : "LA BOUTIQUE NE PEUT PAS PRENDRE DE COMMANDE : " + vitalesKo.map((f) => f.nom).join(", "),
    epreuves: faites,
    ms: Date.now() - debut,
    heure: new Date().toISOString(),
  }, ok ? 200 : 503);
}
