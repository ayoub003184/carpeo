(function () {
  var KEY = "carpeo-consent";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
    catch (e) { return null; }
  }

  function write(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
    apply(value);
  }

  function loadScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement("script");
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  }

  function apply(consent) {
    window.dataLayer = window.dataLayer || [];
    if (!consent) return;
    var c = window.CARPEO || {};
    if (consent.analytics && c.ga4Id && c.ga4Id.indexOf("X") === -1) {
      loadScript("https://www.googletagmanager.com/gtag/js?id=" + c.ga4Id);
      window.dataLayer.push(["js", new Date()]);
      window.dataLayer.push(["config", c.ga4Id]);
    }
    if (consent.ads && c.metaPixelId && c.metaPixelId.indexOf("0") !== 0) {
      window.dataLayer.push({ event: "meta-pixel-ready", pixel: c.metaPixelId });
    }
    if (consent.ads && c.googleAdsId && c.googleAdsId.indexOf("X") === -1) {
      window.dataLayer.push({ event: "google-ads-ready", id: c.googleAdsId });
    }
    if ((consent.analytics || consent.ads) && c.gtmId && c.gtmId.indexOf("X") === -1) {
      loadScript("https://www.googletagmanager.com/gtm.js?id=" + c.gtmId);
    }
  }

  window.carpeoTrack = function (name, params) {
    var consent = read();
    if (!consent || (!consent.analytics && !consent.ads)) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name }, params || {}));
  };

  function banner() {
    var root = document.getElementById("cookie-root");
    if (!root || read()) return;
    root.innerHTML =
      '<div class="cookie" role="dialog" aria-labelledby="cookie-title">' +
      '<h2 id="cookie-title" style="font-size:1.15rem">Cookies et mesure d\'audience</h2>' +
      '<p>Les traceurs d\'audience et de publicité ne se déclenchent qu\'avec votre accord. Le refus est aussi simple que l\'acceptation.</p>' +
      '<div class="cookie-actions">' +
      '<button type="button" class="btn btn-night" id="cookie-refuse">Tout refuser</button>' +
      '<button type="button" class="btn btn-ocean" id="cookie-accept">Tout accepter</button>' +
      '</div>' +
      '<p><button type="button" class="mini" id="cookie-custom">Personnaliser</button></p>' +
      '<div id="cookie-panel" hidden>' +
      '<div class="checks">' +
      '<label><input type="checkbox" checked disabled> Nécessaires (toujours actifs)</label>' +
      '<label><input type="checkbox" id="ck-analytics"> Mesure d\'audience (GA4, GTM)</label>' +
      '<label><input type="checkbox" id="ck-ads"> Publicité (Meta Pixel, Google Ads)</label>' +
      '</div>' +
      '<button type="button" class="btn btn-night" id="cookie-save">Enregistrer mes choix</button>' +
      '</div></div>';
    document.getElementById("cookie-refuse").onclick = function () {
      write({ analytics: false, ads: false, necessary: true });
      root.innerHTML = "";
    };
    document.getElementById("cookie-accept").onclick = function () {
      write({ analytics: true, ads: true, necessary: true });
      root.innerHTML = "";
    };
    document.getElementById("cookie-custom").onclick = function () {
      document.getElementById("cookie-panel").hidden = false;
    };
    document.getElementById("cookie-save").onclick = function () {
      write({
        analytics: document.getElementById("ck-analytics").checked,
        ads: document.getElementById("ck-ads").checked,
        necessary: true
      });
      root.innerHTML = "";
    };
  }

  document.addEventListener("DOMContentLoaded", function () {
    apply(read());
    banner();
    var reopen = document.getElementById("cookie-reopen");
    if (reopen) {
      reopen.addEventListener("click", function (e) {
        e.preventDefault();
        localStorage.removeItem(KEY);
        banner();
      });
    }
  });
})();
