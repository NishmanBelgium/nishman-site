/* ==========================================================================
   APP — logique de routage "sans backend".
   Une seule page HTML (index.html, dupliquée en 404.html) sert les 3 URLs.
   Le chemin (/dilhan, /guilem, /bekir) détermine le commercial affiché ;
   tout le reste vient de SHARED (assets/js/config.js).
   ========================================================================== */

(function () {
  "use strict";

  function getSlugFromPath() {
    // "/dilhan/" -> "dilhan" ; "/dilhan" -> "dilhan" ; "/" -> ""
    const path = window.location.pathname;
    const clean = path.replace(/^\/+|\/+$/g, "");
    return clean.toLowerCase();
  }

  function buildWhatsappUrl(agent) {
    const text = encodeURIComponent(SHARED.whatsappMessage(agent.name));
    return `https://wa.me/${agent.whatsapp}?text=${text}`;
  }

  function renderAgent(agent) {
    document.getElementById("agent-name").textContent = agent.name;
    document.getElementById("agent-bio").textContent = SHARED.bio;

    const wa = document.getElementById("btn-whatsapp");
    wa.href = buildWhatsappUrl(agent);

    document.title = `${agent.name} — ${SHARED.brand}`;
  }

  function renderShared() {
    document.getElementById("eyebrow").textContent = SHARED.eyebrow;

    const ig = document.getElementById("btn-instagram");
    if (SHARED.instagram) {
      ig.href = SHARED.instagram;
      ig.closest("li").style.display = "";
    } else {
      ig.closest("li").style.display = "none";
    }

    const cat = document.getElementById("btn-catalog");
    cat.href = SHARED.catalog;

    const site = document.getElementById("btn-website");
    if (SHARED.website) {
      site.href = SHARED.website;
      site.closest("li").style.display = "";
    } else {
      site.closest("li").style.display = "none";
    }
  }

  function showFallback() {
    document.getElementById("agent-view").hidden = true;
    document.getElementById("fallback-view").hidden = false;
  }

  function init() {
    renderShared();

    const slug = getSlugFromPath();
    const agent = AGENTS[slug];

    if (agent) {
      renderAgent(agent);
      document.getElementById("agent-view").hidden = false;
    } else {
      showFallback();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
