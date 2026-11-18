/* ==========================================================================
   BALAYAGE PAR LE RELAIS — rattraper les comptes jamais confirmés.

   POURQUOI CETTE PAGE EXISTE. Le relais branché le 18 novembre vérifie les
   nouvelles inscriptions, et le rattrapage après-vente repêche les commandes
   passées pendant un silence du registre. Mais il reste la cohorte : tous les
   comptes français et luxembourgeois créés AVANT, dont le numéro est peut-être
   parfaitement valide et qui sont en TVA belge uniquement parce que, le jour
   de leur inscription, le registre européen a éconduit Cloudflare.

   Ce sont précisément ces comptes qui vont commander demain. Les laisser en
   l'état, c'est reproduire volontairement la situation qu'on vient de passer
   une journée à démêler : une facture TTC à un client exonérable, une note de
   crédit, une facture refaite.

   CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS. Elle ne décide rien : elle
   appelle controlerEtEnregistrer, qui est le seul endroit du site où se
   décide une exonération, avec la porte du relais ouverte. Toutes les
   prudences écrites là-bas s'appliquent telles quelles — en particulier
   celle-ci, qui est la plus importante : un démenti du relais sans numéro
   de consultation ne condamne personne, il laisse le compte à vérifier.
   Le balayage ne peut donc qu'ouvrir des exonérations méritées ou ne rien
   changer. Il ne peut pas en retirer une à tort.

   GET  : qui serait balayé, et combien de requêtes ça coûterait. N'appelle
          rien, ne dépense rien.
   POST : balaie, au plus `max` comptes, le plus ancien contrôle d'abord.
   ========================================================================== */

import { json, erreur, compteAdmin } from "../_commun.js";
import { cleDeService } from "../_cle_service.js";
import { controlerEtEnregistrer, ouvreDroitAExoneration } from "../_tva.js";

/* Le relais met quinze secondes par numéro. Une requête Cloudflare ne vit
   pas éternellement, donc on balaie par petits lots et on rappelle. Six
   numéros font déjà une minute et demie. */
const MAX_DEFAUT = 6;
const MAX_PLAFOND = 12;

/* Les comptes à reprendre : un pays qui peut être exonéré, un numéro à
   présenter, et pas encore d'exonération acquise.

   On ne touche pas aux « sans_numero » ni aux « a_corriger » : la France a
   déjà tranché sur eux, ils n'ont pas de numéro intracommunautaire à
   vérifier, et les interroger ne ferait que brûler des requêtes. */
const CANDIDATS =
  "   FROM comptes " +
  "  WHERE pays IN ('FR','LU') " +
  "    AND COALESCE(NULLIF(TRIM(tva),''), NULLIF(TRIM(siret),'')) IS NOT NULL " +
  "    AND COALESCE(tva_valide, 0) = 0 " +
  "    AND COALESCE(tva_statut,'') NOT IN ('sans_numero','a_corriger') ";

function bornes(url) {
  const brut = Math.floor(Number(url.searchParams.get("max")) || MAX_DEFAUT);
  return Math.max(1, Math.min(MAX_PLAFOND, brut));
}

async function candidats(env, max) {
  const r = await env.DB.prepare(
    "SELECT id, email, salon, pays, tva, siret, tva_valide, tva_statut, " +
    "       tva_verifiee_le, tva_preuve, tva_nom, tva_motif " +
    CANDIDATS +
    /* Le contrôle le plus ancien d'abord : c'est celui qui a le plus de
       chances d'avoir été refusé par le registre plutôt que démenti. Les
       jamais contrôlés passent devant. */
    "  ORDER BY COALESCE(tva_verifiee_le, '') ASC, id ASC " +
    "  LIMIT ?"
  ).bind(max).all();
  return (r && r.results) || [];
}

async function combien(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n " + CANDIDATS).first();
  return Number((r && r.n) || 0);
}

export async function onRequestGet({ request, env }) {
  const compte = await compteAdmin(request, env);
  if (!compte) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  const max = bornes(new URL(request.url));
  const liste = await candidats(env, max);
  const total = await combien(env);

  return json({
    ok: true, ecrit: false,
    cle_presente: !!env.CLE_VATSENSE,
    a_reprendre: total,
    /* Ce que ça coûtera en requêtes chez le relais. Le forfait d'essai en
       compte 500, et un numéro déjà demandé revient du cache sans en
       consommer — mais on compte au pire. */
    requetes_estimees: total,
    lot: max,
    apercu: liste.map((c) => ({
      id: c.id,
      client: c.salon || c.email,
      pays: c.pays,
      /* Le numéro n'est pas une donnée secrète — il figure sur chaque
         facture — mais il n'a rien à faire dans une liste qu'on recopie :
         on dit seulement s'il y en a un. */
      a_un_numero: !!(c.tva || c.siret),
      statut: c.tva_statut || "jamais",
      motif: c.tva_motif || "",
      verifie_le: c.tva_verifiee_le || "",
    })),
  });
}

export async function onRequestPost({ request, env }) {
  const compte = await compteAdmin(request, env);
  const machine = !compte && cleDeService(request, env);
  if (!compte && !machine) return erreur("Page réservée.", 404, "reservee");
  if (!env.DB) return erreur("Base indisponible.", 503, "base");

  const url = new URL(request.url);
  if (url.searchParams.get("appliquer") !== "oui") {
    return erreur("Ajoutez ?appliquer=oui pour écrire. Sans cela, le GET montre le plan.",
                  400, "confirmation_requise");
  }

  const cle = String((env && env.CLE_VATSENSE) || "");
  if (!cle) {
    /* Sans clé, le balayage n'apporterait rien : les portes officielles
       seront éconduites comme toujours, et on écrirait soixante fois le
       même « indisponible ». On refuse franchement. */
    return json({ ok: false, code: "cle_absente",
      detail: "CLE_VATSENSE n'est pas renseignée pour cet environnement." });
  }

  const max = bornes(url);
  const liste = await candidats(env, max);

  const releves = [];
  let exoneres = 0;
  for (const c of liste) {
    const t0 = Date.now();
    let r = null;
    try {
      r = await controlerEtEnregistrer(env.DB, c, env,
        { tentatives: 1, delaiMs: 4000, relais: true,
          cleRelais: cle, delaiRelaisMs: 25000 });
    } catch (e) {
      r = { statut: "indisponible", motif: String((e && e.message) || e).slice(0, 80) };
    }

    const ouvre = ouvreDroitAExoneration(c.pays, r && r.statut);
    if (ouvre) exoneres++;

    releves.push({
      id: c.id,
      client: c.salon || c.email,
      pays: c.pays,
      avant: c.tva_statut || "jamais",
      apres: (r && r.statut) || "?",
      /* Le changement qui compte : ce compte est-il désormais exonéré ?
         C'est la seule ligne qui se traduise en euros sur une facture. */
      exonere: ouvre,
      preuve_recue: !!(r && r.preuve),
      chemin: (r && r.chemin) || "",
      motif: (r && r.motif) || "",
      ms: Date.now() - t0,
    });
  }

  const restants = await combien(env);

  return json({
    ok: true, ecrit: true,
    examines: releves.length,
    /* Combien de clients cessent, à partir de maintenant, de payer une TVA
       qu'ils ne doivent pas. C'est le chiffre de cette page. */
    devenus_exoneres: exoneres,
    restants,
    /* Un balayage qui ne finit pas se lit comme un balayage fini : le piège
       du 18 novembre, où une boucle a lu « restants » absent et s'est
       arrêtée à douze comptes sur soixante-sept en croyant avoir terminé.
       On le dit donc explicitement. */
    termine: restants === 0,
    releves,
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
