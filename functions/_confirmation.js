/* ==========================================================================
   LA CONFIRMATION DE COMMANDE — celle que la loi exige, pas la facture.

   Un consommateur qui achète à distance doit recevoir, sur un support
   durable et dans un délai raisonnable après la conclusion du contrat, la
   confirmation du contrat lui-même : ce qu'il a acheté, à quel prix, chez
   qui, et surtout l'information précontractuelle — dont le droit de
   rétractation et le formulaire qui permet de l'exercer.

   Une facture ne fait pas cela. Elle dit un montant, pas des droits.

   Et un lien ne le fait pas non plus. La Cour de justice l'a tranché
   (Content Services, C-49/11) : renvoyer vers une page web n'est pas
   remettre sur support durable, parce que le commerçant peut la changer
   quand il veut. Le texte doit donc voyager DANS le message, où il
   restera tel quel dans la boîte du client.

   D'où ce module. Il prend le texte là où il vit déjà — les pages
   /conditions-de-vente/ et /retractation/ — et le met dans le courriel.
   Une seule source : le jour où NBD corrige une clause, le courriel la
   porte le soir même, sans que personne n'ait à y penser. C'est
   exactement la leçon du PDF des CGV professionnelles, qui a gardé six
   mois une adresse de siège périmée parce qu'il était recopié à la main.
   ========================================================================== */

import { appel } from "./_odoo.js";
import { configureSendcloud, pointRelais } from "./_sendcloud.js";

/* Le marqueur laissé dans le fil de discussion Odoo après l'envoi. C'est
   lui qui empêche un second courriel si la chaîne est rejouée — une
   notification de Mollie peut très bien arriver deux fois. */
const MARQUEUR = "CONF-CONSO";

/* --- Aller chercher le texte des pages ---------------------------------- */

/**
 * Le corps d'une page légale, tel qu'il est publié.
 *
 * On ne lit pas un fichier : on demande la page au serveur de fichiers
 * statiques de Cloudflare, exactement comme un visiteur. Ce qui est
 * envoyé au client est donc ce qu'il lirait sur le site.
 */
export async function corpsDocument(env, chemin) {
  if (!env || !env.ASSETS) throw new Error("ASSETS indisponible");
  // L'hôte n'a pas d'importance pour cette liaison : seul le chemin compte.
  const r = await env.ASSETS.fetch(new Request("https://nishman.be" + chemin));
  if (!r.ok) throw new Error("page " + chemin + " introuvable (" + r.status + ")");
  const html = await r.text();

  const m = html.match(/<main[^>]*class="doc"[^>]*>([\s\S]*?)<\/main>/i);
  if (!m) throw new Error("corps introuvable dans " + chemin);
  let corps = m[1];

  // Ce qui n'a pas de sens dans un courriel.
  corps = corps.replace(/<a[^>]*class="doc-retour"[^>]*>[\s\S]*?<\/a>/gi, "");
  corps = corps.replace(/<script[\s\S]*?<\/script>/gi, "");
  corps = corps.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "");   // le titre est déjà dans le courriel

  return corps.trim();
}

/* --- Habiller le texte pour un courriel --------------------------------- */

/* Les clients de messagerie ne chargent pas nos feuilles de style, et
   plusieurs suppriment les blocs <style>. La seule mise en forme sur
   laquelle on peut compter est celle écrite dans l'attribut style de
   chaque balise. On la pose donc une par une. */
const HABITS = [
  [/<h2(\s[^>]*)?>/gi, '<h2 style="font:700 15px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:26px 0 8px;">'],
  [/<h3(\s[^>]*)?>/gi, '<h3 style="font:700 13px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:18px 0 6px;">'],
  [/<p(\s[^>]*)?>/gi, '<p style="font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#333;margin:0 0 10px;">'],
  [/<li(\s[^>]*)?>/gi, '<li style="font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#333;margin:0 0 5px;">'],
  [/<ul(\s[^>]*)?>/gi, '<ul style="margin:0 0 12px;padding-left:20px;">'],
  [/<ol(\s[^>]*)?>/gi, '<ol style="margin:0 0 12px;padding-left:20px;">'],
  [/<table(\s[^>]*)?>/gi, '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 14px;">'],
  [/<th(\s[^>]*)?>/gi, '<th style="font:700 12px/1.5 Arial,Helvetica,sans-serif;color:#111;text-align:left;padding:7px 9px;border-bottom:1px solid #ddd;background:#f6f6f6;">'],
  [/<td(\s[^>]*)?>/gi, '<td style="font:400 12px/1.55 Arial,Helvetica,sans-serif;color:#333;padding:7px 9px;border-bottom:1px solid #eee;vertical-align:top;">'],
  [/<a\s+href=/gi, '<a style="color:#111;" href='],
];

function habiller(html) {
  let s = String(html);
  for (const [quoi, par] of HABITS) s = s.replace(quoi, par);
  // Les liens internes doivent pointer quelque part depuis une boîte mail.
  s = s.replace(/href="\//g, 'href="https://nishman.be/');
  // L'encadré d'identification du vendeur, qui perdait sa classe.
  s = s.replace(/<div class="encadre">/gi,
    '<div style="background:#f6f6f6;border-radius:8px;padding:14px 16px;margin:0 0 14px;">');
  return s;
}

function texte(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function euros(n) {
  return Number(n || 0).toFixed(2).replace(".", ",") + " €";
}

/* --- Le récapitulatif de la commande ------------------------------------ */

function recapitulatif(commande, lignes) {
  const rangs = lignes.map((l) =>
    '<tr>'
    + '<td style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:#333;padding:9px 0;border-bottom:1px solid #eee;">'
    + texte(Array.isArray(l.product_id) ? l.product_id[1] : l.name)
    + '</td>'
    + '<td style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:#666;padding:9px 0;border-bottom:1px solid #eee;text-align:center;white-space:nowrap;">'
    + '× ' + Number(l.product_uom_qty || 0)
    + '</td>'
    + '<td style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:#111;padding:9px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">'
    + euros(l.price_total)
    + '</td></tr>').join("");

  const total = (lib, val, fort) =>
    '<tr><td colspan="2" style="font:' + (fort ? "700 15px" : "400 13px")
    + '/1.6 Arial,Helvetica,sans-serif;color:#111;padding:' + (fort ? "10px 0 0" : "5px 0")
    + ';">' + texte(lib) + '</td>'
    + '<td style="font:' + (fort ? "700 15px" : "400 13px")
    + '/1.6 Arial,Helvetica,sans-serif;color:#111;padding:' + (fort ? "10px 0 0" : "5px 0")
    + ';text-align:right;white-space:nowrap;">' + euros(val) + '</td></tr>';

  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 6px;">'
    + rangs
    + total("Total hors TVA", commande.amount_untaxed)
    + total("TVA", commande.amount_tax)
    + total("Total payé", commande.amount_total, true)
    + '</table>';
}

/* --- Le courriel -------------------------------------------------------- */

export function courriel({ commande, lignes, relais, client, conditions, retractation }) {
  const bloc = (titre, dedans) =>
    '<h2 style="font:700 15px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:30px 0 10px;">'
    + texte(titre) + '</h2>' + dedans;

  const adresse = client
    ? [client.prenom + " " + client.nom, client.adresse,
       client.code_postal + " " + client.ville, client.pays]
      .filter(Boolean).map(texte).join("<br />")
    : "";

  const livraison = relais
    ? '<p style="font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#333;margin:0;">'
      + '<strong>' + texte(relais.nom) + '</strong><br />'
      + texte(relais.adresse) + '</p>'
    : '<p style="font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#333;margin:0;">'
      + 'Votre colis part vers le point relais que vous avez choisi. Vous recevrez '
      + 'le lien de suivi dès que l\'étiquette sera émise.</p>';

  return '<!doctype html><html lang="fr"><head><meta charset="utf-8" />'
    + '<meta name="viewport" content="width=device-width,initial-scale=1" /></head>'
    + '<body style="margin:0;padding:0;background:#f4f4f4;">'
    + '<table cellpadding="0" cellspacing="0" style="width:100%;background:#f4f4f4;">'
    + '<tr><td align="center" style="padding:22px 12px;">'
    + '<table cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border-radius:10px;">'
    + '<tr><td style="padding:28px 30px 34px;">'

    + '<p style="font:700 11px/1.4 Arial,Helvetica,sans-serif;color:#999;letter-spacing:.08em;'
    + 'text-transform:uppercase;margin:0 0 6px;">NBD Distribution — NISHMAN</p>'
    + '<h1 style="font:700 22px/1.3 Arial,Helvetica,sans-serif;color:#111;margin:0 0 4px;">'
    + 'Confirmation de votre commande</h1>'
    + '<p style="font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#666;margin:0 0 22px;">'
    + 'Commande ' + texte(commande.name) + '</p>'

    + '<p style="font:400 14px/1.7 Arial,Helvetica,sans-serif;color:#333;margin:0 0 6px;">'
    + 'Merci pour votre commande. Votre paiement a bien été reçu et votre colis '
    + 'sera expédié sous deux jours ouvrables. Vous serez averti dès qu\'il sera '
    + 'disponible dans votre point relais.</p>'
    + '<p style="font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#666;margin:0 0 4px;">'
    + 'Ce message vaut confirmation du contrat. Conservez-le : il contient '
    + 'l\'intégralité des conditions de votre achat et le formulaire qui vous '
    + 'permet de vous rétracter.</p>'

    + bloc("Votre commande", recapitulatif(commande, lignes))
    + bloc("Livraison", livraison)
    + (adresse ? bloc("Adresse de facturation",
        '<p style="font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#333;margin:0;">'
        + adresse + '</p>') : "")

    + '<hr style="border:0;border-top:1px solid #e6e6e6;margin:34px 0 0;" />'
    + '<h2 style="font:700 16px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:26px 0 10px;">'
    + 'Votre droit de rétractation</h2>'
    + habiller(retractation)

    + '<hr style="border:0;border-top:1px solid #e6e6e6;margin:34px 0 0;" />'
    + '<h2 style="font:700 16px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:26px 0 10px;">'
    + 'Conditions générales de vente applicables à votre commande</h2>'
    + habiller(conditions)

    + '<hr style="border:0;border-top:1px solid #e6e6e6;margin:30px 0 0;" />'
    + '<p style="font:400 11px/1.7 Arial,Helvetica,sans-serif;color:#999;margin:16px 0 0;">'
    + 'NBD DISTRIBUTION SRL — Avenue Léopold III 21, 7133 Binche, Belgique<br />'
    + 'TVA BE 0817.750.283 — contact@nishman.be — +32 489 97 00 87<br />'
    + 'Importateur officiel NISHMAN pour la Belgique, la France et le Luxembourg.</p>'

    + '</td></tr></table></td></tr></table></body></html>';
}

/* --- L'envoi ------------------------------------------------------------ */

/**
 * Envoie la confirmation consommateur, une fois et une seule.
 *
 * Le garde-fou n'est pas notre registre mais le fil de discussion de la
 * commande dans Odoo : il survit à la perte de notre base, et NBD le voit.
 */
export async function envoyerConfirmation(env, p, journal) {
  const orderId = p.odoo_order_id;

  const deja = await appel(env, "mail.message", "search_count",
    [[["model", "=", "sale.order"], ["res_id", "=", orderId],
      ["body", "like", "%" + MARQUEUR + "%"]]], {});
  if (deja) {
    journal.push({ geste: "confirmation consommateur", ok: true, detail: "déjà envoyée" });
    return;
  }

  const lu = await appel(env, "sale.order", "read",
    [[orderId], ["name", "amount_untaxed", "amount_tax", "amount_total",
                 "partner_id", "order_line"]], {});
  const commande = lu && lu[0];
  if (!commande) throw new Error("commande introuvable");

  const lignes = (commande.order_line && commande.order_line.length)
    ? await appel(env, "sale.order.line", "read",
        [commande.order_line, ["name", "product_id", "product_uom_qty", "price_total",
                               "display_type"]], {})
    : [];
  const marchandise = (lignes || []).filter((l) => !l.display_type);

  // L'adresse saisie à la caisse, qui prime sur la fiche Odoo : c'est
  // celle que le client vient de taper.
  let client = null;
  try { client = p.client ? JSON.parse(p.client) : null; } catch (e) { client = null; }

  // Le destinataire : l'adresse donnée à la commande, sinon celle du partenaire.
  let destinataire = (client && client.email) || "";
  if (!destinataire) {
    const pid = Array.isArray(commande.partner_id) ? commande.partner_id[0] : commande.partner_id;
    const pa = pid ? await appel(env, "res.partner", "read", [[pid], ["email"]], {}) : null;
    destinataire = (pa && pa[0] && pa[0].email) || "";
  }
  if (!destinataire) throw new Error("aucune adresse électronique pour la confirmation");

  const [conditions, retractation] = await Promise.all([
    corpsDocument(env, "/conditions-de-vente/"),
    corpsDocument(env, "/retractation/"),
  ]);

  // Le point relais : on le redemande à Sendcloud, qui en est la source.
  // S'il ne répond pas, le courriel part quand même avec une formulation
  // générale — une confirmation en retard serait bien pire qu'une
  // confirmation sans le nom du commerce.
  let relais = null;
  if (p.relais_id) {
    try {
      configureSendcloud(env);
      const pr = await pointRelais(env, p.relais_id);
      if (pr) {
        relais = {
          nom: pr.name || pr.nom || "",
          adresse: [pr.street, pr.house_number, pr.postal_code, pr.city]
            .filter(Boolean).join(" "),
        };
      }
    } catch (e) { relais = null; }
  }

  const corps = courriel({
    commande, lignes: marchandise, relais, client, conditions, retractation,
  });

  const mailId = await appel(env, "mail.mail", "create", [{
    subject: "Confirmation de votre commande " + commande.name + " — NISHMAN",
    body_html: corps,
    email_to: destinataire,
    // On garde la trace de l'envoi : c'est la preuve que la confirmation
    // est bien partie, et c'est à nous de la produire en cas de litige.
    auto_delete: false,
    model: "sale.order",
    res_id: orderId,
  }], {});

  await appel(env, "mail.mail", "send", [[mailId]], {});

  await appel(env, "sale.order", "message_post", [[orderId]], {
    body: "Confirmation consommateur envoyée à " + destinataire
        + " (conditions de vente et formulaire de rétractation inclus). " + MARQUEUR,
    message_type: "comment",
  });

  journal.push({
    geste: "confirmation consommateur", ok: true,
    detail: "envoyée à " + destinataire + ", conditions et rétractation incluses",
  });
}
