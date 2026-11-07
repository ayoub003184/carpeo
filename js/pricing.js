(function () {
  "use strict";

  var STORAGE_KEY = "carpeo-pricing-v1";
  var euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

  var DEFINITIONS = {
    sofa2Straight: { group: "Canapés", label: "Canapé droit, 2 places", mode: "price", price: 89 },
    sofa3Straight: { group: "Canapés", label: "Canapé droit, 3 places", mode: "price", price: 99 },
    sofa4Straight: { group: "Canapés", label: "Canapé droit, 4 places", mode: "quote", price: 0 },
    sofa2Angle: { group: "Canapés", label: "Canapé d’angle, 2 places", mode: "price", price: 119 },
    sofa3Angle: { group: "Canapés", label: "Canapé d’angle, 3 places", mode: "price", price: 139 },
    sofa4Angle: { group: "Canapés", label: "Canapé d’angle, 4 places", mode: "quote", price: 0 },
    sofa2Meridienne: { group: "Canapés", label: "Méridienne, 2 places", mode: "price", price: 119 },
    sofa3Meridienne: { group: "Canapés", label: "Méridienne, 3 places", mode: "price", price: 139 },
    sofaPanoramic: { group: "Canapés", label: "Canapé panoramique", mode: "quote", price: 0 },
    sofaConvertible: { group: "Canapés", label: "Canapé convertible", mode: "quote", price: 0 },
    mattress1: { group: "Literie", label: "Matelas, une face", mode: "price", price: 79 },
    mattress2: { group: "Literie", label: "Matelas, deux faces", mode: "price", price: 89 },
    headboard: { group: "Literie", label: "Tête de lit", mode: "quote", price: 0 },
    armchair: { group: "Assises", label: "Fauteuil", mode: "price", price: 49 },
    chair: { group: "Assises", label: "Chaise rembourrée", mode: "price", price: 25 },
    chairs6: { group: "Assises", label: "Lot de 6 chaises", mode: "price", price: 90 },
    rug: { group: "Surfaces", label: "Tapis", mode: "quote", price: 39 },
    carpet: { group: "Surfaces", label: "Moquette", mode: "quote", price: 0 },
    cushion: { group: "Autres textiles", label: "Coussin", mode: "quote", price: 0 },
    other: { group: "Autres textiles", label: "Autre demande", mode: "quote", price: 0 }
  };

  function defaults() {
    var items = {};
    Object.keys(DEFINITIONS).forEach(function (key) {
      items[key] = { mode: DEFINITIONS[key].mode, price: DEFINITIONS[key].price };
    });
    return { deposit: 20, items: items };
  }

  function load() {
    var result = defaults();
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || typeof stored !== "object") return result;
      var deposit = Number(stored.deposit);
      if (isFinite(deposit) && deposit >= 0) result.deposit = deposit;
      Object.keys(result.items).forEach(function (key) {
        var item = stored.items && stored.items[key];
        if (!item) return;
        result.items[key].mode = item.mode === "price" ? "price" : "quote";
        var price = Number(item.price);
        if (isFinite(price) && price >= 0) result.items[key].price = price;
      });
    } catch (error) {
      return result;
    }
    return result;
  }

  function save(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    return defaults();
  }

  function get(key) {
    var settings = load();
    return settings.items[key] || { mode: "quote", price: 0 };
  }

  function price(key) {
    var item = get(key);
    return item.mode === "price" ? item.price : null;
  }

  function display(key) {
    var item = get(key);
    return item.mode === "price" ? euro.format(item.price) : "Sur devis";
  }

  function option(prefix, key) {
    return prefix + " — " + display(key).toLowerCase().replace(/^sur/, "sur");
  }

  function render(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-price-key]").forEach(function (node) {
      node.textContent = display(node.getAttribute("data-price-key"));
    });
    scope.querySelectorAll("[data-deposit]").forEach(function (node) {
      node.textContent = euro.format(load().deposit);
    });
  }

  window.CARPEO_PRICING = {
    storageKey: STORAGE_KEY,
    definitions: DEFINITIONS,
    defaults: defaults,
    load: load,
    save: save,
    reset: reset,
    get: get,
    price: price,
    display: display,
    option: option,
    render: render,
    euro: euro
  };

  document.addEventListener("DOMContentLoaded", function () { render(document); });
})();
