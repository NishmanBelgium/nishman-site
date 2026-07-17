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

  const STORAGE_KEY = "nishman_selection_v1";

  let PRODUCTS = [];
  let selection = {}; // { ean: qty }
  let activeCategory = "Tous";
  let searchTerm = "";

  // ==========================================================================
  // LANGUES — fr par défaut ; le choix est mémorisé et recharge la page.
  // Les noms de produits restent dans leur langue d'origine (marque).
  // ==========================================================================

  const LANGS = ["fr", "en", "nl"];

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
      mySelection: "Ma sélection", sendTo: "Envoyer cette sélection sur WhatsApp à :",
      remove: "retirer", unit: (n) => n + " unité" + (n > 1 ? "s" : ""),
      box: (n) => n + " carton" + (n > 1 ? "s" : ""),
      articles: (n) => n + " article" + (n > 1 ? "s" : ""),
      seeSelection: "voir ma sélection", discover: "Découvrir",
      askPrice: "Prix sur demande", proAccess: "Accès professionnel",
      enterCode: "Entrez votre code d'accès pour afficher les prix.",
      codePlaceholder: "Code d'accès", unlock: "Afficher les prix",
      wrongCode: "Code incorrect — vérifiez et réessayez.",
      noCode: "Pas encore de code ? Contactez notre équipe :",
      codeMsg: "Bonjour, je souhaite un code d'accès professionnel pour voir les prix sur nishman.be.",
      lockedNote: "Prix réservés aux professionnels",
      addCart: "Ajouter au panier", updateCart: "Mettre à jour le panier",
      totalHT: "Total HT", salesTeam: "Service commercial Nishman",
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
      mySelection: "My selection", sendTo: "Send this selection on WhatsApp to:",
      remove: "remove", unit: (n) => n + " unit" + (n > 1 ? "s" : ""),
      box: (n) => n + " box" + (n > 1 ? "es" : ""),
      articles: (n) => n + " item" + (n > 1 ? "s" : ""),
      seeSelection: "view my selection", discover: "Discover",
      askPrice: "Price on request", proAccess: "Professional access",
      enterCode: "Enter your access code to display prices.",
      codePlaceholder: "Access code", unlock: "Show prices",
      wrongCode: "Invalid code — please check and try again.",
      noCode: "No code yet? Contact our team:",
      codeMsg: "Hello, I would like a professional access code to see prices on nishman.be.",
      lockedNote: "Prices reserved for professionals",
      addCart: "Add to cart", updateCart: "Update cart",
      totalHT: "Total excl. VAT", salesTeam: "Nishman sales team",
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
      mySelection: "Mijn selectie", sendTo: "Stuur deze selectie via WhatsApp naar:",
      remove: "verwijderen", unit: (n) => n + " stuk" + (n > 1 ? "s" : ""),
      box: (n) => n + " do" + (n > 1 ? "zen" : "os"),
      articles: (n) => n + " artikel" + (n > 1 ? "en" : ""),
      seeSelection: "bekijk mijn selectie", discover: "Ontdekken",
      askPrice: "Prijs op aanvraag", proAccess: "Professionele toegang",
      enterCode: "Voer uw toegangscode in om de prijzen te tonen.",
      codePlaceholder: "Toegangscode", unlock: "Prijzen tonen",
      wrongCode: "Ongeldige code — controleer en probeer opnieuw.",
      noCode: "Nog geen code? Contacteer ons team:",
      codeMsg: "Hallo, ik wil graag een professionele toegangscode om de prijzen op nishman.be te zien.",
      lockedNote: "Prijzen voorbehouden aan professionals",
      addCart: "In winkelmand", updateCart: "Winkelmand bijwerken",
      totalHT: "Totaal excl. btw", salesTeam: "Nishman verkoopdienst",
      logout: "Prijzen verbergen",
      waMsg: "Hallo, ik wil graag een prijsofferte voor de volgende producten:",
      boxDetail: (b, n, tot) => b + " do" + (b > 1 ? "zen" : "os") + " van " + n + " (" + tot + " stuks)",
    },
  };

  const T = I18N[LANG];

  const CAT_I18N = {
    "Coiffage & Style": { en: "Hair Styling", nl: "Haarstyling" },
    "Peignes & Brosses": { en: "Combs & Brushes", nl: "Kammen & Borstels" },
    "Après-rasage & Cologne": { en: "Aftershave & Cologne", nl: "Aftershave & Cologne" },
    "Rasage": { en: "Shaving", nl: "Scheren" },
    "Coloration": { en: "Hair Color", nl: "Haarkleuring" },
    "Shampoings & Après-shampoings": { en: "Shampoo & Conditioner", nl: "Shampoo & Conditioner" },
    "Soins mains & corps": { en: "Hand & Body Care", nl: "Hand- & Lichaamsverzorging" },
    "Soins barbe": { en: "Beard Care", nl: "Baardverzorging" },
    "Masques & Soins visage": { en: "Masks & Face Care", nl: "Maskers & Gezichtsverzorging" },
    "Testeurs & Miniatures": { en: "Testers & Minis", nl: "Testers & Mini's" },
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
    return window.NISHMAN_INLINE_IMAGES
      ? window.NISHMAN_INLINE_IMAGES[p.image] || IMAGE_BASE + p.image
      : IMAGE_BASE + p.image;
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
    const res = await fetch("/assets/data/products.json");
    PRODUCTS = await res.json();
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
    document.body.style.overflow = "hidden";
  }

  function closeCatPanel() {
    document.getElementById("cat-overlay").hidden = true;
    document.body.style.overflow = "";
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;");
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
              <img src="${productImageSrc(p)}" alt="${escapeHtml(p.name)}" loading="lazy" />
            </div>
            <p class="product-cat">${escapeHtml(pText(p, "tagline") || catLabel(p.category))}</p>
            <p class="product-name">${escapeHtml(p.name)}</p>
            <p class="product-vol">${escapeHtml(p.volume || "")}</p>
            <div class="product-footer">
              ${priceZone(p, "")}
              ${
                inSel
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
        <img src="${productImageSrc(p)}" alt="${escapeHtml(p.name)}" />
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
    document.body.style.overflow = "hidden";
  }

  function renderSheetQty(ean) {
    const zone = document.getElementById("sheet-qty-zone");
    if (!zone) return;
    const p = PRODUCTS.find((x) => x.ean === ean);
    const existing = selection[ean] || { u: 0, b: 0 };
    // Quantités en cours de composition : rien n'entre au panier avant "Ajouter"
    const pending = { u: existing.u || 0, b: existing.b || 0 };
    const wasInCart = pending.u > 0 || pending.b > 0;

    function draw() {
      const row = (kind, label) => `
        <div class="buy-row">
          <span class="buy-row-label">${label}</span>
          <div class="qty-stepper" data-kind="${kind}">
            <button data-action="dec">−</button>
            <span>${pending[kind]}</span>
            <button data-action="inc">+</button>
          </div>
        </div>`;

      const empty = pending.u === 0 && pending.b === 0;
      zone.innerHTML =
        row("u", T.perUnit) +
        (p && p.box_qty ? row("b", T.boxOf(p.box_qty)) : "") +
        `<button class="sheet-confirm" id="sheet-confirm" ${empty && !wasInCart ? "disabled" : ""}>
           ${wasInCart ? T.updateCart : T.addCart}
         </button>`;

      zone.querySelectorAll(".qty-stepper").forEach((st) => {
        const kind = st.dataset.kind;
        st.querySelector("[data-action='inc']").addEventListener("click", () => {
          pending[kind] += 1; draw();
        });
        st.querySelector("[data-action='dec']").addEventListener("click", () => {
          pending[kind] = Math.max(0, pending[kind] - 1); draw();
        });
      });

      const confirm = document.getElementById("sheet-confirm");
      if (confirm) {
        confirm.addEventListener("click", () => {
          if (pending.u === 0 && pending.b === 0) {
            delete selection[ean];
          } else {
            selection[ean] = { u: pending.u, b: pending.b };
          }
          saveSelection();
          renderGrid();
          renderFloatBar();
          closeProductSheet(); // retour direct au catalogue
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
    document.body.style.overflow = "";
  }

  // ---------- Tiroir de sélection ----------

  function openDrawer() {
    renderDrawer();
    document.getElementById("drawer-overlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    document.getElementById("drawer-overlay").hidden = true;
    document.body.style.overflow = "";
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
        if (q.u > 0) rows.push({ kind: "u", label: `× ${T.unit(q.u)}` });
        if (q.b > 0) rows.push({ kind: "b", label: `× ${T.box(q.b)} · ${p.box_qty}` });
        return rows
          .map(
            (r) => `
          <div class="drawer-item">
            <img src="${productImageSrc(p)}" alt="" />
            <span class="drawer-item-name">${escapeHtml(p.name)} ${r.label}</span>
            <button class="drawer-remove" data-ean="${ean}" data-kind="${r.kind}">${T.remove}</button>
          </div>`
          )
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

    list.querySelectorAll(".drawer-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const e = selection[btn.dataset.ean];
        if (e) {
          e[btn.dataset.kind] = 0;
          if (!e.u && !e.b) delete selection[btn.dataset.ean];
        }
        saveSelection();
        renderDrawer();
        renderGrid();
        renderFloatBar();
      });
    });

    renderAgentPicker();
  }

  // ---------- Envoi WhatsApp ----------

  function buildSelectionMessage() {
    const lines = Object.keys(selection).map((ean) => {
      const p = PRODUCTS.find((x) => x.ean === ean);
      if (!p) return null;
      const q = selection[ean];
      const parts = [];
      if (q.u > 0) parts.push(T.unit(q.u));
      if (q.b > 0) parts.push(T.boxDetail(q.b, p.box_qty, q.b * p.box_qty));
      return `• ${p.name} — ${parts.join(" + ")}`;
    }).filter(Boolean);
    return `${T.waMsg}\n\n${lines.join("\n")}`;
  }

  function renderAgentPicker() {
    const wrap = document.getElementById("agent-pick-list");
    wrap.innerHTML = "";
    Object.keys(AGENTS).forEach((slug) => {
      const agent = AGENTS[slug];
      const btn = document.createElement("a");
      btn.className = "label-row primary";
      btn.style.marginBottom = "8px";
      btn.target = "_blank";
      btn.rel = "noopener";
      const message = encodeURIComponent(buildSelectionMessage());
      btn.href = `https://wa.me/${agent.whatsapp}?text=${message}`;
      btn.innerHTML = `
        <span class="swatch swatch-whatsapp"></span>
        <span class="row-text">Envoyer à ${agent.name}</span>
        <span class="chevron">&#8250;</span>
      `;
      wrap.appendChild(btn);
    });
  }

  // ---------- Initialisation ----------

  async function init() {
    loadSelection();
    applyStaticI18n();
    await Promise.all([loadProducts(), initPriceLock()]);
    renderCatButton();
    renderGrid();
    renderFloatBar();
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

    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dots = [], raf = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(60, (w * h) / 15000));
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

    function frame() {
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
      raf = requestAnimationFrame(frame);
    }

    function start() { if (!raf) frame(); }
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
  function initIntroScroll() {
    const scene = document.getElementById("intro-scene");
    const cue = document.getElementById("intro-cue");
    const sheet = document.getElementById("catalog-sheet");
    if (!scene || !sheet) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ticking = false;
    function apply() {
      ticking = false;
      const vh = window.innerHeight || 1;
      const p = Math.min(Math.max(window.scrollY / vh, 0), 1);
      if (!reduced) {
        scene.style.transform = `translateY(${p * -40}px) translateZ(${p * -260}px) rotateX(${p * 22}deg) scale(${1 - p * 0.12})`;
        scene.style.opacity = String(1 - p * 1.25);
        // La feuille arrive légèrement inclinée puis s'aplatit en fin de course.
        const flat = Math.min(p / 0.85, 1);
        sheet.style.transform = p < 1 ? `perspective(1200px) rotateX(${(1 - flat) * 3.5}deg)` : "none";
      }
      if (cue) cue.style.opacity = p > 0.04 ? "0" : "";
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  // ==========================================================================
  // PRIX VERROUILLÉS — chiffrés dans prices.enc.json, déchiffrés dans le
  // navigateur avec un code d'accès professionnel. Sans code valide, les
  // prix sont mathématiquement illisibles (AES-GCM + PBKDF2).
  // ==========================================================================

  let PRICES = null; // { ean: prix } après déverrouillage
  let PRICE_META = null;

  function b64buf(s) {
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  async function tryUnlock(code) {
    if (!PRICE_META || !window.crypto || !window.crypto.subtle) return false;
    try {
      const enc = new TextEncoder();
      const baseKey = await crypto.subtle.importKey("raw", enc.encode(code.trim()), "PBKDF2", false, ["deriveKey"]);
      const kek = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: b64buf(PRICE_META.kdf.salt), iterations: PRICE_META.kdf.iter, hash: "SHA-256" },
        baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
      );
      for (const w of PRICE_META.wrapped) {
        try {
          const masterRaw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64buf(w.iv) }, kek, b64buf(w.ct));
          const master = await crypto.subtle.importKey("raw", masterRaw, { name: "AES-GCM" }, false, ["decrypt"]);
          const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64buf(PRICE_META.data.iv) }, master, b64buf(PRICE_META.data.ct));
          PRICES = JSON.parse(new TextDecoder().decode(data));
          return true;
        } catch (e) { /* pas cet emballage : code suivant */ }
      }
    } catch (e) { /* code invalide */ }
    return false;
  }

  function priceOf(p) {
    return PRICES ? (PRICES[p.ean] !== undefined ? PRICES[p.ean] : null) : null;
  }

  function unlocked() { return PRICES !== null; }

  async function initPriceLock() {
    try {
      const res = await fetch("/assets/data/prices.enc.json");
      PRICE_META = await res.json();
    } catch (e) {
      PRICE_META = null;
    }
    const saved = localStorage.getItem("nishman-access-code");
    if (saved && (await tryUnlock(saved)) === false) {
      localStorage.removeItem("nishman-access-code");
    }
  }

  function openAccessModal() {
    const ov = document.getElementById("access-overlay");
    if (!ov) return;
    document.getElementById("access-error").hidden = true;
    document.getElementById("access-input").value = "";
    // Boutons "demander un code" vers les commerciaux
    const zone = document.getElementById("access-agents");
    if (zone && typeof AGENTS !== "undefined" && AGENTS.dilhan) {
      zone.innerHTML = `<a class="access-agent" target="_blank" rel="noopener"
        href="https://wa.me/${AGENTS.dilhan.whatsapp}?text=${encodeURIComponent(T.codeMsg)}">
        <span class="access-agent-dot"></span>${T.salesTeam}</a>`;
    }
    ov.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("access-input").focus(), 60);
  }

  function closeAccessModal() {
    const ov = document.getElementById("access-overlay");
    if (ov) ov.hidden = true;
    document.body.style.overflow = "";
  }

  async function submitAccessCode() {
    const input = document.getElementById("access-input");
    const err = document.getElementById("access-error");
    const btn = document.getElementById("access-submit");
    btn.disabled = true;
    const ok = await tryUnlock(input.value);
    btn.disabled = false;
    if (ok) {
      localStorage.setItem("nishman-access-code", input.value.trim());
      closeAccessModal();
      renderGrid();
      renderProAccessBtn();
    } else {
      err.hidden = false;
    }
  }

  function lockPrices() {
    PRICES = null;
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
    if (ov) ov.addEventListener("click", (e) => { if (e.target.id === "access-overlay") closeAccessModal(); });
    const submit = document.getElementById("access-submit");
    if (submit) submit.addEventListener("click", submitAccessCode);
    const input = document.getElementById("access-input");
    if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAccessCode(); });
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
    document.documentElement.lang = LANG;
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
        document.getElementById("catalog-sheet").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
