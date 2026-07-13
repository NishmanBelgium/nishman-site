/* ==========================================================================
   HOME — script dédié à la page d'accueil (nishman.be seul).
   Se contente d'afficher la liste des commerciaux depuis AGENTS
   (assets/js/config.js). N'a aucun impact sur /dilhan, /guilem, /bekir,
   qui sont gérés séparément par 404.html + app.js.
   ========================================================================== */

(function () {
  "use strict";

  function buildAgentList() {
    const list = document.getElementById("home-agent-list");
    if (!list) return;

    Object.keys(AGENTS).forEach((slug) => {
      const agent = AGENTS[slug];
      const li = document.createElement("li");
      li.innerHTML = `
        <a class="label-row" href="/${slug}">
          <span class="swatch"></span>
          <span class="row-text">
            ${agent.name}
            <span class="row-sub">Voir sa carte de contact</span>
          </span>
          <span class="chevron">&#8250;</span>
        </a>
      `;
      list.appendChild(li);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildAgentList);
  } else {
    buildAgentList();
  }
})();
