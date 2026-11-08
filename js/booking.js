(function () {
  var euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  var state = { items: [blank()], step: 0, slot: "", calendarFrom: "", files: {}, promo: "", avance: "oui", promoMsg: "" };

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
      ? ["Prestation et photos", "Adresse", "Créneau souhaité", "Envoi du devis"]
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
        '<p class="note" id="zone-note">Intervention à domicile.</p>' +
        '<label><input type="checkbox" id="rgpd" style="width:auto"> J\'ai lu la <a href="confidentialite.html">politique de confidentialité</a>. Mes informations servent à traiter cette demande.</label>' +
        '<p class="field-error" id="coord-error" hidden>Indiquez les champs obligatoires et acceptez l\'information sur vos données.</p>' +
        "</div>";
      html += '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="next">Voir les créneaux disponibles</button></div>';
    }

    if (state.step === 2) {
      var minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      html += '<div class="panel">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.8rem">' +
        '<div><h3 style="margin:0">Créneaux disponibles en temps réel</h3><p class="note" style="margin:0">Synchronisés avec le planning et les périodes de congés CARPEO.</p></div>' +
        '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
        '<label for="cal-jump" style="margin:0;font-size:0.85rem">Aller au :</label>' +
        '<input type="date" id="cal-jump" min="' + minDate + '" value="' + esc(state.calendarFrom || minDate) + '" style="margin:0;width:160px;padding:0.4rem 0.6rem">' +
        '<button type="button" class="pill" id="cal-prev">← Préc.</button>' +
        '<button type="button" class="pill" id="cal-next">Suiv. →</button>' +
        '</div></div>' +
        (state.slot ? '<div class="summary" style="margin-bottom:0.9rem;padding:0.65rem 1rem"><strong>Créneau sélectionné : ' + esc(state.slot) + '</strong></div>' : '') +
        '<div id="days"><p>Chargement des disponibilités…</p></div></div>';
      html += '<p class="field-error" id="slot-error" hidden>Choisissez un créneau disponible pour continuer.</p>';
      html += '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="next">' + (quoteMode() ? "Continuer vers le devis" : "Voir le prix") + '</button></div>';
    }

    if (state.step === 3) {
      html += summaryHtml();
    }

    root.innerHTML = html;
    bind();
    showPreviews();
    if (state.step === 2) renderCalendar();
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
    var deposit = pricing.load().deposit || 20;
    var rest = Math.max(0, Math.round((due - deposit) * 100) / 100);
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
    var avanceBox = '<fieldset><legend>Souhaitez-vous bénéficier de l\'avance immédiate (-50 % crédit d\'impôt) ?</legend><label><input type="radio" name="avance" value="oui"' + (state.avance === "oui" ? " checked" : "") + '> Oui, je souhaite bénéficier de l\'avance immédiate (-50 %)</label><label><input type="radio" name="avance" value="non"' + (state.avance !== "oui" ? " checked" : "") + '> Non, je souhaite régler la totalité de la prestation</label><p class="note">Si vous choisissez oui, prévoyez 5 à 10 minutes à l\'arrivée pour finaliser l\'inscription Urssaf avec nous. L\'acompte de réservation reste fixe à ' + euro.format(money.deposit) + ' pour toutes les prestations.</p></fieldset>';
    var pay = q
      ? '<p>Ce dossier demande une estimation personnalisée. Aucun paiement n\'est demandé maintenant. L’acompte fixe de <strong>' + euro.format(money.deposit) + '</strong> sera demandé uniquement après acceptation du devis.</p>'
      : promoBox + avanceBox +
        '<dl class="summary"><dt>Prix de la prestation</dt><dd>' + euro.format(money.base) + '</dd>' +
        (money.off ? '<dt>Réduction ' + money.code + '</dt><dd>− ' + euro.format(money.off) + '</dd>' : '') +
        (money.avance ? '<dt>Avantage crédit d\'impôt 50 %</dt><dd>− ' + euro.format(money.net - money.due) + '</dd><dt>Montant après crédit d\'impôt</dt><dd>' + euro.format(money.due) + '</dd>' : '') +
        '<dt>Acompte fixe (toutes prestations)</dt><dd>' + euro.format(money.deposit) + '</dd><dt>Solde restant après acompte</dt><dd>' + euro.format(money.rest) + '</dd></dl>' +
        '<p class="note">L’acompte pour toutes les prestations est fixe à ' + euro.format(money.deposit) + ' (et non 50 % du montant). Il est déduit du montant à régler.</p>' +
        '<div class="stripe-box"><strong>Paiement sécurisé</strong><p>Après confirmation, le dossier est enregistré et l’acompte de ' + euro.format(money.deposit) + ' peut être réglé en ligne.</p><p class="note">Créneau : ' + (state.slot || "—") + '.</p></div>' +
        '<label><input type="checkbox" id="cgv" style="width:auto"> J\'accepte les <a href="cgv.html">conditions</a> avant de confirmer.</label>' +
      '<p class="field-error" id="pay-error" hidden>Acceptez les conditions pour confirmer.</p>';
    return '<div class="panel"><h3>' + (q ? "Votre demande de devis" : "Récapitulatif") + '</h3><ul>' + lines + "</ul>" + pay +
      '<div class="btn-row"><button type="button" class="btn btn-ghost" id="prev">Retour</button><button type="button" class="btn btn-ocean" id="confirm">' +
      (q ? "Envoyer la demande" : "Confirmer la réservation") + "</button></div></div>";
  }

  function getLocalAdminStore() {
    try {
      return JSON.parse(localStorage.getItem("carpeo-admin-store-v1") || "null") || {};
    } catch (e) {
      return {};
    }
  }

  function findLocalBlock(slotVal, blockedList) {
    return (blockedList || []).find(function (row) {
      var start = String(row.slot_start || "");
      var end = String(row.slot_end || row.slot_start || "");
      if (start.length === 10) start += " 00:00";
      if (end.length === 10) end += " 23:59";
      return Boolean(start && end && slotVal >= start && slotVal <= end);
    });
  }

  async function renderCalendar() {
    var host = document.getElementById("days");
    if (!host) return;
    var localStore = getLocalAdminStore();
    var localBlocked = Array.isArray(localStore.blockedSlots) ? localStore.blockedSlots : [];
    var localBooked = new Set(
      (Array.isArray(localStore.bookings) ? localStore.bookings : [])
        .filter(function (b) { return b.slot && b.status !== "Annulé" && b.status !== "Terminé"; })
        .map(function (b) { return b.slot; })
    );

    var daysData = [];
    var allBlocked = localBlocked.slice();
    var fromParam = state.calendarFrom ? "&from=" + encodeURIComponent(state.calendarFrom) : "";

    try {
      var response = await fetch("/api/slots?days=14&t=" + Date.now() + fromParam, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
      if (!response.ok) throw new Error();
      var payload = await response.json();
      daysData = payload.days || [];
      if (Array.isArray(payload.blocked)) {
        payload.blocked.forEach(function (bl) {
          if (!allBlocked.some(function (x) { return x.slot_start === bl.slot_start && x.slot_end === bl.slot_end; })) {
            allBlocked.push(bl);
          }
        });
      }
    } catch (error) {
      var base = state.calendarFrom && /^\d{4}-\d{2}-\d{2}$/.test(state.calendarFrom)
        ? new Date(state.calendarFrom + "T12:00:00")
        : new Date();
      var startOff = state.calendarFrom ? 0 : 1;
      for (var d = startOff; d < startOff + 14; d++) {
        var fallbackDate = new Date(base);
        fallbackDate.setDate(base.getDate() + d);
        if (fallbackDate.getDay() === 0) continue;
        var iso = fallbackDate.toISOString().slice(0, 10);
        daysData.push({
          date: iso,
          slots: ["08:00", "11:00", "14:00", "17:00"].map(function (time) {
            return { value: iso + " " + time, time: time, available: true };
          })
        });
      }
    }

    var html = "";
    if (allBlocked.length) {
      html += '<div class="note" style="background:#fce8e8;color:#7a1c1c;border-left:4px solid #b53838;padding:0.65rem 0.9rem;border-radius:10px;margin-bottom:0.9rem">' +
        '<strong>Périodes de congés / fermeture programmées :</strong> ' +
        allBlocked.map(function (bl) {
          return esc(bl.slot_start) + (bl.slot_end && bl.slot_end !== bl.slot_start ? " au " + esc(bl.slot_end) : "") + " (" + esc(bl.reason || "Congé") + ")";
        }).join(" · ") +
        "</div>";
    }

    daysData.forEach(function (day) {
      var date = new Date(day.date + "T12:00:00");
      var evaluatedSlots = (day.slots || []).map(function (slot) {
        var id = slot.value || (day.date + " " + slot.time);
        var lBlock = findLocalBlock(id, allBlocked);
        var isUsed = localBooked.has(id);
        var avail = slot.available !== false && !lBlock && !isUsed;
        var reason = !avail ? (lBlock ? (lBlock.reason || "Congé") : (slot.reason || (isUsed ? "Réservé" : "Indisponible"))) : "";
        return { id: id, time: slot.time || id.slice(-5), available: avail, reason: reason };
      });
      var allDayBlocked = evaluatedSlots.length > 0 && evaluatedSlots.every(function (s) { return !s.available; });
      var dayLabel = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      html += '<div style="margin-bottom:0.85rem;padding-bottom:0.65rem;border-bottom:1px solid var(--line)">' +
        '<p style="margin:0 0 0.45rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap">' +
        '<strong style="text-transform:capitalize">' + dayLabel + '</strong>' +
        (allDayBlocked ? '<span class="badge" style="background:#fce8e8;color:#7a1c1c;margin:0">Fermé / ' + esc(evaluatedSlots[0].reason || "Congé") + '</span>' : '<span class="badge" style="background:#dcfce7;color:#166534;margin:0">Créneaux disponibles</span>') +
        '</p><div class="slots">';
      evaluatedSlots.forEach(function (slot) {
        var selected = state.slot === slot.id;
        html += '<button type="button" class="slot" data-slot="' + slot.id + '" aria-pressed="' + selected + '"' +
          (!slot.available ? " disabled" : "") + ">" +
          "<strong>" + slot.time + "</strong> · " +
          (slot.available ? (selected ? "✓ Sélectionné" : "Disponible") : "Indisponible (" + esc(slot.reason) + ")") +
          "</button>";
      });
      html += "</div></div>";
    });

    host.innerHTML = html;
    host.querySelectorAll("[data-slot]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.slot = b.getAttribute("data-slot");
        var err = document.getElementById("slot-error");
        if (err) err.hidden = true;
        render();
      });
    });

    var jumpInput = document.getElementById("cal-jump");
    if (jumpInput) {
      jumpInput.onchange = function () {
        state.calendarFrom = jumpInput.value;
        renderCalendar();
      };
    }
    var prevBtn = document.getElementById("cal-prev");
    var nextBtn = document.getElementById("cal-next");
    if (prevBtn) {
      prevBtn.onclick = function () {
        var cur = state.calendarFrom ? new Date(state.calendarFrom + "T12:00:00") : new Date();
        cur.setDate(cur.getDate() - 14);
        var tomorrow = new Date(Date.now() + 86400000);
        if (cur < tomorrow) cur = tomorrow;
        state.calendarFrom = cur.toISOString().slice(0, 10);
        render();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = function () {
        var cur = state.calendarFrom ? new Date(state.calendarFrom + "T12:00:00") : new Date();
        cur.setDate(cur.getDate() + 14);
        state.calendarFrom = cur.toISOString().slice(0, 10);
        render();
      };
    }
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
      if (state.step === 2 && !state.slot) {
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
    var urlParams = new URLSearchParams(location.search);
    var attribution = {
      source: urlParams.get("utm_source") || (state.customer && state.customer.heard) || "Site web",
      medium: urlParams.get("utm_medium") || "",
      campaign: urlParams.get("utm_campaign") || ""
    };
    try {
      var response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ items: state.items, customer: state.customer, slot: state.slot, promo: money.code, advance: state.avance, attribution: attribution, photos: await photoData() }) });
      dossier = await response.json();
      if (!response.ok) throw new Error(dossier.error || "La demande n’a pas pu être enregistrée.");
    } catch (error) {
      dossier = {
        ref: "CAR-" + Math.random().toString(16).slice(2, 10).toUpperCase(),
        key: Math.random().toString(36).slice(2, 10).toUpperCase(),
        status: q ? "Demande reçue" : "Acompte à régler",
        total: q ? null : money.due,
        deposit: q ? 20 : money.deposit,
        balance: q ? null : money.rest
      };
    }
    try {
      var st = getLocalAdminStore();
      if (Array.isArray(st.bookings)) {
        st.bookings.unshift({
          id: Date.now(),
          ref: dossier.ref,
          key: dossier.key,
          type: q ? "devis" : "reservation",
          status: dossier.status,
          slot: state.slot,
          total: dossier.total,
          deposit: dossier.deposit || 20,
          balance: dossier.balance,
          quote_amount: null,
          notes: "Créé depuis le parcours en ligne.",
          tags: q ? "Devis en ligne" : "Réservation en ligne",
          customer: state.customer,
          items: state.items,
          attribution: attribution,
          created_at: new Date().toISOString()
        });
        localStorage.setItem("carpeo-admin-store-v1", JSON.stringify(st));
      }
    } catch (e) {}
    if (window.carpeoTrack) {
      window.carpeoTrack(q ? "Lead" : "Booking", q ? { kind: "devis" } : { value: dossier.deposit, currency: "EUR" });
    }
    var root = document.getElementById("booking");
    root.innerHTML = '<div class="panel"><p class="sur">Confirmation</p><h2>' + (q ? "Demande envoyée" : "Réservation préparée") + '</h2>' +
      '<p>Conservez ces deux codes. Ils ouvrent le suivi de ce dossier sur cet appareil.</p>' +
      '<dl class="summary"><dt>Référence</dt><dd>' + dossier.ref + '</dd><dt>Clé d’accès</dt><dd>' + dossier.key + '</dd><dt>Statut</dt><dd id="conf-status">' + dossier.status + '</dd></dl>' +
      (q ? "" : "<p>Total " + euro.format(dossier.total) + " · acompte " + euro.format(dossier.deposit) + " · reste " + euro.format(dossier.balance) + ".</p>") +
      '<p class="note">Conservez la référence et la clé pour consulter ce dossier de manière sécurisée.</p>' +
      '<div class="btn-row">' +
      (!q && dossier.deposit ? '<button type="button" class="btn btn-ocean" id="pay-now-btn">Payer l\'acompte en ligne (' + euro.format(dossier.deposit) + ')</button>' : '') +
      '<a class="btn ' + (q ? 'btn-ocean' : 'btn-ghost') + '" href="suivi.html?ref=' + encodeURIComponent(dossier.ref) + '&cle=' + encodeURIComponent(dossier.key) + '">Voir le suivi</a>' +
      '</div><p id="pay-now-msg" class="note" style="margin-top:0.6rem"></p></div>';

    var payNow = document.getElementById("pay-now-btn");
    if (payNow) {
      payNow.onclick = async function () {
        payNow.disabled = true;
        payNow.textContent = "Paiement en cours…";
        try {
          var pr = await fetch("/api/payments/create-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ref: dossier.ref, key: dossier.key, kind: "deposit" })
          });
          var pdata = await pr.json();
          if (!pr.ok) throw new Error(pdata.error || "Erreur paiement");
          document.getElementById("conf-status").textContent = "Confirmé";
          document.getElementById("pay-now-msg").textContent = "Acompte réglé avec succès. Votre rendez-vous est confirmé !";
          payNow.remove();
        } catch (err) {
          payNow.disabled = false;
          payNow.textContent = "Réessayer le paiement (" + euro.format(dossier.deposit) + ")";
          document.getElementById("pay-now-msg").textContent = err.message;
        }
      };
    }
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
