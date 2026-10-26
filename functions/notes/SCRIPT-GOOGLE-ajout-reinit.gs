/* ===========================================================================
   NISHMAN — à AJOUTER dans votre script Google existant (étape 194)
   ===========================================================================

   CE FICHIER N'EST PAS À COLLER EN ENTIER PAR-DESSUS VOTRE SCRIPT.
   Il contient deux choses à ajouter à ce que vous avez déjà.

   Pour ouvrir votre script : votre Google Sheets du registre
   -> menu Extensions -> Apps Script.

   ---------------------------------------------------------------------------
   ÉTAPE 1 — Brancher la nouvelle action
   ---------------------------------------------------------------------------
   Cherchez la fonction doGet (Cmd+F : "function doGet").
   Vous y verrez ce bloc :

       if (p.action === "unlock") {
         out = actionUnlock(p.code);
       } else if (p.action === "signup") {
         out = actionSignup(p.vat, p.email, p.lang);
       } else {
         out = { ok: false, message: "action inconnue" };
       }

   Ajoutez-y la ligne « reinit », pour obtenir exactement ceci :

       if (p.action === "unlock") {
         out = actionUnlock(p.code);
       } else if (p.action === "signup") {
         out = actionSignup(p.vat, p.email, p.lang);
       } else if (p.action === "reinit") {
         out = actionReinit(p.code, p.email, p.salon, p.lien);
       } else {
         out = { ok: false, message: "action inconnue" };
       }

   ---------------------------------------------------------------------------
   ÉTAPE 2 — Coller la fonction ci-dessous
   ---------------------------------------------------------------------------
   Descendez tout en bas du script et collez TOUT ce qui suit cette ligne.

   ---------------------------------------------------------------------------
   ÉTAPE 3 — Redéployer
   ---------------------------------------------------------------------------
   Bouton bleu « Déployer » en haut à droite -> Gérer les déploiements ->
   icône crayon -> Version : « Nouvelle version » -> Déployer.

   L'adresse /exec ne change pas : le site continue de fonctionner.
   =========================================================================== */


/**
 * Envoie à un client le lien qui lui permet de choisir un nouveau mot de passe.
 *
 * Le site appelle cette fonction ; il présente le code interne, sans lequel
 * rien n'est envoyé. Sans ce contrôle, n'importe qui connaissant l'adresse du
 * script pourrait faire partir des courriels en votre nom.
 */
function actionReinit(code, email, salon, lien) {
  if (code !== CODE_INTERNE) return { ok: false, message: "refusé" };
  if (!email || !lien)       return { ok: false, message: "incomplet" };

  var nom = salon ? String(salon) : "";
  var sujet = "NISHMAN — nouveau mot de passe pour votre espace professionnel";

  var html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
    'max-width:520px;margin:0 auto;padding:28px 24px;color:#1a1a1a;line-height:1.6">' +

      '<p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;' +
      'color:#8a8a92;margin:0 0 22px">NISHMAN &middot; NBD Distribution</p>' +

      '<p style="margin:0 0 16px">Bonjour' + (nom ? ' ' + echapperHtml_(nom) : '') + ',</p>' +

      '<p style="margin:0 0 16px">Vous avez demandé à changer le mot de passe de ' +
      'votre espace professionnel. Cliquez sur le bouton ci-dessous pour en ' +
      'choisir un nouveau.</p>' +

      '<p style="margin:26px 0">' +
        '<a href="' + lien + '" style="display:inline-block;background:#ff8a00;' +
        'color:#ffffff;text-decoration:none;font-weight:700;padding:14px 26px;' +
        'border-radius:999px">Choisir un nouveau mot de passe</a>' +
      '</p>' +

      '<p style="margin:0 0 16px;font-size:14px;color:#5c5c66">Ce lien est ' +
      'valable une heure et ne fonctionne qu\'une seule fois.</p>' +

      '<p style="margin:0 0 22px;font-size:14px;color:#5c5c66">Si le bouton ne ' +
      'fonctionne pas, copiez cette adresse dans votre navigateur :<br>' +
      '<span style="word-break:break-all;color:#1a1a1a">' + lien + '</span></p>' +

      '<p style="margin:0 0 22px;font-size:14px;color:#5c5c66">Si vous n\'êtes ' +
      'pas à l\'origine de cette demande, ignorez ce message : votre mot de ' +
      'passe actuel reste valable.</p>' +

      '<hr style="border:0;border-top:1px solid #e6e6ea;margin:26px 0">' +

      '<p style="margin:0;font-size:13px;color:#8a8a92">' +
      'NBD Distribution &mdash; importateur officiel NISHMAN pour la Belgique, ' +
      'la France et le Luxembourg<br>' +
      'contact@nishman.be &middot; nishman.be</p>' +

    '</div>';

  var texte =
    'Bonjour' + (nom ? ' ' + nom : '') + ',\n\n' +
    'Vous avez demandé à changer le mot de passe de votre espace ' +
    'professionnel NISHMAN.\n\n' +
    'Ouvrez cette adresse pour en choisir un nouveau :\n' + lien + '\n\n' +
    'Ce lien est valable une heure et ne fonctionne qu\'une seule fois.\n\n' +
    'Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : ' +
    'votre mot de passe actuel reste valable.\n\n' +
    'NBD Distribution — importateur officiel NISHMAN\n' +
    'contact@nishman.be — nishman.be';

  try {
    MailApp.sendEmail({
      to: email,
      subject: sujet,
      body: texte,          // version texte, pour les messageries qui refusent le HTML
      htmlBody: html,
      name: "NISHMAN — NBD Distribution",
      replyTo: "contact@nishman.be"
    });
    return { ok: true };
  } catch (err) {
    // Quota Google atteint, ou adresse refusée. On le note dans le journal
    // d'exécution du script, consultable depuis l'éditeur.
    Logger.log("Envoi réinitialisation impossible : " + err);
    return { ok: false, message: "envoi impossible" };
  }
}


/** Empêche qu'un nom de salon contenant des chevrons casse la mise en page. */
function echapperHtml_(t) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
