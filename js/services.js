(function () {
  var pricing = window.CARPEO_PRICING;
  var sofa = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12V8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V12"/><path d="M3 12h18v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M7 19v1.5M17 19v1.5"/></svg>';
  var chair = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V5h10v6"/><path d="M6 11h12v3H6z"/><path d="M8 14v6M16 14v6"/></svg>';
  var bed = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18V8M3 14h18v4M21 14V10a3 3 0 0 0-3-3H11"/><path d="M3 18h18"/></svg>';
  var rug = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 6v12M12 6v12M16 6v12"/></svg>';

  var catalog = [
    { name: "Fauteuil", key: "armchair", icon: chair, item: { cat: "fauteuil" } },
    { name: "Canapé 2 places", key: "sofa2Straight", icon: sofa, item: { cat: "canape", places: "2", config: "droit" } },
    { name: "Canapé 3 places", key: "sofa3Straight", icon: sofa, item: { cat: "canape", places: "3", config: "droit" } },
    { name: "Canapé d'angle", key: "sofa2Angle", icon: sofa, item: { cat: "canape", places: "2", config: "angle" } },
    { name: "Matelas, 1 face", key: "mattress1", icon: bed, item: { cat: "matelas", faces: "1" } },
    { name: "Matelas, 2 faces", key: "mattress2", icon: bed, item: { cat: "matelas", faces: "2" } },
    { name: "Angle 3 places", key: "sofa3Angle", icon: sofa, item: { cat: "canape", places: "3", config: "angle" } },
    { name: "Chaise", key: "chair", icon: chair, item: { cat: "chaise" } },
    { name: "Tapis", key: "rug", icon: rug, item: { cat: "tapis" } },
    { name: "Moquette", key: "carpet", icon: rug, item: { cat: "moquette" } },
    { name: "Tête de lit", key: "headboard", icon: bed, item: { cat: "tete" } },
    { name: "Coussin", key: "cushion", icon: sofa, item: { cat: "coussin" } }
  ];

  var euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var qty = catalog.map(function () { return 0; });

  function lineTotal(entry, n) {
    if (entry.item.cat === "chaise") {
      var single = pricing.price("chair");
      var bundle = pricing.price("chairs6");
      if (single == null || bundle == null) return null;
      return Math.floor(n / 6) * bundle + (n % 6) * single;
    }
    var unit = pricing.price(entry.key);
    if (unit == null) return null;
    return unit * n;
  }

  function paint() {
    var count = 0;
    var sum = 0;
    var quote = false;
    qty.forEach(function (n, i) {
      var node = document.querySelector('[data-n="' + i + '"]');
      if (node) node.textContent = String(n);
      count += n;
      var line = lineTotal(catalog[i], n);
      if (n && line == null) quote = true;
      else sum += line || 0;
    });
    var dock = document.getElementById("pick-dock");
    dock.classList.toggle("is-on", count > 0);
    document.getElementById("pick-count").textContent = count + (count > 1 ? " supports" : " support");
    document.getElementById("pick-sum").textContent = quote ? "Sur devis" : euro.format(sum);
    document.getElementById("pick-go").textContent = quote ? "Demander un devis" : "Continuer";
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (pricing && pricing.ready) await pricing.ready;
    var grid = document.getElementById("pick-grid");
    if (!grid) return;
    grid.innerHTML = catalog.map(function (entry, i) {
      return '<article class="pick"><div class="pick-ico">' + entry.icon + "</div><h3>" + entry.name + '</h3><p class="pick-price">' +
        pricing.display(entry.key) + '</p><div class="qty">' +
        '<button type="button" data-dec="' + i + '" aria-label="Retirer un ' + entry.name + '">−</button>' +
        '<span data-n="' + i + '">0</span>' +
        '<button type="button" data-inc="' + i + '" aria-label="Ajouter un ' + entry.name + '">+</button></div></article>';
    }).join("");

    grid.addEventListener("click", function (e) {
      var inc = e.target.closest("[data-inc]");
      var dec = e.target.closest("[data-dec]");
      if (inc) qty[inc.getAttribute("data-inc")] += 1;
      if (dec) qty[dec.getAttribute("data-dec")] = Math.max(0, qty[dec.getAttribute("data-dec")] - 1);
      if (inc || dec) paint();
    });

    document.getElementById("pick-go").addEventListener("click", function () {
      var picks = [];
      qty.forEach(function (n, i) {
        if (!n) return;
        var item = Object.assign({ qty: n }, catalog[i].item);
        picks.push(item);
      });
      sessionStorage.setItem("carpeo-picks", JSON.stringify(picks));
    });
    paint();
  });
})();
