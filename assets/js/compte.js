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
      credentials: "same-origin",
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
    // Une session encore valable rend ce formulaire inutile : on emmène
    // directement la personne sur son compte. Sans ce contrôle, quelqu'un
    // de déjà connecté voyait un écran de connexion et en concluait,
    // à juste titre, que le site l'avait oublié.
    // La carte reste masquée le temps de la réponse, sinon le formulaire
    // apparaît une fraction de seconde avant de disparaître.
    var carte = document.querySelector(".carte-compte");
    if (carte && location.search.indexOf("creer") === -1) {
      carte.style.visibility = "hidden";
      fetch("/api/moi", {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.connecte) { location.replace("/pro/compte/"); return; }
          carte.style.visibility = "";
        })
        .catch(function () { carte.style.visibility = ""; });
    }

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
        telephone: $("#i-tel").value.trim(),
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
    var MOI = null;

    var PAYS = { BE: "Belgique", FR: "France", LU: "Luxembourg" };

    // Ce que l'on demande dépend du pays, exactement comme à l'inscription.
    var IDENTIFIANT = {
      BE: { label: "Numéro d'entreprise (TVA)",
            aide: "Dix chiffres, avec ou sans BE devant. Exemple : 0817.750.283." },
      FR: { label: "Numéro de SIRET",
            aide: "Quatorze chiffres, tels qu'ils figurent sur votre avis de situation." },
      LU: { label: "Numéro de TVA",
            aide: "Huit chiffres, avec ou sans LU devant." },
    };

    fetch("/api/moi", { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.connecte) { location.href = "/pro/connexion/"; return; }
        MOI = d.compte;
        remplirEntete();
        remplirApercu();
        remplirProfil();
        espace.hidden = false;
        chargerCommandes();
      })
      .catch(function () { location.href = "/pro/connexion/"; });

    /* ---- navigation entre les vues ---- */

    var onglets = $("#onglets-espace");
    onglets.addEventListener("click", function (e) {
      var b = e.target.closest("[data-vue]");
      if (!b) return;
      montrerVue(b.dataset.vue);
    });

    function montrerVue(quelle) {
      var bs = onglets.querySelectorAll("[data-vue]");
      for (var i = 0; i < bs.length; i++) {
        bs[i].setAttribute("aria-selected", String(bs[i].dataset.vue === quelle));
      }
      var vues = espace.querySelectorAll("section.vue");
      for (var j = 0; j < vues.length; j++) {
        vues[j].hidden = vues[j].dataset.vue !== quelle;
      }
      // L'ancre dans l'adresse permet de revenir sur la même vue après
      // un rechargement, et de donner un lien direct à quelqu'un.
      try { history.replaceState(null, "", "#" + quelle); } catch (x) {}
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    var depart = (location.hash || "").replace("#", "");
    if (depart && espace.querySelector('section.vue[data-vue="' + depart + '"]')) {
      montrerVue(depart);
    }

    /* ---- en-tête et aperçu ---- */

    function remplirEntete() {
      $("#nom-salon").textContent = MOI.salon;
      $("#mail-compte").textContent = MOI.email;

      // Un avertissement déposé à l'inscription est montré une fois, ici.
      try {
        var avis = sessionStorage.getItem("nishman-avis");
        if (avis) {
          sessionStorage.removeItem("nishman-avis");
          dire($("#msg-profil"), avis, "erreur");
          montrerVue("coordonnees");
        }
      } catch (x) {}
    }

    function remplirApercu() {
      var c = MOI;
      var etiquette = c.tva_valide
        ? ' <span class="etiquette vert">vérifié</span>'
        : ' <span class="etiquette gris">à vérifier</span>';

      var html =
        paire("Société", echappe(c.salon)) +
        paire("Responsable", echappe([c.prenom, c.nom].filter(Boolean).join(" ")) || "—") +
        paire("Pays", echappe(PAYS[c.pays] || c.pays || "—"));

      if (c.siret) html += paire("SIRET", echappe(c.siret));
      html += paire("Numéro de TVA", c.tva ? echappe(c.tva) + etiquette
                                     : '<span class="etiquette gris">à renseigner</span>');

      var adresse = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(" ")]
        .filter(Boolean).join(", ");
      html += paire("Adresse", echappe(adresse) || "—") +
              paire("Téléphone", echappe(c.telephone) || "—") +
              paire("Adresse e-mail", echappe(c.email)) +
              paire("Compte créé le", dateCourte(c.depuis));

      $("#infos").innerHTML = html;
    }

    function paire(terme, valeur) {
      return '<div class="paire"><dt>' + terme + "</dt><dd>" + valeur + "</dd></div>";
    }

    /* ---- messages ---- */

    function dire(zone, texte, genre) {
      zone.textContent = texte;
      zone.className = "message on " + (genre || "erreur");
    }
    function taire(zone) { zone.className = "message"; }

    /* ---- coordonnées ---- */

    var formProfil = $("#form-profil");
    var selPays = $("#p-pays");

    function remplirProfil() {
      selPays.value = MOI.pays || "BE";
      $("#p-societe").value = MOI.salon || "";
      $("#p-identifiant").value = MOI.pays === "FR" ? (MOI.siret || "")
                                                    : (MOI.tva || "").replace(/^[A-Z]{2}/, "");
      $("#p-prenom").value = MOI.prenom || "";
      $("#p-nom").value = MOI.nom || "";
      $("#p-tel").value = MOI.telephone || "";
      $("#p-adresse").value = MOI.adresse || "";
      $("#p-cp").value = MOI.code_postal || "";
      $("#p-ville").value = MOI.ville || "";
      majPays();
    }

    function majPays() {
      var modele = IDENTIFIANT[selPays.value] || IDENTIFIANT.BE;
      $("#p-l-identifiant").textContent = modele.label;
      $("#p-aide-identifiant").textContent = modele.aide;
    }
    selPays.addEventListener("change", majPays);

    $("#b-profil-annuler").addEventListener("click", function () {
      remplirProfil();
      taire($("#msg-profil"));
    });

    formProfil.addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("#msg-profil");
      taire(zone);
      var b = $("#b-profil");
      b.disabled = true;
      b.textContent = "Enregistrement…";

      envoyer("/api/profil", {
        pays: selPays.value,
        societe: $("#p-societe").value.trim(),
        identifiant: $("#p-identifiant").value.trim(),
        prenom: $("#p-prenom").value.trim(),
        nom: $("#p-nom").value.trim(),
        telephone: $("#p-tel").value.trim(),
        adresse: $("#p-adresse").value.trim(),
        code_postal: $("#p-cp").value.trim(),
        ville: $("#p-ville").value.trim(),
      }).then(function (r) {
        b.disabled = false;
        b.textContent = "Enregistrer";
        if (!r.ok) { dire(zone, r.donnees.erreur || "L'enregistrement a échoué."); return; }

        dire(zone, r.donnees.avertissement || "Vos coordonnées sont à jour.",
             r.donnees.avertissement ? "erreur" : "succes");

        // On relit le compte plutôt que de recopier ce qu'on vient d'envoyer :
        // c'est le serveur qui a le dernier mot, notamment sur le numéro de
        // TVA reconstitué pour la France.
        return fetch("/api/moi", { headers: { accept: "application/json" }, credentials: "same-origin" })
          .then(function (x) { return x.json(); })
          .then(function (d) {
            if (d.connecte) { MOI = d.compte; remplirEntete(); remplirApercu(); remplirProfil(); }
          });
      }).catch(function () {
        b.disabled = false;
        b.textContent = "Enregistrer";
        dire(zone, "Connexion au serveur impossible. Réessayez.");
      });
    });

    /* ---- adresse de connexion ---- */

    $("#form-email").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("#msg-email");
      taire(zone);
      var b = $("#b-email");
      b.disabled = true;
      b.textContent = "Changement…";

      envoyer("/api/email", {
        email: $("#e-email").value.trim(),
        motdepasse: $("#e-mdp").value,
      }).then(function (r) {
        b.disabled = false;
        b.textContent = "Changer l'adresse";
        if (!r.ok) { dire(zone, r.donnees.erreur || "Le changement a échoué."); return; }
        MOI.email = r.donnees.email;
        remplirEntete();
        remplirApercu();
        $("#e-email").value = "";
        $("#e-mdp").value = "";
        dire(zone, "Votre adresse de connexion est désormais " + r.donnees.email + ".", "succes");
      }).catch(function () {
        b.disabled = false;
        b.textContent = "Changer l'adresse";
        dire(zone, "Connexion au serveur impossible. Réessayez.");
      });
    });

    /* ---- mot de passe ---- */

    $("#form-mdp").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("#msg-mdp");
      taire(zone);

      var nouveau = $("#m-nouveau").value;
      if (nouveau !== $("#m-confirme").value) {
        dire(zone, "Les deux nouveaux mots de passe ne correspondent pas.");
        return;
      }

      var b = $("#b-mdp");
      b.disabled = true;
      b.textContent = "Changement…";

      envoyer("/api/motdepasse", {
        actuel: $("#m-actuel").value,
        nouveau: nouveau,
      }).then(function (r) {
        b.disabled = false;
        b.textContent = "Changer le mot de passe";
        if (!r.ok) { dire(zone, r.donnees.erreur || "Le changement a échoué."); return; }
        $("#m-actuel").value = "";
        $("#m-nouveau").value = "";
        $("#m-confirme").value = "";
        dire(zone, "Mot de passe changé. Les autres appareils ont été déconnectés.", "succes");
      }).catch(function () {
        b.disabled = false;
        b.textContent = "Changer le mot de passe";
        dire(zone, "Connexion au serveur impossible. Réessayez.");
      });
    });

    /* ---- commandes ---- */

    function chargerCommandes() {
      var zone = $("#commandes");
      fetch("/api/commandes", { headers: { accept: "application/json" }, credentials: "same-origin" })
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
      fetch("/api/deconnexion", { method: "POST", credentials: "same-origin" })
        .then(function () { location.href = "/"; })
        .catch(function () { location.href = "/"; });
    });
  }
})();
