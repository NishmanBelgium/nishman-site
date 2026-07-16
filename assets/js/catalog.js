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
    label.textContent = filtered ? activeCategory : "Toutes";
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
            <span>${escapeHtml(c.name === "Tous" ? "Toute la gamme" : c.name)}</span>
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
    if (price === null || price === undefined) return "Nous consulter";
    return price.toFixed(2).replace(".", ",") + " €";
  }

  function renderGrid() {
    const grid = document.getElementById("grid");
    const countEl = document.getElementById("result-count");
    const filtered = getFiltered();

    countEl.textContent = `${filtered.length} produit${filtered.length > 1 ? "s" : ""}`;

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
            <p class="product-cat">${escapeHtml(p.tagline || p.category)}</p>
            <p class="product-name">${escapeHtml(p.name)}</p>
            <p class="product-vol">${escapeHtml(p.volume || "")}</p>
            <div class="product-footer">
              <span class="product-price">
                ${formatPrice(p.price_ht)}
                <span class="vat-note">HT / unité</span>
              </span>
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

    grid.querySelectorAll("[data-action='add']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = PRODUCTS.find((x) => x.ean === btn.dataset.ean);
        if (p && p.box_qty) {
          openProductSheet(p.ean); // le choix unité / carton se fait sur la fiche
        } else {
          changeQty(btn.dataset.ean, 1, "u");
        }
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
    if (u) parts.push(u + " article" + (u > 1 ? "s" : ""));
    if (b) parts.push(b + " carton" + (b > 1 ? "s" : ""));
    bar.hidden = false;
    bar.innerHTML = `<span class="fb-count">${u + b}</span> ${parts.join(" + ")} — voir ma sélection`;
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
      <p class="sheet-desc">${escapeHtml(p.description || "")}</p>
      ${p.box_qty ? `<p class="sheet-packaging">Conditionnement : carton de ${p.box_qty} unités${p.price_ht ? " — " + formatPrice(p.price_ht * p.box_qty) + " HT / carton" : ""}</p>` : ""}
      <div class="sheet-buy">
        <span class="product-price sheet-price">
          ${formatPrice(p.price_ht)}
          <span class="vat-note">HT / unité</span>
        </span>
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
    const q = selection[ean] || { u: 0, b: 0 };

    function row(kind, label) {
      const val = q[kind] || 0;
      if (val > 0) {
        return `
          <div class="buy-row">
            <span class="buy-row-label">${label}</span>
            <div class="qty-stepper" data-kind="${kind}">
              <button data-action="dec">−</button>
              <span>${val}</span>
              <button data-action="inc">+</button>
            </div>
          </div>`;
      }
      return `
        <div class="buy-row">
          <span class="buy-row-label">${label}</span>
          <button class="buy-add" data-kind="${kind}">Ajouter</button>
        </div>`;
    }

    zone.innerHTML =
      row("u", "À l'unité") +
      (p && p.box_qty ? row("b", "Carton de " + p.box_qty) : "");

    zone.querySelectorAll(".buy-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        changeQty(ean, 1, btn.dataset.kind);
        renderSheetQty(ean);
      });
    });
    zone.querySelectorAll(".qty-stepper").forEach((st) => {
      const kind = st.dataset.kind;
      st.querySelector("[data-action='inc']").addEventListener("click", () => {
        changeQty(ean, 1, kind);
        renderSheetQty(ean);
      });
      st.querySelector("[data-action='dec']").addEventListener("click", () => {
        changeQty(ean, -1, kind);
        renderSheetQty(ean);
      });
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
        if (q.u > 0) rows.push({ kind: "u", label: `× ${q.u} unité${q.u > 1 ? "s" : ""}` });
        if (q.b > 0) rows.push({ kind: "b", label: `× ${q.b} carton${q.b > 1 ? "s" : ""} de ${p.box_qty}` });
        return rows
          .map(
            (r) => `
          <div class="drawer-item">
            <img src="${productImageSrc(p)}" alt="" />
            <span class="drawer-item-name">${escapeHtml(p.name)} ${r.label}</span>
            <button class="drawer-remove" data-ean="${ean}" data-kind="${r.kind}">retirer</button>
          </div>`
          )
          .join("");
      })
      .join("");

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
      if (q.u > 0) parts.push(`${q.u} unité${q.u > 1 ? "s" : ""}`);
      if (q.b > 0) parts.push(`${q.b} carton${q.b > 1 ? "s" : ""} de ${p.box_qty} (${q.b * p.box_qty} unités)`);
      return `• ${p.name} — ${parts.join(" + ")}`;
    }).filter(Boolean);
    return `Bonjour, je souhaite une offre de prix pour les produits suivants :\n\n${lines.join("\n")}`;
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
    await loadProducts();
    renderCatButton();
    renderGrid();
    renderFloatBar();

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
      if (e.key === "Escape") { closeCatPanel(); closeProductSheet(); closeDrawer(); }
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

  // Monogramme sticky + bouton retour haut.
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
