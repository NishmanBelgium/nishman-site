/* ==========================================================================
   CARTES DE CONTACT (QR codes) — page 404.html.
   Lit le slug dans l'URL (/dilhan, /guilem, /bekir), remplit la carte du
   commercial correspondant depuis config.js (AGENTS + SHARED).
   URL inconnue -> sélecteur listant tous les commerciaux.
   Ce fichier remplace l'ancien app.js et ne dépend que de config.js.
   ========================================================================== */

(function () {
  "use strict";

  function slugFromUrl() {
    const seg = window.location.pathname.split("/").filter(Boolean)[0] || "";
    return seg.toLowerCase();
  }

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function setHref(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    if (url) {
      el.href = url;
    } else if (el.parentElement) {
      el.parentElement.remove(); // bouton sans destination : on le retire
    }
  }

  function renderAgent(slug, agent) {
    const name = document.getElementById("agent-name");
    if (name) name.textContent = agent.name;

    const bio = document.getElementById("agent-bio");
    if (bio && SHARED.bio) bio.textContent = SHARED.bio;

    setHref("btn-whatsapp", "https://wa.me/" + agent.whatsapp);
    setHref("btn-instagram", SHARED.instagram);
    setHref("btn-catalog", SHARED.catalog);
    setHref("btn-website", SHARED.website);

    document.title = "Nishman — " + agent.name;
    show("agent-view");
  }

  function renderFallback() {
    const list = document.getElementById("fallback-list");
    if (list) {
      list.innerHTML = "";
      Object.keys(AGENTS).forEach(function (slug) {
        const agent = AGENTS[slug];
        const li = document.createElement("li");
        li.innerHTML =
          '<a class="label-row primary" href="/' + slug + '">' +
          '<span class="swatch swatch-whatsapp"></span>' +
          '<span class="row-text">' + agent.name +
          '<span class="row-sub">Carte de contact</span></span>' +
          '<span class="chevron">&#8250;</span></a>';
        list.appendChild(li);
      });
      // Lien vers le site en fin de liste
      const li = document.createElement("li");
      li.innerHTML =
        '<a class="label-row" href="/">' +
        '<span class="swatch swatch-catalog"></span>' +
        '<span class="row-text">Découvrir le site' +
        '<span class="row-sub">nishman.be</span></span>' +
        '<span class="chevron">&#8250;</span></a>';
      list.appendChild(li);
    }
    show("fallback-view");
  }

  function init() {
    if (typeof AGENTS === "undefined" || typeof SHARED === "undefined") return;
    const slug = slugFromUrl();
    if (AGENTS[slug]) {
      renderAgent(slug, AGENTS[slug]);
    } else {
      renderFallback();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
