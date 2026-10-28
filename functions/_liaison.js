/* ==========================================================================
   LIAISON — rapprocher un compte du site et sa fiche client Odoo.

   Le site et Odoo tiennent chacun leur version du client : l'un un compte
   avec mot de passe, l'autre une fiche qui porte les commandes. Sans pont
   entre les deux, l'espace professionnel reste vide.

   Le rapprochement se fait tout seul, d'abord sur l'adresse e-mail, ensuite
   sur le numéro de TVA. Il est tracé dans la base ET signalé par courriel :
   un numéro de TVA est une donnée publique, donc une liaison faite sur ce
   seul critère mérite d'être vue passer.
   ========================================================================== */

import { partenaireParEmail } from "./_odoo.js";

function memeEntreprise(tvaFiche, tvaCompte) {
  const n = (v) => String(v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^[A-Z]{2}/, "");
  return !!n(tvaCompte) && n(tvaFiche) === n(tvaCompte);
}
import { codePortier, adressePortier } from "./_portier.js";


/**
 * Cherche la fiche Odoo d'un compte, la retient, et en garde trace.
 * Renvoie l'identifiant de la fiche, ou null si rien ne correspond.
 */
export async function rapprocher(env, compte) {
  // L'e-mail d'abord : c'est le critère le plus personnel, et le seul qui
  // désigne quelqu'un plutôt qu'une entreprise.
  //
  // Le numéro de TVA seul ne rattache plus rien : il est public, et
  // l'inscription ne le vérifie pas. Il suffisait de s'inscrire avec celui
  // d'un salon pour lire ses commandes et ses remises négociées. L'e-mail
  // reste le critère, à condition que la fiche ne porte pas un autre
  // numéro de TVA que le compte.
  const fiche = await partenaireParEmail(env, compte.email);
  const critere = "email";
  if (!fiche) return null;
  if (fiche.vat && !memeEntreprise(fiche.vat, compte.tva)) return null;

  await env.DB.prepare("UPDATE comptes SET odoo_partner_id = ? WHERE id = ?")
    .bind(fiche.id, compte.id).run();

  // La trace ne doit jamais empêcher le client de voir ses commandes : si
  // elle échoue, la liaison tient quand même.
  try { await tracer(env, compte, fiche, critere); } catch (e) { /* tant pis */ }

  return fiche.id;
}

async function tracer(env, compte, fiche, critere) {
  await env.DB.prepare(`
    INSERT INTO liaisons
      (compte_id, compte_email, odoo_partner_id, partenaire_nom, partenaire_tva, critere)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    compte.id, compte.email, fiche.id,
    fiche.name || null, fiche.vat || null, critere
  ).run();

  // Le courriel part par le script Google, seul capable d'envoyer. S'il n'est
  // pas encore équipé de l'action, l'appel échoue sans conséquence : la ligne
  // ci-dessus reste la trace.
  const code = codePortier(env);
  if (!code) return;

  const url = adressePortier(env)
    + "?action=liaison&callback=p"
    + "&code=" + encodeURIComponent(code)
    + "&compte=" + encodeURIComponent(compte.email)
    + "&salon=" + encodeURIComponent(compte.salon || "")
    + "&fiche=" + encodeURIComponent(fiche.name || "")
    + "&tva=" + encodeURIComponent(fiche.vat || "")
    + "&critere=" + encodeURIComponent(critere);

  await fetch(url, { headers: { accept: "*/*" } });
}
