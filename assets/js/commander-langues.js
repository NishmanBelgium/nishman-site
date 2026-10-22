/* ==========================================================================
   COMMANDER — les textes.

   Le français est complet. Les quatre autres langues viennent à l'étape
   suivante : d'ici là, elles retombent sur le français plutôt que d'afficher
   une clé technique. C'est pour cette raison que la page n'est pas encore
   reliée au catalogue — personne ne doit y arriver par hasard avant que les
   cinq langues y soient.
   ========================================================================== */

window.NISHMAN_CMD_LANGUES = {
  fr: {
    retour: "Retour au catalogue",
    chargement: "Nous préparons votre commande…",

    vide_titre: "Votre panier est vide",
    vide_texte: "Ajoutez des produits au catalogue pour passer commande.",
    vide_cta: "Voir le catalogue",

    conn_titre: "Connectez-vous pour commander",
    conn_texte: "Nous vendons exclusivement aux professionnels. Votre panier est conservé : vous le retrouverez après connexion.",
    conn_cta: "Me connecter",
    conn_creer: "Je n'ai pas encore de compte",
    conn_devis: "Ou demander un devis sans compte",

    ident_titre: "Vos coordonnées",
    ident_modifier: "Modifier dans mon compte",

    recep_titre: "Réception",
    recep_livraison: "Livraison",
    recep_retrait: "Retrait à Binche",
    recep_retrait_sous: "Sans frais, sur rendez-vous",
    recep_meme: "Livrer à mon adresse de facturation",

    liv_nom: "Nom du destinataire",
    liv_adresse: "Adresse (rue et numéro)",
    liv_cp: "Code postal",
    liv_ville: "Ville",
    liv_pays: "Pays",

    recap_titre: "Votre commande",
    th_produit: "Produit",
    th_pieces: "Pièces",
    th_pu: "P.U. HT",
    th_total: "Total HT",

    tot_sous: "Sous-total HT",
    tot_port: "Frais de livraison",
    tot_total: "Total à payer",
    tot_remise: "Remise",
    tva_label: "TVA",

    port_offert: "Offert",
    port_regle: (seuil, forfait) =>
      "Offerte dès " + seuil + " € HT, sinon " + forfait + " €",
    port_manque: (manque, seuil) =>
      "Encore " + manque + " € HT pour la livraison offerte (dès " + seuil + " € HT).",

    regime_intracom: "Autoliquidation : facturé hors TVA, vous déclarez la TVA dans votre pays.",
    regime_sans_tva: "Votre numéro de TVA n'est pas encore validé : la TVA belge de 21 % s'applique.",

    promo_label: "Code promo (facultatif)",
    promo_btn: "Appliquer",
    promo_ok: (code) => "Code " + code + " appliqué.",
    promo_non: "Ce code n'est pas reconnu.",

    ecartees: (n) => n + " article(s) de votre panier ne sont plus disponibles et ont été retirés.",

    valid_titre: "Validation",
    valid_cgv_html: "J'accepte les <a href=\"/conditions-de-vente/\" target=\"_blank\" rel=\"noopener\">conditions de vente</a>.",
    valid_cta: "Valider ma commande",
    valid_envoi: "Enregistrement…",
    valid_note: "Votre commande est enregistrée chez nous et vous recevez le devis correspondant par e-mail. Aucun paiement n'est prélevé à cette étape.",

    pay_titre: "Paiement en ligne",
    pay_texte: "Le paiement par carte et Bancontact arrive prochainement. En attendant, validez votre commande ci-dessous : vous recevrez un devis à confirmer, payable par virement.",

    fini_titre: "Commande enregistrée",
    fini_texte: (ref, email) =>
      "Référence " + ref + ". Vous recevez le devis correspondant à l'adresse " + email + ".",
    fini_partiel: "Un détail de votre commande demande une vérification de notre part : nous vous recontactons avant confirmation.",
    fini_compte: "Voir mes commandes",
    fini_catalogue: "Retour au catalogue",

    // Messages d'erreur du serveur, par code
    erreurs: {
      session: "Votre session a expiré. Reconnectez-vous : votre panier est conservé.",
      cgv: "Acceptez les conditions de vente pour continuer.",
      vide: "Votre panier est vide.",
      livraison_absente: "Indiquez une adresse de livraison.",
      livraison_nom: "Indiquez le nom du destinataire.",
      livraison_adresse: "Indiquez la rue et le numéro.",
      livraison_cp: "Indiquez un code postal.",
      livraison_ville: "Indiquez la ville.",
      livraison_pays: "Nous livrons en Belgique, en France et au Luxembourg.",
      tarifs: "Les tarifs sont momentanément indisponibles. Réessayez dans un instant.",
      odoo: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité — réessayez dans un instant ou contactez-nous.",
      injoignable: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité — réessayez dans un instant.",
      muet: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité — réessayez dans un instant.",
      refus: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité — contactez-nous et nous la saisissons pour vous.",
      reseau: "Connexion interrompue. Votre panier est conservé : réessayez.",
    },
  },
};
