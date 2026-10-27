/* ==========================================================================
   COMMANDER — les textes.

   Les cinq langues du site. Toute clé manquante retombe sur le français
   plutôt que d'afficher un libellé technique : une traduction oubliée se
   voit, mais ne casse rien.
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
    promo_trop_petit: (code, mini) => "Le code " + code + " s'applique à partir de "
      + mini.toFixed(2).replace(".", ",") + " € HT de commande.",

    ecartees: (n) => n + " article(s) de votre panier ne sont plus disponibles et ont été retirés.",

    valid_titre: "Validation",
    valid_cgv_html: "J'accepte les <a href=\"/conditions-de-vente/\" target=\"_blank\" rel=\"noopener\">conditions de vente</a>.",
    valid_cta: "Valider ma commande",
    valid_envoi: "Enregistrement…",
    valid_note: "Votre commande est enregistrée chez nous et vous recevez le devis correspondant par e-mail. Aucun paiement n'est prélevé à cette étape.",

    pay_cta: "Payer maintenant",
    pay_note: "Carte bancaire, Bancontact ou virement instantané. Votre facture est émise dès le paiement reçu.",
    pay_ou: "ou",
    pay_envoi: "Ouverture du paiement…",
    valid_cta_alt: "Recevoir un devis à payer par virement",
    valid_note_alt: "Vous recevez le devis par e-mail et payez par virement. La commande est préparée à réception du paiement.",

    fini_titre: "Commande enregistrée",
    fini_texte: (ref, email) =>
      "Référence " + ref + ". Vous recevez le devis correspondant à l'adresse " + email + ".",
    fini_partiel: "Un détail de votre commande demande une vérification de notre part : nous vous recontactons avant confirmation.",
    fini_compte: "Voir mes commandes",
    fini_catalogue: "Retour au catalogue",

    ret_attente_titre: "Nous vérifions votre paiement",
    ret_attente_texte: "Quelques secondes : nous interrogeons votre banque. Ne fermez pas cette page.",
    ret_ok_titre: "Paiement reçu",
    ret_ok_texte: (devis, facture) => "Commande " + devis + (facture ? " — facture " + facture : "") + ". Vous la recevez par e-mail.",
    ret_ok_expedition: "Nous préparons votre colis. Vous recevrez le numéro de suivi dès l'expédition.",
    ret_encours_texte: "Votre paiement est enregistré. Nous finalisons votre commande…",
    ret_lent_texte: "Votre paiement est bien reçu. La confirmation de commande vous parvient par e-mail dans quelques minutes.",
    ret_perdu_titre: "Paiement non abouti",
    ret_perdu_texte: "Rien ne vous a été débité. Votre panier est conservé : vous pouvez reprendre votre commande.",
    ret_reprendre: "Reprendre ma commande",
    ret_inconnu_titre: "Paiement introuvable",
    ret_inconnu_texte: "Nous ne retrouvons pas ce paiement sur votre compte. S'il a été débité, contactez-nous : nous le rattachons à votre commande.",
    ret_incertain_titre: "Confirmation en attente",
    ret_incertain_texte: "Nous n'avons pas encore reçu la confirmation de votre banque. Elle peut prendre quelques minutes. Ne payez pas une seconde fois : nous vous écrivons dès qu'elle arrive.",

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

  en: {
    retour: "Back to catalogue",
    chargement: "Preparing your order…",

    vide_titre: "Your basket is empty",
    vide_texte: "Add products from the catalogue to place an order.",
    vide_cta: "View the catalogue",

    conn_titre: "Sign in to order",
    conn_texte: "We sell to professionals only. Your basket is saved — you will find it again after signing in.",
    conn_cta: "Sign in",
    conn_creer: "I don't have an account yet",
    conn_devis: "Or request a quotation without an account",

    ident_titre: "Your details",
    ident_modifier: "Edit in my account",

    recep_titre: "Delivery",
    recep_livraison: "Delivery",
    recep_retrait: "Collection in Binche",
    recep_retrait_sous: "Free, by appointment",
    recep_meme: "Deliver to my billing address",

    liv_nom: "Recipient name",
    liv_adresse: "Street and number",
    liv_cp: "Postcode",
    liv_ville: "Town",
    liv_pays: "Country",

    recap_titre: "Your order",
    th_produit: "Product",
    th_pieces: "Items",
    th_pu: "Unit excl. VAT",
    th_total: "Total excl. VAT",

    tot_sous: "Subtotal excl. VAT",
    tot_port: "Delivery charge",
    tot_total: "Total payable",
    tot_remise: "Discount",
    tva_label: "VAT",

    port_offert: "Free",
    port_regle: (seuil, forfait) =>
      "Free from \u20ac" + seuil + " excl. VAT, otherwise \u20ac" + forfait,
    port_manque: (manque, seuil) =>
      "\u20ac" + manque + " more excl. VAT for free delivery (from \u20ac" + seuil + " excl. VAT).",

    regime_intracom: "Reverse charge: invoiced excluding VAT. You declare the VAT in your own country.",
    regime_sans_tva: "Your VAT number has not been validated yet, so Belgian VAT at 21% applies.",

    promo_label: "Promo code (optional)",
    promo_btn: "Apply",
    promo_ok: (code) => "Code " + code + " applied.",
    promo_non: "This code is not recognised.",
    promo_trop_petit: (code, mini) => "Code " + code + " applies from "
      + mini.toFixed(2) + " EUR excl. VAT upwards.",

    ecartees: (n) => n + " item(s) in your basket are no longer available and have been removed.",

    valid_titre: "Confirmation",
    valid_cgv_html: "I accept the <a href=\"/conditions-de-vente/\" target=\"_blank\" rel=\"noopener\">terms of sale</a>.",
    valid_cta: "Place my order",
    valid_envoi: "Saving…",
    valid_note: "Your order is recorded with us and you receive the matching quotation by e-mail. No payment is taken at this stage.",

    pay_cta: "Pay now",
    pay_note: "Card, Bancontact or instant transfer. Your invoice is issued as soon as the payment arrives.",
    pay_ou: "or",
    pay_envoi: "Opening payment…",
    valid_cta_alt: "Receive a quotation payable by transfer",
    valid_note_alt: "You receive the quotation by e-mail and pay by bank transfer. The order is prepared once the payment arrives.",

    fini_titre: "Order recorded",
    fini_texte: (ref, email) =>
      "Reference " + ref + ". The matching quotation is on its way to " + email + ".",
    fini_partiel: "One detail of your order needs checking on our side. We will contact you before confirming.",
    fini_compte: "View my orders",
    fini_catalogue: "Back to catalogue",

    ret_attente_titre: "Checking your payment",
    ret_attente_texte: "A few seconds: we are asking your bank. Please do not close this page.",
    ret_ok_titre: "Payment received",
    ret_ok_texte: (devis, facture) => "Order " + devis + (facture ? " — invoice " + facture : "") + ". It is on its way to your inbox.",
    ret_ok_expedition: "We are preparing your parcel. You will receive the tracking number as soon as it ships.",
    ret_encours_texte: "Your payment is recorded. We are finalising your order…",
    ret_lent_texte: "Your payment has arrived. The order confirmation reaches you by e-mail within a few minutes.",
    ret_perdu_titre: "Payment not completed",
    ret_perdu_texte: "Nothing was charged. Your basket is saved — you can pick your order up where you left it.",
    ret_reprendre: "Resume my order",
    ret_inconnu_titre: "Payment not found",
    ret_inconnu_texte: "We cannot find this payment on your account. If you were charged, contact us and we will attach it to your order.",
    ret_incertain_titre: "Confirmation pending",
    ret_incertain_texte: "We have not yet received confirmation from your bank. It can take a few minutes. Please do not pay a second time — we will write to you as soon as it arrives.",

    erreurs: {
      session: "Your session has expired. Please sign in again — your basket is saved.",
      cgv: "Please accept the terms of sale to continue.",
      vide: "Your basket is empty.",
      livraison_absente: "Please give a delivery address.",
      livraison_nom: "Please give the recipient's name.",
      livraison_adresse: "Please give the street and number.",
      livraison_cp: "Please give a postcode.",
      livraison_ville: "Please give the town.",
      livraison_pays: "We deliver to Belgium, France and Luxembourg.",
      tarifs: "Prices are briefly unavailable. Please try again in a moment.",
      odoo: "Your order could not be recorded. Nothing has been charged — try again shortly or contact us.",
      injoignable: "Your order could not be recorded. Nothing has been charged — please try again shortly.",
      muet: "Your order could not be recorded. Nothing has been charged — please try again shortly.",
      refus: "Your order could not be recorded. Nothing has been charged — contact us and we will enter it for you.",
      reseau: "Connection lost. Your basket is saved — please try again.",
    },
  },

  nl: {
    retour: "Terug naar de catalogus",
    chargement: "We maken uw bestelling klaar…",

    vide_titre: "Uw winkelmandje is leeg",
    vide_texte: "Voeg producten toe via de catalogus om te bestellen.",
    vide_cta: "Naar de catalogus",

    conn_titre: "Meld u aan om te bestellen",
    conn_texte: "Wij verkopen uitsluitend aan professionals. Uw mandje blijft bewaard: u vindt het terug na het aanmelden.",
    conn_cta: "Aanmelden",
    conn_creer: "Ik heb nog geen account",
    conn_devis: "Of vraag een offerte aan zonder account",

    ident_titre: "Uw gegevens",
    ident_modifier: "Wijzigen in mijn account",

    recep_titre: "Ontvangst",
    recep_livraison: "Levering",
    recep_retrait: "Afhalen in Binche",
    recep_retrait_sous: "Gratis, op afspraak",
    recep_meme: "Leveren op mijn facturatieadres",

    liv_nom: "Naam van de ontvanger",
    liv_adresse: "Straat en nummer",
    liv_cp: "Postcode",
    liv_ville: "Gemeente",
    liv_pays: "Land",

    recap_titre: "Uw bestelling",
    th_produit: "Product",
    th_pieces: "Stuks",
    th_pu: "Prijs excl. btw",
    th_total: "Totaal excl. btw",

    tot_sous: "Subtotaal excl. btw",
    tot_port: "Leveringskosten",
    tot_total: "Te betalen totaal",
    tot_remise: "Korting",
    tva_label: "Btw",

    port_offert: "Gratis",
    port_regle: (seuil, forfait) =>
      "Gratis vanaf " + seuil + " \u20ac excl. btw, anders " + forfait + " \u20ac",
    port_manque: (manque, seuil) =>
      "Nog " + manque + " \u20ac excl. btw voor gratis levering (vanaf " + seuil + " \u20ac excl. btw).",

    regime_intracom: "Verlegging: gefactureerd zonder btw. U geeft de btw aan in uw eigen land.",
    regime_sans_tva: "Uw btw-nummer is nog niet gevalideerd, daarom geldt de Belgische btw van 21%.",

    promo_label: "Kortingscode (optioneel)",
    promo_btn: "Toepassen",
    promo_ok: (code) => "Code " + code + " toegepast.",
    promo_non: "Deze code wordt niet herkend.",
    promo_trop_petit: (code, mini) => "Code " + code + " geldt vanaf "
      + mini.toFixed(2).replace(".", ",") + " EUR excl. btw.",

    ecartees: (n) => n + " artikel(en) in uw mandje zijn niet meer beschikbaar en werden verwijderd.",

    valid_titre: "Bevestiging",
    valid_cgv_html: "Ik aanvaard de <a href=\"/conditions-de-vente/\" target=\"_blank\" rel=\"noopener\">verkoopvoorwaarden</a>.",
    valid_cta: "Mijn bestelling bevestigen",
    valid_envoi: "Bezig met opslaan…",
    valid_note: "Uw bestelling wordt bij ons geregistreerd en u ontvangt de bijbehorende offerte per e-mail. In deze stap wordt niets afgeschreven.",

    pay_cta: "Nu betalen",
    pay_note: "Kaart, Bancontact of directe overschrijving. Uw factuur wordt opgemaakt zodra de betaling binnen is.",
    pay_ou: "of",
    pay_envoi: "Betaling wordt geopend…",
    valid_cta_alt: "Een offerte ontvangen, betaalbaar via overschrijving",
    valid_note_alt: "U ontvangt de offerte per e-mail en betaalt via overschrijving. De bestelling wordt klaargemaakt zodra de betaling binnen is.",

    fini_titre: "Bestelling geregistreerd",
    fini_texte: (ref, email) =>
      "Referentie " + ref + ". De bijbehorende offerte wordt verstuurd naar " + email + ".",
    fini_partiel: "Eén detail van uw bestelling vraagt een controle van onze kant. Wij nemen contact op voor de bevestiging.",
    fini_compte: "Mijn bestellingen bekijken",
    fini_catalogue: "Terug naar de catalogus",

    ret_attente_titre: "Wij controleren uw betaling",
    ret_attente_texte: "Enkele seconden: wij bevragen uw bank. Sluit deze pagina niet.",
    ret_ok_titre: "Betaling ontvangen",
    ret_ok_texte: (devis, facture) => "Bestelling " + devis + (facture ? " — factuur " + facture : "") + ". U ontvangt ze per e-mail.",
    ret_ok_expedition: "Wij maken uw pakket klaar. U ontvangt het trackingnummer zodra het verzonden is.",
    ret_encours_texte: "Uw betaling is geregistreerd. Wij ronden uw bestelling af…",
    ret_lent_texte: "Uw betaling is goed ontvangen. De orderbevestiging bereikt u binnen enkele minuten per e-mail.",
    ret_perdu_titre: "Betaling niet voltooid",
    ret_perdu_texte: "Er is niets afgeschreven. Uw winkelwagen is bewaard: u kunt uw bestelling hervatten.",
    ret_reprendre: "Mijn bestelling hervatten",
    ret_inconnu_titre: "Betaling niet gevonden",
    ret_inconnu_texte: "Wij vinden deze betaling niet op uw account. Werd u toch afgeschreven, neem dan contact met ons op: wij koppelen ze aan uw bestelling.",
    ret_incertain_titre: "Bevestiging in afwachting",
    ret_incertain_texte: "Wij hebben nog geen bevestiging van uw bank ontvangen. Dat kan enkele minuten duren. Betaal niet een tweede keer — wij schrijven u zodra ze binnen is.",

    erreurs: {
      session: "Uw sessie is verlopen. Meld u opnieuw aan — uw mandje blijft bewaard.",
      cgv: "Aanvaard de verkoopvoorwaarden om verder te gaan.",
      vide: "Uw winkelmandje is leeg.",
      livraison_absente: "Geef een leveringsadres op.",
      livraison_nom: "Geef de naam van de ontvanger op.",
      livraison_adresse: "Geef straat en nummer op.",
      livraison_cp: "Geef een postcode op.",
      livraison_ville: "Geef de gemeente op.",
      livraison_pays: "Wij leveren in België, Frankrijk en Luxemburg.",
      tarifs: "De tarieven zijn even niet beschikbaar. Probeer het zo meteen opnieuw.",
      odoo: "Uw bestelling kon niet worden geregistreerd. Er werd niets afgeschreven — probeer het zo meteen opnieuw of neem contact op.",
      injoignable: "Uw bestelling kon niet worden geregistreerd. Er werd niets afgeschreven — probeer het zo meteen opnieuw.",
      muet: "Uw bestelling kon niet worden geregistreerd. Er werd niets afgeschreven — probeer het zo meteen opnieuw.",
      refus: "Uw bestelling kon niet worden geregistreerd. Er werd niets afgeschreven — neem contact op, wij voeren ze voor u in.",
      reseau: "Verbinding onderbroken. Uw mandje blijft bewaard — probeer het opnieuw.",
    },
  },

  de: {
    retour: "Zurück zum Katalog",
    chargement: "Wir bereiten Ihre Bestellung vor…",

    vide_titre: "Ihr Warenkorb ist leer",
    vide_texte: "Fügen Sie Produkte aus dem Katalog hinzu, um zu bestellen.",
    vide_cta: "Zum Katalog",

    conn_titre: "Melden Sie sich an, um zu bestellen",
    conn_texte: "Wir verkaufen ausschließlich an Gewerbetreibende. Ihr Warenkorb bleibt erhalten: Sie finden ihn nach der Anmeldung wieder.",
    conn_cta: "Anmelden",
    conn_creer: "Ich habe noch kein Konto",
    conn_devis: "Oder ein Angebot ohne Konto anfordern",

    ident_titre: "Ihre Daten",
    ident_modifier: "In meinem Konto ändern",

    recep_titre: "Empfang",
    recep_livraison: "Lieferung",
    recep_retrait: "Abholung in Binche",
    recep_retrait_sous: "Kostenlos, nach Vereinbarung",
    recep_meme: "An meine Rechnungsadresse liefern",

    liv_nom: "Name des Empfängers",
    liv_adresse: "Straße und Hausnummer",
    liv_cp: "Postleitzahl",
    liv_ville: "Ort",
    liv_pays: "Land",

    recap_titre: "Ihre Bestellung",
    th_produit: "Produkt",
    th_pieces: "Stück",
    th_pu: "Preis netto",
    th_total: "Gesamt netto",

    tot_sous: "Zwischensumme netto",
    tot_port: "Versandkosten",
    tot_total: "Zu zahlender Betrag",
    tot_remise: "Rabatt",
    tva_label: "MwSt.",

    port_offert: "Kostenlos",
    port_regle: (seuil, forfait) =>
      "Kostenlos ab " + seuil + " \u20ac netto, sonst " + forfait + " \u20ac",
    port_manque: (manque, seuil) =>
      "Noch " + manque + " \u20ac netto bis zur kostenlosen Lieferung (ab " + seuil + " \u20ac netto).",

    regime_intracom: "Reverse-Charge: Rechnung ohne MwSt. Sie melden die MwSt. in Ihrem Land an.",
    regime_sans_tva: "Ihre USt-IdNr. ist noch nicht bestätigt, daher gilt die belgische MwSt. von 21%.",

    promo_label: "Aktionscode (optional)",
    promo_btn: "Anwenden",
    promo_ok: (code) => "Code " + code + " angewendet.",
    promo_non: "Dieser Code wird nicht erkannt.",
    promo_trop_petit: (code, mini) => "Code " + code + " gilt ab "
      + mini.toFixed(2).replace(".", ",") + " EUR netto.",

    ecartees: (n) => n + " Artikel in Ihrem Warenkorb sind nicht mehr verfügbar und wurden entfernt.",

    valid_titre: "Bestätigung",
    valid_cgv_html: "Ich akzeptiere die <a href=\"/conditions-de-vente/\" target=\"_blank\" rel=\"noopener\">Verkaufsbedingungen</a>.",
    valid_cta: "Bestellung abschicken",
    valid_envoi: "Wird gespeichert…",
    valid_note: "Ihre Bestellung wird bei uns erfasst und Sie erhalten das zugehörige Angebot per E-Mail. In diesem Schritt wird nichts abgebucht.",

    pay_cta: "Jetzt bezahlen",
    pay_note: "Karte, Bancontact oder Sofortüberweisung. Ihre Rechnung wird erstellt, sobald die Zahlung eingeht.",
    pay_ou: "oder",
    pay_envoi: "Zahlung wird geöffnet…",
    valid_cta_alt: "Angebot erhalten, zahlbar per Überweisung",
    valid_note_alt: "Sie erhalten das Angebot per E-Mail und zahlen per Überweisung. Die Bestellung wird nach Zahlungseingang vorbereitet.",

    fini_titre: "Bestellung erfasst",
    fini_texte: (ref, email) =>
      "Referenz " + ref + ". Das zugehörige Angebot geht an " + email + ".",
    fini_partiel: "Ein Detail Ihrer Bestellung muss von uns geprüft werden. Wir melden uns vor der Bestätigung.",
    fini_compte: "Meine Bestellungen ansehen",
    fini_catalogue: "Zurück zum Katalog",

    ret_attente_titre: "Wir prüfen Ihre Zahlung",
    ret_attente_texte: "Einen Moment: wir fragen bei Ihrer Bank nach. Bitte schließen Sie diese Seite nicht.",
    ret_ok_titre: "Zahlung eingegangen",
    ret_ok_texte: (devis, facture) => "Bestellung " + devis + (facture ? " — Rechnung " + facture : "") + ". Sie erhalten sie per E-Mail.",
    ret_ok_expedition: "Wir stellen Ihr Paket zusammen. Die Sendungsnummer erhalten Sie beim Versand.",
    ret_encours_texte: "Ihre Zahlung ist erfasst. Wir stellen Ihre Bestellung fertig…",
    ret_lent_texte: "Ihre Zahlung ist eingegangen. Die Bestellbestätigung erreicht Sie in wenigen Minuten per E-Mail.",
    ret_perdu_titre: "Zahlung nicht abgeschlossen",
    ret_perdu_texte: "Es wurde nichts abgebucht. Ihr Warenkorb bleibt erhalten: Sie können Ihre Bestellung fortsetzen.",
    ret_reprendre: "Bestellung fortsetzen",
    ret_inconnu_titre: "Zahlung nicht gefunden",
    ret_inconnu_texte: "Wir finden diese Zahlung nicht in Ihrem Konto. Falls doch abgebucht wurde, melden Sie sich bei uns: wir ordnen sie Ihrer Bestellung zu.",
    ret_incertain_titre: "Bestätigung ausstehend",
    ret_incertain_texte: "Wir haben noch keine Bestätigung Ihrer Bank erhalten. Das kann einige Minuten dauern. Bitte zahlen Sie nicht erneut — wir schreiben Ihnen, sobald sie eintrifft.",

    erreurs: {
      session: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an — Ihr Warenkorb bleibt erhalten.",
      cgv: "Bitte akzeptieren Sie die Verkaufsbedingungen, um fortzufahren.",
      vide: "Ihr Warenkorb ist leer.",
      livraison_absente: "Bitte geben Sie eine Lieferadresse an.",
      livraison_nom: "Bitte geben Sie den Namen des Empfängers an.",
      livraison_adresse: "Bitte geben Sie Straße und Hausnummer an.",
      livraison_cp: "Bitte geben Sie eine Postleitzahl an.",
      livraison_ville: "Bitte geben Sie den Ort an.",
      livraison_pays: "Wir liefern nach Belgien, Frankreich und Luxemburg.",
      tarifs: "Die Preise sind kurzzeitig nicht verfügbar. Bitte versuchen Sie es gleich erneut.",
      odoo: "Ihre Bestellung konnte nicht erfasst werden. Es wurde nichts abgebucht — versuchen Sie es gleich erneut oder kontaktieren Sie uns.",
      injoignable: "Ihre Bestellung konnte nicht erfasst werden. Es wurde nichts abgebucht — bitte versuchen Sie es gleich erneut.",
      muet: "Ihre Bestellung konnte nicht erfasst werden. Es wurde nichts abgebucht — bitte versuchen Sie es gleich erneut.",
      refus: "Ihre Bestellung konnte nicht erfasst werden. Es wurde nichts abgebucht — kontaktieren Sie uns, wir erfassen sie für Sie.",
      reseau: "Verbindung unterbrochen. Ihr Warenkorb bleibt erhalten — bitte versuchen Sie es erneut.",
    },
  },

  tr: {
    retour: "Katalo\u011fa d\u00f6n",
    chargement: "Sipari\u015finizi haz\u0131rl\u0131yoruz…",

    vide_titre: "Sepetiniz bo\u015f",
    vide_texte: "Sipari\u015f vermek i\u00e7in katalogdan \u00fcr\u00fcn ekleyin.",
    vide_cta: "Kataloga git",

    conn_titre: "Sipari\u015f vermek i\u00e7in giri\u015f yap\u0131n",
    conn_texte: "Yaln\u0131zca profesyonellere sat\u0131\u015f yap\u0131yoruz. Sepetiniz saklan\u0131r: giri\u015f yapt\u0131ktan sonra onu yeniden bulursunuz.",
    conn_cta: "Giri\u015f yap",
    conn_creer: "Hen\u00fcz hesab\u0131m yok",
    conn_devis: "Veya hesaps\u0131z fiyat teklifi isteyin",

    ident_titre: "Bilgileriniz",
    ident_modifier: "Hesab\u0131mda d\u00fczenle",

    recep_titre: "Teslim",
    recep_livraison: "Teslimat",
    recep_retrait: "Binche'den teslim alma",
    recep_retrait_sous: "\u00dccretsiz, randevu ile",
    recep_meme: "Fatura adresime teslim et",

    liv_nom: "Al\u0131c\u0131n\u0131n ad\u0131",
    liv_adresse: "Sokak ve numara",
    liv_cp: "Posta kodu",
    liv_ville: "\u015eehir",
    liv_pays: "\u00dclke",

    recap_titre: "Sipari\u015finiz",
    th_produit: "\u00dcr\u00fcn",
    th_pieces: "Adet",
    th_pu: "Birim (KDV hari\u00e7)",
    th_total: "Toplam (KDV hari\u00e7)",

    tot_sous: "Ara toplam (KDV hari\u00e7)",
    tot_port: "Teslimat \u00fccreti",
    tot_total: "\u00d6denecek tutar",
    tot_remise: "\u0130ndirim",
    tva_label: "KDV",

    port_offert: "\u00dccretsiz",
    port_regle: (seuil, forfait) =>
      seuil + " \u20ac (KDV hari\u00e7) \u00fczeri \u00fccretsiz, alt\u0131nda " + forfait + " \u20ac",
    port_manque: (manque, seuil) =>
      "\u00dccretsiz teslimat i\u00e7in " + manque + " \u20ac (KDV hari\u00e7) daha gerekiyor (" + seuil + " \u20ac \u00fczeri).",

    regime_intracom: "Tersine KDV: KDV'siz faturaland\u0131r\u0131l\u0131r. KDV'yi kendi \u00fclkenizde beyan edersiniz.",
    regime_sans_tva: "KDV numaran\u0131z hen\u00fcz do\u011frulanmad\u0131, bu nedenle %21 Bel\u00e7ika KDV'si uygulan\u0131r.",

    promo_label: "Promosyon kodu (iste\u011fe ba\u011fl\u0131)",
    promo_btn: "Uygula",
    promo_ok: (code) => code + " kodu uyguland\u0131.",
    promo_non: "Bu kod tan\u0131nm\u0131yor.",
    promo_trop_petit: (code, mini) => code + " kodu "
      + mini.toFixed(2) + " EUR (KDV hariç) üzeri siparişlerde geçerlidir.",

    ecartees: (n) => "Sepetinizdeki " + n + " \u00fcr\u00fcn art\u0131k mevcut de\u011fil ve kald\u0131r\u0131ld\u0131.",

    valid_titre: "Onay",
    valid_cgv_html: "<a href=\"/conditions-de-vente/\" target=\"_blank\" rel=\"noopener\">Sat\u0131\u015f ko\u015fullar\u0131n\u0131</a> kabul ediyorum.",
    valid_cta: "Sipari\u015fimi onayla",
    valid_envoi: "Kaydediliyor…",
    valid_note: "Sipari\u015finiz taraf\u0131m\u0131zca kaydedilir ve ilgili teklifi e-posta ile al\u0131rs\u0131n\u0131z. Bu a\u015famada hi\u00e7bir \u00f6deme al\u0131nmaz.",

    pay_cta: "\u015eimdi \u00f6de",
    pay_note: "Kart, Bancontact veya an\u0131nda havale. \u00d6deme ula\u015ft\u0131\u011f\u0131 anda faturan\u0131z d\u00fczenlenir.",
    pay_ou: "veya",
    pay_envoi: "\u00d6deme a\u00e7\u0131l\u0131yor\u2026",
    valid_cta_alt: "Havale ile \u00f6denecek teklif al",
    valid_note_alt: "Teklifi e-posta ile al\u0131r ve havale ile \u00f6dersiniz. Sipari\u015f, \u00f6deme ula\u015ft\u0131\u011f\u0131nda haz\u0131rlan\u0131r.",

    fini_titre: "Sipari\u015f kaydedildi",
    fini_texte: (ref, email) =>
      "Referans " + ref + ". \u0130lgili teklif " + email + " adresine g\u00f6nderiliyor.",
    fini_partiel: "Sipari\u015finizin bir ayr\u0131nt\u0131s\u0131 taraf\u0131m\u0131zdan kontrol edilmeli. Onaydan \u00f6nce sizinle ileti\u015fime ge\u00e7ece\u011fiz.",
    fini_compte: "Sipari\u015flerimi g\u00f6r",
    fini_catalogue: "Katalo\u011fa d\u00f6n",

    ret_attente_titre: "\u00d6demenizi do\u011fruluyoruz",
    ret_attente_texte: "Birka\u00e7 saniye: bankan\u0131za soruyoruz. L\u00fctfen bu sayfay\u0131 kapatmay\u0131n.",
    ret_ok_titre: "\u00d6deme al\u0131nd\u0131",
    ret_ok_texte: (devis, facture) => "Sipari\u015f " + devis + (facture ? " \u2014 fatura " + facture : "") + ". E-posta ile size ula\u015f\u0131r.",
    ret_ok_expedition: "Kolinizi haz\u0131rl\u0131yoruz. Kargoya verildi\u011finde takip numaras\u0131n\u0131 alacaks\u0131n\u0131z.",
    ret_encours_texte: "\u00d6demeniz kaydedildi. Sipari\u015finizi tamaml\u0131yoruz\u2026",
    ret_lent_texte: "\u00d6demeniz al\u0131nd\u0131. Sipari\u015f onay\u0131 birka\u00e7 dakika i\u00e7inde e-posta ile size ula\u015f\u0131r.",
    ret_perdu_titre: "\u00d6deme tamamlanmad\u0131",
    ret_perdu_texte: "Hesab\u0131n\u0131zdan hi\u00e7bir tutar \u00e7ekilmedi. Sepetiniz sakland\u0131: sipari\u015finize kald\u0131\u011f\u0131 yerden devam edebilirsiniz.",
    ret_reprendre: "Sipari\u015fime devam et",
    ret_inconnu_titre: "\u00d6deme bulunamad\u0131",
    ret_inconnu_texte: "Bu \u00f6demeyi hesab\u0131n\u0131zda bulam\u0131yoruz. Tutar \u00e7ekildiyse bize yaz\u0131n: sipari\u015finizle e\u015fle\u015ftiririz.",
    ret_incertain_titre: "Onay bekleniyor",
    ret_incertain_texte: "Bankan\u0131zdan hen\u00fcz onay almad\u0131k. Bu birka\u00e7 dakika s\u00fcrebilir. L\u00fctfen ikinci kez \u00f6deme yapmay\u0131n \u2014 onay geldi\u011finde size yazaca\u011f\u0131z.",

    erreurs: {
      session: "Oturumunuz sona erdi. L\u00fctfen yeniden giri\u015f yap\u0131n — sepetiniz saklan\u0131yor.",
      cgv: "Devam etmek i\u00e7in sat\u0131\u015f ko\u015fullar\u0131n\u0131 kabul edin.",
      vide: "Sepetiniz bo\u015f.",
      livraison_absente: "L\u00fctfen bir teslimat adresi belirtin.",
      livraison_nom: "L\u00fctfen al\u0131c\u0131n\u0131n ad\u0131n\u0131 belirtin.",
      livraison_adresse: "L\u00fctfen sokak ve numaray\u0131 belirtin.",
      livraison_cp: "L\u00fctfen bir posta kodu belirtin.",
      livraison_ville: "L\u00fctfen \u015fehri belirtin.",
      livraison_pays: "Bel\u00e7ika, Fransa ve L\u00fcksemburg'a teslimat yap\u0131yoruz.",
      tarifs: "Fiyatlar k\u0131sa s\u00fcreli\u011fine kullan\u0131lam\u0131yor. L\u00fctfen birazdan tekrar deneyin.",
      odoo: "Sipari\u015finiz kaydedilemedi. Hesab\u0131n\u0131zdan hi\u00e7bir tutar \u00e7ekilmedi — birazdan tekrar deneyin veya bize ula\u015f\u0131n.",
      injoignable: "Sipari\u015finiz kaydedilemedi. Hi\u00e7bir tutar \u00e7ekilmedi — l\u00fctfen birazdan tekrar deneyin.",
      muet: "Sipari\u015finiz kaydedilemedi. Hi\u00e7bir tutar \u00e7ekilmedi — l\u00fctfen birazdan tekrar deneyin.",
      refus: "Sipari\u015finiz kaydedilemedi. Hi\u00e7bir tutar \u00e7ekilmedi — bize ula\u015f\u0131n, sizin i\u00e7in girelim.",
      reseau: "Ba\u011flant\u0131 kesildi. Sepetiniz saklan\u0131yor — l\u00fctfen tekrar deneyin.",
    },
  },
};
