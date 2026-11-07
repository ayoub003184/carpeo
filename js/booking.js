(function () {
  var euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var STAINS = ["Nourriture", "Boisson", "Graisse", "Encre", "Urine", "Sang", "Taches organiques", "Odeurs", "Autre"];
  var AGES = ["Moins de 24 heures", "Quelques jours", "Quelques semaines", "Plusieurs mois", "Inconnue"];
  var HEARD = ["Instagram", "Facebook", "TikTok", "Google", "Publicité en ligne", "Recommandation", "Autre"];

  function priceOf(item) {
    if (item.cat === "canape") {
      var places = item.places;
      if (item.config === "angle" || item.config === "meridienne") {
        if (places === "2") return 119;
        if (places === "3") return 139;
        return null;
      }
      if (places === "2") return 89;
      if (places === "3") return 99;
      return null;
    }
    if (item.cat === "matelas") {
      var unit = item.faces === "2" ? 89 : 79;
      return unit * (parseInt(item.qty, 10) || 1);
    }
    if (item.cat === "fauteuil") return 49 * (parseInt(item.qty, 10) || 1);
    if (item.cat === "chaise") {
      var q = parseInt(item.qty, 10) || 1;
      return Math.floor(q / 6) * 90 + (q % 6) * 25;
    }
    return null;
  }

  function needsQuote(item) {
    return item.cat === "tapis" || item.cat === "moquette" || item.cat === "coussin" || item.cat === "autre" || priceOf(item) == null;
  }

  function area(item) {
    var L = parseFloat(String(item.length || "").replace(",", "."));
    var W = parseFloat(String(item.width || "").replace(",", "."));
    if (item.surface) {
      var s = parseFloat(String(item.surface).replace(",", "."));
      if (!isNaN(s)) return s;
    }
    if (!isNaN(L) && !isNaN(W)) return Math.round(L * W * 100) / 100;
    return null;
  }

  function blank() {
    return { cat: "canape", places: "3", config: "droit", matiere: "", qty: "1", faces: "1", length: "", width: "", surface: "", size: "", desc: "", stain: "", stainCount: "", age: "", odor: "non", use: "", caution: "" };
  }

  var state = { items: [blank()], step: 0, slot: "", files: {} };

  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function field(label, inner, id) {
    return '<div><label for="' + id + '">' + label + '</label>' + inner + '</div>';
  }

  function itemCard(item, index) {
    var cat = '<select id="cat-' + index + '" data-k="cat">' +
      [["canape", "Canapé ou sofa"], ["matelas", "Matelas"], ["fauteuil", "Fauteuil"], ["chaise", "Chaise rembourrée"], ["tapis", "Tapis"], ["moquette", "Moquette"], ["coussin", "Coussins"], ["autre", "Autre textile"]]
        .map(function (o) { return '<option value="' + o[0] + '"' + (item.cat === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
      "</select>";
    var extra = "";
    if (item.cat === "canape") {
      extra += field("Nombre de places", '<select id="places-' + index + '" data-k="places"><option value="2"' + (item.places === "2" ? " selected" : "") + '>2 places</option><option value="3"' + (item.places === "3" ? " selected" : "") + '>3 places</option></select>', "places-" + index);
      extra += field("Configuration", '<select id="config-' + index + '" data-k="config"><option value="droit">Droit</option><option value="angle"' + (item.config === "angle" ? " selected" : "") + '>Angle</option><option value="meridienne"' + (item.config === "meridienne" ? " selected" : "") + '>Méridienne</option><option value="autre"' + (item.config === "autre" ? " selected" : "") + '>Autre</option></select>', "config-" + index);
      extra += field("Revêtement, si connu", '<input id="mat-' + index + '" data-k="matiere" value="' + esc(item.matiere) + '" placeholder="Tissu, velours, cuir…">', "mat-" + index);
    }
    if (item.cat === "matelas") {
      extra += field("Quantité", '<input id="qty-' + index + '" data-k="qty" type="number" min="1" value="' + item.qty + '">', "qty-" + index);
      extra += field("Faces à nettoyer", '<select id="faces-' + index + '" data-k="faces"><option value="1">Une face — 79 €</option><option value="2"' + (item.faces === "2" ? " selected" : "") + '>Deux faces — 89 €</option></select>', "faces-" + index);
      extra += field("Dimensions", '<input id="size-' + index + '" data-k="size" value="' + esc(item.size) + '" placeholder="140 × 190, 160 × 200…">', "size-" + index);
    }
    if (item.cat === "fauteuil" || item.cat === "chaise" || item.cat === "coussin") {
      extra += field("Quantité", '<input id="qty-' + index + '" data-k="qty" type="number" min="1" value="' + item.qty + '">', "qty-" + index);
      extra += field(item.cat === "coussin" ? "Taille approximative" : "Revêtement ou particularité", '<input id="mat-' + index + '" data-k="matiere" value="' + esc(item.matiere) + '">', "mat-" + index);
    }
    if (item.cat === "tapis" || item.cat === "moquette") {
      var m2 = area(item);
      extra += field("Longueur (m)", '<input id="len-' + index + '" data-k="length" inputmode="decimal" value="' + esc(item.length) + '">', "len-" + index);
      extra += field("Largeur (m)", '<input id="wid-' + index + '" data-k="width" inputmode="decimal" value="' + esc(item.width) + '">', "wid-" + index);
      extra += field("Ou surface directe (m²)", '<input id="surf-' + index + '" data-k="surface" inputmode="decimal" value="' + esc(item.surface) + '">', "surf-" + index);
      extra += '<p class="note">Surface retenue : ' + (m2 == null ? "à compléter" : m2.toLocaleString("fr-FR") + " m²") + ". Le prix au m² n'est pas encore fixé : ce textile part en devis. Indication tapis : à partir de 39 €.</p>";
    }
    if (item.cat === "autre") {
      extra += field("Description", '<input id="desc-' + index + '" data-k="desc" value="' + esc(item.desc) + '">', "desc-" + index);
      extra += field("Quantité", '<input id="qty-' + index + '" data-k="qty" type="number" min="1" value="' + item.qty + '">', "qty-" + index);
    }
    var stains = STAINS.map(function (s) {
      return '<option' + (item.stain === s ? " selected" : "") + ">" + s + "</option>";
    }).join("");
    var ages = AGES.map(function (s) {
      return '<option' + (item.age === s ? " selected" : "") + ">" + s + "</option>";
    }).join("");
    extra += field("Nature des taches", '<select id="stain-' + index + '" data-k="stain"><option value="">Non précisé</option>' + stains + "</select>", "stain-" + index);
    extra += field("Nombre approximatif", '<input id="sc-' + index + '" data-k="stainCount" value="' + esc(item.stainCount) + '">', "sc-" + index);
    extra += field("Ancienneté", '<select id="age-' + index + '" data-k="age"><option value="">Non précisé</option>' + ages + "</select>", "age-" + index);
    extra += field("Odeurs persistantes", '<select id="odor-' + index + '" data-k="odor"><option value="non">Non</option><option value="oui"' + (item.odor === "oui" ? " selected" : "") + ">Oui</option></select>", "odor-" + index);
    extra += '<p class="note">Certaines taches anciennes, ou qui ont déjà altéré les fibres, peuvent ne pas disparaître totalement.</p>';
    extra += '<label for="ph-' + index + '">Photos (vue d\'ensemble, taches, étiquette). JPG, PNG ou WebP, 5 Mo max, 4 fichiers.</label>';
    extra += '<input id="ph-' + index + '" type="file" accept="image/jpeg,image/png,image/webp" multiple data-photos="' + index + '">';
    extra += '<div class="previews" id="prev-' + index + '"></div>';
    return '<article class="panel item-card" data-index="' + index + '"><div class="item-top"><h3>Textile ' + (index + 1) + '</h3>' +
      (state.items.length > 1 ? '<button type="button" class="mini" data-remove="' + index + '">Retirer</button>' : "") +
      "</div>" + field("Catégorie", cat, "cat-" + index) + extra + "</article>";
  }

  function readItems() {
    document.querySelectorAll(".item-card").forEach(function (card) {
      var i = parseInt(card.getAttribute("data-index"), 10);
      card.querySelectorAll("[data-k]").forEach(function (input) {
        state.items[i][input.getAttribute("data-k")] = input.value;
      });
    });
  }

  function showPreviews() {
    Object.keys(state.files).forEach(function (i) {
      var box = document.getElementById("prev-" + i);
      if (!box) return;
      box.innerHTML = "";
      (state.files[i] || []).forEach(function (file) {
        var img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.alt = "Aperçu : " + file.name;
        box.appendChild(img);
      });
    });
  }

  function quoteMode() {
    return state.items.some(needsQuote);
  }

  function total() {
    return state.items.reduce(function (sum, item) {
      var p = priceOf(item);
      return sum + (p || 0);
    }, 0);
  }

  function steps() {
    var q = quoteMode();
    return q
      ? ["Textiles", "Coordonnées", "Envoi du devis"]
      : ["Textiles", "Coordonnées", "Créneau", "Acompte"];
  }

  function render() {
    var root = document.getElementById("booking");
    if (!root) return;
    var names = steps();
    var html = '<div class="stepper">' + names.map(function (n, i) {
      return '<span class="' + (i === state.step ? "is-on" : "") + '">' + (i + 1) + ". " + n + "</span>";
    }).join("") + "</div>";

    if (state.step === 0) {
      html += state.items.map(itemCard).join("");
      html += '<button type="button" class="btn btn-ghost" id="add-item">Ajouter un textile</button>';
      html += '<div class="btn-row"><button type="button" class="btn btn-ocean" id="next">Continuer</button></div>';
      html += '<p class="note">Canapés, matelas, fauteuils et chaises ont un prix ferme. Tapis, moquettes, coussins et textiles atypiques partent en demande de devis. Si un seul article est sur devis, tout le dossier le devient.</p>';
    }

    if (state.step === 1) {
      html += '<div class="panel"><div class="grid-2">' +
        field("Nom", '<input id="nom" required autocomplete="family-name">', "nom") +
        field("Prénom", '<input id="prenom" required autocomplete="given-name">', "prenom") +
        field("E-mail", '<input id="email" type="email" required autocomplete="email">', "email") +
        field("Téléphone", '<input id="tel" type="tel" required autocomplete="tel">', "tel") +
        "</div>" +
        field("Adresse d'intervention", '<input id="adresse" required autocomplete="street-address">', "adresse") +
        '<div class="grid-2">' +
        field("Code postal", '<input id="cp" required inputmode="numeric" autocomplete="postal-code">', "cp") +
        field("Ville", '<input id="ville" required autocomplete="address-level2">', "ville") +
        "</div>" +
        field("Complément, étage, ascenseur", '<input id="compl">', "compl") +
        field("Instructions d'accès", '<input id="acces">', "acces") +
        field("Comment avez-vous connu CARPEO ?", '<select id="heard">' + HEARD.map(function (h) { return "<option>" + h + "</option>"; }).join("") + "</select>", "heard") +
        '<label><input type="checkbox" id="rgpd" style="width:auto"> J\'ai lu la <a href="confidentialite.html">politique de confidentialité</a>. Mes informations servent à traiter cette demande.</label>' +
        '<p class="field-error" id="coord-error" hidden>Indiquez les champs obligatoires et acceptez l\'information sur vos données.</p>' +
        "</div>";
      html += '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="next">Continuer</button></div>';
    }

    if (!quoteMode() && state.step === 2) {
      html += '<div class="panel"><h3>Créneaux indicatifs</h3><p class="note">Données de démonstration. Un créneau choisi est réservé 15 minutes dans ce navigateur, le temps de passer à l\'acompte.</p><div id="days"></div></div>';
      html += '<p class="field-error" id="slot-error" hidden>Choisissez un créneau libre.</p>';
      html += '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="next">Voir le prix</button></div>';
    }

    if ((!quoteMode() && state.step === 3) || (quoteMode() && state.step === 2)) {
      html += summaryHtml();
    }

    root.innerHTML = html;
    bind();
    showPreviews();
    if (!quoteMode() && state.step === 2) renderCalendar();
  }

  function summaryHtml() {
    var q = quoteMode();
    var t = total();
    var deposit = Math.round(t * 50) / 100;
    var rest = Math.round((t - deposit) * 100) / 100;
    var lines = state.items.map(function (item, i) {
      var p = priceOf(item);
      return "<li>Textile " + (i + 1) + " — " + item.cat + (p == null ? " — devis" : " — " + euro.format(p)) + "</li>";
    }).join("");
    var money = q
      ? '<p>Ce dossier demande une estimation. Aucun paiement n\'est demandé maintenant. Pour un tapis, l\'indication commence à 39 €, sans que ce montant soit un prix ferme.</p>'
      : '<dl class="summary"><dt>Total</dt><dd>' + euro.format(t) + '</dd><dt>Acompte 50 %</dt><dd>' + euro.format(deposit) + '</dd><dt>Reste à payer le jour de l\'intervention</dt><dd>' + euro.format(rest) + '</dd></dl>' +
        '<div class="stripe-box"><strong>Paiement Stripe</strong><p>Écran préparé pour Stripe. Aucune carte n\'est demandée et aucun débit n\'est fait tant que les clés Stripe ne sont pas connectées.</p><p class="note">Créneau : ' + (state.slot || "—") + ". Réservation temporaire : 15 minutes.</p></div>" +
        '<label><input type="checkbox" id="cgv" style="width:auto"> J\'accepte les <a href="cgv.html">conditions</a>, y compris l\'affichage de l\'acompte avant paiement. Le texte définitif des annulations reste à valider juridiquement.</label>' +
        '<p class="field-error" id="pay-error" hidden>Acceptez les conditions pour continuer la simulation.</p>';
    return '<div class="panel"><h3>' + (q ? "Votre demande de devis" : "Récapitulatif") + '</h3><ul>' + lines + "</ul>" + money +
      '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="confirm">' +
      (q ? "Envoyer la demande" : "Simuler le paiement de l'acompte") + "</button></div></div>";
  }

  function renderCalendar() {
    var host = document.getElementById("days");
    if (!host) return;
    var now = new Date();
    var html = "";
    for (var d = 1; d <= 12; d++) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      if (day.getDay() === 0) continue;
      var label = day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      var iso = day.getFullYear() + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0");
      html += "<p><strong>" + label + "</strong></p><div class='slots'>";
      ["08:30", "10:30", "13:30", "15:30"].forEach(function (time) {
        var id = iso + " " + time;
        var blocked = (day.getDate() + time.charCodeAt(0)) % 5 === 0;
        var pressed = state.slot === id;
        html += '<button type="button" class="slot" data-slot="' + id + '" aria-pressed="' + pressed + '"' + (blocked ? " disabled" : "") + ">" + time + (blocked ? " indisponible" : "") + "</button>";
      });
      html += "</div>";
    }
    host.innerHTML = html;
    host.querySelectorAll("[data-slot]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.slot = b.getAttribute("data-slot");
        sessionStorage.setItem("carpeo-hold", JSON.stringify({ slot: state.slot, until: Date.now() + 15 * 60 * 1000 }));
        renderCalendar();
      });
    });
  }

  function customer() {
    return {
      nom: val("nom"), prenom: val("prenom"), email: val("email"), tel: val("tel"),
      adresse: val("adresse"), cp: val("cp"), ville: val("ville"), compl: val("compl"),
      acces: val("acces"), heard: val("heard")
    };
  }

  function val(id) {
    var n = document.getElementById(id);
    return n ? n.value.trim() : (state.customer && state.customer[id]) || "";
  }

  function bind() {
    var add = document.getElementById("add-item");
    if (add) add.onclick = function () { readItems(); state.items.push(blank()); render(); };
    document.querySelectorAll("[data-remove]").forEach(function (b) {
      b.onclick = function () {
        readItems();
        state.items.splice(parseInt(b.getAttribute("data-remove"), 10), 1);
        render();
      };
    });
    document.querySelectorAll("[data-k]").forEach(function (input) {
      input.addEventListener("change", function () {
        readItems();
        if (input.getAttribute("data-k") === "cat" || input.getAttribute("data-k") === "length" || input.getAttribute("data-k") === "width" || input.getAttribute("data-k") === "surface") render();
      });
    });
    document.querySelectorAll("[data-photos]").forEach(function (input) {
      input.addEventListener("change", function () {
        var i = input.getAttribute("data-photos");
        var files = Array.prototype.slice.call(input.files || []).filter(function (f) {
          return f.size <= 5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(f.type);
        }).slice(0, 4);
        state.files[i] = files;
        showPreviews();
      });
    });
    var next = document.getElementById("next");
    var prev = document.getElementById("prev");
    if (prev) prev.onclick = function () { readItems(); if (state.step === 1) state.customer = customer(); state.step -= 1; render(); restoreCustomer(); };
    if (next) next.onclick = function () {
      readItems();
      if (state.step === 1 && !validCustomer()) return;
      if (!quoteMode() && state.step === 2 && !holdOk()) {
        document.getElementById("slot-error").hidden = false;
        return;
      }
      if (state.step === 1) state.customer = customer();
      state.step += 1;
      render();
      restoreCustomer();
    };
    var confirm = document.getElementById("confirm");
    if (confirm) confirm.onclick = finish;
  }

  function restoreCustomer() {
    if (!state.customer) return;
    Object.keys(state.customer).forEach(function (k) {
      var n = document.getElementById(k);
      if (n) n.value = state.customer[k];
    });
  }

  function validCustomer() {
    var ids = ["nom", "prenom", "email", "tel", "adresse", "cp", "ville"];
    var ok = ids.every(function (id) { return document.getElementById(id).value.trim(); });
    var mail = document.getElementById("email").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) ok = false;
    if (!document.getElementById("rgpd").checked) ok = false;
    document.getElementById("coord-error").hidden = ok;
    return ok;
  }

  function holdOk() {
    var raw = sessionStorage.getItem("carpeo-hold");
    if (!raw || !state.slot) return false;
    var hold = JSON.parse(raw);
    return hold.slot === state.slot && hold.until > Date.now();
  }

  function finish() {
    if (!quoteMode() && !document.getElementById("cgv").checked) {
      document.getElementById("pay-error").hidden = false;
      return;
    }
    var ref = "CAR-" + Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    var key = Math.random().toString(36).slice(2, 8).toUpperCase();
    var q = quoteMode();
    var t = total();
    var deposit = Math.round(t * 50) / 100;
    var dossier = {
      ref: ref,
      key: key,
      type: q ? "devis" : "reservation",
      status: q ? "Demande reçue" : "Acompte simulé — en attente de Stripe",
      items: state.items,
      customer: state.customer,
      slot: q ? "" : state.slot,
      total: q ? null : t,
      deposit: q ? null : deposit,
      balance: q ? null : Math.round((t - deposit) * 100) / 100,
      created: new Date().toISOString()
    };
    var all = [];
    try { all = JSON.parse(localStorage.getItem("carpeo-dossiers") || "[]"); } catch (e) { all = []; }
    all.push(dossier);
    localStorage.setItem("carpeo-dossiers", JSON.stringify(all));
    sessionStorage.removeItem("carpeo-hold");
    if (window.carpeoTrack) {
      window.carpeoTrack(q ? "Lead" : "Purchase", q ? { kind: "devis" } : { value: deposit, currency: "EUR", kind: "acompte-simule" });
    }
    var root = document.getElementById("booking");
    root.innerHTML = '<div class="panel"><p class="sur">Confirmation</p><h2>' + (q ? "Demande envoyée" : "Réservation préparée") + '</h2>' +
      '<p>Conservez ces deux codes. Ils ouvrent le suivi de ce dossier sur cet appareil.</p>' +
      '<dl class="summary"><dt>Référence</dt><dd>' + ref + '</dd><dt>Clé</dt><dd>' + key + '</dd><dt>Statut</dt><dd>' + dossier.status + '</dd></dl>' +
      (q ? "" : "<p>Total " + euro.format(t) + " · acompte " + euro.format(deposit) + " · reste " + euro.format(dossier.balance) + ".</p>") +
      '<p class="note">Aucune notification réelle n\'est partie : il n\'y a pas encore de serveur, d\'e-mail ni de compte Stripe.</p>' +
      '<a class="btn btn-ocean" href="suivi.html?ref=' + encodeURIComponent(ref) + '&cle=' + encodeURIComponent(key) + '">Voir le suivi</a></div>';
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("booking")) return;
    var params = new URLSearchParams(location.search);
    if (params.get("parcours") === "devis") state.items = [{ cat: "tapis", places: "3", config: "droit", matiere: "", qty: "1", faces: "1", length: "", width: "", surface: "", size: "", desc: "", stain: "", stainCount: "", age: "", odor: "non", use: "", caution: "" }];
    render();
  });
})();
