(function () {
  "use strict";
  var STORAGE_KEY = "carpeo-pricing-v2";
  var euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var DEFINITIONS = {
    sofa2Straight:{group:"Canapés",label:"Canapé droit, 2 places",mode:"price",price:89},sofa3Straight:{group:"Canapés",label:"Canapé droit, 3 places",mode:"price",price:99},sofa4Straight:{group:"Canapés",label:"Canapé droit, 4 places",mode:"quote",price:0},sofa2Angle:{group:"Canapés",label:"Canapé d’angle, 2 places",mode:"price",price:119},sofa3Angle:{group:"Canapés",label:"Canapé d’angle, 3 places",mode:"price",price:139},sofa4Angle:{group:"Canapés",label:"Canapé d’angle, 4 places",mode:"quote",price:0},sofa2Meridienne:{group:"Canapés",label:"Méridienne, 2 places",mode:"price",price:119},sofa3Meridienne:{group:"Canapés",label:"Méridienne, 3 places",mode:"price",price:139},sofaPanoramic:{group:"Canapés",label:"Canapé panoramique",mode:"quote",price:0},sofaConvertible:{group:"Canapés",label:"Canapé convertible",mode:"quote",price:0},mattress1:{group:"Literie",label:"Matelas, une face",mode:"price",price:79},mattress2:{group:"Literie",label:"Matelas, deux faces",mode:"price",price:89},headboard:{group:"Literie",label:"Tête de lit",mode:"quote",price:0},armchair:{group:"Assises",label:"Fauteuil",mode:"price",price:49},chair:{group:"Assises",label:"Chaise rembourrée",mode:"price",price:25},chairs6:{group:"Assises",label:"Lot de 6 chaises",mode:"price",price:90},rug:{group:"Surfaces",label:"Tapis",mode:"quote",price:39},carpet:{group:"Surfaces",label:"Moquette",mode:"quote",price:0},cushion:{group:"Autres textiles",label:"Coussin",mode:"quote",price:0},other:{group:"Autres textiles",label:"Autre demande",mode:"quote",price:0}
  };
  function defaults() {
    var items = {};
    Object.keys(DEFINITIONS).forEach(function (k) {
      items[k] = { mode: DEFINITIONS[k].mode, price: DEFINITIONS[k].price };
    });
    var cfg = window.CARPEO || {};
    return {
      deposit: 20,
      area: cfg.area || "Intervention à domicile",
      hours: cfg.hours || "7 jours sur 7, de 9 h à 19 h",
      updatedAt: 0,
      items: items
    };
  }
  function normalise(data) {
    var out = defaults();
    if (!data) return out;
    if (data.deposit != null) out.deposit = Math.max(0, Number(data.deposit) || 0);
    if (data.area && String(data.area).trim()) out.area = String(data.area).trim();
    if (data.hours && String(data.hours).trim()) out.hours = String(data.hours).trim();
    if (data.updatedAt != null) out.updatedAt = Number(data.updatedAt) || 0;
    if (data.items) {
      Object.keys(out.items).forEach(function (k) {
        var v = data.items[k];
        if (!v) return;
        out.items[k].mode = v.mode === "price" ? "price" : "quote";
        out.items[k].price = Math.max(0, Number(v.price) || 0);
        if (v.label) DEFINITIONS[k].label = v.label;
        if (v.group) DEFINITIONS[k].group = v.group;
      });
    }
    return out;
  }
  function readLocalCache() {
    var base = null;
    try {
      base = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) { base = null; }
    var norm = normalise(base);
    try {
      var adminStore = JSON.parse(localStorage.getItem("carpeo-admin-store-v1") || "null");
      if (adminStore && adminStore.settings) {
        if (adminStore.settings.area) norm.area = adminStore.settings.area;
        if (adminStore.settings.hours) norm.hours = adminStore.settings.hours;
        if (adminStore.settings.deposit != null) norm.deposit = Math.max(0, Number(adminStore.settings.deposit) || 0);
      }
      if (adminStore && adminStore.pricing && adminStore.pricing.items) {
        var adminUpd = Number(adminStore.pricing.updatedAt || 0);
        if (adminUpd >= norm.updatedAt) {
          norm = normalise(adminStore.pricing);
        }
      }
    } catch (e) {}
    return norm;
  }
  var cache = readLocalCache();
  function load() { return cache; }
  function get(k) { return cache.items[k] || { mode: "quote", price: 0 }; }
  function price(k) { var v = get(k); return v.mode === "price" ? v.price : null; }
  function display(k) { var v = get(k); return v.mode === "price" ? euro.format(v.price) : "Sur devis"; }
  function option(prefix, k) { return prefix + " — " + display(k).toLowerCase(); }
  function render(root) {
    var scope = root || document;
    if (window.CARPEO) {
      if (cache.area) window.CARPEO.area = cache.area;
      if (cache.hours) window.CARPEO.hours = cache.hours;
    }
    scope.querySelectorAll("[data-price-key]").forEach(function (n) {
      n.textContent = display(n.getAttribute("data-price-key"));
    });
    scope.querySelectorAll("[data-deposit]").forEach(function (n) {
      n.textContent = euro.format(cache.deposit);
    });
    if (cache.area) {
      scope.querySelectorAll("[data-area]").forEach(function (n) {
        n.textContent = cache.area;
      });
    }
    if (cache.hours) {
      scope.querySelectorAll("[data-hours]").forEach(function (n) {
        n.textContent = cache.hours;
      });
    }
  }
  async function refresh() {
    var local = readLocalCache();
    try {
      var r = await fetch("/api/pricing?t=" + Date.now(), { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
      if (!r.ok) throw new Error();
      var serverData = normalise(await r.json());
      if ((local.updatedAt || 0) > (serverData.updatedAt || 0)) {
        cache = local;
      } else {
        cache = serverData;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch (e) {}
      }
    } catch (e) {
      cache = local;
    }
    if (document.readyState !== "loading") render(document);
    return cache;
  }
  var ready = refresh();
  window.addEventListener("storage", function (ev) {
    if (ev.key === STORAGE_KEY || ev.key === "carpeo-admin-store-v1") {
      cache = readLocalCache();
      render(document);
    }
  });
  window.CARPEO_PRICING = { storageKey: STORAGE_KEY, definitions: DEFINITIONS, defaults: defaults, load: load, get: get, price: price, display: display, option: option, render: render, refresh: refresh, ready: ready, euro: euro };
  document.addEventListener("DOMContentLoaded", function () {
    render(document);
    ready.then(function () { render(document); });
  });
})();
