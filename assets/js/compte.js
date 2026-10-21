/* ==========================================================================
   COMPTE — le navigateur côté client : formulaires, session, espace.
   Un seul fichier sert les quatre pages de l'espace professionnel ; chacune
   n'active que ce qui la concerne, selon les éléments présents dans son HTML.

   Les textes ne sont pas écrits ici : ils viennent de compte-langues.js,
   chargé juste avant. Ce fichier ne contient que de la logique.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };

  /* ── langue ───────────────────────────────────────────────────────── */

  var LANGS = ["fr", "en", "nl", "de", "tr"];
  var CLE_LANGUE = "nishman-lang";

  var LANG = (function () {
    try {
      var l = localStorage.getItem(CLE_LANGUE);
      if (LANGS.indexOf(l) !== -1) return l;
    } catch (x) {}
    return "fr";
  })();

  var TOUT = window.NISHMAN_LANGUES || {};
  var T = TOUT[LANG] || TOUT.fr || {};
  var FR = TOUT.fr || {};

  // Une clé oubliée dans une langue retombe sur le français plutôt que sur
  // du vide : une page incomplète reste lisible.
  function t(cle) {
    if (T[cle] != null) return T[cle];
    if (FR[cle] != null) return FR[cle];
    return "";
  }

  function remplir(texte, valeurs) {
    return String(texte).replace(/\{(\w+)\}/g, function (tout, cle) {
      return valeurs && valeurs[cle] != null ? valeurs[cle] : tout;
    });
  }

  // Le serveur renvoie son message en français ET un code. On préfère la
  // traduction ; faute de code connu, le message français passe quand même,
  // ce qui vaut toujours mieux qu'un écran muet.
  function messageServeur(donnees, parDefaut) {
    if (!donnees) return parDefaut || "";
    var table = T.erreurs || FR.erreurs || {};
    var texte = table[donnees.code];
    if (texte) return remplir(texte, donnees);
    return donnees.erreur || donnees.message || parDefaut || "";
  }

  /* ── application des textes au HTML ───────────────────────────────── */

  function appliquerLangue() {
    document.documentElement.setAttribute("lang", LANG);

    var noeuds = document.querySelectorAll("[data-t]");
    for (var i = 0; i < noeuds.length; i++) {
      var texte = t(noeuds[i].getAttribute("data-t"));
      if (texte) noeuds[i].textContent = texte;
    }
    // Quelques textes contiennent un retour à la ligne volontaire.
    var html = document.querySelectorAll("[data-t-html]");
    for (var j = 0; j < html.length; j++) {
      var h = t(html[j].getAttribute("data-t-html"));
      if (h) html[j].innerHTML = h;
    }
    var aria = document.querySelectorAll("[data-t-aria]");
    for (var a = 0; a < aria.length; a++) {
      var et = t(aria[a].getAttribute("data-t-aria"));
      if (et) aria[a].setAttribute("aria-label", et);
    }
    var metas = document.querySelectorAll("meta[data-t-contenu]");
    for (var k = 0; k < metas.length; k++) {
      var c = t(metas[k].getAttribute("data-t-contenu"));
      if (c) metas[k].setAttribute("content", c);
    }
  }

  function brancherChoixLangue() {
    var boutons = document.querySelectorAll("[data-langue]");
    for (var i = 0; i < boutons.length; i++) {
      var b = boutons[i];
      b.setAttribute("aria-pressed", String(b.getAttribute("data-langue") === LANG));
      b.addEventListener("click", function () {
        var choisie = this.getAttribute("data-langue");
        if (choisie === LANG) return;
        try { localStorage.setItem(CLE_LANGUE, choisie); } catch (x) {}
        // Une partie des textes est posée par ce script au chargement :
        // on recharge plutôt que de tout repeindre à la main.
        location.reload();
      });
    }
  }

  appliquerLangue();
  brancherChoixLangue();

  /* ── outils ───────────────────────────────────────────────────────── */

  function echappe(txt) {
    return String(txt == null ? "" : txt)
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
    try {
      return d.toLocaleDateString(t("locale") || "fr-BE",
        { day: "2-digit", month: "short", year: "numeric" });
    } catch (x) {
      return String(iso).slice(0, 10);
    }
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

  // Ce que l'on demande dépend du pays : un coiffeur français connaît son
  // SIRET et presque jamais son numéro intracommunautaire, qui sera
  // reconstitué à partir du SIREN côté serveur.
  function modelesIdentifiant() {
    return {
      BE: { label: t("id_BE_label"), aide: t("id_BE_aide") },
      FR: { label: t("id_FR_label"), aide: t("id_FR_aide") },
      LU: { label: t("id_LU_label"), aide: t("id_LU_aide") },
    };
  }

  function nomsPays() {
    return { BE: t("pays_BE"), FR: t("pays_FR"), LU: t("pays_LU") };
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
      bouton.textContent = t("b_connexion_cours");

      function rendreBouton() {
        bouton.disabled = false;
        bouton.textContent = t("b_connexion");
      }

      envoyer("/api/connexion", {
        email: $("#c-email").value.trim(),
        motdepasse: $("#c-mdp").value,
      }).then(function (r) {
        if (r.ok) { location.href = "/pro/compte/"; return; }
        dire(messageServeur(r.donnees, t("echec_connexion")));
        rendreBouton();
      }).catch(function () {
        dire(t("serveur"));
        rendreBouton();
      });
    });

    var IDENTIFIANT = modelesIdentifiant();
    var selPays = $("#i-pays");
    var blocInscription = $("#bloc-inscription");

    function majPays() {
      var modele = IDENTIFIANT[selPays.value];
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

      if (!selPays.value) { dire(t("pays_dabord")); return; }

      var bouton = $("#b-inscription");
      bouton.disabled = true;
      bouton.textContent = t("b_inscription_cours");

      function rendreBouton() {
        bouton.disabled = false;
        bouton.textContent = t("b_inscription");
      }

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
          // On transmet le code, pas la phrase : la page de compte le rendra
          // dans la langue qui y est choisie.
          if (r.donnees.avertissement) {
            try {
              sessionStorage.setItem("nishman-avis", JSON.stringify({
                code: r.donnees.avertissement_code || "",
                texte: r.donnees.avertissement,
              }));
            } catch (x) {}
          }
          location.href = "/pro/compte/";
          return;
        }
        dire(messageServeur(r.donnees, t("echec_inscription")));
        rendreBouton();
      }).catch(function () {
        dire(t("serveur"));
        rendreBouton();
      });
    });
  }

  /* ── mot de passe oublié : demande du lien ────────────────────────── */

  var formOubli = $("#form-oubli");

  if (formOubli) {
    var msgOubli = $("#message");

    formOubli.addEventListener("submit", function (e) {
      e.preventDefault();
      msgOubli.className = "message";
      var b = $("#b-oubli");
      b.disabled = true;
      b.textContent = t("b_oubli_cours");

      envoyer("/api/oubli", { email: $("#o-email").value.trim() })
        .then(function (r) {
          b.disabled = false;
          b.textContent = t("b_oubli");
          if (!r.ok) {
            msgOubli.textContent = messageServeur(r.donnees, t("echec_envoi"));
            msgOubli.className = "message on erreur";
            return;
          }
          // Le message est le même que l'adresse existe ou non : le serveur
          // ne dit pas qui est client, et la page ne le trahit pas non plus.
          msgOubli.textContent = messageServeur(r.donnees);
          msgOubli.className = "message on succes";
          formOubli.hidden = true;
        })
        .catch(function () {
          b.disabled = false;
          b.textContent = t("b_oubli");
          msgOubli.textContent = t("serveur");
          msgOubli.className = "message on erreur";
        });
    });
  }

  /* ── mot de passe oublié : nouveau mot de passe ───────────────────── */

  var formReinit = $("#form-reinit");

  if (formReinit) {
    var msgReinit = $("#message");
    var jeton = new URLSearchParams(location.search).get("j") || "";

    if (!jeton) {
      msgReinit.textContent = t("lien_incomplet_page");
      msgReinit.className = "message on erreur";
      formReinit.hidden = true;
    }

    formReinit.addEventListener("submit", function (e) {
      e.preventDefault();
      msgReinit.className = "message";

      var mdp = $("#r-mdp").value;
      if (mdp !== $("#r-confirme").value) {
        msgReinit.textContent = t("mdp_differents");
        msgReinit.className = "message on erreur";
        return;
      }

      var b = $("#b-reinit");
      b.disabled = true;
      b.textContent = t("b_enregistrer_cours");

      envoyer("/api/reinitialiser", { jeton: jeton, motdepasse: mdp })
        .then(function (r) {
          if (r.ok) {
            msgReinit.textContent = t("mdp_enregistre");
            msgReinit.className = "message on succes";
            formReinit.hidden = true;
            setTimeout(function () { location.href = "/pro/connexion/"; }, 2500);
            return;
          }
          b.disabled = false;
          b.textContent = t("b_enregistrer");
          msgReinit.textContent = messageServeur(r.donnees, t("echec_enregistrement"));
          msgReinit.className = "message on erreur";
        })
        .catch(function () {
          b.disabled = false;
          b.textContent = t("b_enregistrer");
          msgReinit.textContent = t("serveur");
          msgReinit.className = "message on erreur";
        });
    });
  }

  /* ── espace du compte ─────────────────────────────────────────────── */

  var espace = $("#espace");

  if (espace) {
    var MOI = null;
    var PAYS = nomsPays();
    var MODELES = modelesIdentifiant();

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
        var brut = sessionStorage.getItem("nishman-avis");
        if (brut) {
          sessionStorage.removeItem("nishman-avis");
          var avis;
          try { avis = JSON.parse(brut); } catch (y) { avis = { texte: brut }; }
          dire($("#msg-profil"), messageServeur({
            code: avis.code, erreur: avis.texte,
          }), "erreur");
          montrerVue("coordonnees");
        }
      } catch (x) {}
    }

    function remplirApercu() {
      var c = MOI;
      var etiquette = c.tva_valide
        ? ' <span class="etiquette vert">' + echappe(t("etiq_verifie")) + "</span>"
        : ' <span class="etiquette gris">' + echappe(t("etiq_a_verifier")) + "</span>";

      var html =
        paire(t("a_societe"), echappe(c.salon)) +
        paire(t("a_responsable"),
              echappe([c.prenom, c.nom].filter(Boolean).join(" ")) || "—") +
        paire(t("a_pays"), echappe(PAYS[c.pays] || c.pays || "—"));

      if (c.siret) html += paire(t("a_siret"), echappe(c.siret));
      html += paire(t("a_tva"), c.tva
        ? echappe(c.tva) + etiquette
        : '<span class="etiquette gris">' + echappe(t("etiq_a_renseigner")) + "</span>");

      var adresse = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(" ")]
        .filter(Boolean).join(", ");
      html += paire(t("a_adresse"), echappe(adresse) || "—") +
              paire(t("a_tel"), echappe(c.telephone) || "—") +
              paire(t("a_email"), echappe(c.email)) +
              paire(t("a_cree"), dateCourte(c.depuis));

      $("#infos").innerHTML = html;
    }

    function paire(terme, valeur) {
      return '<div class="paire"><dt>' + echappe(terme) + "</dt><dd>" + valeur + "</dd></div>";
    }

    /* ---- messages ---- */

    function dire(zone, texte, genre) {
      zone.textContent = texte;
      zone.className = "message on " + (genre || "erreur");
    }
    function taire(zone) { zone.className = "message"; }

    /* ---- coordonnées ---- */

    var formProfil = $("#form-profil");
    var selPaysProfil = $("#p-pays");

    function remplirProfil() {
      selPaysProfil.value = MOI.pays || "BE";
      $("#p-societe").value = MOI.salon || "";
      $("#p-identifiant").value = MOI.pays === "FR" ? (MOI.siret || "")
                                                    : (MOI.tva || "").replace(/^[A-Z]{2}/, "");
      $("#p-prenom").value = MOI.prenom || "";
      $("#p-nom").value = MOI.nom || "";
      $("#p-tel").value = MOI.telephone || "";
      $("#p-adresse").value = MOI.adresse || "";
      $("#p-cp").value = MOI.code_postal || "";
      $("#p-ville").value = MOI.ville || "";
      majPaysProfil();
    }

    function majPaysProfil() {
      var modele = MODELES[selPaysProfil.value] || MODELES.BE;
      $("#p-l-identifiant").textContent = modele.label;
      $("#p-aide-identifiant").textContent = modele.aide;
    }
    selPaysProfil.addEventListener("change", majPaysProfil);

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
      b.textContent = t("b_enregistrer_cours");

      envoyer("/api/profil", {
        pays: selPaysProfil.value,
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
        b.textContent = t("b_enregistrer");
        if (!r.ok) {
          dire(zone, messageServeur(r.donnees, t("echec_enregistrement")));
          return;
        }

        var avis = r.donnees.avertissement
          ? messageServeur({ code: r.donnees.avertissement_code,
                             erreur: r.donnees.avertissement })
          : "";
        dire(zone, avis || t("profil_ok"), avis ? "erreur" : "succes");

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
        b.textContent = t("b_enregistrer");
        dire(zone, t("serveur"));
      });
    });

    /* ---- adresse de connexion ---- */

    $("#form-email").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("#msg-email");
      taire(zone);
      var b = $("#b-email");
      b.disabled = true;
      b.textContent = t("b_changement_cours");

      envoyer("/api/email", {
        email: $("#e-email").value.trim(),
        motdepasse: $("#e-mdp").value,
      }).then(function (r) {
        b.disabled = false;
        b.textContent = t("b_changer_email");
        if (!r.ok) {
          dire(zone, messageServeur(r.donnees, t("echec_changement")));
          return;
        }
        MOI.email = r.donnees.email;
        remplirEntete();
        remplirApercu();
        $("#e-email").value = "";
        $("#e-mdp").value = "";
        dire(zone, remplir(t("email_ok"), { email: r.donnees.email }), "succes");
      }).catch(function () {
        b.disabled = false;
        b.textContent = t("b_changer_email");
        dire(zone, t("serveur"));
      });
    });

    /* ---- mot de passe ---- */

    $("#form-mdp").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("#msg-mdp");
      taire(zone);

      var nouveau = $("#m-nouveau").value;
      if (nouveau !== $("#m-confirme").value) {
        dire(zone, t("mdp_differents_nouveaux"));
        return;
      }

      var b = $("#b-mdp");
      b.disabled = true;
      b.textContent = t("b_changement_cours");

      envoyer("/api/motdepasse", {
        actuel: $("#m-actuel").value,
        nouveau: nouveau,
      }).then(function (r) {
        b.disabled = false;
        b.textContent = t("b_changer_mdp");
        if (!r.ok) {
          dire(zone, messageServeur(r.donnees, t("echec_changement")));
          return;
        }
        $("#m-actuel").value = "";
        $("#m-nouveau").value = "";
        $("#m-confirme").value = "";
        dire(zone, t("mdp_change"), "succes");
      }).catch(function () {
        b.disabled = false;
        b.textContent = t("b_changer_mdp");
        dire(zone, t("serveur"));
      });
    });

    /* ---- commandes ---- */

    function chargerCommandes() {
      var zone = $("#commandes");
      fetch("/api/commandes", { headers: { accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.pret)     { zone.innerHTML = vide(t("cmd_pas_prete")); return; }
          if (d.inconnu)   { zone.innerHTML = vide(t("cmd_inconnu"));   return; }
          if (!d.commandes.length) { zone.innerHTML = vide(t("cmd_vide")); return; }
          zone.innerHTML = tableau(d.commandes);
        })
        .catch(function () { zone.innerHTML = vide(t("cmd_echec")); });
    }

    // Ces trois messages contiennent un <br /> voulu : ils viennent de la
    // table des langues, pas d'une saisie, et ne sont donc pas échappés.
    function vide(texte) { return '<p class="vide">' + texte + "</p>"; }

    function tableau(lignes) {
      var html = '<table class="table-cmd"><thead><tr>' +
        "<th>" + echappe(t("t_reference")) + "</th>" +
        "<th>" + echappe(t("t_date")) + "</th>" +
        "<th>" + echappe(t("t_etat")) + "</th>" +
        '<th class="nombre">' + echappe(t("t_total")) + "</th>" +
        "</tr></thead><tbody>";

      for (var i = 0; i < lignes.length; i++) {
        var c = lignes[i];
        // L'état arrive d'Odoo sous forme de code ; le texte français qui
        // l'accompagne ne sert que si la langue ne connaît pas ce code.
        var etat = (T.etats || {})[c.etat_code] || c.etat || "";
        var ouvrable = c.id != null;

        html += "<tr" +
          (ouvrable
            ? ' class="cmd-ouvrable" data-id="' + echappe(c.id) + '"' +
              ' tabindex="0" role="button" aria-expanded="false"' +
              ' title="' + echappe(t("det_voir")) + '"'
            : "") +
          "><td>" + echappe(c.reference) + "</td>" +
          "<td>" + dateCourte(c.date) + "</td>" +
          "<td>" + echappe(etat) + "</td>" +
          '<td class="nombre">' + euros(c.total_ht) + "</td></tr>";

        if (ouvrable) {
          html += '<tr class="cmd-detail" data-detail="' + echappe(c.id) +
                  '" hidden><td colspan="4"></td></tr>';
        }
      }
      return html + "</tbody></table>";
    }

    /* ---- le détail d'une commande ---- */

    // La zone, elle, ne change jamais : on écoute sur elle plutôt que sur
    // des lignes qui sont réécrites à chaque chargement.
    var zoneCmd = $("#commandes");

    zoneCmd.addEventListener("click", function (e) {
      var tr = e.target.closest("tr.cmd-ouvrable");
      if (tr) basculerDetail(tr);
    });

    // Une ligne qui se déplie à la souris doit se déplier au clavier.
    zoneCmd.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      var tr = e.target.closest ? e.target.closest("tr.cmd-ouvrable") : null;
      if (!tr) return;
      e.preventDefault();
      basculerDetail(tr);
    });

    function basculerDetail(tr) {
      var id = tr.getAttribute("data-id");
      var det = zoneCmd.querySelector('tr.cmd-detail[data-detail="' + id + '"]');
      if (!det) return;

      if (!det.hidden) {
        det.hidden = true;
        tr.setAttribute("aria-expanded", "false");
        return;
      }
      det.hidden = false;
      tr.setAttribute("aria-expanded", "true");

      // Une commande déjà lue ne se redemande pas : son contenu ne bouge plus.
      if (det.getAttribute("data-charge")) return;

      var cellule = det.firstElementChild;
      cellule.innerHTML = note(t("det_chargement"));

      fetch("/api/commande?id=" + encodeURIComponent(id), {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.pret || !d.lignes) {
            cellule.innerHTML = note(messageServeur(d, t("det_echec")));
            return;
          }
          if (!d.lignes.length) {
            cellule.innerHTML = note(t("det_vide"));
            return;
          }
          cellule.innerHTML = detail(d.lignes);
          det.setAttribute("data-charge", "1");
        })
        .catch(function () { cellule.innerHTML = note(t("det_echec")); });
    }

    function note(texte) {
      return '<p class="det-note">' + echappe(texte) + "</p>";
    }

    // Deux décimales au plus, et pas de « 2,00 » là où « 2 » suffit.
    function nombre(n) {
      if (n == null || isNaN(n)) return "—";
      return String(Math.round(Number(n) * 100) / 100).replace(".", ",");
    }

    function detail(lignes) {
      var html = '<table class="table-det"><thead><tr>' +
        "<th>" + echappe(t("det_produit")) + "</th>" +
        '<th class="nombre">' + echappe(t("det_quantite")) + "</th>" +
        '<th class="nombre">' + echappe(t("det_pu")) + "</th>" +
        '<th class="nombre">' + echappe(t("det_remise")) + "</th>" +
        '<th class="nombre">' + echappe(t("det_total")) + "</th>" +
        "</tr></thead><tbody>";

      for (var i = 0; i < lignes.length; i++) {
        var l = lignes[i];
        html += "<tr><td>" + echappe(l.designation) + "</td>" +
          '<td class="nombre">' + nombre(l.quantite) + "</td>" +
          '<td class="nombre">' + euros(l.prix_unitaire) + "</td>" +
          '<td class="nombre">' + (l.remise ? nombre(l.remise) + " %" : "—") + "</td>" +
          '<td class="nombre">' + euros(l.total) + "</td></tr>";
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
