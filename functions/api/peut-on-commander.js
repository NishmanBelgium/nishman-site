/* ==========================================================================
   PEUT-ON COMMANDER, DEPUIS CHAQUE PAYS ? — le contrôle qui ne crée rien.

   Écrit le 26 novembre 2026, le soir d'une panne de six jours.

   CE QU'IL SURVEILLE, ET POURQUOI CELUI-LÀ PRÉCISÉMENT.

   Le 20 novembre à 18 h 46, la position fiscale « OSS B2C France » a été
   renommée « Intra » dans Odoo. Le site cherche ses réglages Odoo **par
   leur nom**, et un nom introuvable arrête la commande net. Résultat : dix
   clientes de la boutique et quatre salons français bloqués pendant six
   jours, sans que rien ne passe au rouge.

   Trois réglages Odoo sont retrouvés par leur nom, et il y en a un jeu par
   pays : la **taxe**, la **position fiscale**, le **mode de livraison**.
   Neuf noms au total, neuf points de rupture, chacun indépendant. Les
   renommer dans Odoo est un geste anodin qui coupe une route de paiement.

   CE QU'IL NE FAIT PAS, ET C'EST VOULU.

   Il ne crée aucune commande, ne touche à aucune fiche, n'écrit nulle part.
   Il lit neuf noms. C'est ce qui lui permet d'être **public** et d'être
   appelé aussi souvent qu'on veut — là où essai-commande-b2c.js, qui crée
   de vraies commandes pour vérifier le total au centime, doit rester
   réservé au compte de NBD et rester rare.

   Les deux se complètent : celui-ci dit « la route est-elle ouverte ? »
   plusieurs fois par jour ; l'autre dit « et le compte est-il juste ? »
   quand on le lui demande.

   CE QU'IL NE RÉVÈLE PAS. Il rend des oui et des non, et le nom de ce qui
   manque — « position fiscale », « taxe », « livraison » — jamais la valeur
   cherchée. Un visiteur apprend que la France peut commander ; il n'apprend
   rien du plan comptable de NBD.
   ========================================================================== */

import { freinerIp, json, erreur } from "../_commun.js";
import { configure as configureOdoo, appel as appelOdoo } from "../_odoo.js";
import { parNomInsensible, nomLivraison } from "../_commande_odoo.js";
import { regimeB2C } from "../_oss.js";

const PAYS = ["BE", "FR", "LU"];

/* La taxe se cherche sur le nom EXACT et doit être unique : « 21% TTC »
   contient un %, qui serait un joker dans une recherche « ilike ». Et deux
   taxes du même nom valent zéro taxe trouvée — c'est déjà la règle dans
   _commande_b2c.js, on la reproduit à l'identique ici, sans quoi ce
   contrôle dirait vert là où la commande échouerait. */
async function taxeUnique(env, nom) {
  const t = await appelOdoo(env, "account.tax", "search_read",
    [[["name", "=", nom], ["type_tax_use", "=", "sale"]], ["id"]], { limit: 2 });
  return (t && t.length === 1) ? t[0] : null;
}

export async function onRequestGet({ request, env }) {
  /* Public, donc freiné : il ne crée rien, mais il interroge Odoo, et on ne
     laisse personne s'en servir pour le fatiguer. Trente par heure laisse
     largement la place à une surveillance qui passe toutes les heures. */
  if (env.DB && await freinerIp(env.DB, request, "controle", 30, 60)) {
    return erreur("Trop de contrôles depuis cette connexion.", 429, "trop_tentatives");
  }
  if (!configureOdoo(env)) {
    return json({ ok: false, motif: "odoo",
      resume: "Odoo n'est pas configuré : impossible de le dire." }, 503);
  }

  const pays = [];
  let tout = true;

  for (const code of PAYS) {
    const regime = regimeB2C(code, env);
    const manque = [];

    try {
      if (!await taxeUnique(env, regime.taxe)) manque.push("taxe");
    } catch (e) { manque.push("taxe (Odoo muet)"); }

    try {
      let trouvee = null;
      for (const candidat of regime.positions) {
        const fp = await parNomInsensible(env, "account.fiscal.position", candidat);
        if (fp) { trouvee = fp; break; }
      }
      if (!trouvee) manque.push("position fiscale");
    } catch (e) { manque.push("position fiscale (Odoo muet)"); }

    try {
      const mode = await parNomInsensible(env, "delivery.carrier",
        nomLivraison(code, env), ["id", "name", "product_id"]);
      if (!mode) manque.push("mode de livraison");
      else if (!(Array.isArray(mode.product_id) ? mode.product_id[0] : mode.product_id)) {
        manque.push("produit de port");
      }
    } catch (e) { manque.push("mode de livraison (Odoo muet)"); }

    const peut = manque.length === 0;
    if (!peut) tout = false;
    pays.push({ pays: code, peut_commander: peut, manque });
  }

  const casses = pays.filter((p) => !p.peut_commander).map((p) => p.pays);

  return json({
    ok: tout,
    resume: tout
      ? "Les trois pays peuvent commander."
      : "ON NE PEUT PAS COMMANDER DEPUIS : " + casses.join(", ")
        + " — " + pays.filter((p) => !p.peut_commander)
            .map((p) => p.pays + " : il manque " + p.manque.join(", ")).join(" · "),
    pays,
    quand: new Date().toISOString(),
    note: "Ce contrôle lit les réglages Odoo retrouvés par leur nom. Il ne crée "
        + "aucune commande. Pour vérifier en plus que les totaux tombent au "
        + "centime, voir /api/essai-commande-b2c, réservé au compte NBD.",
  }, tout ? 200 : 503);
}
