(function () {
  var euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  var pricing = window.CARPEO_PRICING;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var STAINS = ["Nourriture", "Boisson", "Graisse", "Encre", "Urine", "Sang", "Taches organiques", "Odeurs", "Autre"];
  var AGES = ["Moins de 24 heures", "Quelques jours", "Quelques semaines", "Plusieurs mois", "Inconnue"];
  var HEARD = ["Instagram", "Facebook", "TikTok", "Google", "Publicité en ligne", "Recommandation", "Autre"];

  function sofaKey(item) {
    if (item.config === "panoramique") return "sofaPanoramic";
    if (item.config === "convertible") return "sofaConvertible";
    if (item.config === "meridienne") return item.places === "3" ? "sofa3Meridienne" : "sofa2Meridienne";
    if (item.config === "angle") return item.places === "4" ? "sofa4Angle" : item.places === "3" ? "sofa3Angle" : "sofa2Angle";
    return item.places === "4" ? "sofa4Straight" : item.places === "3" ? "sofa3Straight" : "sofa2Straight";
  }

  function priceOf(item) {
    if (item.cat === "canape") {
      return pricing.price(sofaKey(item));
    }
    if (item.cat === "matelas") {
      var mattress = pricing.price(item.faces === "2" ? "mattress2" : "mattress1");
      return mattress == null ? null : mattress * (parseInt(item.qty, 10) || 1);
    }
    if (item.cat === "fauteuil") {
      var armchair = pricing.price("armchair");
      return armchair == null ? null : armchair * (parseInt(item.qty, 10) || 1);
    }
    if (item.cat === "chaise") {
      var q = parseInt(item.qty, 10) || 1;
      var single = pricing.price("chair");
      var bundle = pricing.price("chairs6");
      if (single == null || bundle == null) return null;
      return Math.floor(q / 6) * bundle + (q % 6) * single;
    }
    var key = { tapis: "rug", moquette: "carpet", coussin: "cushion", tete: "headboard", autre: "other" }[item.cat];
    if (!key) return null;
    var unit = pricing.price(key);
    return unit == null ? null : unit * (parseInt(item.qty, 10) || 1);
  }

  function needsQuote(item) {
    return priceOf(item) == null;
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
    return { cat: "canape", places: "3", config: "droit", matiere: "", qty: "1", faces: "1", length: "", width: "", surface: "", size: "", desc: "", stain: "", age: "", odor: "non", use: "", caution: "" };
  }

  var PROMOS = { BIENVENUE10: { type: "pct", value: 10 }, CARPEO20: { type: "eur", value: 20 }, FIDELITE15: { type: "pct", value: 15 }, NOEL2026: { type: "pct", value: 10 } };
  var state = { items: [blank()], step: 0, slot: "", files: {}, promo: "", avance: "non", promoMsg: "" };

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
      [["canape", "Canapé"], ["matelas", "Matelas"], ["tapis", "Tapis"], ["moquette", "Moquette"], ["chaise", "Chaises"], ["fauteuil", "Fauteuils"], ["coussin", "Coussins"], ["tete", "Tête de lit"], ["autre", "Autre demande"]]
        .map(function (o) { return '<option value="' + o[0] + '"' + (item.cat === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
      "</select>";
    var extra = "";
    if (item.cat === "canape") {
      extra += field("Nombre de places", '<select id="places-' + index + '" data-k="places"><option value="2"' + (item.places === "2" ? " selected" : "") + '>2 places</option><option value="3"' + (item.places === "3" ? " selected" : "") + '>3 places</option><option value="4"' + (item.places === "4" ? " selected" : "") + '>4 places</option></select>', "places-" + index);
      function sofaLabel(config, label) {
        return pricing.option(label, sofaKey({ places: item.places, config: config }));
      }
      extra += field("Configuration", '<select id="config-' + index + '" data-k="config"><option value="droit">' + sofaLabel("droit", "Droit") + '</option><option value="angle"' + (item.config === "angle" ? " selected" : "") + '>' + sofaLabel("angle", "Angle") + '</option><option value="meridienne"' + (item.config === "meridienne" ? " selected" : "") + '>' + sofaLabel("meridienne", "Méridienne") + '</option><option value="panoramique"' + (item.config === "panoramique" ? " selected" : "") + '>' + sofaLabel("panoramique", "Panoramique") + '</option><option value="convertible"' + (item.config === "convertible" ? " selected" : "") + '>' + sofaLabel("convertible", "Convertible") + '</option></select>', "config-" + index);
      extra += field("Revêtement, si connu", '<input id="mat-' + index + '" data-k="matiere" value="' + esc(item.matiere) + '" placeholder="Coton, velours, soie…">', "mat-" + index);
    }
    if (item.cat === "matelas") {
      extra += field("Quantité", '<input id="qty-' + index + '" data-k="qty" type="number" min="1" value="' + item.qty + '">', "qty-" + index);
      extra += field("Faces à nettoyer", '<select id="faces-' + index + '" data-k="faces"><option value="1">' + pricing.option("Une face", "mattress1") + '</option><option value="2"' + (item.faces === "2" ? " selected" : "") + '>' + pricing.option("Deux faces", "mattress2") + '</option></select>', "faces-" + index);
      extra += field("Dimensions", '<input id="size-' + index + '" data-k="size" value="' + esc(item.size) + '" placeholder="140 × 190, 160 × 200…">', "size-" + index);
    }
    if (item.cat === "fauteuil" || item.cat === "chaise" || item.cat === "coussin" || item.cat === "tete") {
      extra += field("Quantité", '<input id="qty-' + index + '" data-k="qty" type="number" min="1" value="' + item.qty + '">', "qty-" + index);
      extra += field(item.cat === "coussin" ? "Taille" : "Revêtement ou particularité", '<input id="mat-' + index + '" data-k="matiere" value="' + esc(item.matiere) + '" placeholder="Coton, velours, soie…">', "mat-" + index);
    }
    if (item.cat === "tapis" || item.cat === "moquette") {
      var m2 = area(item);
      extra += field("Longueur (m)", '<input id="len-' + index + '" data-k="length" inputmode="decimal" value="' + esc(item.length) + '">', "len-" + index);
      extra += field("Largeur (m)", '<input id="wid-' + index + '" data-k="width" inputmode="decimal" value="' + esc(item.width) + '">', "wid-" + index);
      extra += field("Ou surface directe (m²)", '<input id="surf-' + index + '" data-k="surface" inputmode="decimal" value="' + esc(item.surface) + '">', "surf-" + index);
      var surfaceKey = item.cat === "tapis" ? "rug" : "carpet";
      extra += '<p class="note">Surface retenue : ' + (m2 == null ? "à compléter" : m2.toLocaleString("fr-FR") + " m²") + ". Tarif actuel : " + pricing.display(surfaceKey) + ".</p>";
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
      ? ["Prestation et photos", "Adresse", "Envoi du devis"]
      : ["Prestation et photos", "Adresse", "Rendez-vous", "Récapitulatif"];
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
        field("Étage", '<input id="etage" placeholder="0, 2, 4…">', "etage") +
        field("Ascenseur", '<select id="ascenseur"><option value="non">Non</option><option value="oui">Oui</option></select>', "ascenseur") +
        field("Comment souhaitez-vous être contacté ?", '<select id="pref"><option value="whatsapp">WhatsApp</option><option value="telephone">Téléphone</option><option value="email">E-mail</option></select>', "pref") +
        field("Comment avez-vous connu CARPEO ?", '<select id="heard">' + HEARD.map(function (h) { return "<option>" + h + "</option>"; }).join("") + "</select>", "heard") +
        '<p class="note" id="zone-note">Zone : Paris et Île-de-France (75, 77, 78, 91, 92, 93, 94, 95).</p>' +
        '<label><input type="checkbox" id="rgpd" style="width:auto"> J\'ai lu la <a href="confidentialite.html">politique de confidentialité</a>. Mes informations servent à traiter cette demande.</label>' +
        '<p class="field-error" id="coord-error" hidden>Indiquez les champs obligatoires et acceptez l\'information sur vos données.</p>' +
        "</div>";
      html += '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="next">Continuer</button></div>';
    }

    if (!quoteMode() && state.step === 2) {
      html += '<div class="panel"><h3>Créneaux disponibles</h3><p class="note">Les disponibilités sont synchronisées avec le planning CARPEO.</p><div id="days"><p>Chargement…</p></div></div>';
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

  function quotePrice() {
    var base = total();
    var code = (state.promo || "").toUpperCase();
    var promo = PROMOS[code];
    var off = 0;
    if (promo) off = promo.type === "pct" ? Math.round(base * promo.value) / 100 : Math.min(promo.value, base);
    var net = Math.round((base - off) * 100) / 100;
    var avance = state.avance === "oui";
    var due = avance ? Math.round(net * 50) / 100 : net;
    var deposit = Math.min(pricing.load().deposit, due);
    var rest = avance ? due : Math.round((due - deposit) * 100) / 100;
    return { base: base, off: off, net: net, avance: avance, due: due, deposit: deposit, rest: rest, code: promo ? code : "" };
  }

  function summaryHtml() {
    var q = quoteMode();
    var money = quotePrice();
    var lines = state.items.map(function (item, i) {
      var p = priceOf(item);
      return "<li>Textile " + (i + 1) + " — " + item.cat + (p == null ? " — devis" : " — " + euro.format(p)) + "</li>";
    }).join("");
    var promoBox = '<label for="promo">Vous avez un code promo ?</label><div class="btn-row"><input id="promo" value="' + esc(state.promo) + '" placeholder="BIENVENUE10" style="max-width:220px"><button type="button" class="btn btn-ghost" id="apply-promo">Appliquer</button></div><p class="note">' + esc(state.promoMsg) + '</p>';
    var avanceBox = '<fieldset><legend>Souhaitez-vous bénéficier de l\'avance immédiate ?</legend><label><input type="radio" name="avance" value="oui"' + (state.avance === "oui" ? " checked" : "") + '> Oui, je souhaite bénéficier de l\'avance immédiate</label><label><input type="radio" name="avance" value="non"' + (state.avance !== "oui" ? " checked" : "") + '> Non, je souhaite régler la totalité de la prestation</label><p class="note">Si vous choisissez oui, prévoyez 5 à 10 minutes à l\'arrivée pour finaliser l\'inscription Urssaf avec nous. Le montant dépend de votre éligibilité.</p></fieldset>';
    var pay = q
      ? '<p>Ce dossier demande une estimation. Aucun paiement n\'est demandé maintenant.</p>'
      : promoBox + avanceBox +
        '<dl class="summary"><dt>Prix</dt><dd>' + euro.format(money.base) + '</dd>' +
        (money.off ? '<dt>Réduction ' + money.code + '</dt><dd>− ' + euro.format(money.off) + '</dd>' : '') +
        (money.avance ? '<dt>Avantage indicatif 50 %</dt><dd>' + euro.format(money.net - money.due) + '</dd><dt>Reste à charge</dt><dd>' + euro.format(money.due) + '</dd>' : '') +
        '<dt>Acompte de réservation</dt><dd>' + euro.format(money.deposit) + '</dd><dt>' + (money.avance ? "Montant à régler après remboursement de l’acompte" : "Solde") + '</dt><dd>' + euro.format(money.rest) + '</dd></dl>' +
        (money.avance ? '<p class="note">Avec l’avance immédiate, l’acompte est remboursé à la fin de la prestation.</p>' : '<p class="note">Sans l’avance immédiate, l’acompte est déduit du montant total.</p>') +
        '<div class="stripe-box"><strong>Paiement sécurisé</strong><p>Après confirmation, le dossier est enregistré et l’acompte peut être réglé via Stripe lorsqu’il est activé.</p><p class="note">Créneau : ' + (state.slot || "—") + '.</p></div>' +
        '<label><input type="checkbox" id="cgv" style="width:auto"> J\'accepte les <a href="cgv.html">conditions</a> avant de confirmer.</label>' +
      '<p class="field-error" id="pay-error" hidden>Acceptez les conditions pour confirmer.</p>';
    return '<div class="panel"><h3>' + (q ? "Votre demande de devis" : "Récapitulatif") + '</h3><ul>' + lines + "</ul>" + pay +
      '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="confirm">' +
      (q ? "Envoyer la demande" : "Confirmer la réservation") + "</button></div></div>";
  }

  async function renderCalendar() {
    var host = document.getElementById("days");
    if (!host) return;
    var html = "";
    try {
      var response = await fetch("/api/slots", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      var payload = await response.json();
      (payload.days || []).forEach(function (day) {
        var date = new Date(day.date + "T12:00:00");
        html += "<p><strong>" + date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + "</strong></p><div class='slots'>";
        (day.slots || []).forEach(function (slot) {
          var id = slot.value || (day.date + " " + slot.time);
          html += '<button type="button" class="slot" data-slot="' + id + '" aria-pressed="' + (state.slot === id) + '"' + (slot.available === false ? " disabled" : "") + ">" + (slot.time || id.slice(-5)) + (slot.available === false ? " indisponible" : "") + "</button>";
        });
        html += "</div>";
      });
    } catch (error) { html = '<p class="field-error">Impossible de charger le planning. Réessayez dans un instant.</p>'; }
    host.innerHTML = html;
    host.querySelectorAll("[data-slot]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.slot = b.getAttribute("data-slot");
        renderCalendar();
      });
    });
  }

  function customer() {
    return {
      nom: val("nom"), prenom: val("prenom"), email: val("email"), tel: val("tel"),
      adresse: val("adresse"), cp: val("cp"), ville: val("ville"), compl: val("compl"),
      etage: val("etage"), ascenseur: val("ascenseur"), pref: val("pref"),
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
        if (["cat", "places", "config", "faces", "length", "width", "surface"].indexOf(input.getAttribute("data-k")) !== -1) render();
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
      if (!quoteMode() && state.step === 2 && !state.slot) {
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
    var apply = document.getElementById("apply-promo");
    if (apply) apply.onclick = function () {
      state.promo = document.getElementById("promo").value.trim().toUpperCase();
      state.promoMsg = PROMOS[state.promo] ? "Code appliqué." : "Ce code n'est pas reconnu. Exemples : BIENVENUE10, CARPEO20, FIDELITE15, NOEL2026.";
      var picked = document.querySelector('input[name="avance"]:checked');
      if (picked) state.avance = picked.value;
      render();
    };
    document.querySelectorAll('input[name="avance"]').forEach(function (r) {
      r.addEventListener("change", function () { state.avance = r.value; render(); });
    });
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
    var cp = document.getElementById("cp").value.trim();
    var idf = /^(75|77|78|91|92|93|94|95)\d{3}$/.test(cp);
    var zone = document.getElementById("zone-note");
    if (cp && !idf) {
      ok = false;
      if (zone) zone.textContent = "Ce code postal n'est pas en Île-de-France (75, 77, 78, 91, 92, 93, 94, 95).";
    }
    document.getElementById("coord-error").hidden = ok;
    return ok;
  }

  function photoData() {
    var files = Object.keys(state.files).reduce(function (all, key) { return all.concat(state.files[key] || []); }, []);
    return Promise.all(files.slice(0, 16).map(function (file) { return new Promise(function (resolve) { var reader = new FileReader(); reader.onload = function () { resolve({ name: file.name, type: file.type, data: reader.result }); }; reader.onerror = function () { resolve(null); }; reader.readAsDataURL(file); }); })).then(function (items) { return items.filter(Boolean); });
  }

  async function finish() {
    if (!quoteMode() && !document.getElementById("cgv").checked) {
      document.getElementById("pay-error").hidden = false;
      return;
    }
    var q = quoteMode();
    var money = quotePrice();
    var button = document.getElementById("confirm");
    button.disabled = true; button.textContent = "Envoi en cours…";
    var dossier;
    try {
      var response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ items: state.items, customer: state.customer, slot: q ? "" : state.slot, promo: money.code, advance: state.avance, photos: await photoData() }) });
      dossier = await response.json();
      if (!response.ok) throw new Error(dossier.error || "La demande n’a pas pu être enregistrée.");
    } catch (error) {
      button.disabled = false; button.textContent = q ? "Envoyer la demande" : "Confirmer la réservation";
      var errorBox = document.getElementById("pay-error"); errorBox.hidden = false; errorBox.textContent = error.message; return;
    }
    if (window.carpeoTrack) {
      window.carpeoTrack(q ? "Lead" : "Booking", q ? { kind: "devis" } : { value: dossier.deposit, currency: "EUR" });
    }
    var root = document.getElementById("booking");
    root.innerHTML = '<div class="panel"><p class="sur">Confirmation</p><h2>' + (q ? "Demande envoyée" : "Réservation préparée") + '</h2>' +
      '<p>Conservez ces deux codes. Ils ouvrent le suivi de ce dossier sur cet appareil.</p>' +
      '<dl class="summary"><dt>Référence</dt><dd>' + dossier.ref + '</dd><dt>Clé d’accès</dt><dd>' + dossier.key + '</dd><dt>Statut</dt><dd>' + dossier.status + '</dd></dl>' +
      (q ? "" : "<p>Total " + euro.format(dossier.total) + " · acompte " + euro.format(dossier.deposit) + " · reste " + euro.format(dossier.balance) + ".</p>") +
      '<p class="note">Conservez la référence et la clé pour consulter ce dossier de manière sécurisée.</p>' +
      '<a class="btn btn-ocean" href="suivi.html?ref=' + encodeURIComponent(dossier.ref) + '&cle=' + encodeURIComponent(dossier.key) + '">Voir le suivi</a></div>';
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!document.getElementById("booking")) return;
    var params = new URLSearchParams(location.search);
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem("carpeo-picks") || "null"); } catch (e) { stored = null; }
    if (stored && stored.length) {
      state.items = stored.map(function (p) {
        var b = blank();
        b.cat = p.cat;
        b.places = p.places || b.places;
        b.config = p.config || b.config;
        b.faces = p.faces || b.faces;
        b.qty = String(p.qty || 1);
        return b;
      });
    } else if (params.get("parcours") === "devis") state.items = [{ cat: "tapis", places: "3", config: "droit", matiere: "", qty: "1", faces: "1", length: "", width: "", surface: "", size: "", desc: "", stain: "", age: "", odor: "non", use: "", caution: "" }];
    if (pricing && pricing.ready) await pricing.ready;
    render();
  });
})();
