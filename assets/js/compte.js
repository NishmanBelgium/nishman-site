/* ==========================================================================
   COMPTE — le navigateur côté client : formulaires, session, espace.
   Un seul fichier sert les deux pages ; chacune n'active que ce qui la
   concerne, selon les éléments présents dans son HTML.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };

  function echappe(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function euros(n) {
    if (n == null || isNaN(n)) return "—";
    return Number(n).toFixed(2).replace(".", ",") + " €";
  }

  function dateCourte(iso) {
    if (!iso) return "—";
    var d = new Date(String(iso).replace(" ", "T"));
    if (isNaN(d)) return String(iso).slice(0, 10);
    return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
  }

  function envoyer(url, corps) {
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, statut: r.status, donnees: d };
      });
    });
  }

  /* ── page de connexion ────────────────────────────────────────────── */

  var formConnexion = $("#form-connexion");

  if (formConnexion) {
    var formInscription = $("#form-inscription");
    var onglConnexion = $("#t-connexion");
    var onglInscription = $("#t-inscription");
    var message = $("#message");

    function dire(texte, genre) {
      message.textContent = texte;
      message.className = "message on " + (genre || "erreur");
    }
    function taire() { message.className = "message"; }

    function montrer(quoi) {
      var inscrire = quoi === "inscription";
      formConnexion.hidden = inscrire;
      formInscription.hidden = !inscrire;
      onglConnexion.setAttribute("aria-selected", String(!inscrire));
      onglInscription.setAttribute("aria-selected", String(inscrire));
      taire();
    }

    onglConnexion.addEventListener("click", function () { montrer("connexion"); });
    onglInscription.addEventListener("click", function () { montrer("inscription"); });

    // Un lien vers /pro/connexion/?creer ouvre directement le formulaire
    // de création : pratique pour les invitations envoyées par e-mail.
    if (location.search.indexOf("creer") !== -1) montrer("inscription");

    formConnexion.addEventListener("submit", function (e) {
      e.preventDefault();
      taire();
      var bouton = $("#b-connexion");
      bouton.disabled = true;
      bouton.textContent = "Connexion…";

      envoyer("/api/connexion", {
        email: $("#c-email").value.trim(),
        motdepasse: $("#c-mdp").value,
      }).then(function (r) {
        if (r.ok) { location.href = "/pro/compte/"; return; }
        dire(r.donnees.erreur || "La connexion a échoué.");
        bouton.disabled = false;
        bouton.textContent = "Se connecter";
      }).catch(function () {
        dire("Connexion au serveur impossible. Réessayez.");
        bouton.disabled = false;
        bouton.textContent = "Se connecter";
      });
    });

    // Ce que l'on demande dépend du pays : un coiffeur français connaît son
    // SIRET et presque jamais son numéro intracommunautaire, qui sera
    // reconstitué à partir du SIREN côté serveur.
    var IDENTIFIANT = {
      BE: { label: "Numéro d'entreprise (TVA)",
            aide: "Dix chiffres, avec ou sans BE devant. Exemple : 0817.750.283." },
      FR: { label: "Numéro de SIRET",
            aide: "Quatorze chiffres, tels qu'ils figurent sur votre avis de situation." },
      LU: { label: "Numéro de TVA",
            aide: "Huit chiffres, avec ou sans LU devant." },
    };

    var selPays = $("#i-pays");
    var blocInscription = $("#bloc-inscription");

    function majPays() {
      var p = selPays.value;
      var modele = IDENTIFIANT[p];
      blocInscription.hidden = !modele;
      if (!modele) return;
      $("#l-identifiant").textContent = modele.label;
      $("#aide-identifiant").textContent = modele.aide;
    }

    selPays.addEventListener("change", majPays);
    majPays();

    formInscription.addEventListener("submit", function (e) {
      e.preventDefault();
      taire();

      if (!selPays.value) { dire("Choisissez d'abord votre pays."); return; }

      var bouton = $("#b-inscription");
      bouton.disabled = true;
      bouton.textContent = "Création…";

      envoyer("/api/inscription", {
        pays: selPays.value,
        societe: $("#i-societe").value.trim(),
        identifiant: $("#i-identifiant").value.trim(),
        prenom: $("#i-prenom").value.trim(),
        nom: $("#i-nom").value.trim(),
        adresse: $("#i-adresse").value.trim(),
        code_postal: $("#i-cp").value.trim(),
        ville: $("#i-ville").value.trim(),
        email: $("#i-email").value.trim(),
        motdepasse: $("#i-mdp").value,
      }).then(function (r) {
        if (r.ok) {
          // Un numéro douteux ne bloque pas l'inscription, mais on ne le passe
          // pas sous silence : il repart avec l'inscrit sur sa page de compte.
          if (r.donnees.avertissement) {
            try { sessionStorage.setItem("nishman-avis", r.donnees.avertissement); } catch (x) {}
          }
          location.href = "/pro/compte/";
          return;
        }
        dire(r.donnees.erreur || "La création du compte a échoué.");
        bouton.disabled = false;
        bouton.textContent = "Créer mon compte";
      }).catch(function () {
        dire("Connexion au serveur impossible. Réessayez.");
        bouton.disabled = false;
        bouton.textContent = "Créer mon compte";
      });
    });
  }

  /* ── espace du compte ─────────────────────────────────────────────── */

  var espace = $("#espace");

  if (espace) {
    fetch("/api/moi", { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.connecte) { location.href = "/pro/connexion/"; return; }
        remplirProfil(d.compte);
        espace.hidden = false;
        chargerCommandes();
      })
      .catch(function () { location.href = "/pro/connexion/"; });

    var PAYS = { BE: "Belgique", FR: "France", LU: "Luxembourg" };

    function remplirProfil(c) {
      $("#nom-salon").textContent = c.salon;
      $("#mail-compte").textContent = c.email;

      // Un avertissement déposé à l'inscription (numéro incohérent) est
      // affiché une fois, ici, puis oublié.
      try {
        var avis = sessionStorage.getItem("nishman-avis");
        if (avis) {
          sessionStorage.removeItem("nishman-avis");
          var bandeau = document.createElement("p");
          bandeau.className = "avis";
          bandeau.textContent = avis;
          espace.insertBefore(bandeau, espace.firstChild);
        }
      } catch (x) {}

      var etiquette = c.tva_valide
        ? ' <span class="etiquette vert">v\u00e9rifi\u00e9</span>'
        : ' <span class="etiquette gris">\u00e0 v\u00e9rifier</span>';

      var html =
        paire("Soci\u00e9t\u00e9", echappe(c.salon)) +
        paire("Responsable", echappe([c.prenom, c.nom].filter(Boolean).join(" ")) || "\u2014") +
        paire("Pays", echappe(PAYS[c.pays] || c.pays || "\u2014"));

      if (c.siret) html += paire("SIRET", echappe(c.siret));
      html += paire("Num\u00e9ro de TVA", c.tva ? echappe(c.tva) + etiquette
                                       : '<span class="etiquette gris">\u00e0 renseigner</span>');

      var adresse = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(" ")]
        .filter(Boolean).join(", ");
      html += paire("Adresse", echappe(adresse) || "\u2014") +
              paire("Adresse e-mail", echappe(c.email)) +
              paire("Compte cr\u00e9\u00e9 le", dateCourte(c.depuis));

      $("#infos").innerHTML = html;
    }

    function paire(terme, valeur) {
      return '<div class="paire"><dt>' + terme + "</dt><dd>" + valeur + "</dd></div>";
    }

    function chargerCommandes() {
      var zone = $("#commandes");
      fetch("/api/commandes", { headers: { accept: "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.pret) {
            zone.innerHTML = '<p class="vide">L\'historique sera disponible dès que la liaison avec notre gestion sera activée.<br />En attendant, vos commandes vous sont confirmées par e-mail.</p>';
            return;
          }
          if (d.inconnu) {
            zone.innerHTML = '<p class="vide">Nous n\'avons pas encore de commande associée à cette adresse.<br />Elles apparaîtront ici après votre première commande.</p>';
            return;
          }
          if (!d.commandes.length) {
            zone.innerHTML = '<p class="vide">Aucune commande pour le moment.</p>';
            return;
          }
          zone.innerHTML = tableau(d.commandes);
        })
        .catch(function () {
          zone.innerHTML = '<p class="vide">L\'historique n\'a pas pu être chargé. Réessayez dans un instant.</p>';
        });
    }

    function tableau(lignes) {
      var html = '<table class="table-cmd"><thead><tr>' +
        "<th>Référence</th><th>Date</th><th>État</th>" +
        '<th class="nombre">Total HT</th></tr></thead><tbody>';
      for (var i = 0; i < lignes.length; i++) {
        var c = lignes[i];
        html += "<tr><td>" + echappe(c.reference) + "</td>" +
          "<td>" + dateCourte(c.date) + "</td>" +
          "<td>" + echappe(c.etat) + "</td>" +
          '<td class="nombre">' + euros(c.total_ht) + "</td></tr>";
      }
      return html + "</tbody></table>";
    }

    $("#b-deconnexion").addEventListener("click", function () {
      fetch("/api/deconnexion", { method: "POST" })
        .then(function () { location.href = "/"; })
        .catch(function () { location.href = "/"; });
    });
  }
})();
