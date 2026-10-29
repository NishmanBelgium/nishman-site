/* ==========================================================================
   CATALOGUE — page /produits.
   Charge assets/data/products.json, permet recherche/filtre, et construit
   une "sélection" envoyée par WhatsApp au commercial choisi (liste AGENTS
   réutilisée depuis assets/js/config.js, une seule source de vérité).
   Aucune donnée n'est envoyée à un serveur : tout reste dans le navigateur
   du visiteur (localStorage) jusqu'à l'envoi WhatsApp final.
   ========================================================================== */

(function () {
  "use strict";


  // Safari (surtout sur iOS) restaure la position de défilement au
  // rechargement : on arrivait alors directement au milieu du catalogue,
  // écran d'accueil sauté. On reprend la main.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const ASSET_V = "205";

  // Conditions commerciales. Modifier ici suffit : le panier, la barre
  // flottante et la page de devis lisent ces deux valeurs.
  // Minimum de commande pour une LIVRAISON, en euros HT. Le retrait sur
  // place n'est soumis à aucun minimum.
  // Frais de port HT par pays de livraison : offerts au-delà du seuil,
  // forfaitaires en dessous. Il n'y a plus de minimum de commande.
  const PORT = {
    BE: { seuil: 300, forfait: 10 },
    FR: { seuil: 500, forfait: 15 },
    LU: { seuil: 500, forfait: 15 },
  };

  const STORAGE_KEY = "nishman_selection_v1";

  let PRODUCTS = [];
  let selection = {}; // { ean: qty }
  let activeCategory = "Tous";
  let searchTerm = "";

  // ==========================================================================
  // LANGUES — fr par défaut ; le choix est mémorisé et recharge la page.
  // Les noms de produits restent dans leur langue d'origine (marque).
  // ==========================================================================

  const LANGS = ["fr", "en", "nl", "de", "tr"];

  function getLang() {
    const saved = localStorage.getItem("nishman-lang");
    return LANGS.includes(saved) ? saved : "fr";
  }

  function setLang(l) {
    localStorage.setItem("nishman-lang", l);
    window.location.reload();
  }

  const LANG = getLang();

  const I18N = {
    fr: {
      search: "Rechercher un produit ou un code EAN...",
      all: "Toutes", allRange: "Toute la gamme", categories: "Catégories",
      results: (n) => n + " produit" + (n > 1 ? "s" : ""),
      unitNote: "HT / unité", perUnit: "À l'unité",
      boxOf: (n) => "Carton de " + n, add: "Ajouter",
      packaging: (n, price) => "Conditionnement : carton de " + n + " unités" + (price ? " — " + price + " HT / carton" : ""),
      mySelection: "Ma sélection", sendTo: "Finaliser ma demande",
      remove: "retirer", unit: (n) => n + " unité" + (n > 1 ? "s" : ""),
      box: (n) => n + " carton" + (n > 1 ? "s" : ""),
      articles: (n) => n + " article" + (n > 1 ? "s" : ""),
      seeSelection: "voir ma sélection", discover: "Découvrir",
      askPrice: "Prix sur demande", proAccess: "Accès professionnel",
      priceLoading: "Chargement des tarifs…",
      priceDown: "Tarifs momentanément indisponibles. Écrivez-nous à contact@nishman.be, nous vous les transmettons.",
      noResults: "Aucun produit ne correspond à votre recherche.",
      welcomeTitle: "Catalogue professionnel",
      welcomeText: "Ce catalogue s'adresse aux salons de coiffure et aux barbiers. Les tarifs affichés sont nos prix professionnels. Pour commander, il faut un compte — la création est immédiate et gratuite.",
      welcomeSkip: "Continuer la visite",
      accountNeeded: "Pour envoyer une demande de devis, il faut un compte professionnel. La création est immédiate et gratuite.",
      accountLogin: "Se connecter",
      accountCreate: "Créer un compte professionnel",
      signupTitle: "Accès réservé aux professionnels",
      lockedNote: "Prix réservés aux professionnels",
      addCart: "Ajouter au panier", updateCart: "Mettre à jour le panier",
      toastAdded: "Ajouté au panier", toastUpdated: "Panier mis à jour",
      clearCart: "Vider",
      clearConfirm: "Vider tout le panier ?",
      toastCleared: "Panier vidé",
      totalHT: "Total HT", salesTeam: "Service commercial Nishman",
      portManque: (m, seuil) => `Encore ${m} et la livraison est offerte`,
      portOffert: "Livraison offerte sur cette commande",
      portRegles: "Livraison offerte dès 300 € HT en Belgique, dès 500 € en France et au Luxembourg.",
      portRetrait: "Retrait à Binche : toujours gratuit.",
      banBE: "Belgique — livraison offerte dès 300 € HT, sinon 10 €",
      banImportateur: "Importateur officiel Nishman — Belgique, France, Luxembourg",
      banHT: "Prix professionnels hors TVA",
      quiTitre: "Qui vous livre",
      quiOfficiel: "Circuit officiel",
      quiOfficielTexte: "NBD Distribution est l'importateur officiel et exclusif de Nishman pour la Belgique, la France et le Luxembourg. Les produits viennent directement de la marque.",
      quiDepot: "Dépôt et showroom à Binche",
      quiDepotTexte: "Les salons y sont reçus sur rendez-vous. Le retrait sur place est possible, sans frais.",
      quiCommerciaux: "Livré par nos commerciaux",
      quiCommerciauxTexte: "Une partie des commandes est livrée en main propre, en Belgique et dans le nord de la France.",
      quiRefs: (n) => `${n} références au catalogue`,
      banFR: "France et Luxembourg — offerte dès 500 € HT, sinon 15 €",
      banRetrait: "Retrait à Binche — toujours gratuit",
      contactTitle: "Une question ? Écrivez-nous", contactWa: "WhatsApp", contactMail: "E-mail",
      contactMsg: "Bonjour, j'ai une question concernant les produits Nishman.",
      outOfStock: "Momentanément indisponible",
      soon: "Bientôt disponible",
      stockLeft: (n) => "Stock disponible : " + n + " pièces",
      lowStock: (n) => "Stock limité : " + n + " pièces — vente à l'unité uniquement",
      cartLimited: "Quantité ajustée au stock disponible",
      footTag: "Distributeur officiel Nishman pour la Belgique, la France et le Luxembourg. Produits professionnels pour barbers et coiffeurs.",
      footContact: "Contact", footCompany: "Société",
      footSocial: "Retrouvez-nous sur",
      footRights: "Tous droits réservés.",
      cgvLink: "Conditions générales de vente",
      proAccessShort: "Accès pro",
      footLegal: "Prix hors TVA réservés aux professionnels.",
      askQuote: "Demander un devis",
      orderNow: "Commander",
      orderSub: "Compte professionnel requis",
      quoteSub: "Compte professionnel requis · réponse sous 24 h",
      waMsg: "Bonjour, je souhaite une offre de prix pour les produits suivants :",
      boxDetail: (b, n, tot) => b + " carton" + (b > 1 ? "s" : "") + " de " + n + " (" + tot + " unités)",
    },
    en: {
      search: "Search a product or EAN code...",
      all: "All", allRange: "Full range", categories: "Categories",
      results: (n) => n + " product" + (n > 1 ? "s" : ""),
      unitNote: "excl. VAT / unit", perUnit: "Per unit",
      boxOf: (n) => "Box of " + n, add: "Add",
      packaging: (n, price) => "Packaging: box of " + n + " units" + (price ? " — " + price + " excl. VAT / box" : ""),
      mySelection: "My selection", sendTo: "Complete my request",
      remove: "remove", unit: (n) => n + " unit" + (n > 1 ? "s" : ""),
      box: (n) => n + " box" + (n > 1 ? "es" : ""),
      articles: (n) => n + " item" + (n > 1 ? "s" : ""),
      seeSelection: "view my selection", discover: "Discover",
      askPrice: "Price on request", proAccess: "Professional access",
      priceLoading: "Loading prices…",
      priceDown: "Prices are temporarily unavailable. Email contact@nishman.be and we will send them to you.",
      noResults: "No product matches your search.",
      welcomeTitle: "Trade catalogue",
      welcomeText: "This catalogue is for hair salons and barbershops. The prices shown are our trade prices. An account is required to order — creating one is free and immediate.",
      welcomeSkip: "Keep browsing",
      accountNeeded: "To send a quote request you need a trade account. Creating one is free and takes a minute.",
      accountLogin: "Log in",
      accountCreate: "Create a trade account",
      signupTitle: "Access reserved for professionals",
      lockedNote: "Prices reserved for professionals",
      addCart: "Add to cart", updateCart: "Update cart",
      toastAdded: "Added to cart", toastUpdated: "Cart updated",
      clearCart: "Clear",
      clearConfirm: "Empty the whole cart?",
      toastCleared: "Cart cleared",
      totalHT: "Total excl. VAT", salesTeam: "Nishman sales team",
      portManque: (m, seuil) => `${m} more and delivery is free`,
      portOffert: "Free delivery on this order",
      portRegles: "Free delivery from €300 excl. VAT in Belgium, from €500 in France and Luxembourg.",
      portRetrait: "Collection in Binche: always free.",
      banBE: "Belgium — free delivery from €300 excl. VAT, otherwise €10",
      banImportateur: "Official Nishman importer — Belgium, France, Luxembourg",
      banHT: "Trade prices, VAT excluded",
      quiTitre: "Who delivers to you",
      quiOfficiel: "Official channel",
      quiOfficielTexte: "NBD Distribution is the official and exclusive Nishman importer for Belgium, France and Luxembourg. Products come straight from the brand.",
      quiDepot: "Warehouse and showroom in Binche",
      quiDepotTexte: "Salons are welcome by appointment. Collection on site is possible, free of charge.",
      quiCommerciaux: "Delivered by our own reps",
      quiCommerciauxTexte: "Part of the orders are delivered by hand, in Belgium and northern France.",
      quiRefs: (n) => `${n} references in the catalogue`,
      banFR: "France and Luxembourg — free from €500 excl. VAT, otherwise €15",
      banRetrait: "Collection in Binche — always free",
      contactTitle: "A question? Write to us", contactWa: "WhatsApp", contactMail: "E-mail",
      contactMsg: "Hello, I have a question about Nishman products.",
      outOfStock: "Temporarily unavailable",
      soon: "Coming soon",
      stockLeft: (n) => "Available stock: " + n + " pcs",
      lowStock: (n) => "Limited stock: " + n + " pcs — sold by unit only",
      cartLimited: "Quantity adjusted to available stock",
      footTag: "Official Nishman distributor for Belgium, France and Luxembourg. Professional products for barbers and hairdressers.",
      footContact: "Contact", footCompany: "Company",
      footSocial: "Follow us on",
      footRights: "All rights reserved.",
      cgvLink: "Terms and conditions of sale",
      proAccessShort: "Pro access",
      footLegal: "Prices excl. VAT, reserved for professionals.",
      askQuote: "Request a quotation",
      orderNow: "Place an order",
      orderSub: "Professional account required",
      quoteSub: "Professional account required · reply within 24 h",
      waMsg: "Hello, I would like a price offer for the following products:",
      boxDetail: (b, n, tot) => b + " box" + (b > 1 ? "es" : "") + " of " + n + " (" + tot + " units)",
    },
    nl: {
      search: "Zoek een product of EAN-code...",
      all: "Alle", allRange: "Volledig gamma", categories: "Categorieën",
      results: (n) => n + " product" + (n > 1 ? "en" : ""),
      unitNote: "excl. btw / stuk", perUnit: "Per stuk",
      boxOf: (n) => "Doos van " + n, add: "Toevoegen",
      packaging: (n, price) => "Verpakking: doos van " + n + " stuks" + (price ? " — " + price + " excl. btw / doos" : ""),
      mySelection: "Mijn selectie", sendTo: "Mijn aanvraag afronden",
      remove: "verwijderen", unit: (n) => n + " stuk" + (n > 1 ? "s" : ""),
      box: (n) => n + " do" + (n > 1 ? "zen" : "os"),
      articles: (n) => n + " artikel" + (n > 1 ? "en" : ""),
      seeSelection: "bekijk mijn selectie", discover: "Ontdekken",
      askPrice: "Prijs op aanvraag", proAccess: "Professionele toegang",
      priceLoading: "Prijzen laden…",
      priceDown: "Prijzen zijn tijdelijk niet beschikbaar. Mail naar contact@nishman.be, wij bezorgen ze u.",
      noResults: "Geen enkel product komt overeen met uw zoekopdracht.",
      welcomeTitle: "Vakcatalogus",
      welcomeText: "Deze catalogus is bedoeld voor kapsalons en barbershops. De getoonde tarieven zijn onze vakprijzen. Om te bestellen hebt u een account nodig — aanmaken is gratis en onmiddellijk.",
      welcomeSkip: "Verder kijken",
      accountNeeded: "Om een offerteaanvraag te versturen hebt u een zakelijk account nodig. Aanmaken is gratis en onmiddellijk.",
      accountLogin: "Aanmelden",
      accountCreate: "Een professioneel account aanmaken",
      signupTitle: "Toegang voorbehouden aan professionals",
      lockedNote: "Prijzen voorbehouden aan professionals",
      addCart: "In winkelmand", updateCart: "Winkelmand bijwerken",
      toastAdded: "Toegevoegd aan winkelmand", toastUpdated: "Winkelmand bijgewerkt",
      clearCart: "Wissen",
      clearConfirm: "De hele mand legen?",
      toastCleared: "Mand geleegd",
      totalHT: "Totaal excl. btw", salesTeam: "Nishman verkoopdienst",
      portManque: (m, seuil) => `Nog ${m} en de levering is gratis`,
      portOffert: "Gratis levering op deze bestelling",
      portRegles: "Gratis levering vanaf € 300 excl. btw in België, vanaf € 500 in Frankrijk en Luxemburg.",
      portRetrait: "Afhalen in Binche: altijd gratis.",
      banBE: "België — gratis levering vanaf € 300 excl. btw, anders € 10",
      banImportateur: "Officiële Nishman-invoerder — België, Frankrijk, Luxemburg",
      banHT: "Vakprijzen, excl. btw",
      quiTitre: "Wie bij u levert",
      quiOfficiel: "Officieel circuit",
      quiOfficielTexte: "NBD Distribution is de officiële en exclusieve invoerder van Nishman voor België, Frankrijk en Luxemburg. De producten komen rechtstreeks van het merk.",
      quiDepot: "Magazijn en showroom in Binche",
      quiDepotTexte: "Salons zijn welkom op afspraak. Afhalen ter plaatse kan, zonder kosten.",
      quiCommerciaux: "Geleverd door onze vertegenwoordigers",
      quiCommerciauxTexte: "Een deel van de bestellingen wordt persoonlijk geleverd, in België en Noord-Frankrijk.",
      quiRefs: (n) => `${n} referenties in de catalogus`,
      banFR: "Frankrijk en Luxemburg — gratis vanaf € 500 excl. btw, anders € 15",
      banRetrait: "Afhalen in Binche — altijd gratis",
      contactTitle: "Een vraag? Schrijf ons", contactWa: "WhatsApp", contactMail: "E-mail",
      contactMsg: "Hallo, ik heb een vraag over de Nishman-producten.",
      outOfStock: "Tijdelijk niet beschikbaar",
      soon: "Binnenkort beschikbaar",
      stockLeft: (n) => "Beschikbare voorraad: " + n + " stuks",
      lowStock: (n) => "Beperkte voorraad: " + n + " stuks — enkel per stuk",
      cartLimited: "Hoeveelheid aangepast aan de voorraad",
      footTag: "Officiële Nishman-verdeler voor België, Frankrijk en Luxemburg. Professionele producten voor barbiers en kappers.",
      footContact: "Contact", footCompany: "Onderneming",
      footSocial: "Volg ons op",
      footRights: "Alle rechten voorbehouden.",
      cgvLink: "Algemene verkoopvoorwaarden",
      proAccessShort: "Pro-toegang",
      footLegal: "Prijzen excl. btw, voorbehouden aan professionals.",
      askQuote: "Offerte aanvragen",
      orderNow: "Bestellen",
      orderSub: "Zakelijk account vereist",
      quoteSub: "Zakelijk account vereist · antwoord binnen 24 u",
      waMsg: "Hallo, ik wil graag een prijsofferte voor de volgende producten:",
      boxDetail: (b, n, tot) => b + " do" + (b > 1 ? "zen" : "os") + " van " + n + " (" + tot + " stuks)",
    },
    de: {
      search: "Produkt oder EAN-Code suchen...",
      all: "Alle", allRange: "Gesamtes Sortiment", categories: "Kategorien",
      results: (n) => n + " Produkt" + (n > 1 ? "e" : ""),
      unitNote: "zzgl. MwSt. / Stück", perUnit: "Pro Stück",
      boxOf: (n) => "Karton mit " + n, add: "Hinzufügen",
      packaging: (n, price) => "Verpackung: Karton mit " + n + " Stück" + (price ? " — " + price + " zzgl. MwSt. / Karton" : ""),
      mySelection: "Meine Auswahl", sendTo: "Meine Anfrage abschließen",
      remove: "entfernen", unit: (n) => n + " Stück",
      box: (n) => n + " Karton" + (n > 1 ? "s" : ""),
      articles: (n) => n + " Artikel",
      seeSelection: "meine Auswahl ansehen", discover: "Entdecken",
      askPrice: "Preis auf Anfrage", proAccess: "Professioneller Zugang",
      priceLoading: "Preise werden geladen…",
      priceDown: "Preise vorübergehend nicht verfügbar. Schreiben Sie an contact@nishman.be, wir senden sie Ihnen zu.",
      noResults: "Kein Produkt entspricht Ihrer Suche.",
      welcomeTitle: "Fachkatalog",
      welcomeText: "Dieser Katalog richtet sich an Friseursalons und Barbershops. Die angezeigten Preise sind unsere Händlerpreise. Zum Bestellen ist ein Konto nötig — die Anmeldung ist kostenlos und sofort möglich.",
      welcomeSkip: "Weiter stöbern",
      accountNeeded: "Für eine Angebotsanfrage benötigen Sie ein Händlerkonto. Die Anmeldung ist kostenlos und sofort möglich.",
      accountLogin: "Anmelden",
      accountCreate: "Händlerkonto erstellen",
      signupTitle: "Zugang nur für Fachkunden",
      lockedNote: "Preise Fachkunden vorbehalten",
      waMsg: "Hallo, ich bitte um ein Preisangebot für folgende Produkte:",
      boxDetail: (b, n, tot) => b + " Karton" + (b > 1 ? "s" : "") + " mit " + n + " (" + tot + " Stück)",
      addCart: "In den Warenkorb", updateCart: "Warenkorb aktualisieren",
      toastAdded: "Zum Warenkorb hinzugefügt", toastUpdated: "Warenkorb aktualisiert",
      clearCart: "Leeren",
      clearConfirm: "Den gesamten Warenkorb leeren?",
      toastCleared: "Warenkorb geleert",
      totalHT: "Gesamt zzgl. MwSt.", salesTeam: "Nishman Vertriebsteam",
      portManque: (m, seuil) => `Noch ${m} und die Lieferung ist kostenlos`,
      portOffert: "Kostenlose Lieferung für diese Bestellung",
      portRegles: "Kostenlose Lieferung ab 300 € netto in Belgien, ab 500 € in Frankreich und Luxemburg.",
      portRetrait: "Abholung in Binche: immer kostenlos.",
      banBE: "Belgien — kostenlose Lieferung ab 300 € netto, sonst 10 €",
      banImportateur: "Offizieller Nishman-Importeur — Belgien, Frankreich, Luxemburg",
      banHT: "Händlerpreise, ohne MwSt.",
      quiTitre: "Wer Sie beliefert",
      quiOfficiel: "Offizieller Vertriebsweg",
      quiOfficielTexte: "NBD Distribution ist der offizielle und exklusive Nishman-Importeur für Belgien, Frankreich und Luxemburg. Die Produkte kommen direkt von der Marke.",
      quiDepot: "Lager und Showroom in Binche",
      quiDepotTexte: "Salons sind nach Vereinbarung willkommen. Abholung vor Ort ist kostenlos möglich.",
      quiCommerciaux: "Von unseren Außendienstlern geliefert",
      quiCommerciauxTexte: "Ein Teil der Bestellungen wird persönlich geliefert, in Belgien und Nordfrankreich.",
      quiRefs: (n) => `${n} Artikel im Katalog`,
      banFR: "Frankreich und Luxemburg — kostenlos ab 500 € netto, sonst 15 €",
      banRetrait: "Abholung in Binche — immer kostenlos",
      contactTitle: "Eine Frage? Schreiben Sie uns", contactWa: "WhatsApp", contactMail: "E-Mail",
      contactMsg: "Guten Tag, ich habe eine Frage zu den Nishman-Produkten.",
      outOfStock: "Vorübergehend nicht verfügbar",
      soon: "Demnächst verfügbar",
      stockLeft: (n) => "Verfügbarer Bestand: " + n + " Stück",
      lowStock: (n) => "Begrenzter Bestand: " + n + " Stück — nur stückweise",
      cartLimited: "Menge an den Bestand angepasst",
      footTag: "Offizieller Nishman-Distributor für Belgien, Frankreich und Luxemburg. Professionelle Produkte für Barbiere und Friseure.",
      footContact: "Kontakt", footCompany: "Unternehmen",
      footSocial: "Folgen Sie uns",
      footRights: "Alle Rechte vorbehalten.",
      cgvLink: "Allgemeine Verkaufsbedingungen",
      proAccessShort: "Fachzugang",
      footLegal: "Preise zzgl. MwSt., Fachkunden vorbehalten.",
      askQuote: "Angebot anfordern",
      orderNow: "Bestellen",
      orderSub: "Geschäftskonto erforderlich",
      quoteSub: "Geschäftskonto erforderlich · Antwort innerhalb von 24 Std.",
    },
    tr: {
      search: "Ürün veya EAN kodu ara...",
      all: "Tümü", allRange: "Tüm seri", categories: "Kategoriler",
      results: (n) => n + " ürün",
      unitNote: "KDV hariç / adet", perUnit: "Adet olarak",
      boxOf: (n) => n + "'lu koli", add: "Ekle",
      packaging: (n, price) => "Koli içeriği: " + n + " adet" + (price ? " — " + price + " KDV hariç / koli" : ""),
      mySelection: "Seçimim", sendTo: "Talebimi tamamla",
      remove: "kaldır", unit: (n) => n + " adet",
      box: (n) => n + " koli",
      articles: (n) => n + " ürün",
      seeSelection: "seçimimi gör", discover: "Keşfet",
      askPrice: "Fiyat için sorunuz", proAccess: "Profesyonel erişim",
      priceLoading: "Fiyatlar yükleniyor…",
      priceDown: "Fiyatlar ge\u00e7ici olarak kullan\u0131lam\u0131yor. contact@nishman.be adresine yaz\u0131n, size iletelim.",
      noResults: "Aramanızla eşleşen ürün yok.",
      welcomeTitle: "Profesyonel katalog",
      welcomeText: "Bu katalog kuaför salonları ve berberler içindir. Gösterilen fiyatlar profesyonel fiyatlarımızdır. Sipariş vermek için hesap gerekir — hesap açmak ücretsiz ve anındadır.",
      welcomeSkip: "Göz atmaya devam et",
      accountNeeded: "Teklif talebi göndermek için profesyonel bir hesap gerekir. Hesap açmak ücretsiz ve anındadır.",
      accountLogin: "Giriş yap",
      accountCreate: "Profesyonel hesap oluştur",
      signupTitle: "Erişim yalnızca profesyonellere açıktır",
      lockedNote: "Fiyatlar profesyonellere özeldir",
      waMsg: "Merhaba, aşağıdaki ürünler için fiyat teklifi rica ediyorum:",
      boxDetail: (b, n, tot) => b + " adet " + n + "'lu koli (" + tot + " adet)",
      addCart: "Sepete ekle", updateCart: "Sepeti güncelle",
      toastAdded: "Sepete eklendi", toastUpdated: "Sepet güncellendi",
      clearCart: "Temizle",
      clearConfirm: "Sepetin tamamı boşaltılsın mı?",
      toastCleared: "Sepet boşaltıldı",
      totalHT: "Toplam (KDV hariç)", salesTeam: "Nishman Satış Ekibi",
      portManque: (m, seuil) => `${m} daha, teslimat ücretsiz olsun`,
      portOffert: "Bu siparişte teslimat ücretsiz",
      portRegles: "Belçika'da 300 € (KDV hariç) üzeri, Fransa ve Lüksemburg'da 500 € üzeri teslimat ücretsiz.",
      portRetrait: "Binche'ten teslim alma: her zaman ücretsiz.",
      banBE: "Belçika — 300 € (KDV hariç) üzeri ücretsiz teslimat, altında 10 €",
      banImportateur: "Resmî Nishman ithalatçısı — Belçika, Fransa, Lüksemburg",
      banHT: "Profesyonel fiyatlar, KDV hariç",
      quiTitre: "Size kim teslim ediyor",
      quiOfficiel: "Resmî kanal",
      quiOfficielTexte: "NBD Distribution, Belçika, Fransa ve Lüksemburg için Nishman'ın resmî ve münhasır ithalatçısıdır. Ürünler doğrudan markadan gelir.",
      quiDepot: "Binche'te depo ve showroom",
      quiDepotTexte: "Salonlar randevuyla kabul edilir. Yerinden teslim alma mümkündür, ücretsizdir.",
      quiCommerciaux: "Kendi temsilcilerimizle teslimat",
      quiCommerciauxTexte: "Siparişlerin bir kısmı Belçika ve Kuzey Fransa'da elden teslim edilir.",
      quiRefs: (n) => `Katalogda ${n} ürün`,
      banFR: "Fransa ve Lüksemburg — 500 € üzeri ücretsiz, altında 15 €",
      banRetrait: "Binche'ten teslim alma — her zaman ücretsiz",
      contactTitle: "Sorunuz mu var? Bize yazın", contactWa: "WhatsApp", contactMail: "E-posta",
      contactMsg: "Merhaba, Nishman ürünleri hakkında bir sorum var.",
      outOfStock: "Geçici olarak mevcut değil",
      soon: "Çok yakında",
      stockLeft: (n) => "Mevcut stok: " + n + " adet",
      lowStock: (n) => "Sınırlı stok: " + n + " adet — yalnızca adet olarak",
      cartLimited: "Miktar mevcut stoğa göre ayarlandı",
      footTag: "Belçika, Fransa ve Lüksemburg için resmi Nishman distribütörü. Barber ve kuaförler için profesyonel ürünler.",
      footContact: "İletişim", footCompany: "Firma",
      footSocial: "Bizi takip edin",
      footRights: "Tüm hakları saklıdır.",
      cgvLink: "Genel satış koşulları",
      proAccessShort: "Pro erişim",
      footLegal: "Fiyatlar KDV hariçtir, profesyonellere özeldir.",
      askQuote: "Fiyat teklifi iste",
      orderNow: "Sipariş ver",
      orderSub: "Kurumsal hesap gerekli",
      quoteSub: "Kurumsal hesap gerekli · 24 saat içinde yanıt",
    },
  };

  const T = I18N[LANG];

  const CAT_I18N = {
    "Aqua Wax": { en: "Aqua Wax", nl: "Aqua Wax", de: "Aqua Wax", tr: "Aqua Wax" },
    "Colognes": { en: "Colognes", nl: "Eau de cologne", de: "Kölnisch Wasser", tr: "Kolonyalar" },
    "Poudres coiffantes": { en: "Styling Powders", nl: "Stylingpoeders", de: "Stylingpuder", tr: "Şekillendirici Pudralar" },
    "Mat Wax": { en: "Mat Wax", nl: "Mat Wax", de: "Mat Wax", tr: "Mat Wax" },
    "Coloration": { en: "Hair Color", nl: "Haarkleuring", de: "Haarfarbe", tr: "Saç Boyası" },
    "Soins barbe": { en: "Beard Care", nl: "Baardverzorging", de: "Bartpflege", tr: "Sakal Bakımı" },
    "Peignes & Brosses": { en: "Combs & Brushes", nl: "Kammen & Borstels", de: "Kämme & Bürsten", tr: "Tarak & Fırça" },
    "Shampoings & Après-shampoings": { en: "Shampoo & Conditioner", nl: "Shampoo & Conditioner", de: "Shampoo & Conditioner", tr: "Şampuan & Saç Kremi" },
    "Rasage": { en: "Shaving", nl: "Scheren", de: "Rasur", tr: "Tıraş" },
    "Gels & Mousses": { en: "Gels & Foams", nl: "Gels & Mousses", de: "Gele & Schäume", tr: "Jöleler & Köpükler" },
    "Crème & Bien-être": { en: "Creams & Wellbeing", nl: "Crèmes & Welzijn", de: "Cremes & Wohlbefinden", tr: "Kremler & Bakım" },
    "Consommables": { en: "Consumables", nl: "Verbruiksartikelen", de: "Verbrauchsmaterial", tr: "Sarf Malzemeleri" },
    "Coffrets": { en: "Gift Sets", nl: "Geschenksets", de: "Geschenksets", tr: "Hediye Setleri" },
  };

  function catLabel(cat) {
    if (LANG === "fr") return cat;
    return (CAT_I18N[cat] && CAT_I18N[cat][LANG]) || cat;
  }

  // Texte produit dans la langue courante, repli sur le français
  function pText(p, field) {
    if (LANG !== "fr" && p[field + "_" + LANG]) return p[field + "_" + LANG];
    return p[field] || "";
  }

  // Source de l'image d'un produit. Centralisé ici : la version "aperçu
  // hors-ligne" (fichier unique) surcharge IMAGE_BASE avec des images
  // embarquées, sans toucher au reste du code.
  const IMAGE_BASE = window.NISHMAN_IMAGE_BASE || "/assets/img/products/";

  function productImageSrc(p) {
    if (window.NISHMAN_INLINE_IMAGES) {
      return window.NISHMAN_INLINE_IMAGES[p.image] || IMAGE_BASE + p.image;
    }
    // Version ajoutée à l'URL : quand une photo est remplacée, les
    // navigateurs la rechargent au lieu de servir leur copie en cache.
    return IMAGE_BASE + p.image + "?v=" + ASSET_V;
  }

  // ---------- Persistance locale de la sélection ----------

  function loadSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      selection = raw ? JSON.parse(raw) : {};
      // Migration : les anciennes sélections stockaient un simple nombre d'unités.
      Object.keys(selection).forEach((ean) => {
        if (typeof selection[ean] === "number") {
          selection[ean] = { u: selection[ean], b: 0 };
        }
      });
    } catch (e) {
      selection = {};
    }
  }

  function saveSelection() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch (e) {
      /* stockage indisponible : la sélection reste valable pour la session en cours */
    }
  }

  function unitCount() {
    return Object.values(selection).reduce((s, q) => s + (q.u || 0), 0);
  }

  function boxCount() {
    return Object.values(selection).reduce((s, q) => s + (q.b || 0), 0);
  }

  function hasSelection() {
    return unitCount() + boxCount() > 0;
  }

  function entry(ean) {
    if (!selection[ean]) selection[ean] = { u: 0, b: 0 };
    return selection[ean];
  }

  // ---------- Chargement des produits ----------

  async function loadProducts() {
    const res = await fetch("/assets/data/products.json?v=" + ASSET_V);
    const all = await res.json();
    // Les produits marqués "hidden" sont temporairement retirés de la vente
    // (rupture de stock) : leur fiche reste dans le fichier, prête à revenir.
    // Ceux marqués "mcb" n'existent que pendant l'offre de salon : invisibles
    // au grand public, visibles sur la tablette du stand (adresse avec ?mcb).
    const offreOuverte =
      typeof window.offreDispo === "function" && window.offreDispo();
    PRODUCTS = all.filter((p) => !p.hidden && (!p.mcb || offreOuverte));
  }

  // ---------- Rendu : filtres catégories ----------
  // Un bouton compact ouvre un panneau montrant TOUTES les catégories d'un
  // coup (grille), au lieu d'une rangée à faire défiler horizontalement.

  function categoryCounts() {
    const counts = {};
    PRODUCTS.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }

  function renderCatButton() {
    const btn = document.getElementById("cat-btn");
    const label = document.getElementById("cat-btn-label");
    const filtered = activeCategory !== "Tous";
    label.textContent = filtered ? catLabel(activeCategory) : T.all;
    btn.classList.toggle("filtered", filtered);
  }

  function renderCatGrid() {
    const counts = categoryCounts();
    // Le menu suit l'ordre de la page : categoryCounts parcourt les produits
    // dans l'ordre du fichier, donc les clés sortent déjà dans l'ordre
    // d'apparition. Aucun tri à appliquer.
    const cats = Object.keys(counts);
    const grid = document.getElementById("cat-grid");

    const cells = [
      { name: "Tous", count: PRODUCTS.length, wide: true },
      ...cats.map((c) => ({ name: c, count: counts[c], wide: false })),
    ];

    grid.innerHTML = cells
      .map(
        (c) => `
          <button class="cat-cell${c.name === activeCategory ? " active" : ""}${c.wide ? " wide" : ""}" data-cat="${escapeAttr(c.name)}">
            <span>${escapeHtml(c.name === "Tous" ? T.allRange : catLabel(c.name))}</span>
            <span class="cat-cell-count">${c.count}</span>
          </button>`
      )
      .join("");

    grid.querySelectorAll("[data-cat]").forEach((cell) => {
      cell.addEventListener("click", () => {
        activeCategory = cell.dataset.cat;
        renderCatButton();
        renderCatGrid();
        renderGrid();
        closeCatPanel();
        // On remonte en haut de la grille, sinon on reste perdu au milieu.
        document.getElementById("grid").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function openCatPanel() {
    renderCatGrid();
    document.getElementById("cat-overlay").hidden = false;
    syncScrollLock();
  }

  function closeCatPanel() {
    document.getElementById("cat-overlay").hidden = true;
    syncScrollLock();
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;");
  }

  // ---------- Limites de commande (stock Odoo) ----------

  function limitOf(ean) {
    return LIMITS && LIMITS[ean] ? LIMITS[ean] : null;
  }

  function maxUnits(p) {
    const l = limitOf(p.ean);
    return l ? l.u : Infinity;
  }

  function maxBoxes(p) {
    const l = limitOf(p.ean);
    if (!l) return Infinity;
    return l.b;
  }

  // Le produit peut-il encore être commandé ?
  function isOut(p) {
    const l = limitOf(p.ean);
    return !!l && l.state === "out";
  }

  // Vente au carton désactivée (stock faible) ?
  function boxDisabled(p) {
    const l = limitOf(p.ean);
    return !!l && l.b <= 0;
  }

  // Pièces déjà engagées dans le panier pour ce produit
  function piecesInCart(p) {
    const q = selection[p.ean];
    if (!q) return 0;
    return (q.u || 0) + (q.b || 0) * (p.box_qty || 0);
  }

  // ---------- Rendu : grille produits ----------

  // Les accents sont une faute de frappe comme une autre : « creme » doit
  // trouver « crème ». On compare des formes aplaties, jamais le texte brut.
  function aplati(t) {
    return String(t == null ? "" : t)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  // Ce dans quoi on cherche, et ce que vaut une trouvaille. Le nom pèse plus
  // que la description : qui tape « mat » veut d'abord les produits qui
  // s'appellent ainsi, pas les quarante dont la notice contient le mot.
  function champsCherchables(p) {
    return [
      { texte: p.name, poids: 100 },
      { texte: p.ean, poids: 90 },
      { texte: catLabel(p.category), poids: 60 },
      { texte: p.category, poids: 55 },
      { texte: p.volume, poids: 50 },
      { texte: pText(p, "tagline"), poids: 40 },
      { texte: p.tagline, poids: 35 },
      { texte: pText(p, "description"), poids: 20 },
      { texte: p.description, poids: 15 },
    ];
  }

  // Score d'un produit pour une requête : chaque mot doit se trouver quelque
  // part (sinon le produit ne sort pas), et on retient le champ le mieux
  // placé. Un mot absent partout = 0 = produit écarté.
  function score(p, mots) {
    let total = 0;
    const champs = champsCherchables(p).map((c) => ({ t: aplati(c.texte), poids: c.poids }));
    for (const mot of mots) {
      let meilleur = 0;
      for (const c of champs) {
        if (c.t.indexOf(mot) === -1) continue;
        // Un mot qui commence un champ vaut mieux qu'un mot au milieu.
        const bonus = c.t.indexOf(mot) === 0 ? 10 : 0;
        if (c.poids + bonus > meilleur) meilleur = c.poids + bonus;
      }
      if (!meilleur) return 0;
      total += meilleur;
    }
    return total;
  }

  function getFiltered() {
    const mots = aplati(searchTerm).trim().split(/\s+/).filter(Boolean);
    const parCategorie = PRODUCTS.filter(
      (p) => activeCategory === "Tous" || p.category === activeCategory
    );
    if (!mots.length) return parCategorie;

    // On classe par pertinence, mais seulement quand il y a une recherche :
    // sans requête, l'ordre du catalogue reste celui que vous avez choisi.
    return parCategorie
      .map((p) => ({ p: p, s: score(p, mots) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);
  }

  function formatPrice(price) {
    if (price === null || price === undefined) return T.askPrice;
    return price.toFixed(2).replace(".", ",") + " €";
  }

  // Zone prix d'un produit : montant si déverrouillé, sinon invitation
  function priceZone(p, cls) {
    if (unlocked()) {
      const v = priceOf(p);
      return `<span class="product-price ${cls || ""}">${formatPrice(v)}<span class="vat-note">${T.unitNote}</span></span>`;
    }
    // Les prix arrivent une seconde après le catalogue. Pendant ce court
    // instant on laisse un gabarit muet : afficher « Prix sur demande »
    // pour le démentir aussitôt donnait l'impression d'un site qui se
    // ravise, et contredisait ce qu'on vient de décider — les prix sont
    // visibles de tous.
    return `<span class="product-price price-attente ${cls || ""}" aria-hidden="true"></span>`;
  }

  // Squelette affiché pendant le chargement des produits : le visiteur voit
  // immédiatement que le catalogue arrive, au lieu d'une page vide.
  function showSkeleton() {
    const grid = document.getElementById("grid");
    if (!grid) return;
    let html = "";
    for (let i = 0; i < 8; i++) {
      html += '<div class="skeleton-card"><div class="sk-img"></div>' +
              '<div class="sk-line sk-short"></div><div class="sk-line"></div>' +
              '<div class="sk-line sk-mid"></div></div>';
    }
    grid.innerHTML = html;
  }

  // Le bloc « Qui vous livre » attend le catalogue : son compteur en vient,
  // et un bloc qui s'affiche avec un nombre vide fait mauvais effet.
  function montrerQui() {
    const bloc = document.getElementById("qui");
    if (!bloc) return;
    const refs = document.getElementById("qui-refs");
    const visibles = PRODUCTS.length;
    if (refs && visibles) refs.textContent = T.quiRefs(visibles);
    bloc.hidden = !visibles;
  }

  function renderGrid() {
    const grid = document.getElementById("grid");
    const countEl = document.getElementById("result-count");
    const filtered = getFiltered();

    countEl.textContent = T.results(filtered.length);
    const panne = document.getElementById("prix-indispo");
    if (panne) {
      panne.textContent = PRIX_INDISPO ? T.priceDown : "";
      panne.hidden = !PRIX_INDISPO;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `<p class="no-results">${T.noResults}</p>`;
      return;
    }

    function carte(p) {
      const q = selection[p.ean] || { u: 0, b: 0 };
      const inSel = q.u > 0 || q.b > 0;
      const summary = [q.u ? q.u + " u" : "", q.b ? q.b + " ct" : ""].filter(Boolean).join(" + ");
      return `
          <div class="product-card" data-open="${p.ean}" role="button" tabindex="0">
            <div class="product-image-wrap">
              <img src="${productImageSrc(p)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" width="900" height="900" />
            </div>
            <p class="product-cat">${escapeHtml(pText(p, "tagline") || catLabel(p.category))}</p>
            <p class="product-name">${escapeHtml(p.name)}</p>
            <p class="product-vol">${escapeHtml(p.volume || "")}</p>
            <div class="product-footer">
              ${priceZone(p, "")}
              ${
                p.soon
                  ? `<span class="card-soon">${T.soon}</span>`
                  : !unlocked()
                  ? ""
                  : isOut(p)
                  ? `<span class="card-out">${T.outOfStock}</span>`
                  : inSel
                  ? `<button class="sel-chip" data-action="add" data-ean="${p.ean}">${summary}</button>`
                  : `<button class="add-btn" data-action="add" data-ean="${p.ean}">+</button>`
              }
            </div>
          </div>
        `;
    }

    // DÉCOUPAGE PAR FAMILLE. Deux cents références d'affilée forment un mur
    // qu'on parcourt sans jamais savoir où l'on en est. Des intertitres
    // rendent la profondeur du catalogue lisible — et c'est la profondeur
    // qui distingue un importateur d'un revendeur.
    //
    // On ne découpe que quand il y a quelque chose à découper : si une
    // famille est déjà sélectionnée, le titre répéterait le filtre ; et si
    // une recherche est en cours, les résultats sont classés par pertinence,
    // un ordre que des sections casseraient.
    const parFamilles = activeCategory === "Tous" && !searchTerm.trim();

    if (!parFamilles) {
      grid.innerHTML = filtered.map(carte).join("");
    } else {
      const ordre = [];
      const paquets = new Map();
      for (const p of filtered) {
        const c = p.category || "—";
        if (!paquets.has(c)) { paquets.set(c, []); ordre.push(c); }
        paquets.get(c).push(p);
      }
      grid.innerHTML = ordre
        .map((c) => {
          const lot = paquets.get(c);
          return `<h2 class="famille-titre">${escapeHtml(catLabel(c))}`
            + `<span class="famille-compte">${lot.length}</span></h2>`
            + lot.map(carte).join("");
        })
        .join("");
    }

    grid.querySelectorAll("[data-action='access']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAccessModal();
      });
    });
    grid.querySelectorAll("[data-action='add']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openProductSheet(btn.dataset.ean); // quantités et validation sur la fiche
      });
    });
    grid.querySelectorAll("[data-open]").forEach((card) => {
      card.addEventListener("click", () => openProductSheet(card.dataset.open));
    });

    observeCards();
  }

  // ---------- Animation d'apparition au scroll ----------

  let observer = null;

  function observeCards() {
    // Sur écran tactile : les cartes s'affichent directement. Observer 178
    // éléments et animer leur entrée coûte cher pour un effet peu visible.
    if (window.matchMedia("(pointer: coarse)").matches) {
      document.querySelectorAll(".product-card:not(.in-view)")
        .forEach((c) => c.classList.add("in-view"));
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in-view");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
      );
    }
    document.querySelectorAll(".product-card:not(.in-view)").forEach((card, i) => {
      card.style.transitionDelay = `${Math.min(i % 12, 8) * 35}ms`;
      observer.observe(card);
    });
  }

  // Fixe une quantité absolue (saisie directe), par opposition à changeQty
  function setQty(ean, valeur, kind) {
    const e = entry(ean);
    e[kind] = Math.max(0, valeur | 0);
    if (!e.u && !e.b) delete selection[ean];
    saveSelection();
    renderFloatBar();
    renderGrid();
  }

  // kind : "u" (unités) ou "b" (cartons)
  function changeQty(ean, delta, kind) {
    const e = entry(ean);
    e[kind] = Math.max(0, (e[kind] || 0) + delta);
    if (e.u === 0 && e.b === 0) delete selection[ean];
    saveSelection();
    renderGrid();
    renderFloatBar();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Barre flottante ----------

  function renderFloatBar() {
    const bar = document.getElementById("float-bar");
    const u = unitCount();
    const b = boxCount();
    document.body.classList.toggle("has-float", u + b > 0);
    if (u + b === 0) {
      bar.hidden = true;
      majOffreBarre();
      return;
    }
    const parts = [];
    if (u) parts.push(T.articles(u));
    if (b) parts.push(T.box(b));
    bar.hidden = false;
    bar.innerHTML = `<span class="fb-count">${u + b}</span> ${parts.join(" + ")} — ${T.seeSelection}`;
    majOffreBarre();
  }

  // Nombre de Packs MCB au panier : c'est lui qui déclenche le cadeau.
  function packsOffre() {
    if (typeof window.offrePackEan !== "function") return 0;
    const ean = String(window.offrePackEan() || "");
    if (!ean) return 0;
    const q = selection[ean];
    if (!q) return 0;
    const p = PRODUCTS.find((x) => x.ean === ean);
    return (q.u || 0) + (q.b || 0) * ((p && p.box_qty) || 1);
  }

  // Bandeau de confirmation de l'offre, au-dessus de la barre flottante.
  function majOffreBarre() {
    if (typeof window.offreBarre === "function") window.offreBarre(packsOffre());
  }

  // ---------- Tiroir de sélection ----------

  // ---------- Fiche produit détaillée ----------

  function openProductSheet(ean) {
    const p = PRODUCTS.find((x) => x.ean === ean);
    if (!p) return;

    const sheet = document.getElementById("product-sheet");

    sheet.querySelector(".sheet-body").innerHTML = `
      <div class="sheet-image">
        <img src="${productImageSrc(p)}" alt="${escapeHtml(p.name)}" decoding="async" width="900" height="900" />
      </div>
      <p class="sheet-tagline">${escapeHtml(p.tagline || p.category)}</p>
      <h2 class="sheet-name">${escapeHtml(p.name)}</h2>
      <p class="sheet-meta">${escapeHtml(p.volume || "")}${p.volume ? " · " : ""}EAN ${p.ean}</p>
      <p class="sheet-desc">${escapeHtml(pText(p, "description"))}</p>
      ${p.box_qty ? `<p class="sheet-packaging">${T.packaging(p.box_qty, unlocked() && priceOf(p) ? formatPrice(priceOf(p) * p.box_qty) : "")}</p>` : ""}
      <div class="sheet-buy">
        ${priceZone(p, "sheet-price")}
        <div class="sheet-qty-rows" id="sheet-qty-zone"></div>
      </div>
    `;

    renderSheetQty(ean);
    document.getElementById("sheet-overlay").hidden = false;
    syncScrollLock();
  }

  function renderSheetQty(ean) {
    const zone = document.getElementById("sheet-qty-zone");
    if (!zone) return;

    // Produit annoncé mais pas encore en stock : consultable, non commandable.
    const prod = PRODUCTS.find((x) => x.ean === ean);
    if (prod && prod.soon) {
      zone.innerHTML = `<p class="sheet-soon">${T.soon}</p>`;
      return;
    }

    // Les prix ne sont pas encore arrivés : on le dit sobrement plutôt que
    // de proposer un accès dont plus personne n'a besoin.
    if (!unlocked()) {
      zone.innerHTML = `<p class="sheet-locked">${PRIX_INDISPO ? T.priceDown : T.priceLoading}</p>`;
      return;
    }
    const p = PRODUCTS.find((x) => x.ean === ean);

    // Rupture de stock : produit visible mais non commandable.
    if (isOut(p)) {
      zone.innerHTML = `<p class="sheet-out">${T.outOfStock}</p>`;
      return;
    }

    const existing = selection[ean] || { u: 0, b: 0 };
    // Quantités en cours de composition : rien n'entre au panier avant "Ajouter"
    const pending = { u: existing.u || 0, b: existing.b || 0 };
    const wasInCart = pending.u > 0 || pending.b > 0;
    const maxU = maxUnits(p);
    const maxB = maxBoxes(p);
    const box = p.box_qty || 0;
    // Le carton disparaît si le stock est trop faible pour en vendre un.
    const carton = box && maxB > 0;

    // Pièces encore disponibles compte tenu de ce qui est déjà composé
    function resteU() { return maxU - pending.u - pending.b * box; }

    function draw() {
      const atMaxU = resteU() <= 0;
      const atMaxB = !carton || pending.b >= maxB || resteU() < box;

      const row = (kind, label, bloque) => `
        <div class="buy-row">
          <span class="buy-row-label">${label}</span>
          <div class="qty-stepper" data-kind="${kind}">
            <button data-action="dec">−</button>
            <input class="qty-input" type="text" inputmode="numeric" pattern="[0-9]*"
                   value="${pending[kind]}" aria-label="${label}" />
            <button data-action="inc" ${bloque ? "disabled" : ""}>+</button>
          </div>
        </div>`;

      const empty = pending.u === 0 && pending.b === 0;
      const info = (carton || maxU === Infinity)
        ? (maxU === Infinity ? "" : `<p class="sheet-stock">${T.stockLeft(maxU)}</p>`)
        : `<p class="sheet-stock sheet-stock-low">${T.lowStock(maxU)}</p>`;

      zone.innerHTML =
        info +
        row("u", T.perUnit, atMaxU) +
        (carton ? row("b", T.boxOf(box), atMaxB) : "") +
        `<button class="sheet-confirm" id="sheet-confirm" ${empty && !wasInCart ? "disabled" : ""}>
           ${wasInCart ? T.updateCart : T.addCart}
         </button>`;

      zone.querySelectorAll(".qty-stepper").forEach((st) => {
        const kind = st.dataset.kind;
        st.querySelector("[data-action='inc']").addEventListener("click", () => {
          // Plafond : on ne peut jamais engager plus que le stock autorisé
          if (kind === "u" && resteU() < 1) return;
          if (kind === "b" && (pending.b >= maxB || resteU() < box)) return;
          pending[kind] += 1; draw();
        });
        st.querySelector("[data-action='dec']").addEventListener("click", () => {
          pending[kind] = Math.max(0, pending[kind] - 1); draw();
        });

        // Saisie directe de la quantité : plus pratique que 20 clics sur "+"
        const champ = st.querySelector(".qty-input");
        if (champ) {
          champ.addEventListener("focus", () => champ.select());
          champ.addEventListener("input", () => {
            champ.value = champ.value.replace(/[^0-9]/g, "");
          });
          const valider = () => {
            let n = parseInt(champ.value, 10);
            if (isNaN(n) || n < 0) n = 0;
            // On ne peut jamais dépasser le stock autorisé
            const autre = kind === "u" ? pending.b * box : pending.u;
            if (kind === "u") {
              n = Math.min(n, Math.max(0, maxU - pending.b * box));
            } else {
              const parBoite = box || 1;
              n = Math.min(n, maxB, Math.floor(Math.max(0, maxU - pending.u) / parBoite));
            }
            pending[kind] = n;
            draw();
          };
          champ.addEventListener("blur", valider);
          champ.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); champ.blur(); }
          });
        }
      });

      const confirm = document.getElementById("sheet-confirm");
      if (confirm) {
        confirm.addEventListener("click", () => {
          if (pending.u === 0 && pending.b === 0) {
            delete selection[ean];
          } else {
            selection[ean] = { u: pending.u, b: pending.b };
          }
          const removed = pending.u === 0 && pending.b === 0;
          saveSelection();
          renderGrid();
          renderFloatBar();
          closeProductSheet(); // retour direct au catalogue
          if (!removed) showToast(wasInCart ? T.toastUpdated : T.toastAdded);
        });
      }
    }

    draw();

    document.querySelectorAll("#product-sheet [data-action='access']").forEach((btn) => {
      btn.addEventListener("click", () => { closeProductSheet(); openAccessModal(); });
    });
  }

  function closeProductSheet() {
    document.getElementById("sheet-overlay").hidden = true;
    syncScrollLock();
  }

  // ---------- Tiroir de sélection ----------

  // Vide le panier d'un coup. Confirmation demandée : c'est irréversible
  // et un panier de plusieurs dizaines de lignes est long à recomposer.
  function clearCart() {
    if (Object.keys(selection).length === 0) return;
    if (!window.confirm(T.clearConfirm || "Vider tout le panier ?")) return;
    Object.keys(selection).forEach((ean) => { delete selection[ean]; });
    saveSelection();
    renderDrawer();
    renderGrid();
    renderFloatBar();
    showToast(T.toastCleared || "Panier vidé");
  }

  function openDrawer() {
    renderDrawer();
    document.getElementById("drawer-overlay").hidden = false;
    syncScrollLock();
  }

  function closeDrawer() {
    document.getElementById("drawer-overlay").hidden = true;
    syncScrollLock();
  }

  // Toast de confirmation : bref, non bloquant, un seul à la fois
  let toastTimer = null;
  function showToast(text) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.innerHTML = `<span class="toast-check">&#10003;</span>${text}`;
    el.classList.remove("show");
    void el.offsetWidth; // relance l'animation
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
  }

  function renderDrawer() {
    const list = document.getElementById("drawer-list");
    const pickTitle = document.querySelector(".agent-pick-title");
    const pickList = document.getElementById("agent-pick-list");
    const eans = Object.keys(selection);

    const btnClear = document.getElementById("drawer-clear");

    if (eans.length === 0) {
      list.innerHTML = `<p class="drawer-empty">${T.emptySelection || "Votre sélection est vide."}</p>`;
      pickTitle.hidden = true;
      pickList.hidden = true;
      if (btnClear) btnClear.hidden = true;   // rien à vider
      return;
    }

    pickTitle.hidden = false;
    pickList.hidden = false;
    if (btnClear) btnClear.hidden = false;

    list.innerHTML = eans
      .map((ean) => {
        const p = PRODUCTS.find((x) => x.ean === ean);
        if (!p) return "";
        const q = selection[ean];
        const rows = [];
        if (q.u > 0) rows.push({ kind: "u", qty: q.u, kindLabel: T.perUnit });
        if (q.b > 0) rows.push({ kind: "b", qty: q.b, kindLabel: T.boxOf(p.box_qty) });
        const unit = unlocked() ? priceOf(p) : null;
        return rows
          .map((r) => {
            // Prix de la ligne : unités = prix × qté ; cartons = prix × box_qty × qté
            let lineTotal = null;
            if (unit !== null) {
              lineTotal = r.kind === "b" ? unit * (p.box_qty || 0) * r.qty : unit * r.qty;
            }
            return `
          <div class="drawer-item">
            <img src="${productImageSrc(p)}" alt="" loading="lazy" decoding="async" width="900" height="900" />
            <span class="drawer-item-name">${escapeHtml(p.name)}<span class="drawer-item-kind">${r.kindLabel}</span></span>
            ${lineTotal !== null ? `<span class="drawer-item-price" style="font-weight:700;font-size:13px;white-space:nowrap;margin-left:auto;padding:0 10px;">${formatPrice(lineTotal)}</span>` : ""}
            <div class="qty-stepper drawer-stepper" data-ean="${ean}" data-kind="${r.kind}">
              <button data-action="dec">−</button>
              <input class="qty-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${r.qty}" />
              <button data-action="inc">+</button>
            </div>
          </div>`;
          })
          .join("");
      })
      .join("");

    // Total HT (uniquement quand les prix sont déverrouillés)
    if (unlocked()) {
      let total = 0;
      let known = true;
      Object.keys(selection).forEach((ean) => {
        const p = PRODUCTS.find((x) => x.ean === ean);
        const price = p ? priceOf(p) : null;
        if (price === null) { known = false; return; }
        const q = selection[ean];
        total += (q.u || 0) * price + (q.b || 0) * (p.box_qty || 0) * price;
      });
      if (known && total > 0) {
        list.innerHTML += `<div class="drawer-total"><span>${T.totalHT}</span><strong>${formatPrice(total)}</strong></div>`;

        // Rien ne bloque : on dit seulement où en est le client par rapport
        // au port offert. Tant qu'on ne connaît pas son pays, on énonce les
        // deux règles plutôt que d'en supposer une.
        const regle = PORT[PAYS_CLIENT] || null;
        if (!regle) {
          list.innerHTML +=
            `<div class="ship-note"><span class="ship-note-sub">${T.portRegles}</span></div>`;
        } else if (total < regle.seuil) {
          list.innerHTML +=
            `<div class="ship-note">` +
              `<span class="ship-note-main">${T.portManque(formatPrice(regle.seuil - total), formatPrice(regle.seuil))}</span>` +
              `<span class="ship-note-sub">${T.portRetrait}</span>` +
            `</div>`;
        } else {
          list.innerHTML += `<div class="ship-note ship-ok">${T.portOffert}</div>`;
        }
      }
    }

    list.querySelectorAll(".drawer-stepper").forEach((st) => {
      const ean = st.dataset.ean;
      const kind = st.dataset.kind;
      // Saisie directe dans le panier
      const champ = st.querySelector(".qty-input");
      if (champ) {
        champ.addEventListener("focus", () => champ.select());
        champ.addEventListener("input", () => {
          champ.value = champ.value.replace(/[^0-9]/g, "");
        });
        const valider = () => {
          const p = PRODUCTS.find((x) => x.ean === ean);
          const box = (p && p.box_qty) || 0;
          let n = parseInt(champ.value, 10);
          if (isNaN(n) || n < 0) n = 0;
          const q = selection[ean] || { u: 0, b: 0 };
          if (kind === "u") {
            n = Math.min(n, Math.max(0, maxUnits(p) - (q.b || 0) * box));
          } else {
            const parBoite = box || 1;
            n = Math.min(n, maxBoxes(p),
                         Math.floor(Math.max(0, maxUnits(p) - (q.u || 0)) / parBoite));
          }
          setQty(ean, n, kind);
          renderDrawer();
        };
        champ.addEventListener("blur", valider);
        champ.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); champ.blur(); }
        });
      }

      st.querySelector("[data-action='inc']").addEventListener("click", () => {
        const p = PRODUCTS.find((x) => x.ean === ean);
        const box = (p && p.box_qty) || 0;
        const reste = maxUnits(p) - piecesInCart(p);
        // Même plafond que sur la fiche : jamais plus que le stock autorisé
        if (kind === "u" && reste < 1) return;
        if (kind === "b" && (reste < box || (selection[ean].b || 0) >= maxBoxes(p))) return;
        changeQty(ean, 1, kind);
        renderDrawer();
      });
      st.querySelector("[data-action='dec']").addEventListener("click", () => {
        changeQty(ean, -1, kind); // à zéro, la ligne disparaît d'elle-même
        renderDrawer();
      });
    });

    renderAgentPicker();
  }

  // ---------- Envoi WhatsApp ----------

  function buildSelectionMessage() {
    const showPrices = unlocked();
    let grand = 0;
    let allKnown = showPrices;
    const lines = Object.keys(selection).map((ean) => {
      const p = PRODUCTS.find((x) => x.ean === ean);
      if (!p) return null;
      const q = selection[ean];
      const parts = [];
      if (q.u > 0) parts.push(T.unit(q.u));
      if (q.b > 0) parts.push(T.boxDetail(q.b, p.box_qty, q.b * p.box_qty));
      let line = `• ${p.name} — ${parts.join(" + ")}`;
      if (showPrices) {
        const unit = priceOf(p);
        if (unit === null) {
          allKnown = false;
        } else {
          const lineTotal = (q.u || 0) * unit + (q.b || 0) * (p.box_qty || 0) * unit;
          grand += lineTotal;
          line += ` = ${formatPrice(lineTotal)}`;
        }
      }
      return line;
    }).filter(Boolean);
    let msg = `${T.waMsg}\n\n${lines.join("\n")}`;
    if (showPrices && allKnown && grand > 0) {
      msg += `\n\n${T.totalHT} : ${formatPrice(grand)}`;
    }
    return msg;
  }

  // ==========================================================================
  // REGISTRE DES COMMANDES — envoi discret vers Google Sheets (Apps Script).
  // Une ligne par commande. N'interrompt jamais le parcours WhatsApp :
  // en cas d'échec réseau, la commande part quand même sur WhatsApp.
  /* Le mouchard qui recopiait les paniers dans la feuille Google a été
     retiré : il n'était appelé nulle part, et il mettait l'adresse du
     script dans le navigateur de chaque visiteur. Le suivi des demandes
     se fait par /api/devis, côté serveur. */

  function renderAgentPicker() {
    const wrap = document.getElementById("agent-pick-list");
    wrap.innerHTML = "";

    // Deux portes, et une hiérarchie claire plutôt que deux boutons de même
    // poids : celui qui sait ce qu'il veut commande, celui qui découvre
    // demande un prix. L'ordre s'inverse selon qu'une session est ouverte,
    // pour que l'action la plus probable soit toujours la première.
    const relie = connecte();

    const commander = document.createElement("a");
    commander.className = "label-row" + (relie ? " primary" : "");
    commander.href = "/commander/";
    commander.innerHTML = `
      <span class="swatch swatch-order"></span>
      <span class="row-text">${T.orderNow}<small class="row-sub">${T.orderSub}</small></span>
      <span class="chevron">&#8250;</span>
    `;

    const devis = document.createElement("a");
    devis.className = "label-row" + (relie ? "" : " primary");
    devis.href = "/devis/";
    devis.innerHTML = `
      <span class="swatch swatch-quote"></span>
      <span class="row-text">${T.askQuote}<small class="row-sub">${T.quoteSub}</small></span>
      <span class="chevron">&#8250;</span>
    `;

    if (relie) { wrap.appendChild(commander); wrap.appendChild(devis); }
    else       { wrap.appendChild(devis); wrap.appendChild(commander); }
  }

  // ---------- Initialisation ----------

  async function init() {
    if (!window.location.hash) window.scrollTo(0, 0);

    showSkeleton();
    loadSelection();
    applyStaticI18n();

    // Les produits s'affichent dès qu'ils sont là. La validation du code
    // d'accès (aller-retour réseau vers Google, 1 à 3 s) se fait EN PARALLÈLE
    // et rafraîchit simplement les prix quand elle aboutit : plus d'attente
    // avant de voir le catalogue.
    await loadProducts();
    montrerQui();
    renderCatButton();
    renderGrid();
    renderFloatBar();

    initPriceLock().then(() => {
      if (unlocked()) {
        const ajuste = clampSelection();
        renderGrid();
        renderFloatBar();
        renderProAccessBtn();
        if (ajuste) showToast(T.cartLimited);
      }
      // Après coup seulement : avant la réponse, on ignore si la personne
      // est déjà cliente, et on l'accueillerait pour rien.
      initBienvenue();
    });
    initLangControls();
    initAccessControls();

    document.getElementById("search-input").addEventListener("input", (e) => {
      searchTerm = e.target.value;
      renderGrid();
    });

    document.getElementById("cat-btn").addEventListener("click", openCatPanel);
    document.getElementById("cat-close").addEventListener("click", closeCatPanel);
    document.getElementById("cat-overlay").addEventListener("click", (e) => {
      if (e.target.id === "cat-overlay") closeCatPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeCatPanel(); closeProductSheet(); closeDrawer(); closeAccessModal(); }
    });

    initTopControls();

    // Service worker conservé : il accélère les visites répétées et garde le
    // catalogue consultable sans réseau. Aucun bandeau d'installation n'est
    // proposé — l'ajout à l'écran d'accueil reste possible manuellement.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Filet : si la page revient d'un arrière-plan avec un état incohérent,
    // on rétablit un défilement correct.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncScrollLock();
    });
    window.addEventListener("pageshow", syncScrollLock);
    renderFooter();

    document.getElementById("float-bar").addEventListener("click", openDrawer);
    const bClear = document.getElementById("drawer-clear");
    if (bClear) bClear.addEventListener("click", clearCart);
    document.getElementById("drawer-close").addEventListener("click", closeDrawer);
    document.getElementById("drawer-overlay").addEventListener("click", (e) => {
      if (e.target.id === "drawer-overlay") closeDrawer();
    });

    document.getElementById("sheet-close").addEventListener("click", closeProductSheet);
    document.getElementById("sheet-overlay").addEventListener("click", (e) => {
      if (e.target.id === "sheet-overlay") closeProductSheet();
    });

    const stickyBar = document.getElementById("search-sticky");
    if (stickyBar) {
      /* Deux états, et non un seul. « scrolled » pose le filet du bas dès
         qu'on quitte le haut de la page. « sur-film » dit que la barre est
         encore posée sur le film et doit donc rester transparente : elle ne
         reprend son fond plein qu'au moment où elle le quitte, sinon elle
         s'opacifierait au premier pixel de défilement, en plein milieu de
         l'image. Le seuil se lit sur la hauteur réelle du film — elle varie
         avec la taille de l'écran. */
      /* La hauteur du film suit celle des commandes qu'il porte : la barre
         de recherche et le ruban s'empilent sur petit écran et occupent le
         double. Une hauteur écrite en dur convenait à un seul format. */
      const film = document.querySelector(".bandeau");
      const ruban = document.getElementById("ban-port");
      const feuille = document.querySelector(".tete-filmee");
      const caler = () => {
        if (!film || !ruban || !feuille) return;
        const bas = ruban.offsetTop + ruban.offsetHeight;
        feuille.style.setProperty("--tete", (bas + 76) + "px");
      };
      caler();
      window.addEventListener("resize", caler, { passive: true });
      /* Le ruban est rempli après coup par la traduction : sa hauteur change
         une fois le texte posé. On recale quand il bouge. */
      if (window.ResizeObserver) new ResizeObserver(caler).observe(ruban);
      const seuil = () => (film ? Math.max(0, film.offsetHeight - stickyBar.offsetHeight - 8) : 0);
      const etat = () => {
        stickyBar.classList.toggle("scrolled", window.scrollY > 8);
        stickyBar.classList.toggle("sur-film", !!film && window.scrollY < seuil());
      };
      etat();
      window.addEventListener("scroll", etat, { passive: true });
      window.addEventListener("resize", etat, { passive: true });
    }
  }


  // ==========================================================================
  // PRIX PROTÉGÉS — servis par /api/prix, qui ne répond qu'à une session
  // ouverte. Aucun prix n'existe dans les fichiers du site : sans compte
  // professionnel connecté, il n'y a rien à télécharger ni à déchiffrer.
  // ==========================================================================

  let PRICES = null;        // { ean: prix }
  let ACCESS_LABEL = null;  // société du compte connecté, s'il y en a un
  let LIMITS = null;        // { ean: {u, b, state} } limites de commande
  let CONNECTE = false;     // une session professionnelle est-elle ouverte ?
  let PAYS_CLIENT = null;   // pays du compte, qui décide du seuil de port
  // Sans ce drapeau, une panne du portier et un chargement en cours
  // s'affichaient du même mot : « Chargement des tarifs… », indéfiniment.
  // C'est ce qui a rendu la panne du 26 octobre illisible depuis la page.
  let PRIX_INDISPO = false;

  // Le navigateur ne connaît aucun code : il demande les prix à son propre
  // serveur. Depuis l'étape 201 ils sont servis à tout le monde ; la réponse
  // dit en plus si une session est ouverte, ce qui décide du bouton affiché
  // dans la barre — « Accès professionnel » ou « Mon compte ».
  async function chargerPrix() {
    try {
      const r = await fetch("/api/prix", {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      const d = await r.json();
      if (!d || !d.ok || !d.prices) return false;
      PRICES = d.prices;
      LIMITS = d.limits || null;
      ACCESS_LABEL = d.societe || null;
      CONNECTE = !!d.connecte;
      PAYS_CLIENT = d.pays || null;
      return true;
    } catch (e) {
      return false;
    }
  }

  function priceOf(p) {
    return PRICES ? (PRICES[p.ean] !== undefined ? PRICES[p.ean] : null) : null;
  }

  // Un panier composé avant réception des limites (ou après une vente
  // entre-temps) peut dépasser le stock : on le ramène dans les clous.
  function clampSelection() {
    if (!LIMITS) return false;
    let modifie = false;
    Object.keys(selection).forEach((ean) => {
      const p = PRODUCTS.find((x) => x.ean === ean);
      if (!p) return;
      const l = LIMITS[ean];
      if (!l) return;
      const q = selection[ean];
      const box = p.box_qty || 0;
      if (l.state === "out") { delete selection[ean]; modifie = true; return; }
      if (q.b > l.b) { q.b = Math.max(0, l.b); modifie = true; }
      const restant = l.u - q.b * box;
      if (q.u > restant) { q.u = Math.max(0, restant); modifie = true; }
      if (!q.u && !q.b) { delete selection[ean]; modifie = true; }
    });
    if (modifie) saveSelection();
    return modifie;
  }

  function unlocked() { return PRICES !== null; }

  // À ne pas confondre avec unlocked() : les prix sont visibles de tous,
  // mais commander demande un compte.
  function connecte() { return CONNECTE; }

  async function initPriceLock() {
    PRIX_INDISPO = !(await chargerPrix());
    if (PRIX_INDISPO) renderGrid();
  }

  // ---------- Fenêtre d'accès : saisie du code OU inscription ----------

  // ==========================================================================
  // VERROU DE DÉFILEMENT — centralisé.
  // Chaque panneau appelait son propre déverrouillage ; si l'un se refermait
  // sans le faire, la page restait figée. On recalcule désormais l'état réel :
  // le défilement n'est bloqué que s'il reste effectivement un panneau ouvert.
  // ==========================================================================

  const OVERLAYS = ["cat-overlay", "sheet-overlay", "drawer-overlay", "access-overlay", "lang-overlay"];

  function syncScrollLock() {
    const open = OVERLAYS.some((id) => {
      const el = document.getElementById(id);
      return el && !el.hidden;
    });
    document.body.style.overflow = open ? "hidden" : "";
  }

  function showAccessStep(step) {
    ["access-step-code", "access-step-signup", "access-step-sent"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = (id !== step);
    });
  }

  function openAccessModal(propos) {
    const ov = document.getElementById("access-overlay");
    if (!ov) return;

    // Même fenêtre, deux propos : à l'arrivée on explique à qui s'adresse
    // ce catalogue ; depuis le bouton, on explique pourquoi un compte est
    // nécessaire pour commander.
    const arrivee = propos === "arrivee";
    const titre = document.getElementById("access-title");
    const desc = document.getElementById("access-desc");
    if (titre) titre.textContent = arrivee ? T.welcomeTitle : T.proAccess;
    if (desc) desc.textContent = arrivee ? T.welcomeText : T.accountNeeded;

    const passer = document.getElementById("access-continue");
    if (passer) {
      passer.hidden = !arrivee;
      passer.textContent = T.welcomeSkip;
    }

    showAccessStep("access-step-code");
    ov.hidden = false;
    syncScrollLock();
  }

  // ── accueil du visiteur ────────────────────────────────────────────
  const CLE_BIENVENUE = "nishman-bienvenue";

  // Montrée une fois, à un visiteur non connecté, et jamais par-dessus la
  // cinématique du logo : on attend qu'il arrive au catalogue, ou qu'il
  // reste assez longtemps pour qu'on puisse supposer qu'il lit.
  function initBienvenue() {
    if (connecte()) return;
    try { if (localStorage.getItem(CLE_BIENVENUE)) return; } catch (x) {}

    let fait = false;
    const montrer = () => {
      if (fait || connecte()) return;
      fait = true;
      try { localStorage.setItem(CLE_BIENVENUE, "1"); } catch (x) {}
      window.removeEventListener("scroll", surScroll);
      openAccessModal("arrivee");
    };
    const surScroll = () => {
      if (window.scrollY > window.innerHeight * 0.55) montrer();
    };
    window.addEventListener("scroll", surScroll, { passive: true });
    setTimeout(montrer, 6000);
  }

  function closeAccessModal() {
    const ov = document.getElementById("access-overlay");
    if (ov) ov.hidden = true;
    syncScrollLock();
  }

  function renderProAccessBtn() {
    const btn = document.getElementById("pro-access");

    // Les deux boutons de la barre s'excluent : on propose de se connecter,
    // ou on mène au compte. Jamais les deux, jamais aucun.
    const compte = document.querySelector(".mon-compte");
    if (compte) compte.style.display = connecte() ? "" : "none";

    if (!btn) return;
    btn.style.display = connecte() ? "none" : "";
    if (connecte()) return;

    // Sur petit écran, le libellé complet déborde de la pilule
    const court = window.matchMedia("(max-width: 620px)").matches;
    const lab = document.getElementById("pro-access-label") || btn;
    lab.textContent = court ? T.proAccessShort : T.proAccess;
    btn.classList.remove("unlocked");
  }

  function initAccessControls() {
    const btn = document.getElementById("pro-access");
    if (btn) btn.addEventListener("click", openAccessModal);
    const close = document.getElementById("access-close");
    if (close) close.addEventListener("click", closeAccessModal);
    const passer = document.getElementById("access-continue");
    if (passer) passer.addEventListener("click", closeAccessModal);
    const ov = document.getElementById("access-overlay");
    if (ov) {
      // Sur iOS, l'appui long pour coller déclenche un « clic » sur le fond
      // et refermait la fenêtre. On ne ferme que sur un vrai appui bref,
      // commencé ET terminé sur le fond, sans sélection de texte en cours.
      let downOnBackdrop = false;
      let downAt = 0;
      ov.addEventListener("pointerdown", (e) => {
        downOnBackdrop = e.target.id === "access-overlay";
        downAt = Date.now();
      });
      ov.addEventListener("pointerup", (e) => {
        const bref = Date.now() - downAt < 400;
        const selection = window.getSelection && String(window.getSelection());
        if (downOnBackdrop && e.target.id === "access-overlay" && bref && !selection) {
          closeAccessModal();
        }
        downOnBackdrop = false;
      });
    }

    renderProAccessBtn();
  }

  // Monogramme sticky + bouton retour haut.
  // Sélecteur de langue : bouton compact + mini panneau
  function initLangControls() {
    const btn = document.getElementById("lang-btn");
    const panel = document.getElementById("lang-overlay");
    if (!btn || !panel) return;
    const lab = document.getElementById("lang-btn-label") || btn;
    lab.textContent = LANG.toUpperCase();
    btn.addEventListener("click", () => { panel.hidden = false; });
    panel.addEventListener("click", (e) => {
      if (e.target.id === "lang-overlay") panel.hidden = true;
      const choice = e.target.closest("[data-lang]");
      if (choice) setLang(choice.dataset.lang);
    });
    panel.querySelectorAll("[data-lang]").forEach((el) => {
      el.classList.toggle("active", el.dataset.lang === LANG);
    });
  }

  // Textes statiques du HTML dans la langue courante
  function applyStaticI18n() {
    const search = document.getElementById("search-input");
    if (search) search.placeholder = T.search;
    const catTitle = document.querySelector("#cat-overlay .drawer-title");
    if (catTitle) catTitle.textContent = T.categories;
    const drawerTitle = document.querySelector("#drawer-overlay .drawer-title");
    if (drawerTitle) drawerTitle.textContent = T.mySelection;
    const pick = document.querySelector(".agent-pick-title");
    if (pick) pick.textContent = T.sendTo;
    const cue = document.querySelector(".cue-text");
    if (cue) cue.textContent = T.discover;
    const accTitle = document.getElementById("access-title");
    if (accTitle) accTitle.textContent = T.proAccess;
    const accDesc = document.getElementById("access-desc");
    if (accDesc) accDesc.textContent = T.accountNeeded;
    const accLogin = document.getElementById("access-login");
    if (accLogin) accLogin.textContent = T.accountLogin;
    const accCreate = document.getElementById("access-create");
    if (accCreate) accCreate.textContent = T.accountCreate;
    const map2 = {
      "t-clear": T.clearCart,
      "ban-importateur": T.banImportateur, "ban-ht": T.banHT,
      "qui-titre": T.quiTitre,
      "qui-officiel": T.quiOfficiel, "qui-officiel-texte": T.quiOfficielTexte,
      "qui-depot": T.quiDepot, "qui-depot-texte": T.quiDepotTexte,
      "qui-commerciaux": T.quiCommerciaux, "qui-commerciaux-texte": T.quiCommerciauxTexte,
      "ban-be": T.banBE, "ban-fr": T.banFR, "ban-retrait": T.banRetrait,
    };
    Object.keys(map2).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = map2[id];
    });
    document.documentElement.lang = LANG;
  }

  // Pied de page : contact permanent, drapeaux pays, textes traduits.
  function renderFooter() {
    const zone = document.getElementById("footer-contact");
    if (zone) {
      const wa = (typeof AGENTS !== "undefined" && AGENTS.dilhan) ? AGENTS.dilhan.whatsapp : "";
      const parts = [];
      if (wa) {
        parts.push(`<a class="foot-btn foot-wa" target="_blank" rel="noopener"
          href="https://wa.me/${wa}?text=${encodeURIComponent(T.contactMsg)}">${T.contactWa}</a>`);
      }
      parts.push(`<a class="foot-btn foot-mail" href="mailto:contact@nishman.be">${T.contactMail}</a>`);
      if (wa) {
        parts.push(`<a class="foot-btn foot-tel" href="tel:+${wa}">+32 489 97 00 87</a>`);
      }
      zone.innerHTML = parts.join("");

      const social = document.getElementById("footer-social");
      if (social) {
        const ig = (typeof SHARED !== "undefined" && SHARED.instagram) ? SHARED.instagram : "";
        // Facebook : lu dans config.js s'il y est, sinon l'adresse de la page.
        const fb = (typeof SHARED !== "undefined" && SHARED.facebook)
          ? SHARED.facebook
          : "https://www.facebook.com/profile.php?id=61592867044572";
        // Les glyphes d'Instagram et de Facebook sont des marques déposées :
        // ils ne sont pas redessinés ici. Le libellé fait le même travail,
        // et les fichiers officiels de Meta pourront prendre sa place.
        const liens = [];
        if (ig) {
          liens.push(`<a class="foot-btn foot-ig" target="_blank" rel="noopener" href="${ig}">Instagram</a>`);
        }
        if (fb) {
          liens.push(`<a class="foot-btn foot-fb" target="_blank" rel="noopener" href="${fb}">Facebook</a>`);
        }
        social.innerHTML = liens.join("");
      }
    }

    const flags = document.getElementById("foot-flags");
    if (flags) {
      flags.innerHTML = ["Belgique", "France", "Luxembourg"]
        .map((c) => `<span class="foot-flag">${c}</span>`).join("");
    }

    const legal = document.getElementById("t-foot-legal");
    if (legal && legal.parentElement) {
      // Le lien CGV rejoint la mention légale du bas de page
      legal.innerHTML = `${T.footLegal} · <a class="foot-cgv" href="/cgv/">${T.cgvLink}</a>`;
    }

    const map = {
      "t-foot-tag": T.footTag,
      "t-foot-contact": T.footContact,
      "t-foot-company": T.footCompany,
      "t-foot-social": T.footSocial,
      "t-foot-rights": T.footRights,
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  }

  function initTopControls() {
    const toTop = document.getElementById("to-top");
    // Le logo ne remonte plus en haut de page : le haut de page est
    // désormais la barre de recherche elle-même, et le clic ne produisait
    // donc plus rien. Il ramène à l'accueil, comme partout ailleurs.
    const goTop = (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (toTop) {
      toTop.addEventListener("click", goTop);
      let ticking = false;
      window.addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          toTop.classList.toggle("visible", window.scrollY > window.innerHeight * 2);
        });
      }, { passive: true });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
