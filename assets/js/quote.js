/* ==========================================================================
   DEMANDE DE DEVIS — page /devis/
   Lit le panier et les coordonnées (localStorage, partagés avec le catalogue),
   compose le document, puis l'envoie au script Google (SHARED.orderLog) qui
   enregistre la ligne et expédie le devis par e-mail au client + copie NBD.
   ========================================================================== */

(function () {
  "use strict";

  const ASSET_V = "46";
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
      street: "Adresse (rue et numéro)", zip: "Code postal", city: "Ville", country: "Pays",
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
      street: "Address (street and number)", zip: "Postcode", city: "City", country: "Country",
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
      street: "Adres (straat en nummer)", zip: "Postcode", city: "Stad", country: "Land",
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
      street: "Adresse (Straße und Nummer)", zip: "PLZ", city: "Stadt", country: "Land",
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
      street: "Adres (cadde ve numara)", zip: "Posta kodu", city: "Şehir", country: "Ülke",
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
    PRODUCTS = await res.json();
  }

  // Déverrouillage des prix : même mécanique que le catalogue, avec le code déjà saisi
  function b64buf(s) {
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  async function loadPrices() {
    const code = localStorage.getItem(CODE_KEY);
    if (!code || !window.crypto || !window.crypto.subtle) return;
    try {
      const meta = await (await fetch("/assets/data/prices.enc.json?v=" + ASSET_V, { cache: "no-store" })).json();
      const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(code.trim()), "PBKDF2", false, ["deriveKey"]);
      const kek = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: b64buf(meta.kdf.salt), iterations: meta.kdf.iter, hash: "SHA-256" },
        baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
      );
      for (const w of meta.wrapped) {
        try {
          const masterRaw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64buf(w.iv) }, kek, b64buf(w.ct));
          const master = await crypto.subtle.importKey("raw", masterRaw, { name: "AES-GCM" }, false, ["decrypt"]);
          const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64buf(meta.data.iv) }, master, b64buf(meta.data.ct));
          PRICES = JSON.parse(new TextDecoder().decode(data));
          return;
        } catch (e) { /* enveloppe suivante */ }
      }
    } catch (e) { /* prix indisponibles : devis sans montants */ }
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
    if (showPrices && total > 0) {
      $("doc-total-row").hidden = false;
      txt("doc-total", money(total));
    } else {
      $("doc-total-row").hidden = true;
    }
    return { lines: lines, total: total, showPrices: showPrices };
  }

  // ---------- Formulaire ----------

  const FIELDS = ["first", "last", "company", "vat", "phone", "email", "street", "zip", "city", "country"];

  function fillForm() {
    FIELDS.forEach((f) => { if (client[f]) $("f-" + f).value = client[f]; });
  }

  function readForm() {
    const data = {};
    FIELDS.forEach((f) => { data[f] = ($("f-" + f).value || "").trim(); });
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
