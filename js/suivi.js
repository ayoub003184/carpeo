(function () {
  function euro(n) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("suivi-form"), out = document.getElementById("suivi-out"), params = new URLSearchParams(location.search);
    if (params.get("ref")) document.getElementById("ref").value = params.get("ref");
    if (params.get("cle")) document.getElementById("cle").value = params.get("cle");

    async function show(ref, key) {
      out.innerHTML = "<p>Chargement du dossier…</p>";
      try {
        var response = await fetch("/api/bookings/" + encodeURIComponent(ref) + "?key=" + encodeURIComponent(key), { headers: { Accept: "application/json" } });
        var found = await response.json();
        if (!response.ok) throw new Error(found.error || "Dossier introuvable");

        var itemsHtml = (found.items || []).map(function (it, idx) {
          return "<li><strong>Article " + (idx + 1) + " :</strong> " + esc(it.cat) +
            (it.places ? " (" + esc(it.places) + " places, " + esc(it.config || "droit") + ")" : "") +
            (it.surface ? " (" + esc(it.surface) + " m²)" : "") +
            (it.matiere ? " · " + esc(it.matiere) : "") +
            (it.frozenPrice != null ? " — <strong>" + euro(it.frozenPrice) + "</strong>" : "") +
            "</li>";
        }).join("");

        var money = found.total == null
          ? "<p>Montant : <strong>" + (found.quoteAmount != null ? "Devis proposé à " + euro(found.quoteAmount) : "En attente du chiffrage CARPEO") + "</strong></p>"
          : '<dl class="summary"><dt>Montant total</dt><dd>' + euro(found.total) + '</dd><dt>Acompte</dt><dd>' + euro(found.deposit) + '</dd><dt>Solde restant</dt><dd>' + euro(found.balance) + '</dd></dl>';

        var actions = '<div class="btn-row">';
        if (found.quoteAmount != null && !["Accepté", "Confirmé", "Planifié", "Terminé"].includes(found.status)) {
          actions += '<button class="btn btn-ocean" type="button" id="accept-quote">Accepter le devis de ' + euro(found.quoteAmount) + '</button>';
        }
        if (["Acompte à régler", "Accepté"].includes(found.status) && found.deposit > 0) {
          actions += '<button class="btn btn-ocean" type="button" id="pay-deposit">Régler l\'acompte (' + euro(found.deposit) + ')</button>';
        }
        if (["Confirmé", "Planifié"].includes(found.status) && found.balance > 0) {
          actions += '<button class="btn btn-night" type="button" id="pay-balance">Régler le solde restant (' + euro(found.balance) + ')</button>';
        }
        actions += '</div><p id="pay-feedback" class="note" style="margin-top:0.6rem"></p>';

        var paymentsHtml = (found.payments || []).length
          ? "<h3>Paiements enregistrés</h3><ul>" + found.payments.map(function (p) {
              return "<li>" + (p.kind === "balance" ? "Solde" : "Acompte") + " : <strong>" + euro(p.amount) + "</strong> — Statut : <span class='badge'>" + esc(p.status) + "</span> (" + new Date(p.created_at).toLocaleDateString("fr-FR") + ")</li>";
            }).join("") + "</ul>"
          : "";

        var historyHtml = "<h3>Historique du dossier</h3><ul>" +
          "<li><strong>Création du dossier :</strong> " + new Date(found.created).toLocaleString("fr-FR") + "</li>" +
          "<li><strong>Dernière mise à jour :</strong> " + new Date(found.updated).toLocaleString("fr-FR") + " — Statut : " + esc(found.status) + "</li>" +
          (found.history || []).map(function (h) {
            return "<li><strong>" + esc(h.channel.toUpperCase()) + " :</strong> " + esc(h.body) + " (" + new Date(h.created_at).toLocaleDateString("fr-FR") + ")</li>";
          }).join("") +
          "</ul>";

        out.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">' +
          '<h2>Dossier ' + esc(found.ref) + '</h2><span class="badge" style="font-size:0.9rem">' + esc(found.status) + '</span></div>' +
          '<p>' + (found.type === "devis" ? "Demande de devis personnalisé" : "Réservation en ligne") + '</p>' +
          '<p><strong>Planification :</strong> ' + (found.slot ? esc(found.slot) : "Créneau en attente de planification") + '</p>' +
          (itemsHtml ? "<h3>Prestations</h3><ul>" + itemsHtml + "</ul>" : "") +
          money + actions + paymentsHtml + historyHtml;

        var acceptBtn = document.getElementById("accept-quote");
        if (acceptBtn) {
          acceptBtn.onclick = async function () {
            acceptBtn.disabled = true;
            var r = await fetch("/api/bookings/" + encodeURIComponent(ref) + "/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key }) });
            var data = await r.json();
            if (!r.ok) { acceptBtn.disabled = false; acceptBtn.textContent = data.error || "Erreur"; return; }
            show(ref, key);
          };
        }

        async function triggerPayment(kind, btn) {
          btn.disabled = true;
          var fb = document.getElementById("pay-feedback");
          if (fb) fb.textContent = "Traitement du paiement sécurisé Stripe en cours…";
          var r = await fetch("/api/payments/create-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ref: ref, key: key, kind: kind })
          });
          var data = await r.json();
          if (!r.ok) {
            btn.disabled = false;
            if (fb) fb.textContent = data.error || "Paiement indisponible.";
            return;
          }
          if (window.carpeoTrack) window.carpeoTrack("Purchase", { value: data.amount, currency: "EUR" });
          show(ref, key);
        }

        var depBtn = document.getElementById("pay-deposit");
        if (depBtn) depBtn.onclick = function () { triggerPayment("deposit", depBtn); };
        var balBtn = document.getElementById("pay-balance");
        if (balBtn) balBtn.onclick = function () { triggerPayment("balance", balBtn); };
      } catch (error) {
        out.innerHTML = '<p class="field-error">' + esc(error.message) + '. Vérifiez la référence et la clé d’accès.</p>';
      }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      show(document.getElementById("ref").value.trim().toUpperCase(), document.getElementById("cle").value.trim().toUpperCase());
    });
    if (params.get("ref") && params.get("cle")) {
      show(params.get("ref").trim().toUpperCase(), params.get("cle").trim().toUpperCase());
    }
  });
})();
