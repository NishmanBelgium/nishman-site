/* ==========================================================================
   LA LISTE DES RÉGULARISATIONS DE TVA, LISIBLE PAR UNE MACHINE.

   POURQUOI CETTE PAGE EXISTE, alors que tout ce qu'elle rend était déjà
   calculé ailleurs.

   Le rattrapage d'après-vente (`_tva_rattrapage.js`) fait son travail : il
   repère les ventes parties avec la TVA belge alors que le numéro du
   client s'est révélé valide juste après, et il en tient la liste. Cette
   liste était publiée à UN SEUL endroit, `/api/stats`, réservé à un compte
   administrateur, et affichée sur `/pro/stats/`.

   Donc elle attendait qu'un humain ouvre un tableau de bord. Constaté le
   28 novembre 2026 : la commande S00398 (L aureas, 81,36 €) y dormait
   depuis NEUF JOURS, et S00459 (The barber, 139,68 €) depuis la veille.
   Dans les deux cas le numéro de TVA était valide trente secondes après
   la commande.

   Une détection que personne ne reçoit n'est pas une détection. Le site
   savait, et ne le disait à personne.

   Cette page ne calcule rien de neuf : elle rend la même liste, derrière
   la clé de service, pour que le veilleur qui tourne chez Google puisse
   la lire et écrire à NBD. C'est le chaînon qui manquait entre « le site
   l'a vu » et « quelqu'un le sait ».

   CE QU'ELLE NE FAIT PAS, ET NE DOIT JAMAIS FAIRE : corriger quoi que ce
   soit. Une note de crédit est un acte comptable, elle appartient à NBD
   et à son comptable. Cette page est en lecture seule — pas de POST, pas
   d'écriture, pas d'effet de bord. Le GET ne touche à rien, et c'est la
   raison pour laquelle on peut l'ouvrir à une machine sans arrière-pensée.
   ========================================================================== */

import { aRegulariser, encoreMuettes } from "../_tva_rattrapage.js";
import { cleDeService } from "../_cle_service.js";
import { compteAdmin, json, erreur } from "../_commun.js";

export async function onRequestGet({ request, env }) {
  /* Deux porteurs possibles : Dilhan depuis son navigateur, ou le veilleur
   * avec la clé. Aucun des deux n'écrit. Un visiteur sans l'un ni l'autre
   * reçoit 404 et non 403 : cette page n'existe pas pour lui. */
  const compte = await compteAdmin(request, env);
  const machine = !compte && cleDeService(request, env);
  if (!compte && !machine) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  const [liste, muettes] = await Promise.all([
    aRegulariser(env.DB),
    encoreMuettes(env.DB),
  ]);

  /* `total` et `total_muettes` existent pour que l'appelant n'ait pas à
   * compter lui-même. C'est exactement la faute du 18 novembre sur
   * tva-rattrapage, où un compteur absent a été lu comme un zéro : on
   * donne le nombre, on ne le laisse pas déduire. */
  return json({
    ok: true,
    total: liste.length,
    total_muettes: muettes.length,
    /* La somme des montants facturés à tort. C'est ce qui dit à NBD si
     * la pile vaut un courrier au comptable ce matin ou la semaine
     * prochaine — un chiffre, pas une impression. */
    montant_total: liste.reduce(
      (s, c) => s + (Number(String(c.montant || "0").replace(",", ".")) || 0), 0),
    liste,
    muettes,
    date: new Date().toISOString(),
  });
}

/* Aucune autre méthode. Pas de POST : rien ici ne s'écrit. */
export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
