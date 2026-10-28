/* ==========================================================================
   SONDE SENDCLOUD — regarder avant de créer.

   Créer une étiquette coûte de l'argent et engage un transporteur. On ne
   tâtonne donc pas : avant de brancher la création automatique, cette page
   interroge SendCloud en LECTURE SEULE et rapporte ce que le compte de NBD
   propose réellement.

   Trois choses dont on a besoin et qu'aucune documentation ne peut
   deviner à notre place :

   1. L'adresse d'expéditeur enregistrée, et son identifiant. Une étiquette
      part forcément de quelque part.
   2. Les méthodes d'expédition réellement disponibles vers un point relais,
      avec leurs identifiants. C'est la liste du compte de NBD, pas celle
      du catalogue général de SendCloud.
   3. Un point relais réel, trouvé près d'un code postal, pour vérifier que
      la recherche fonctionne depuis le serveur et pas seulement depuis le
      navigateur.

   Aucun colis n'est créé, aucune étiquette n'est achetée. On peut la
   rappeler autant de fois qu'on veut.

   Réservé au compte de NBD.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { configureSendcloud, appelSendcloud, compteSendcloud } from "../_sendcloud.js";

const ADMIN_DEFAUT = "contact@nishman.be";

/* Un code postal par pays, au cœur de la zone de vente, pour que la
   recherche de points relais ait toutes les chances d'aboutir. */
const SONDAGE = {
  BE: { cp: "7130", ville: "Binche" },
  FR: { cp: "59000", ville: "Lille" },
  LU: { cp: "1111", ville: "Luxembourg" },
};

async function sansCasser(nom, promesse) {
  try { return { nom, ok: true, donnees: await promesse }; }
  catch (e) {
    return { nom, ok: false, souci: String((e && e.message) || "erreur").slice(0, 240),
             statut: (e && e.statut) || null };
  }
}

/** Les points relais près d'un code postal, vus depuis le serveur. */
async function pointsPres(env, pays, cp) {
  const q = "?country=" + encodeURIComponent(pays) + "&postal_code=" + encodeURIComponent(cp);
  const r = await fetch("https://servicepoints.sendcloud.sc/api/v2/service-points" + q, {
    headers: {
      authorization: "Basic " + btoa(
        String(env.SENDCLOUD_PUBLIC || "").trim() + ":" + String(env.SENDCLOUD_SECRET || "").trim()),
      accept: "application/json",
    },
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) {
    const err = new Error("HTTP " + r.status + (t ? " — " + t.slice(0, 160) : ""));
    err.statut = r.status;
    throw err;
  }
  return Array.isArray(d) ? d : (d && d.results) || [];
}

export async function onRequestGet({ request, env }) {
  const compte = env.DB ? await compteConnecte(request, env.DB) : null;
  const admins = String(env.EMAIL_ADMIN || ADMIN_DEFAUT)
    .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const moi = String((compte && compte.email) || "").trim().toLowerCase();
  if (!moi || admins.indexOf(moi) === -1) return erreur("Page réservée.", 404, "reservee");

  if (!configureSendcloud(env)) {
    return erreur("Les clés SendCloud ne sont pas configurées.", 503, "sendcloud");
  }

  const url = new URL(request.url);
  const pays = String(url.searchParams.get("pays") || "BE").toUpperCase();
  const defaut = SONDAGE[pays] || SONDAGE.BE;
  // Un code postal au choix : la recherche de points relais dépend
  // entièrement du lieu, et un code postal mal choisi fait conclure à tort
  // qu'un pays n'est pas desservi.
  const cpDemande = String(url.searchParams.get("cp") || "").trim();
  const lieu = cpDemande ? { cp: cpDemande, ville: "code postal demandé" } : defaut;

  const sorties = {};

  // 1) Le compte.
  const c = await sansCasser("compte", compteSendcloud(env));
  sorties.compte = c.ok
    ? { ok: true, nom: (c.donnees && c.donnees.username) || (c.donnees && c.donnees.company_name) || "—",
        societe: (c.donnees && c.donnees.company_name) || "" }
    : { ok: false, souci: c.souci };

  // 2) Les adresses d'expéditeur. Sans elle, aucune étiquette ne peut partir.
  const a = await sansCasser("adresses", appelSendcloud(env, "/user/addresses/sender"));
  if (a.ok) {
    const liste = (a.donnees && a.donnees.sender_addresses) || [];
    sorties.expediteur = {
      ok: liste.length > 0,
      nombre: liste.length,
      adresses: liste.map((x) => ({
        id: x.id, nom: x.company_name || x.contact_name || "",
        ville: [x.postal_code, x.city].filter(Boolean).join(" "),
        pays: x.country,
      })),
      conseil: liste.length
        ? "L'identifiant à retenir est celui de l'adresse du dépôt."
        : "AUCUNE adresse d'expéditeur : à créer dans SendCloud (Réglages, Adresses).",
    };
  } else {
    sorties.expediteur = { ok: false, souci: a.souci };
  }

  // 3) Un point relais réel, cherché depuis le serveur.
  const p = await sansCasser("points", pointsPres(env, pays, lieu.cp));
  if (p.ok) {
    const liste = p.donnees || [];
    sorties.points_relais = {
      ok: liste.length > 0,
      recherche: pays + " " + lieu.cp + " (" + lieu.ville + ")",
      nombre: liste.length,
      transporteurs: [...new Set(liste.map((x) => x.carrier).filter(Boolean))],
      exemples: liste.slice(0, 5).map((x) => ({
        id: x.id, nom: x.name, transporteur: x.carrier,
        adresse: [x.street, x.house_number].filter(Boolean).join(" "),
        ville: [x.postal_code, x.city].filter(Boolean).join(" "),
      })),
      tous: liste.map((x) => ({
        id: x.id, nom: x.name, transporteur: x.carrier,
        ville: [x.postal_code, x.city].filter(Boolean).join(" "),
      })),
    };
  } else {
    sorties.points_relais = { ok: false, souci: p.souci,
      recherche: pays + " " + lieu.cp };
  }

  // 4) Les méthodes d'expédition, pour UN POINT DE CHAQUE TRANSPORTEUR.
  //
  //    Interroger un seul point ne dit rien du coût réel : le client
  //    choisit son point relais, donc il choisit le transporteur, donc il
  //    choisit ce que l'envoi coûte. Comparer bpost, DPD et Mondial Relay
  //    sur le même trajet est la seule façon de savoir ce qu'une commande
  //    coûtera vraiment — et l'écart est loin d'être négligeable.
  const parTransporteur = {};
  for (const x of (sorties.points_relais && sorties.points_relais.tous) || []) {
    if (x.transporteur && !parTransporteur[x.transporteur]) parTransporteur[x.transporteur] = x;
  }

  const comparatif = [];
  for (const [transporteur, point] of Object.entries(parTransporteur)) {
    const m = await sansCasser("methodes", appelSendcloud(env,
      "/shipping_methods?to_country=" + encodeURIComponent(pays)
      + "&service_point_id=" + encodeURIComponent(point.id)));
    if (!m.ok) {
      comparatif.push({ transporteur, ok: false, souci: m.souci });
      continue;
    }
    const liste = ((m.donnees && m.donnees.shipping_methods) || [])
      .map((x) => ({
        id: x.id, nom: x.name,
        min: Number(x.min_weight), max: Number(x.max_weight),
        prix: Array.isArray(x.countries) && x.countries[0] ? x.countries[0].price : null,
      }))
      .filter((x) => x.prix !== null);

    // Ce qui nous intéresse vraiment : la tranche qui couvrira un colis de
    // particulier. Un panier de deux ou trois articles pèse rarement plus
    // de 800 grammes emballé.
    const pour = (kg) => {
      const bonnes = liste.filter((x) => kg > x.min && kg <= x.max);
      if (!bonnes.length) return null;
      return bonnes.reduce((a, b) => (a.prix <= b.prix ? a : b));
    };
    const p300 = pour(0.3), p800 = pour(0.8), p2 = pour(2);

    comparatif.push({
      transporteur, ok: liste.length > 0,
      point: point.nom + " (" + point.ville + ")",
      methodes: liste.length,
      colis_300g: p300 ? { id: p300.id, nom: p300.nom, prix: p300.prix } : null,
      colis_800g: p800 ? { id: p800.id, nom: p800.nom, prix: p800.prix } : null,
      colis_2kg: p2 ? { id: p2.id, nom: p2.nom, prix: p2.prix } : null,
    });
  }

  comparatif.sort((a, b) => {
    const pa = (a.colis_300g && a.colis_300g.prix) || 999;
    const pb = (b.colis_300g && b.colis_300g.prix) || 999;
    return pa - pb;
  });

  sorties.methodes = {
    ok: comparatif.some((c) => c.ok),
    comparatif,
    conseil: comparatif.length
      ? "Le moins cher pour un colis de 300 g est en tête de liste. "
        + "C'est son identifiant de méthode qui ira sur le colis."
      : "Aucune méthode trouvée : vérifiez les transporteurs cochés dans "
        + "l'intégration « Site Nishman » chez SendCloud.",
  };

  const tout = ["compte", "expediteur", "points_relais", "methodes"]
    .every((k) => sorties[k] && sorties[k].ok);

  if (sorties.points_relais && sorties.points_relais.tous) delete sorties.points_relais.tous;

  return json({
    ok: true,
    tout_va_bien: tout,
    resume: tout
      ? "SendCloud répond : adresse d'expéditeur, points relais et méthodes d'expédition "
        + "sont disponibles. La création automatique d'étiquettes peut être branchée."
      : "Il manque quelque chose avant de pouvoir créer des étiquettes. Voir le détail.",
    pays_testé: pays,
    ...sorties,
    note: "Cette page ne crée rien et n'achète rien. Elle peut être rappelée sans risque, "
        + "et avec ?pays=FR ou ?pays=LU pour les autres destinations.",
    date: new Date().toISOString(),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
