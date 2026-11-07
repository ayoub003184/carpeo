(function () {
  function euro(n) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
  }
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("suivi-form");
    var out = document.getElementById("suivi-out");
    var params = new URLSearchParams(location.search);
    if (params.get("ref")) document.getElementById("ref").value = params.get("ref");
    if (params.get("cle")) document.getElementById("cle").value = params.get("cle");

    function show(ref, key) {
      var all = [];
      try { all = JSON.parse(localStorage.getItem("carpeo-dossiers") || "[]"); } catch (e) { all = []; }
      var found = all.filter(function (d) { return d.ref === ref && d.key === key; })[0];
      if (!found) {
        out.innerHTML = "<p>Aucun dossier ne correspond à cette référence et à cette clé sur cet appareil.</p>";
        return;
      }
      var money = found.total == null ? "<p>Montant : en attente du devis.</p>" :
        "<p>Total " + euro(found.total) + " · acompte " + euro(found.deposit) + " · reste " + euro(found.balance) + ".</p>";
      out.innerHTML = "<h2>" + found.ref + "</h2><p><strong>" + found.status + "</strong></p>" +
        "<p>" + (found.type === "devis" ? "Demande de devis" : "Réservation") + " · " +
        new Date(found.created).toLocaleString("fr-FR") + "</p>" +
        (found.slot ? "<p>Créneau : " + found.slot + "</p>" : "<p>Créneau : pas encore planifié.</p>") +
        money +
        "<p class=\"note\">Historique local de démonstration. Un serveur reliera plus tard le vrai dossier, les devis et les paiements Stripe.</p>";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      show(document.getElementById("ref").value.trim().toUpperCase(), document.getElementById("cle").value.trim().toUpperCase());
    });
    if (params.get("ref") && params.get("cle")) show(params.get("ref"), params.get("cle"));
  });
})();
