(function () {
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.2c.4 4.6 2.2 6.6 6.8 7.2-4.6.5-6.4 2.6-6.8 7.2-.4-4.6-2.2-6.7-6.8-7.2 4.6-.6 6.4-2.6 6.8-7.2z"/></svg>';

  document.addEventListener("DOMContentLoaded", function () {
    var header = document.querySelector("[data-header]");
    var btn = document.querySelector(".nav-btn");
    var nav = document.getElementById("menu");
    var page = document.body.getAttribute("data-nav");
    if (nav) {
      var privateLink = nav.querySelector('[data-nav="services"]');
      var proLink = nav.querySelector('[data-nav="pros"]');
      if (privateLink) privateLink.textContent = "Particuliers";
      if (proLink) proLink.textContent = "Professionnels";
      if (!nav.querySelector(".nav-book")) {
        var bookLink = document.createElement("a");
        bookLink.className = "nav-book";
        bookLink.href = "reserver.html";
        bookLink.textContent = "Réserver maintenant";
        nav.appendChild(bookLink);
      }
    }
    document.querySelectorAll(".site-footer p").forEach(function (p) {
      if (/prolongez la vie de vos textiles/i.test(p.textContent)) p.textContent = "Redonnez vie à vos textiles";
    });
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
      var stopped = false;
      range.addEventListener("input", function () { stopped = true; set(range.value); });
      if (!reduce) {
        var start = performance.now();
        function sweep(now) {
          if (stopped) return;
          var elapsed = now - start;
          var value = elapsed < 1500 ? 25 + (elapsed / 1500) * 50 : 75 - Math.min(1, (elapsed - 1500) / 1200) * 17;
          range.value = String(Math.round(value)); set(range.value);
          if (elapsed < 2700) requestAnimationFrame(sweep);
        }
        requestAnimationFrame(sweep);
      }
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
      if (cfg.phone && el.tagName === "A") el.setAttribute("href", "tel:" + cfg.phone.replace(/\s/g, ""));
      el.addEventListener("click", function (e) {
        if (!cfg.phone) { e.preventDefault(); reach("phone"); }
      });
    });
    var tax = document.getElementById("tax-price");
    if (tax) {
      var outA = document.getElementById("tax-off");
      var outB = document.getElementById("tax-due");
      function paintTax() {
        var n = Math.max(0, parseFloat(String(tax.value).replace(",", ".")) || 0);
        var off = Math.round(n * 50) / 100;
        outA.textContent = off.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
        outB.textContent = (Math.round((n - off) * 100) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
      }
      tax.addEventListener("input", paintTax);
      paintTax();
    }

    var homeReviews = document.getElementById("home-reviews");
    if (homeReviews) {
      (async function () {
        var list = [];
        try {
          var st = JSON.parse(localStorage.getItem("carpeo-admin-store-v1") || "null");
          if (st && Array.isArray(st.reviews)) {
            list = st.reviews.filter(function (r) { return (r.status || "Publié") === "Publié"; });
          }
        } catch (e) {}
        try {
          var r = await fetch("/api/reviews?t=" + Date.now(), { cache: "no-store" });
          if (r.ok) {
            var data = await r.json();
            if (Array.isArray(data.reviews) && data.reviews.length) {
              data.reviews.forEach(function (rv) {
                if (!list.some(function (x) { return x.customer_name === rv.customer_name && x.comment === rv.comment; })) {
                  list.push(rv);
                }
              });
            }
          }
        } catch (e) {}
        if (list.length) {
          var escHtml = function (s) {
            return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
              return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
          };
          homeReviews.innerHTML = list.slice(0, 6).map(function (rv) {
            var stars = "★".repeat(Math.min(5, Math.max(1, Number(rv.rating) || 5)));
            return '<blockquote class="reveal is-in">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.45rem">' +
              '<strong>' + escHtml(rv.customer_name || "Client CARPEO") + '</strong>' +
              '<span style="color:#fbbc04;letter-spacing:0.08em">' + stars + '</span>' +
              '</div>' +
              '<p style="margin-bottom:0.5rem">« ' + escHtml(rv.comment || "") + ' »</p>' +
              (rv.reply ? '<small class="note" style="display:block;border-top:1px solid var(--line);padding-top:0.4rem"><strong>Réponse CARPEO :</strong> ' + escHtml(rv.reply) + '</small>' : '') +
              '</blockquote>';
          }).join("");
        }
      })();
    }

    var form = document.getElementById("contact-form");
    if (form) {
      form.addEventListener("submit", async function (e) {
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
        var button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = "Envoi…";
        try {
          var response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: document.getElementById("c-nom").value, email: document.getElementById("c-email").value, phone: document.getElementById("c-tel").value, need: document.getElementById("c-need").value, message: document.getElementById("c-msg").value }) });
          var data = await response.json(); if (!response.ok) throw new Error(data.error || "Envoi impossible");
          if (window.carpeoTrack) window.carpeoTrack("Contact", { method: "form" });
          form.hidden = true; var done=document.getElementById("contact-done"); done.textContent="Votre message a bien été transmis à CARPEO. Nous vous répondrons rapidement."; done.hidden=false;
        } catch (error) { button.disabled=false; button.textContent="Envoyer mon message"; var done=document.getElementById("contact-done"); done.textContent=error.message; done.hidden=false; }
      });
    }
  });
})();
