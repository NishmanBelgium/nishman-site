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

import { partenaireParEmail, partenaireParTva } from "./_odoo.js";

const PORTIER_DEFAUT =
  "https://script.google.com/macros/s/AKfycbxGO1OpyvQVYdEKwuDr-TZgkD7Z9zL8Ly0PNZSMJZDnf_mfIHgz0GOGOMOPCzBAQTWMWw/exec";

/**
 * Cherche la fiche Odoo d'un compte, la retient, et en garde trace.
 * Renvoie l'identifiant de la fiche, ou null si rien ne correspond.
 */
export async function rapprocher(env, compte) {
  // L'e-mail d'abord : c'est le critère le plus personnel, et le seul qui
  // désigne quelqu'un plutôt qu'une entreprise.
  let fiche = await partenaireParEmail(env, compte.email);
  let critere = "email";

  if (!fiche && compte.tva) {
    fiche = await partenaireParTva(env, compte.tva);
    critere = "tva";
  }
  if (!fiche) return null;

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
  const code = env.PORTIER_CODE;
  if (!code) return;

  const url = (env.PORTIER_URL || PORTIER_DEFAUT)
    + "?action=liaison&callback=p"
    + "&code=" + encodeURIComponent(code)
    + "&compte=" + encodeURIComponent(compte.email)
    + "&salon=" + encodeURIComponent(compte.salon || "")
    + "&fiche=" + encodeURIComponent(fiche.name || "")
    + "&tva=" + encodeURIComponent(fiche.vat || "")
    + "&critere=" + encodeURIComponent(critere);

  await fetch(url, { headers: { accept: "*/*" } });
}
