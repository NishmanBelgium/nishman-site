/* ==========================================================================
   DEMANDE DE DEVIS — page /devis/
   Lit le panier et les coordonnées (localStorage, partagés avec le catalogue),
   compose le document, puis l'envoie au script Google (SHARED.orderLog) qui
   enregistre la ligne et expédie le devis par e-mail au client + copie NBD.
   ========================================================================== */

(function () {
  "use strict";

  const ASSET_V = "120";

  // Mêmes conditions commerciales que le catalogue.
  // Minimum de commande en LIVRAISON, en euros HT. Le retrait sur place
  // n'est soumis a aucun minimum : c'est le transport qu'il protege.
  const MIN_ORDER = 300;
  // Doit correspondre EXACTEMENT à STORAGE_KEY de catalog.js
  const SEL_KEY = "nishman_selection_v1";
  const SEL_KEYS_FALLBACK = ["nishman-selection", "nishman_selection"];
  const CLIENT_KEY = "nishman-client";
  const LANG_KEY = "nishman-lang";
  const CODE_KEY = "nishman-access-code";

  const LANGS = ["fr", "en", "nl", "de", "tr"];
  const LANG = LANGS.includes(localStorage.getItem(LANG_KEY)) ? localStorage.getItem(LANG_KEY) : "fr";

  // ---------- Traductions de la page ----------
  const I18N = {
    fr: {
      back: "Retour au catalogue", step1: "Étape 1 sur 2", step2: "Étape 2 sur 2",
      formtitle: "Vos coordonnées professionnelles",
      formlead: "Nous vendons exclusivement aux professionnels. Ces informations figureront sur votre devis.",
      first: "Prénom", last: "Nom", company: "Nom du salon / société",
      vat: "Numéro d'entreprise / TVA", phone: "Téléphone", email: "E-mail",
      vatLen: (n, r) => `Le numéro de TVA doit comporter ${n} caractères après le préfixe (${r} saisis).`,
      vatSiren: "Il manque les 2 caractères de clé à placer DEVANT votre SIREN. Votre numéro de TVA s'écrit FR + 2 caractères + les 9 chiffres du SIREN.",
      vatHint: (n) => `${n} caractères attendus`,
      street: "Adresse (rue et numéro)", zip: "Code postal", city: "Ville", country: "Pays",
      shipMode: "Mode de réception", shipDelivery: "Livraison", shipPickup: "Retrait à Cuesmes",
      shipFee: "Frais de livraison", shipFree: "Livraison offerte", subTotal: "Sous-total HT",
      minBlock: (min, m) => `Minimum de commande en livraison : ${min} HT. Il vous manque ${m}. Ajoutez des produits, ou choisissez le retrait a Cuesmes — sans minimum.`,
      cont: "Continuer", saved: "Vos coordonnées sont conservées sur cet appareil pour vos prochaines demandes.",
      doctitle: "DEMANDE DE DEVIS", ref: "Référence", date: "Date", client: "Client",
      thProd: "Produit", thEan: "EAN", thU: "Unités", thB: "Cartons", thTot: "Total pièces",
      thPu: "P.U. HT", thSub: "Sous-total", totalht: "Total HT",
      legal: "Document non contractuel — sous réserve de confirmation, de disponibilité et de validation des conditions par NBD Distribution SRL. Prix hors TVA, hors frais de livraison éventuels. Validité indicative : 30 jours.",
      send: "Envoyer ma demande de devis", sending: "Envoi en cours...",
      print: "Imprimer / PDF", edit: "Modifier mes coordonnées",
      required: "Merci de compléter les champs surlignés.",
      bademail: "L'adresse e-mail ne semble pas valide.",
      empty: "Votre panier est vide. Retournez au catalogue pour composer votre demande.",
      sendfail: "L'envoi a échoué. Vérifiez votre connexion et réessayez, ou imprimez le devis et transmettez-le à contact@nishman.be.",
      donetitle: "Demande envoyée",
      donetext: (mail) => "Votre devis a été envoyé à " + mail + ". Notre équipe commerciale revient vers vous rapidement.",
      askPrice: "Sur demande",
      docSent: "Demande envoyée",
    },
    en: {
      back: "Back to catalogue", step1: "Step 1 of 2", step2: "Step 2 of 2",
      formtitle: "Your business details",
      formlead: "We sell to professionals only. These details will appear on your quotation.",
      first: "First name", last: "Last name", company: "Salon / company name",
      vat: "Company / VAT number", phone: "Phone", email: "E-mail",
      vatLen: (n, r) => `The VAT number must contain ${n} characters after the prefix (${r} entered).`,
      vatSiren: "The 2 key characters are missing BEFORE your SIREN. A French VAT number reads FR + 2 characters + the 9 SIREN digits.",
      vatHint: (n) => `${n} characters expected`,
      street: "Address (street and number)", zip: "Postcode", city: "City", country: "Country",
      shipMode: "Delivery method", shipDelivery: "Delivery", shipPickup: "Collection in Cuesmes",
      shipFee: "Delivery charge", shipFree: "Free delivery", subTotal: "Subtotal excl. VAT",
      minBlock: (min, m) => `Minimum order for delivery: ${min} excl. VAT. You are ${m} short. Add products, or choose collection in Cuesmes — no minimum.`,
      cont: "Continue", saved: "Your details are kept on this device for your next requests.",
      doctitle: "QUOTATION REQUEST", ref: "Reference", date: "Date", client: "Customer",
      thProd: "Product", thEan: "EAN", thU: "Units", thB: "Boxes", thTot: "Total pcs",
      thPu: "Unit price", thSub: "Subtotal", totalht: "Total excl. VAT",
      legal: "Non-contractual document — subject to confirmation, availability and approval of terms by NBD Distribution SRL. Prices excl. VAT, excl. any delivery costs. Indicative validity: 30 days.",
      send: "Send my quotation request", sending: "Sending...",
      print: "Print / PDF", edit: "Edit my details",
      required: "Please complete the highlighted fields.",
      bademail: "This e-mail address does not look valid.",
      empty: "Your cart is empty. Go back to the catalogue to build your request.",
      sendfail: "Sending failed. Check your connection and try again, or print the quotation and send it to contact@nishman.be.",
      donetitle: "Request sent",
      donetext: (mail) => "Your quotation has been sent to " + mail + ". Our sales team will get back to you shortly.",
      askPrice: "On request",
      docSent: "Request sent",
    },
    nl: {
      back: "Terug naar catalogus", step1: "Stap 1 van 2", step2: "Stap 2 van 2",
      formtitle: "Uw professionele gegevens",
      formlead: "Wij verkopen uitsluitend aan professionals. Deze gegevens verschijnen op uw offerte.",
      first: "Voornaam", last: "Naam", company: "Naam salon / bedrijf",
      vat: "Ondernemings- / btw-nummer", phone: "Telefoon", email: "E-mail",
      vatLen: (n, r) => `Het btw-nummer moet ${n} tekens bevatten na het voorvoegsel (${r} ingevoerd).`,
      vatSiren: "De 2 sleuteltekens ontbreken VÓÓR uw SIREN. Een Frans btw-nummer is FR + 2 tekens + de 9 cijfers van het SIREN.",
      vatHint: (n) => `${n} tekens verwacht`,
      street: "Adres (straat en nummer)", zip: "Postcode", city: "Stad", country: "Land",
      shipMode: "Wijze van ontvangst", shipDelivery: "Levering", shipPickup: "Afhalen in Cuesmes",
      shipFee: "Leveringskosten", shipFree: "Gratis levering", subTotal: "Subtotaal excl. btw",
      minBlock: (min, m) => `Minimumbestelling bij levering: ${min} excl. btw. Er ontbreekt nog ${m}. Voeg producten toe of kies afhalen in Cuesmes — zonder minimum.`,
      cont: "Doorgaan", saved: "Uw gegevens worden op dit toestel bewaard voor volgende aanvragen.",
      doctitle: "OFFERTEAANVRAAG", ref: "Referentie", date: "Datum", client: "Klant",
      thProd: "Product", thEan: "EAN", thU: "Stuks", thB: "Dozen", thTot: "Totaal stuks",
      thPu: "Stukprijs", thSub: "Subtotaal", totalht: "Totaal excl. btw",
      legal: "Niet-contractueel document — onder voorbehoud van bevestiging, beschikbaarheid en goedkeuring van de voorwaarden door NBD Distribution SRL. Prijzen excl. btw, excl. eventuele leveringskosten. Indicatieve geldigheid: 30 dagen.",
      send: "Mijn offerteaanvraag versturen", sending: "Bezig met versturen...",
      print: "Afdrukken / PDF", edit: "Mijn gegevens wijzigen",
      required: "Gelieve de gemarkeerde velden in te vullen.",
      bademail: "Dit e-mailadres lijkt niet geldig.",
      empty: "Uw winkelmand is leeg. Ga terug naar de catalogus om uw aanvraag samen te stellen.",
      sendfail: "Versturen mislukt. Controleer uw verbinding en probeer opnieuw, of print de offerte en stuur ze naar contact@nishman.be.",
      donetitle: "Aanvraag verzonden",
      donetext: (mail) => "Uw offerte is verzonden naar " + mail + ". Ons verkoopteam neemt binnenkort contact met u op.",
      askPrice: "Op aanvraag",
      docSent: "Aanvraag verzonden",
    },
    de: {
      back: "Zurück zum Katalog", step1: "Schritt 1 von 2", step2: "Schritt 2 von 2",
      formtitle: "Ihre Geschäftsdaten",
      formlead: "Wir verkaufen ausschließlich an Fachkunden. Diese Angaben erscheinen auf Ihrem Angebot.",
      first: "Vorname", last: "Nachname", company: "Name des Salons / der Firma",
      vat: "Unternehmens- / USt-Nummer", phone: "Telefon", email: "E-Mail",
      vatLen: (n, r) => `Die USt-Nummer muss ${n} Zeichen nach dem Präfix enthalten (${r} eingegeben).`,
      vatSiren: "Die 2 Prüfzeichen fehlen VOR Ihrer SIREN. Eine französische USt-Nummer lautet FR + 2 Zeichen + die 9 Ziffern der SIREN.",
      vatHint: (n) => `${n} Zeichen erwartet`,
      street: "Adresse (Straße und Nummer)", zip: "PLZ", city: "Stadt", country: "Land",
      shipMode: "Art des Empfangs", shipDelivery: "Lieferung", shipPickup: "Abholung in Cuesmes",
      shipFee: "Versandkosten", shipFree: "Kostenlose Lieferung", subTotal: "Zwischensumme netto",
      minBlock: (min, m) => `Mindestbestellwert bei Lieferung: ${min} netto. Es fehlen ${m}. Fugen Sie Produkte hinzu oder wahlen Sie Abholung in Cuesmes — ohne Mindestwert.`,
      cont: "Weiter", saved: "Ihre Daten werden auf diesem Gerät für künftige Anfragen gespeichert.",
      doctitle: "ANGEBOTSANFRAGE", ref: "Referenz", date: "Datum", client: "Kunde",
      thProd: "Produkt", thEan: "EAN", thU: "Stück", thB: "Kartons", thTot: "Stück gesamt",
      thPu: "Stückpreis", thSub: "Zwischensumme", totalht: "Gesamt zzgl. MwSt.",
      legal: "Unverbindliches Dokument — vorbehaltlich Bestätigung, Verfügbarkeit und Genehmigung der Konditionen durch NBD Distribution SRL. Preise zzgl. MwSt., zzgl. eventueller Lieferkosten. Richtwert der Gültigkeit: 30 Tage.",
      send: "Angebotsanfrage senden", sending: "Wird gesendet...",
      print: "Drucken / PDF", edit: "Meine Daten ändern",
      required: "Bitte füllen Sie die markierten Felder aus.",
      bademail: "Diese E-Mail-Adresse scheint ungültig zu sein.",
      empty: "Ihr Warenkorb ist leer. Kehren Sie zum Katalog zurück, um Ihre Anfrage zusammenzustellen.",
      sendfail: "Senden fehlgeschlagen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut, oder drucken Sie das Angebot und senden Sie es an contact@nishman.be.",
      donetitle: "Anfrage gesendet",
      donetext: (mail) => "Ihr Angebot wurde an " + mail + " gesendet. Unser Vertriebsteam meldet sich in Kürze bei Ihnen.",
      askPrice: "Auf Anfrage",
      docSent: "Anfrage gesendet",
    },
    tr: {
      back: "Katalog'a dön", step1: "Adım 1 / 2", step2: "Adım 2 / 2",
      formtitle: "Kurumsal bilgileriniz",
      formlead: "Yalnızca profesyonellere satış yapıyoruz. Bu bilgiler teklifinizde yer alacaktır.",
      first: "Ad", last: "Soyad", company: "Salon / firma adı",
      vat: "Firma / vergi numarası", phone: "Telefon", email: "E-posta",
      vatLen: (n, r) => `Vergi numarası ön ekten sonra ${n} karakter içermelidir (${r} girildi).`,
      vatSiren: "SIREN numaranızın ÖNÜNDE bulunması gereken 2 anahtar karakter eksik. Fransız vergi numarası FR + 2 karakter + 9 haneli SIREN şeklindedir.",
      vatHint: (n) => `${n} karakter bekleniyor`,
      street: "Adres (cadde ve numara)", zip: "Posta kodu", city: "Şehir", country: "Ülke",
      shipMode: "Teslim şekli", shipDelivery: "Teslimat", shipPickup: "Cuesmes'ten teslim alma",
      shipFee: "Teslimat ücreti", shipFree: "Teslimat ücretsiz", subTotal: "Ara toplam (KDV hariç)",
      minBlock: (min, m) => `Teslimat icin minimum siparis: ${min} (KDV haric). ${m} eksik. Urun ekleyin veya Cuesmes teslim almayi secin — minimum yok.`,
      cont: "Devam", saved: "Bilgileriniz sonraki talepleriniz için bu cihazda saklanır.",
      doctitle: "FİYAT TEKLİFİ TALEBİ", ref: "Referans", date: "Tarih", client: "Müşteri",
      thProd: "Ürün", thEan: "EAN", thU: "Adet", thB: "Koli", thTot: "Toplam adet",
      thPu: "Birim fiyat", thSub: "Ara toplam", totalht: "Toplam (KDV hariç)",
      legal: "Bağlayıcı olmayan belge — NBD Distribution SRL tarafından onay, stok durumu ve koşulların kabulüne tabidir. Fiyatlar KDV hariçtir, olası teslimat masrafları dahil değildir. Tahmini geçerlilik: 30 gün.",
      send: "Fiyat teklifi talebimi gönder", sending: "Gönderiliyor...",
      print: "Yazdır / PDF", edit: "Bilgilerimi düzenle",
      required: "Lütfen işaretli alanları doldurun.",
      bademail: "Bu e-posta adresi geçerli görünmüyor.",
      empty: "Sepetiniz boş. Talebinizi oluşturmak için kataloğa dönün.",
      sendfail: "Gönderim başarısız. Bağlantınızı kontrol edip tekrar deneyin veya teklifi yazdırıp contact@nishman.be adresine iletin.",
      donetitle: "Talep gönderildi",
      donetext: (mail) => "Teklifiniz " + mail + " adresine gönderildi. Satış ekibimiz kısa süre içinde sizinle iletişime geçecek.",
      askPrice: "Talep üzerine",
      docSent: "Talep gönderildi",
    },
  };

  const T = I18N[LANG] || I18N.fr;

  // ---------- Utilitaires ----------

  function $(id) { return document.getElementById(id); }
  function txt(id, value) { const el = $(id); if (el) el.textContent = value; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(v) { return v.toFixed(2).replace(".", ",") + " €"; }

  let PRODUCTS = [];
  let PRICES = null;
  let selection = {};
  let client = {};
  let docRef = "";

  function unlocked() { return PRICES !== null; }
  function priceOf(p) { return PRICES && PRICES[p.ean] !== undefined ? PRICES[p.ean] : null; }

  // ---------- Chargement des données ----------

  function loadSelection() {
    selection = {};
    const keys = [SEL_KEY].concat(SEL_KEYS_FALLBACK);
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && Object.keys(parsed).length) {
          selection = parsed;
          break;
        }
      } catch (e) { /* clé suivante */ }
    }
    // Migration : ancien format où la valeur était un simple nombre d'unités
    Object.keys(selection).forEach((k) => {
      if (typeof selection[k] === "number") selection[k] = { u: selection[k], b: 0 };
    });
  }

  function loadClient() {
    try { client = JSON.parse(localStorage.getItem(CLIENT_KEY)) || {}; }
    catch (e) { client = {}; }
  }

  async function loadProducts() {
    const res = await fetch("/assets/data/products.json?v=" + ASSET_V);
    PRODUCTS = await res.json();   // pas de filtre ici : un devis en cours
                                   // doit rester lisible même si un produit
                                   // vient d'être masqué.
  }

  // Déverrouillage des prix : même mécanique que le catalogue, avec le code déjà saisi
  // Récupération des prix auprès du portier (script Google), exactement comme
  // le catalogue. L'ancien fichier chiffré prices.enc.json n'existe plus.
  function callGate(params) {
    return new Promise((resolve) => {
      const url = (typeof SHARED !== "undefined" && SHARED.orderLog) ? SHARED.orderLog : "";
      if (!url) return resolve(null);
      const cb = "nishmanQ" + Date.now() + Math.floor(Math.random() * 1000);
      const timer = setTimeout(() => { cleanup(); resolve(null); }, 12000);

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

  async function loadPrices() {
    const code = localStorage.getItem(CODE_KEY);
    if (!code) return;
    const res = await callGate({ action: "unlock", code: code.trim().toUpperCase() });
    if (res && res.ok && res.prices) PRICES = res.prices;
  }

  // ---------- Lignes du devis ----------

  function buildLines() {
    const out = [];
    Object.keys(selection).forEach((ean) => {
      const p = PRODUCTS.find((x) => x.ean === ean);
      if (!p) return;
      const q = selection[ean];
      const u = q.u || 0;
      const b = q.b || 0;
      if (u + b === 0) return;
      const box = p.box_qty || 0;
      const pieces = u + b * box;
      const unit = unlocked() ? priceOf(p) : null;
      out.push({
        ean: p.ean, name: p.name, units: u, boxes: b, boxQty: box,
        pieces: pieces, unitPrice: unit,
        subtotal: unit !== null ? pieces * unit : null,
      });
    });
    return out;
  }

  function makeRef() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
    return "DEV-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + rnd;
  }

  // ---------- Rendu du document ----------

  function renderDoc() {
    const lines = buildLines();
    docRef = docRef || makeRef();
    txt("doc-ref", docRef);
    txt("doc-date", new Date().toLocaleDateString(LANG === "fr" ? "fr-BE" : LANG));

    $("doc-client-body").innerHTML =
      "<strong>" + esc(client.company) + "</strong><br />" +
      esc(client.first) + " " + esc(client.last) + "<br />" +
      esc(client.street) + "<br />" +
      esc(client.zip) + " " + esc(client.city) + " — " + esc(client.country) + "<br />" +
      "TVA : " + esc(client.vat) + "<br />" +
      esc(client.phone) + " — " + esc(client.email);

    const showPrices = unlocked();
    document.querySelectorAll(".price-col").forEach((el) => { el.hidden = !showPrices; });

    $("doc-lines").innerHTML = lines.map((l) => `
      <tr>
        <td class="prod-name">${esc(l.name)}</td>
        <td class="ean">${esc(l.ean)}</td>
        <td class="num">${l.units || "—"}</td>
        <td class="num">${l.boxes ? l.boxes + " × " + l.boxQty : "—"}</td>
        <td class="num"><strong>${l.pieces}</strong></td>
        ${showPrices ? `<td class="num price-col">${l.unitPrice !== null ? money(l.unitPrice) : T.askPrice}</td>` : ""}
        ${showPrices ? `<td class="num price-col"><strong>${l.subtotal !== null ? money(l.subtotal) : "—"}</strong></td>` : ""}
      </tr>`).join("");

    const total = lines.reduce((s, l) => s + (l.subtotal || 0), 0);
    const retrait = (client.shipmode || "livraison") === "retrait";

    // Plus de frais de livraison : la ligne reste dans la page mais ne
    // s'affiche jamais, pour ne pas casser la mise en page du document.
    const rowShip = $("doc-ship-row");
    if (rowShip) rowShip.hidden = true;

    if (showPrices && total > 0) {
      $("doc-total-row").hidden = false;
      txt("doc-total", money(total));
    } else {
      $("doc-total-row").hidden = true;
    }

    // Minimum de commande : bloquant en livraison, jamais en retrait.
    const manque = (!retrait && showPrices && total > 0 && total < MIN_ORDER)
      ? MIN_ORDER - total : 0;
    const btn = $("btn-send"), avert = $("min-warn");
    if (btn) {
      btn.disabled = manque > 0;
      btn.classList.toggle("cta-bloque", manque > 0);
    }
    if (avert) {
      avert.hidden = manque <= 0;
      if (manque > 0) avert.textContent = T.minBlock(money(MIN_ORDER), money(manque));
    }

    return { lines: lines, total: total, subTotal: total, shipping: 0,
             pickup: retrait, showPrices: showPrices, manque: manque };
  }

  // ---------- Formulaire ----------

  const FIELDS = ["first", "last", "company", "vat", "phone", "email", "street", "zip", "city", "country", "shipmode"];

  // Le préfixe pays est affiché à gauche du champ et suit la liste déroulante.
  // Le client ne saisit que les chiffres : impossible de l'effacer ou de le
  // remplacer, ce qui garantit un numéro toujours au bon format.
  function brancherPays() {
    const pays = $("f-country"), tva = $("f-vat"), badge = $("vat-prefix");
    if (!pays || !tva) return;
    const aide = $("vat-aide");
    const maj = () => {
      const p = PREFIXE[pays.value] || "BE";
      if (badge) badge.textContent = p;
      tva.value = corpsTva(tva.value, pays.value);
      tva.placeholder = p === "BE" ? "0123456789"
                      : p === "FR" ? "12345678901" : "12345678";
      tva.maxLength = LONGUEUR[p] || 15;
      compter();
    };
    // Compteur visible : le client voit tout de suite qu'il manque des
    // caractères, sans avoir à valider pour s'en rendre compte.
    const compter = () => {
      if (!aide) return;
      const p = PREFIXE[pays.value] || "BE";
      const n = LONGUEUR[p] || 0;
      const r = corpsTva(tva.value, pays.value).length;
      aide.textContent = n ? r + " / " + n + " — " + T.vatHint(n) : "";
      aide.classList.toggle("vat-aide-ok", n > 0 && r === n);
    };
    tva.addEventListener("input", compter);
    pays.addEventListener("change", maj);
    tva.addEventListener("blur", maj);
    // nettoyage à la volée : le préfixe collé disparaît dès la saisie
    tva.addEventListener("input", () => {
      const v = tva.value.toUpperCase();
      if (/^(BE|FR|LU|NL|DE)/.test(v.replace(/[\s.\-]/g, ""))) {
        tva.value = corpsTva(v, pays.value);
      }
    });
    maj();
  }

  function fillForm() {
    FIELDS.forEach((f) => { if (client[f]) $("f-" + f).value = client[f]; });
    // le numéro est stocké avec son préfixe : on ne remet que les chiffres
    if (client.vat) $("f-vat").value = corpsTva(client.vat, client.country);
    // Un pays enregistré autrefois mais retiré de la liste (Pays-Bas,
    // Allemagne) laisserait le sélecteur vide et le devis sans pays.
    const pays = $("f-country");
    if (pays && !pays.value) pays.selectedIndex = 0;
  }

  // Préfixe pays imposé sur le numéro de TVA : le client peut le taper ou
  // non, le devis porte toujours BE, FR ou LU selon le pays sélectionné.
  const PREFIXE = { "Belgique": "BE", "France": "FR", "Luxembourg": "LU" };
  // Longueur du numéro APRÈS le préfixe. En France : 2 caractères de clé
  // suivis des 9 chiffres du SIREN — d'où 11, et non 9.
  const LONGUEUR = { BE: 10, FR: 11, LU: 8 };

  /** Ne garde que la partie numérique du numéro : le préfixe pays est figé
      à côté du champ et n'est plus saisissable. */
  function corpsTva(valeur, pays) {
    let v = (valeur || "").replace(/[\s.\-]/g, "").toUpperCase();
    if (!v) return "";
    // si le client colle un numéro complet, on retire le préfixe collé
    v = v.replace(/^(BE|FR|LU|NL|DE)/, "");
    if (PREFIXE[pays] === "BE" && /^[0-9]{9}$/.test(v)) v = "0" + v;  // zéro de tête
    return v;
  }

  function normaliserTva(valeur, pays) {
    const corps = corpsTva(valeur, pays);
    if (!corps) return "";
    return (PREFIXE[pays] || "") + corps;
  }

  function readForm() {
    const data = {};
    FIELDS.forEach((f) => { data[f] = ($("f-" + f).value || "").trim(); });
    data.vat = normaliserTva(data.vat, data.country);
    return data;
  }

  function validateForm() {
    const data = readForm();
    let ok = true;
    FIELDS.forEach((f) => {
      const el = $("f-" + f);
      const bad = !data[f];
      el.classList.toggle("invalid", bad);
      if (bad) ok = false;
    });
    const err = $("form-error");
    if (!ok) { err.textContent = T.required; err.hidden = false; return null; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
      $("f-email").classList.add("invalid");
      err.textContent = T.bademail; err.hidden = false; return null;
    }

    // Numéro de TVA : la longueur doit correspondre au pays choisi.
    const pfx = PREFIXE[data.country] || "BE";
    const corps = corpsTva($("f-vat").value, data.country);
    const attendu = LONGUEUR[pfx];
    if (attendu && corps.length !== attendu) {
      $("f-vat").classList.add("invalid");
      // Cas le plus fréquent en France : le SIREN seul, sans la clé.
      err.textContent = (pfx === "FR" && /^[0-9]{9}$/.test(corps))
        ? T.vatSiren
        : T.vatLen(attendu, corps.length);
      err.hidden = false;
      return null;
    }
    err.hidden = true;
    return data;
  }

  // ---------- Envoi ----------

  function endpoint() {
    return (typeof SHARED !== "undefined" && SHARED.orderLog) ? SHARED.orderLog : "";
  }

  async function sendQuote() {
    const data = renderDoc();
    const btn = $("btn-send");
    const err = $("send-error");
    err.hidden = true;
    btn.disabled = true;
    $("t-send").textContent = T.sending;

    const payload = {
      type: "quote",
      ref: docRef,
      date: new Date().toISOString(),
      lang: LANG,
      client: client,
      total: data.showPrices ? data.total.toFixed(2) : "",
      subTotal: data.showPrices ? data.subTotal.toFixed(2) : "",
      shipping: data.showPrices ? data.shipping.toFixed(2) : "",
      pickup: data.pickup ? "1" : "",
      currency: "EUR",
      lines: data.lines.map((l) => ({
        ean: l.ean, name: l.name, units: l.units, boxes: l.boxes,
        boxQty: l.boxQty, pieces: l.pieces,
        unitPrice: l.unitPrice !== null ? l.unitPrice.toFixed(2) : "",
        subtotal: l.subtotal !== null ? l.subtotal.toFixed(2) : "",
      })),
    };

    const url = endpoint();
    let ok = false;
    if (url) {
      try {
        await fetch(url, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        ok = true; // mode no-cors : la réponse n'est pas lisible, l'absence d'erreur vaut succès
      } catch (e) { ok = false; }
    }

    btn.disabled = false;
    $("t-send").textContent = T.send;

    if (!ok) { err.textContent = T.sendfail; err.hidden = false; return; }

    // Panier vidé : la demande est partie
    [SEL_KEY].concat(SEL_KEYS_FALLBACK).forEach((k) => localStorage.removeItem(k));

    // Le document reste visible sous la confirmation : le client garde une
    // trace de sa demande et peut encore l'imprimer.
    $("step-done").hidden = false;
    $("doc-done-text").textContent = T.donetext(client.email);
    document.querySelector("#step-recap .quote-actions").hidden = true;
    const eyebrow = document.querySelector("#step-recap .quote-eyebrow");
    if (eyebrow) eyebrow.textContent = T.docSent;
    // On replace la confirmation AVANT le document
    const main = document.querySelector(".quote-main");
    main.insertBefore($("step-done"), $("step-recap"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Textes statiques ----------

  function applyI18n() {
    document.documentElement.lang = LANG;
    const map = {
      "t-back": T.back, "t-step1": T.step1, "t-step2": T.step2,
      "t-formtitle": T.formtitle, "t-formlead": T.formlead,
      "t-f-first": T.first, "t-f-last": T.last, "t-f-company": T.company,
      "t-f-vat": T.vat, "t-f-phone": T.phone, "t-f-email": T.email,
      "t-f-street": T.street, "t-f-zip": T.zip, "t-f-city": T.city, "t-f-country": T.country,
      "t-f-shipmode": T.shipMode,
      "t-continue": T.cont, "t-saved": T.saved,
      "t-doctitle": T.doctitle, "t-ref": T.ref, "t-date": T.date, "t-client": T.client,
      "t-th-prod": T.thProd, "t-th-ean": T.thEan, "t-th-u": T.thU, "t-th-b": T.thB,
      "t-th-tot": T.thTot, "t-th-pu": T.thPu, "t-th-sub": T.thSub,
      "t-totalht": T.totalht, "t-legal": T.legal,
      "t-send": T.send, "t-print": T.print, "t-edit": T.edit,
      "t-donetitle": T.donetitle, "t-print2": T.print, "t-backcat": T.back,
    };
    Object.keys(map).forEach((id) => txt(id, map[id]));
  }

  // ---------- Initialisation ----------

  async function init() {
    applyI18n();
    loadSelection();
    loadClient();
    fillForm();
    brancherPays();

    if (Object.keys(selection).length === 0) {
      $("step-form").innerHTML =
        '<h1 class="quote-title">' + esc(T.empty) + "</h1>" +
        '<a class="quote-alt" href="/produits/">' + esc(T.back) + "</a>";
      return;
    }

    await Promise.all([loadProducts(), loadPrices()]);

    $("to-recap").addEventListener("click", () => {
      const data = validateForm();
      if (!data) return;
      client = data;
      localStorage.setItem(CLIENT_KEY, JSON.stringify(client));
      renderDoc();
      $("step-form").hidden = true;
      $("step-recap").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("btn-edit").addEventListener("click", () => {
      $("step-recap").hidden = true;
      $("step-form").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("btn-send").addEventListener("click", sendQuote);
    $("btn-print").addEventListener("click", () => window.print());
    $("btn-print-2").addEventListener("click", () => window.print());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
