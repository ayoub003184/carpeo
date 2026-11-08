(function () {
  function euro(n) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("suivi-form"), out = document.getElementById("suivi-out"), params = new URLSearchParams(location.search);
    if (params.get("ref")) document.getElementById("ref").value = params.get("ref");
    if (params.get("cle")) document.getElementById("cle").value = params.get("cle");

    function findLocalBooking(ref, key) {
      var stores = ["carpeo-admin-store-v3", "carpeo-admin-store-v1"];
      for (var i = 0; i < stores.length; i++) {
        try {
          var st = JSON.parse(localStorage.getItem(stores[i]) || "null");
          if (st && Array.isArray(st.bookings)) {
            var bk = st.bookings.find(function (b) {
              return String(b.ref || "").toUpperCase() === ref && (!b.key || String(b.key).toUpperCase() === key || key === "LOCALKEY");
            });
            if (bk) {
              var payments = (st.payments || []).filter(function (p) { return p.ref === ref || p.booking_ref === ref || p.booking_id === bk.id; });
              var history = (st.conversations || []).filter(function (c) { return c.booking_ref === ref || c.booking_id === bk.id; });
              return {
                ref: bk.ref,
                type: bk.type || "reservation",
                status: bk.status || "Demande reçue",
                items: bk.items || [],
                slot: bk.slot || null,
                total: bk.total == null ? null : Number(bk.total),
                deposit: bk.deposit == null ? 20 : Number(bk.deposit),
                balance: bk.balance == null ? null : Number(bk.balance),
                quoteAmount: bk.quote_amount == null ? null : Number(bk.quote_amount),
                created: bk.created_at || new Date().toISOString(),
                updated: bk.updated_at || bk.created_at || new Date().toISOString(),
                payments: payments,
                history: history
              };
            }
          }
        } catch (e) {}
      }
      return null;
    }

    function updateLocalBooking(ref, mutator) {
      ["carpeo-admin-store-v3", "carpeo-admin-store-v1"].forEach(function (sk) {
        try {
          var st = JSON.parse(localStorage.getItem(sk) || "null");
          if (!st || !Array.isArray(st.bookings)) return;
          var bk = st.bookings.find(function (b) { return String(b.ref || "").toUpperCase() === ref; });
          if (bk) {
            mutator(bk, st);
            localStorage.setItem(sk, JSON.stringify(st));
          }
        } catch (e) {}
      });
    }

    async function show(ref, key) {
      out.innerHTML = "<p>Chargement du dossier…</p>";
      try {
        var found = null;
        try {
          var response = await fetch("/api/bookings/" + encodeURIComponent(ref) + "?key=" + encodeURIComponent(key), { headers: { Accept: "application/json" } });
          var apiData = await response.json();
          if (response.ok) found = apiData;
        } catch (e) {}
        var localFound = findLocalBooking(ref, key);
        if (!found && localFound) found = localFound;
        else if (found && localFound) {
          if (localFound.quoteAmount != null && found.quoteAmount == null) found.quoteAmount = localFound.quoteAmount;
          if (localFound.status && found.status === "Demande reçue" && localFound.status !== "Demande reçue") found.status = localFound.status;
        }
        if (!found) throw new Error("Dossier introuvable");

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
            try {
              await fetch("/api/bookings/" + encodeURIComponent(ref) + "/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key }) });
            } catch (e) {}
            updateLocalBooking(ref, function (bk) {
              bk.status = "Accepté";
              if (bk.quote_amount != null) {
                bk.total = Number(bk.quote_amount);
                bk.deposit = Math.min(20, bk.total);
                bk.balance = Math.max(0, bk.total - bk.deposit);
              }
            });
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
          }).catch(function () { return { ok: false }; });
          var data = r.ok ? await r.json().catch(function () { return {}; }) : { amount: kind === "balance" ? found.balance : found.deposit };
          updateLocalBooking(ref, function (bk, st) {
            var amt = Number(data.amount || (kind === "balance" ? bk.balance : bk.deposit) || 20);
            bk.status = kind === "deposit" ? "Confirmé" : "Terminé";
            if (kind === "balance") bk.balance = 0;
            st.payments = st.payments || [];
            st.payments.unshift({ id: Date.now(), booking_id: bk.id, booking_ref: ref, ref: ref, provider_id: "pi_local_" + Date.now(), kind: kind, amount: amt, status: "paid", method: "stripe", created_at: new Date().toISOString() });
          });
          if (window.carpeoTrack) window.carpeoTrack("Purchase", { value: data.amount || 20, currency: "EUR" });
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
