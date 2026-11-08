(function () {
  "use strict";
  function renderTable() {
    var body = document.getElementById("price-table-body");
    var pricing = window.CARPEO_PRICING;
    if (!body || !pricing) return;
    var keys = ["sofa2Straight", "sofa3Straight", "sofa2Angle", "sofa3Angle", "mattress1", "mattress2", "armchair", "chair", "chairs6", "rug", "carpet", "cushion", "headboard"];
    var deposit = pricing.load().deposit;
    body.innerHTML = keys.map(function (key) {
      var def = pricing.definitions[key];
      var item = pricing.get(key);
      var fixed = item.mode === "price";
      return "<tr><td>" + def.label + "</td><td>" + pricing.display(key) + "</td><td>" +
        pricing.euro.format(deposit) + "</td><td>" +
        (fixed ? "Réservation" : "Devis") + "</td></tr>";
    }).join("");
  }
  document.addEventListener("DOMContentLoaded", async function () {
    renderTable();
    var pricing = window.CARPEO_PRICING;
    if (pricing && pricing.ready) {
      await pricing.ready;
      renderTable();
    }
  });
  window.addEventListener("storage", renderTable);
})();
