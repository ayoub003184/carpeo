(function () {
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.2c.4 4.6 2.2 6.6 6.8 7.2-4.6.5-6.4 2.6-6.8 7.2-.4-4.6-2.2-6.7-6.8-7.2 4.6-.6 6.4-2.6 6.8-7.2z"/></svg>';

  document.addEventListener("DOMContentLoaded", function () {
    var header = document.querySelector("[data-header]");
    var btn = document.querySelector(".nav-btn");
    var nav = document.getElementById("menu");
    var page = document.body.getAttribute("data-nav");
    if (nav && page) {
      nav.querySelectorAll("a").forEach(function (a) {
        if (a.getAttribute("data-nav") === page) a.setAttribute("aria-current", "page");
      });
    }
    function onScroll() {
      if (!header) return;
      header.classList.toggle("is-compact", window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    if (btn && nav) {
      btn.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    document.querySelectorAll(".spark").forEach(function (el) { el.innerHTML = STAR; });

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll(".reveal").forEach(function (el, i) {
      el.style.animationDelay = reduce ? "0s" : (i % 4) * 0.08 + "s";
    });
    if ("IntersectionObserver" in window && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
    } else {
      document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-in"); });
    }

    document.querySelectorAll("[data-count]").forEach(function (el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      var suffix = el.getAttribute("data-suffix") || "";
      if (reduce) {
        el.textContent = target.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        return;
      }
      var start = performance.now();
      function tick(now) {
        var p = Math.min(1, (now - start) / 900);
        var val = target * (1 - Math.pow(1 - p, 3));
        el.textContent = val.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    document.querySelectorAll("[data-ba]").forEach(function (box) {
      var range = box.querySelector(".ba-range");
      function set(v) { box.style.setProperty("--pos", v + "%"); }
      set(range.value);
      range.addEventListener("input", function () { set(range.value); });
    });

    var cfg = window.CARPEO || {};
    document.querySelectorAll("[data-email]").forEach(function (el) {
      el.textContent = cfg.email;
      if (el.tagName === "A") el.href = "mailto:" + cfg.email;
    });
    document.querySelectorAll("[data-site]").forEach(function (el) { el.textContent = cfg.siteLabel; });
    document.querySelectorAll("[data-area]").forEach(function (el) { el.textContent = cfg.area; });
    document.querySelectorAll("[data-hours]").forEach(function (el) { el.textContent = cfg.hours; });
    document.querySelectorAll("[data-phone]").forEach(function (el) {
      el.textContent = cfg.phone ? cfg.phone : "Numéro à confirmer";
    });

    function reach(kind) {
      if (kind === "phone" && cfg.phone) {
        window.location.href = "tel:" + cfg.phone.replace(/\s/g, "");
        return;
      }
      if (kind === "wa" && cfg.whatsapp) {
        window.open("https://wa.me/" + cfg.whatsapp.replace(/\D/g, ""), "_blank", "noopener");
        return;
      }
      var msg = kind === "wa"
        ? "Le numéro WhatsApp n'est pas encore renseigné. Écrivez à " + cfg.email + "."
        : "Le numéro de téléphone n'est pas encore renseigné. Écrivez à " + cfg.email + ".";
      var box = document.getElementById("reach-note");
      if (!box) {
        box = document.createElement("div");
        box.id = "reach-note";
        box.className = "cookie";
        box.setAttribute("role", "status");
        document.body.appendChild(box);
      }
      box.innerHTML = "<p>" + msg + "</p><button type='button' class='btn btn-night' id='reach-close'>Fermer</button>";
      document.getElementById("reach-close").onclick = function () { box.remove(); };
    }
    document.querySelectorAll("[data-wa]").forEach(function (el) {
      el.addEventListener("click", function () { reach("wa"); });
    });
    document.querySelectorAll("[data-call]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (!cfg.phone) { e.preventDefault(); reach("phone"); }
      });
    });

    var form = document.getElementById("contact-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var ok = true;
        form.querySelectorAll("[required]").forEach(function (field) {
          var err = field.parentElement.querySelector(".field-error");
          var emailBad = field.type === "email" && field.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value);
          if (!field.value.trim() || emailBad) {
            ok = false;
            field.setAttribute("aria-invalid", "true");
            if (err) err.hidden = false;
          } else {
            field.removeAttribute("aria-invalid");
            if (err) err.hidden = true;
          }
        });
        if (!ok) return;
        if (window.carpeoTrack) window.carpeoTrack("Contact", { method: "form" });
        form.hidden = true;
        document.getElementById("contact-done").hidden = false;
      });
    }
  });
})();
