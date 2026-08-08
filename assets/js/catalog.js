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

  const ASSET_V = "75"; // incrémenté à chaque mise à jour pour contourner les caches

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
      enterCode: "Entrez votre code d'accès pour afficher les prix.",
      codePlaceholder: "Code d'accès", unlock: "Afficher les prix",
      wrongCode: "Code incorrect — vérifiez et réessayez.",
      noCode: "Pas encore de code ?",
      checking: "Vérification...",
      signupLink: "Obtenir un accès professionnel",
      signupTitle: "Accès réservé aux professionnels",
      signupIntro: "Indiquez votre numéro d'entreprise et votre e-mail : votre code d'accès vous sera envoyé immédiatement.",
      signupVat: "Numéro d'entreprise / TVA",
      signupEmail: "E-mail professionnel",
      signupSubmit: "Recevoir mon code",
      signupInvalid: "Vérifiez le numéro d'entreprise et l'adresse e-mail.",
      signupFailed: "La vérification a échoué. Réessayez dans un instant.",
      signupSent: (m) => "Votre code d'accès vient d'être envoyé à " + m + ". Pensez à vérifier vos courriers indésirables.",
      signupPending: "Votre demande a bien été reçue. Notre équipe la validera manuellement et vous recevrez votre code par e-mail.",
      haveCode: "J'ai déjà un code",
      sentOk: "Continuer",
      codeMsg: "Bonjour, je souhaite un code d'accès professionnel pour voir les prix sur nishman.be.",
      lockedNote: "Prix réservés aux professionnels",
      addCart: "Ajouter au panier", updateCart: "Mettre à jour le panier",
      toastAdded: "Ajouté au panier", toastUpdated: "Panier mis à jour",
      totalHT: "Total HT", salesTeam: "Service commercial Nishman",
      contactTitle: "Une question ? Écrivez-nous", contactWa: "WhatsApp", contactMail: "E-mail",
      contactMsg: "Bonjour, j'ai une question concernant les produits Nishman.",
      outOfStock: "Momentanément indisponible",
      stockLeft: (n) => "Stock disponible : " + n + " pièces",
      lowStock: (n) => "Stock limité : " + n + " pièces — vente à l'unité uniquement",
      cartLimited: "Quantité ajustée au stock disponible",
      footTag: "Distributeur officiel Nishman pour la Belgique, la France et le Luxembourg. Produits professionnels pour barbers et coiffeurs.",
      footContact: "Contact", footCompany: "Société",
      footSocial: "Retrouvez-nous sur",
      footRights: "Tous droits réservés.",
      cgvLink: "Conditions générales de vente",
      footLegal: "Prix hors TVA réservés aux professionnels.",
      askQuote: "Demander un devis",
      logout: "Masquer les prix",
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
      enterCode: "Enter your access code to display prices.",
      codePlaceholder: "Access code", unlock: "Show prices",
      wrongCode: "Invalid code — please check and try again.",
      noCode: "No code yet?",
      checking: "Checking...",
      signupLink: "Get professional access",
      signupTitle: "Access reserved for professionals",
      signupIntro: "Enter your company number and e-mail: your access code will be sent immediately.",
      signupVat: "Company / VAT number",
      signupEmail: "Business e-mail",
      signupSubmit: "Get my code",
      signupInvalid: "Please check the company number and e-mail address.",
      signupFailed: "Verification failed. Please try again shortly.",
      signupSent: (m) => "Your access code has just been sent to " + m + ". Please also check your spam folder.",
      signupPending: "Your request has been received. Our team will review it and you will get your code by e-mail.",
      haveCode: "I already have a code",
      sentOk: "Continue",
      codeMsg: "Hello, I would like a professional access code to see prices on nishman.be.",
      lockedNote: "Prices reserved for professionals",
      addCart: "Add to cart", updateCart: "Update cart",
      toastAdded: "Added to cart", toastUpdated: "Cart updated",
      totalHT: "Total excl. VAT", salesTeam: "Nishman sales team",
      contactTitle: "A question? Write to us", contactWa: "WhatsApp", contactMail: "E-mail",
      contactMsg: "Hello, I have a question about Nishman products.",
      outOfStock: "Temporarily unavailable",
      stockLeft: (n) => "Available stock: " + n + " pcs",
      lowStock: (n) => "Limited stock: " + n + " pcs — sold by unit only",
      cartLimited: "Quantity adjusted to available stock",
      footTag: "Official Nishman distributor for Belgium, France and Luxembourg. Professional products for barbers and hairdressers.",
      footContact: "Contact", footCompany: "Company",
      footSocial: "Follow us on",
      footRights: "All rights reserved.",
      cgvLink: "Terms and conditions of sale",
      footLegal: "Prices excl. VAT, reserved for professionals.",
      askQuote: "Request a quotation",
      logout: "Hide prices",
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
      enterCode: "Voer uw toegangscode in om de prijzen te tonen.",
      codePlaceholder: "Toegangscode", unlock: "Prijzen tonen",
      wrongCode: "Ongeldige code — controleer en probeer opnieuw.",
      noCode: "Nog geen code?",
      checking: "Controleren...",
      signupLink: "Professionele toegang aanvragen",
      signupTitle: "Toegang voorbehouden aan professionals",
      signupIntro: "Geef uw ondernemingsnummer en e-mailadres op: uw toegangscode wordt onmiddellijk verstuurd.",
      signupVat: "Ondernemings- / btw-nummer",
      signupEmail: "Professioneel e-mailadres",
      signupSubmit: "Mijn code ontvangen",
      signupInvalid: "Controleer het ondernemingsnummer en het e-mailadres.",
      signupFailed: "De controle is mislukt. Probeer het zo dadelijk opnieuw.",
      signupSent: (m) => "Uw toegangscode is zonet verstuurd naar " + m + ". Controleer ook uw ongewenste e-mail.",
      signupPending: "Uw aanvraag is goed ontvangen. Ons team bekijkt ze en u ontvangt uw code per e-mail.",
      haveCode: "Ik heb al een code",
      sentOk: "Doorgaan",
      codeMsg: "Hallo, ik wil graag een professionele toegangscode om de prijzen op nishman.be te zien.",
      lockedNote: "Prijzen voorbehouden aan professionals",
      addCart: "In winkelmand", updateCart: "Winkelmand bijwerken",
      toastAdded: "Toegevoegd aan winkelmand", toastUpdated: "Winkelmand bijgewerkt",
      totalHT: "Totaal excl. btw", salesTeam: "Nishman verkoopdienst",
      contactTitle: "Een vraag? Schrijf ons", contactWa: "WhatsApp", contactMail: "E-mail",
      contactMsg: "Hallo, ik heb een vraag over de Nishman-producten.",
      outOfStock: "Tijdelijk niet beschikbaar",
      stockLeft: (n) => "Beschikbare voorraad: " + n + " stuks",
      lowStock: (n) => "Beperkte voorraad: " + n + " stuks — enkel per stuk",
      cartLimited: "Hoeveelheid aangepast aan de voorraad",
      footTag: "Officiële Nishman-verdeler voor België, Frankrijk en Luxemburg. Professionele producten voor barbiers en kappers.",
      footContact: "Contact", footCompany: "Onderneming",
      footSocial: "Volg ons op",
      footRights: "Alle rechten voorbehouden.",
      cgvLink: "Algemene verkoopvoorwaarden",
      footLegal: "Prijzen excl. btw, voorbehouden aan professionals.",
      askQuote: "Offerte aanvragen",
      logout: "Prijzen verbergen",
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
      enterCode: "Geben Sie Ihren Zugangscode ein, um die Preise anzuzeigen.",
      codePlaceholder: "Zugangscode", unlock: "Preise anzeigen",
      wrongCode: "Ungültiger Code — bitte prüfen und erneut versuchen.",
      noCode: "Noch keinen Code?",
      checking: "Prüfung läuft...",
      signupLink: "Professionellen Zugang erhalten",
      signupTitle: "Zugang nur für Fachkunden",
      signupIntro: "Geben Sie Ihre Unternehmensnummer und E-Mail an: Ihr Zugangscode wird sofort versendet.",
      signupVat: "Unternehmens- / USt-Nummer",
      signupEmail: "Geschäftliche E-Mail",
      signupSubmit: "Code erhalten",
      signupInvalid: "Bitte prüfen Sie Unternehmensnummer und E-Mail-Adresse.",
      signupFailed: "Die Prüfung ist fehlgeschlagen. Bitte versuchen Sie es gleich erneut.",
      signupSent: (m) => "Ihr Zugangscode wurde soeben an " + m + " gesendet. Prüfen Sie auch den Spam-Ordner.",
      signupPending: "Ihre Anfrage ist eingegangen. Unser Team prüft sie und Sie erhalten Ihren Code per E-Mail.",
      haveCode: "Ich habe bereits einen Code",
      sentOk: "Weiter",
      codeMsg: "Hallo, ich hätte gerne einen professionellen Zugangscode, um die Preise auf nishman.be zu sehen.",
      lockedNote: "Preise Fachkunden vorbehalten",
      logout: "Preise ausblenden",
      waMsg: "Hallo, ich bitte um ein Preisangebot für folgende Produkte:",
      boxDetail: (b, n, tot) => b + " Karton" + (b > 1 ? "s" : "") + " mit " + n + " (" + tot + " Stück)",
      addCart: "In den Warenkorb", updateCart: "Warenkorb aktualisieren",
      toastAdded: "Zum Warenkorb hinzugefügt", toastUpdated: "Warenkorb aktualisiert",
      totalHT: "Gesamt zzgl. MwSt.", salesTeam: "Nishman Vertriebsteam",
      contactTitle: "Eine Frage? Schreiben Sie uns", contactWa: "WhatsApp", contactMail: "E-Mail",
      contactMsg: "Guten Tag, ich habe eine Frage zu den Nishman-Produkten.",
      outOfStock: "Vorübergehend nicht verfügbar",
      stockLeft: (n) => "Verfügbarer Bestand: " + n + " Stück",
      lowStock: (n) => "Begrenzter Bestand: " + n + " Stück — nur stückweise",
      cartLimited: "Menge an den Bestand angepasst",
      footTag: "Offizieller Nishman-Distributor für Belgien, Frankreich und Luxemburg. Professionelle Produkte für Barbiere und Friseure.",
      footContact: "Kontakt", footCompany: "Unternehmen",
      footSocial: "Folgen Sie uns",
      footRights: "Alle Rechte vorbehalten.",
      cgvLink: "Allgemeine Verkaufsbedingungen",
      footLegal: "Preise zzgl. MwSt., Fachkunden vorbehalten.",
      askQuote: "Angebot anfordern",
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
      enterCode: "Fiyatları görüntülemek için erişim kodunuzu girin.",
      codePlaceholder: "Erişim kodu", unlock: "Fiyatları göster",
      wrongCode: "Geçersiz kod — kontrol edip tekrar deneyin.",
      noCode: "Kodunuz yok mu?",
      checking: "Kontrol ediliyor...",
      signupLink: "Profesyonel erişim al",
      signupTitle: "Erişim yalnızca profesyonellere açıktır",
      signupIntro: "Vergi numaranızı ve e-posta adresinizi girin: erişim kodunuz anında gönderilecektir.",
      signupVat: "Firma / vergi numarası",
      signupEmail: "Kurumsal e-posta",
      signupSubmit: "Kodumu al",
      signupInvalid: "Vergi numarasını ve e-posta adresini kontrol edin.",
      signupFailed: "Doğrulama başarısız oldu. Lütfen birazdan tekrar deneyin.",
      signupSent: (m) => "Erişim kodunuz " + m + " adresine gönderildi. Lütfen istenmeyen posta klasörünü de kontrol edin.",
      signupPending: "Talebiniz alındı. Ekibimiz inceleyecek ve kodunuz e-posta ile gönderilecektir.",
      haveCode: "Zaten bir kodum var",
      sentOk: "Devam",
      codeMsg: "Merhaba, nishman.be sitesinde fiyatları görebilmek için profesyonel erişim kodu talep ediyorum.",
      lockedNote: "Fiyatlar profesyonellere özeldir",
      logout: "Fiyatları gizle",
      waMsg: "Merhaba, aşağıdaki ürünler için fiyat teklifi rica ediyorum:",
      boxDetail: (b, n, tot) => b + " adet " + n + "'lu koli (" + tot + " adet)",
      addCart: "Sepete ekle", updateCart: "Sepeti güncelle",
      toastAdded: "Sepete eklendi", toastUpdated: "Sepet güncellendi",
      totalHT: "Toplam (KDV hariç)", salesTeam: "Nishman Satış Ekibi",
      contactTitle: "Sorunuz mu var? Bize yazın", contactWa: "WhatsApp", contactMail: "E-posta",
      contactMsg: "Merhaba, Nishman ürünleri hakkında bir sorum var.",
      outOfStock: "Geçici olarak mevcut değil",
      stockLeft: (n) => "Mevcut stok: " + n + " adet",
      lowStock: (n) => "Sınırlı stok: " + n + " adet — yalnızca adet olarak",
      cartLimited: "Miktar mevcut stoğa göre ayarlandı",
      footTag: "Belçika, Fransa ve Lüksemburg için resmi Nishman distribütörü. Barber ve kuaförler için profesyonel ürünler.",
      footContact: "İletişim", footCompany: "Firma",
      footSocial: "Bizi takip edin",
      footRights: "Tüm hakları saklıdır.",
      cgvLink: "Genel satış koşulları",
      footLegal: "Fiyatlar KDV hariçtir, profesyonellere özeldir.",
      askQuote: "Fiyat teklifi iste",
    },
  };

  const T = I18N[LANG];

  const CAT_I18N = {
    "Coiffage & Style": { en: "Hair Styling", nl: "Haarstyling", de: "Haarstyling", tr: "Saç Şekillendirme" },
    "Peignes & Brosses": { en: "Combs & Brushes", nl: "Kammen & Borstels", de: "Kämme & Bürsten", tr: "Tarak & Fırça" },
    "Après-rasage & Cologne": { en: "Aftershave & Cologne", nl: "Aftershave & Cologne", de: "Aftershave & Cologne", tr: "Tıraş Sonrası & Kolonya" },
    "Rasage": { en: "Shaving", nl: "Scheren", de: "Rasur", tr: "Tıraş" },
    "Coloration": { en: "Hair Color", nl: "Haarkleuring", de: "Haarfarbe", tr: "Saç Boyası" },
    "Shampoings & Après-shampoings": { en: "Shampoo & Conditioner", nl: "Shampoo & Conditioner", de: "Shampoo & Conditioner", tr: "Şampuan & Saç Kremi" },
    "Soins mains & corps": { en: "Hand & Body Care", nl: "Hand- & Lichaamsverzorging", de: "Hand- & Körperpflege", tr: "El & Vücut Bakımı" },
    "Soins barbe": { en: "Beard Care", nl: "Baardverzorging", de: "Bartpflege", tr: "Sakal Bakımı" },
    "Masques & Soins visage": { en: "Masks & Face Care", nl: "Maskers & Gezichtsverzorging", de: "Masken & Gesichtspflege", tr: "Maske & Yüz Bakımı" },
    "Testeurs & Miniatures": { en: "Testers & Minis", nl: "Testers & Mini's", de: "Tester & Minis", tr: "Tester & Mini Boy" },
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
    PRODUCTS = all.filter((p) => !p.hidden);
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
    // Catégories triées par nombre de produits : les plus fournies en premier.
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
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

  function getFiltered() {
    const term = searchTerm.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      const matchCat = activeCategory === "Tous" || p.category === activeCategory;
      const matchTerm =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.ean.includes(term);
      return matchCat && matchTerm;
    });
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
    return `<button class="price-locked" data-action="access">&#128274; ${T.askPrice}</button>`;
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

  function renderGrid() {
    const grid = document.getElementById("grid");
    const countEl = document.getElementById("result-count");
    const filtered = getFiltered();

    countEl.textContent = T.results(filtered.length);

    if (filtered.length === 0) {
      grid.innerHTML = `<p class="no-results">Aucun produit ne correspond à votre recherche.</p>`;
      return;
    }

    grid.innerHTML = filtered
      .map((p) => {
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
                !unlocked()
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
      })
      .join("");

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
      return;
    }
    const parts = [];
    if (u) parts.push(T.articles(u));
    if (b) parts.push(T.box(b));
    bar.hidden = false;
    bar.innerHTML = `<span class="fb-count">${u + b}</span> ${parts.join(" + ")} — ${T.seeSelection}`;
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

    // Sans accès professionnel : aucune possibilité d'ajouter au panier.
    if (!unlocked()) {
      zone.innerHTML = `<p class="sheet-locked">${T.lockedNote}</p>
        <button class="buy-add sheet-unlock" data-action="access">${T.proAccess}</button>`;
      const b = zone.querySelector("[data-action='access']");
      if (b) b.addEventListener("click", () => { closeProductSheet(); openAccessModal(); });
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

    if (eans.length === 0) {
      list.innerHTML = `<p class="drawer-empty">Votre sélection est vide.</p>`;
      pickTitle.hidden = true;
      pickList.hidden = true;
      return;
    }

    pickTitle.hidden = false;
    pickList.hidden = false;

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
  // L'URL est renseignée dans config.js (SHARED.orderLog) ; vide = désactivé.
  // ==========================================================================

  function orderLogUrl() {
    return (typeof SHARED !== "undefined" && SHARED.orderLog) ? SHARED.orderLog : "";
  }

  function buildOrderPayload() {
    const items = [];
    let grand = 0;
    let priced = unlocked();
    Object.keys(selection).forEach((ean) => {
      const p = PRODUCTS.find((x) => x.ean === ean);
      if (!p) return;
      const q = selection[ean];
      const unit = priced ? priceOf(p) : null;
      const parts = [];
      if (q.u > 0) parts.push(q.u + " u");
      if (q.b > 0) parts.push(q.b + " ct(" + p.box_qty + ")");
      let lineTotal = null;
      if (unit !== null) {
        lineTotal = (q.u || 0) * unit + (q.b || 0) * (p.box_qty || 0) * unit;
        grand += lineTotal;
      }
      items.push(p.name + " — " + parts.join(" + ") + (lineTotal !== null ? " = " + formatPrice(lineTotal) : ""));
    });
    return {
      date: new Date().toISOString(),
      lang: LANG,
      access: ACCESS_LABEL || "—",       // quel code a servi (traçabilité)
      itemCount: Object.keys(selection).length,
      items: items.join(" | "),
      totalHT: priced ? grand.toFixed(2) : "",
    };
  }

  function logOrder() {
    const url = orderLogUrl();
    if (!url || Object.keys(selection).length === 0) return;
    try {
      const body = JSON.stringify(buildOrderPayload());
      // sendBeacon : envoi "tire et oublie", survit même si l'onglet part sur WhatsApp
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, body);
      } else {
        fetch(url, { method: "POST", body: body, mode: "no-cors", keepalive: true });
      }
    } catch (e) { /* le registre ne doit jamais bloquer la commande */ }
  }

  function renderAgentPicker() {
    const wrap = document.getElementById("agent-pick-list");
    wrap.innerHTML = "";

    // 1) Parcours principal : demande de devis (formulaire + document + envoi)
    const quote = document.createElement("a");
    quote.className = "label-row primary";
    quote.href = "/devis/";
    quote.innerHTML = `
      <span class="swatch swatch-quote"></span>
      <span class="row-text">${T.askQuote}</span>
      <span class="chevron">&#8250;</span>
    `;
    wrap.appendChild(quote);

    // 2) Raccourci WhatsApp conservé pour les habitués
    if (typeof AGENTS !== "undefined" && AGENTS.dilhan) {
      const btn = document.createElement("a");
      btn.className = "label-row";
      btn.style.marginTop = "9px";
      btn.target = "_blank";
      btn.rel = "noopener";
      btn.href = `https://wa.me/${AGENTS.dilhan.whatsapp}?text=${encodeURIComponent(buildSelectionMessage())}`;
      btn.addEventListener("click", logOrder);
      btn.innerHTML = `
        <span class="swatch swatch-whatsapp"></span>
        <span class="row-text">${T.salesTeam}</span>
        <span class="chevron">&#8250;</span>
      `;
      wrap.appendChild(btn);
    }
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

    initIntro();
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
      window.addEventListener(
        "scroll",
        () => {
          stickyBar.classList.toggle("scrolled", window.scrollY > 8);
        },
        { passive: true }
      );
    }
  }


  // ==========================================================================
  // ÉCRAN D'ACCUEIL — particules, transition 3D vers la feuille catalogue.
  // ==========================================================================

  // Particules orange sur l'écran noir. Coupées hors écran / onglet masqué.
  function initIntroParticles() {
    const canvas = document.getElementById("intro-particles");
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Sur écran tactile, aucune particule : c'est la charge la plus lourde
    // du site et elle empêche un défilement parfaitement fluide.
    if (window.matchMedia("(pointer: coarse)").matches) {
      canvas.style.display = "none";
      return;
    }

    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dots = [], raf = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const count = Math.round(Math.min(coarse ? 26 : 60, (w * h) / (coarse ? 26000 : 15000)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.4,
        vx: (Math.random() - 0.5) * 0.14,
        vy: -(Math.random() * 0.24 + 0.05),
        a: Math.random() * 0.45 + 0.1,
        tw: Math.random() * Math.PI * 2,
      }));
    }

    const slow = window.matchMedia("(pointer: coarse)").matches;
    let last = 0;

    function frame(ts) {
      raf = requestAnimationFrame(frame);
      // Sur mobile, 30 images/s suffisent largement et libèrent le processeur
      // pour un défilement fluide.
      if (slow && ts - last < 33) return;
      last = ts || 0;
      ctx.clearRect(0, 0, w, h);
      dots.forEach((d) => {
        d.x += d.vx; d.y += d.vy; d.tw += 0.018;
        if (d.y < -6) { d.y = h + 6; d.x = Math.random() * w; }
        if (d.x < -6) d.x = w + 6;
        if (d.x > w + 6) d.x = -6;
        const alpha = d.a * (0.6 + 0.4 * Math.sin(d.tw));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 156, 40, ${alpha})`;
        ctx.fill();
      });
    }

    function start() { if (!raf) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    new IntersectionObserver(
      (entries) => (entries[0].isIntersecting ? start() : stop()),
      { threshold: 0 }
    ).observe(document.getElementById("intro"));
  }

  // Transition 3D : pendant que la feuille blanche monte, la scène du logo
  // bascule vers l'arrière (profondeur), rétrécit et s'éteint.
  // Transition 3D d'entrée — version stabilisée mobile :
  // - hauteurs verrouillées en pixels (la barre d'adresse mobile ne fait
  //   plus sauter les calculs en plein scroll) ;
  // - la feuille catalogue n'est jamais transformée sur écran tactile, et
  //   sur desktop une hystérésis évite qu'elle rebascule en 3D quand on
  //   remonte vite (une feuille transformée casse la barre sticky).
  function initIntroScroll() {
    const scene = document.getElementById("intro-scene");
    const cue = document.getElementById("intro-cue");
    const intro = document.getElementById("intro");
    const track = document.getElementById("intro-track");
    if (!scene || !intro || !track) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Sur écran tactile : mise en page simple gérée par le CSS. Le script
    // ne touche à rien — c'est ce qui garantit un défilement natif et fluide.
    const simple = window.matchMedia("(pointer: coarse), (max-width: 860px)").matches;
    if (simple) {
      if (cue) {
        let t = false;
        window.addEventListener("scroll", () => {
          if (t) return;
          t = true;
          requestAnimationFrame(() => {
            t = false;
            cue.style.opacity = window.scrollY > 40 ? "0" : "";
          });
        }, { passive: true });
      }
      return;
    }

    let H = window.innerHeight || 1;
    let lastW = window.innerWidth;

    const sheet = document.getElementById("catalog-sheet");

    function lockHeights() {
      H = window.innerHeight || 1;
      intro.style.height = H + "px";
      track.style.height = H * 2 + "px";
      // La remontée de la feuille est fixée en PIXELS, comme les hauteurs
      // ci-dessus : sinon le repli de la barre d'adresse mobile recalcule
      // les unités vh en plein scroll et toute la page se décale.
      if (sheet) sheet.style.marginTop = -H + "px";
    }

    // Ne re-verrouiller qu'aux vrais changements (rotation, redimensionnement),
    // jamais au simple repli de la barre d'adresse pendant le scroll.
    window.addEventListener("resize", () => {
      if (window.innerWidth !== lastW) {
        lastW = window.innerWidth;
        lockHeights();
        apply();
      }
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => { lastW = window.innerWidth; lockHeights(); apply(); }, 250);
    });

    let ticking = false;
    let lastP = -1;

    function apply() {
      ticking = false;
      const p = Math.min(Math.max(window.scrollY / H, 0), 1);
      // Rien à faire si la position n'a pas bougé, ou si l'intro est déjà
      // entièrement passée : on évite d'écrire dans la page à chaque image.
      if (p === lastP) return;
      if (p === 1 && lastP === 1) return;
      lastP = p;
      if (!reduced) {
        scene.style.transform = `translateY(${p * -40}px) translateZ(${p * -260}px) rotateX(${p * 22}deg) scale(${1 - p * 0.12})`;
        scene.style.opacity = String(Math.max(0, 1 - p * 1.25));
        // La feuille n'est JAMAIS transformée : un transform sur elle créerait
        // un cadre de référence et décrocherait la barre de recherche collante.
        // L'effet de profondeur reste porté par la scène du logo, isolée.
      }
      if (cue) cue.style.opacity = p > 0.04 ? "0" : "";
    }

    lockHeights();
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  // ==========================================================================
  // PRIX PROTÉGÉS — servis par le portier (script Google) après validation
  // du code d'accès professionnel. Aucun prix n'existe dans les fichiers du
  // site : sans code valide, il n'y a rien à télécharger ni à déchiffrer.
  // ==========================================================================

  let PRICES = null;        // { ean: prix } une fois l'accès validé
  let ACCESS_LABEL = null;  // entreprise associée au code (traçabilité)
  let LIMITS = null;        // { ean: {u, b, state} } limites de commande

  function gateUrl() {
    return (typeof SHARED !== "undefined" && SHARED.orderLog) ? SHARED.orderLog : "";
  }

  // Appel au portier. mode=jsonp car le script Google ne renvoie pas
  // d'en-têtes CORS exploitables en lecture depuis un site tiers.
  function callGate(params) {
    return new Promise((resolve) => {
      const url = gateUrl();
      if (!url) return resolve(null);
      const cb = "nishmanCb" + Date.now() + Math.floor(Math.random() * 1000);
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 12000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cb] = (data) => { cleanup(); resolve(data); };

      const qs = Object.keys(params)
        .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
        .join("&");
      const script = document.createElement("script");
      script.src = url + "?" + qs + "&callback=" + cb;
      script.onerror = () => { cleanup(); resolve(null); };
      document.head.appendChild(script);
    });
  }

  // Valide un code et récupère les prix
  async function tryUnlock(code) {
    const clean = (code || "").trim().toUpperCase();
    if (!clean) return false;
    const res = await callGate({ action: "unlock", code: clean });
    if (res && res.ok && res.prices) {
      PRICES = res.prices;
      LIMITS = res.limits || null;
      ACCESS_LABEL = res.company || clean;
      return true;
    }
    return false;
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

  async function initPriceLock() {
    const saved = localStorage.getItem("nishman-access-code");
    if (saved && (await tryUnlock(saved)) === false) {
      localStorage.removeItem("nishman-access-code");
    }
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

  function openAccessModal() {
    const ov = document.getElementById("access-overlay");
    if (!ov) return;
    document.getElementById("access-error").hidden = true;
    document.getElementById("signup-error").hidden = true;
    document.getElementById("access-input").value = "";
    showAccessStep("access-step-code");
    ov.hidden = false;
    syncScrollLock();
    setTimeout(() => document.getElementById("access-input").focus(), 60);
  }

  function closeAccessModal() {
    const ov = document.getElementById("access-overlay");
    if (ov) ov.hidden = true;
    syncScrollLock();
  }

  async function submitAccessCode() {
    const input = document.getElementById("access-input");
    const err = document.getElementById("access-error");
    const btn = document.getElementById("access-submit");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = T.checking;
    const ok = await tryUnlock(input.value);
    btn.disabled = false;
    btn.textContent = T.unlock;
    if (ok) {
      localStorage.setItem("nishman-access-code", input.value.trim().toUpperCase());
      closeAccessModal();
      renderGrid();
      renderProAccessBtn();
    } else {
      err.textContent = T.wrongCode;
      err.hidden = false;
    }
  }

  // ---------- Inscription : vérification du numéro de TVA ----------

  async function submitSignup() {
    const vat = document.getElementById("signup-vat");
    const mail = document.getElementById("signup-email");
    const err = document.getElementById("signup-error");
    const btn = document.getElementById("signup-submit");
    err.hidden = true;

    const v = (vat.value || "").replace(/[\s.\-]/g, "").toUpperCase();
    const m = (mail.value || "").trim();
    vat.classList.toggle("invalid", v.length < 8);
    mail.classList.toggle("invalid", !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m));
    if (v.length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) {
      err.textContent = T.signupInvalid;
      err.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = T.checking;
    const res = await callGate({ action: "signup", vat: v, email: m, lang: LANG });
    btn.disabled = false;
    btn.textContent = T.signupSubmit;

    if (res && res.ok) {
      document.getElementById("sent-text").textContent =
        (res.pending ? T.signupPending : T.signupSent(m));
      showAccessStep("access-step-sent");
    } else {
      err.textContent = (res && res.message) ? res.message : T.signupFailed;
      err.hidden = false;
    }
  }

  function lockPrices() {
    PRICES = null;
    ACCESS_LABEL = null;
    // Sans prix, le panier n'a plus de sens : on repart d'une base propre.
    selection = {};
    saveSelection();
    localStorage.removeItem("nishman-access-code");
    renderGrid();
    renderProAccessBtn();
  }

  function renderProAccessBtn() {
    const btn = document.getElementById("pro-access");
    if (!btn) return;
    btn.textContent = unlocked() ? T.logout : T.proAccess;
    btn.classList.toggle("unlocked", unlocked());
  }

  function initAccessControls() {
    const btn = document.getElementById("pro-access");
    if (btn) btn.addEventListener("click", () => (unlocked() ? lockPrices() : openAccessModal()));
    const close = document.getElementById("access-close");
    if (close) close.addEventListener("click", closeAccessModal);
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

    const submit = document.getElementById("access-submit");
    if (submit) submit.addEventListener("click", submitAccessCode);
    const input = document.getElementById("access-input");
    if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAccessCode(); });

    // Navigation entre saisie du code et inscription
    const toSignup = document.getElementById("go-signup");
    if (toSignup) toSignup.addEventListener("click", (e) => {
      e.preventDefault();
      showAccessStep("access-step-signup");
      setTimeout(() => document.getElementById("signup-vat").focus(), 60);
    });
    const toCode = document.getElementById("go-code");
    if (toCode) toCode.addEventListener("click", (e) => {
      e.preventDefault();
      showAccessStep("access-step-code");
    });
    const sSubmit = document.getElementById("signup-submit");
    if (sSubmit) sSubmit.addEventListener("click", submitSignup);
    const sMail = document.getElementById("signup-email");
    if (sMail) sMail.addEventListener("keydown", (e) => { if (e.key === "Enter") submitSignup(); });
    const done = document.getElementById("sent-close");
    if (done) done.addEventListener("click", () => showAccessStep("access-step-code"));

    renderProAccessBtn();
  }

  // Monogramme sticky + bouton retour haut.
  // Sélecteur de langue : bouton compact + mini panneau
  function initLangControls() {
    const btn = document.getElementById("lang-btn");
    const panel = document.getElementById("lang-overlay");
    if (!btn || !panel) return;
    btn.textContent = LANG.toUpperCase();
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
    if (accDesc) accDesc.textContent = T.enterCode;
    const accInput = document.getElementById("access-input");
    if (accInput) accInput.placeholder = T.codePlaceholder;
    const accSubmit = document.getElementById("access-submit");
    if (accSubmit) accSubmit.textContent = T.unlock;
    const accErr = document.getElementById("access-error");
    if (accErr) accErr.textContent = T.wrongCode;
    const accNo = document.getElementById("access-nocode");
    if (accNo) accNo.textContent = T.noCode;
    const map2 = {
      "go-signup": T.signupLink,
      "signup-intro": T.signupIntro,
      "t-signup-vat": T.signupVat,
      "t-signup-email": T.signupEmail,
      "signup-submit": T.signupSubmit,
      "go-code": T.haveCode,
      "sent-close": T.sentOk,
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
        social.innerHTML = ig
          ? `<a class="foot-btn foot-ig" target="_blank" rel="noopener" href="${ig}">
               <img class="foot-ig-icon" src="/assets/img/instagram.png" alt="" />Instagram</a>`
          : "";
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
    const brand = document.getElementById("sticky-brand");
    const goTop = (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (brand) brand.addEventListener("click", goTop);
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

  function initIntro() {
    initIntroParticles();
    initIntroScroll();
    const cue = document.getElementById("intro-cue");
    if (cue) {
      cue.addEventListener("click", () => {
        const target = document.getElementById("search-sticky") || document.getElementById("catalog-sheet");
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
