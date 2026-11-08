(function () {
  "use strict";

  var csrf = sessionStorage.getItem("carpeo_admin_csrf") || "";
  var adminToken = sessionStorage.getItem("carpeo_admin_token") || "";
  var currentUser = null;
  var activeTab = "dashboard";
  var viewHost = document.getElementById("admin-view");
  var navTabs = document.getElementById("admin-nav-tabs");
  var app = document.getElementById("admin-app");
  var loginPanel = document.getElementById("login-panel");
  var statusToast = document.getElementById("admin-status");
  var quickBar = document.getElementById("admin-quick-bar");
  var userBadge = document.getElementById("admin-user-badge");

  var KANBAN_STAGES = [
    "Demande reçue",
    "Devis envoyé",
    "Accepté",
    "Acompte à régler",
    "Confirmé",
    "Planifié",
    "Terminé"
  ];
  var ALL_STATUSES = KANBAN_STAGES.concat(["Annulé"]);

  // Local UI state across views
  var ui = {
    period: "all",
    bookingMode: "kanban", // "kanban" | "list"
    bookingFilter: "all",
    bookingSearch: "",
    prefillCustomer: null,
    smartList: "all",
    contactSearch: "",
    selectedContactId: null,
    convChannel: "all",
    prefillRecipient: "",
    prefillSubject: "",
    weekOffset: 0,
    selectedDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    leafletMap: null
  };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function eur(v) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v) || 0);
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  var toastTimer = null;
  function note(msg) {
    if (!statusToast) return;
    if (!msg) { statusToast.hidden = true; return; }
    statusToast.innerHTML = "<span>" + esc(msg) + '</span><button type="button" class="mini" style="color:#fff" id="close-toast">Fermer</button>';
    statusToast.hidden = false;
    var closeBtn = document.getElementById("close-toast");
    if (closeBtn) closeBtn.onclick = function () { statusToast.hidden = true; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { statusToast.hidden = true; }, 5000);
  }

  // Embedded fallback store when running without Node/Supabase backend
  var LOCAL_STORE_KEY = "carpeo-admin-store-v3";
  function getLocalStore() {
    try {
      var raw = localStorage.getItem(LOCAL_STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    var day2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    var store = {
      loggedIn: false,
      user: { id: 1, email: "admin@carpeo.local", name: "Administrateur CARPEO", role: "admin" },
      settings: {
        deposit: "20",
        area: "Intervention à domicile et en entreprise",
        hours: "7 jours sur 7, de 9 h à 19 h",
        maps_url: "https://www.google.com/maps/place/Carpeo/@48.8350077,2.4096267,11z/data=!3m1!4b1!4m6!3m5!1s0x42afe645686fa375:0xe9c68ae617bca720!8m2!3d48.8350076!4d2.4096267!16s%2Fg%2F11zzsk71ns?entry=ttu&g_ep=EgoyMDI2MTEwMy4wIKXMDSoASAFQAw%3D%3D",
        auto_reminder_j1: "true",
        auto_quote_followup: "true",
        auto_review_request: "true",
        gtm_id: "GTM-XXXXXXX",
        ga4_id: "G-XXXXXXXX",
        meta_pixel_id: "000000000000000",
        google_ads_id: "AW-XXXXXXXX"
      },
      bookings: [
        {
          id: 1, ref: "CAR-8F4A219B", type: "reservation", status: "Planifié", slot: tomorrow + " 11:00",
          total: 139, deposit: 20, balance: 119, quote_amount: null, notes: "Code porte 4582B, 2e étage avec ascenseur.", tags: "Particulier, Fidèle",
          lat: 48.8648, lng: 2.3798, created_at: new Date().toISOString(),
          customer: { nom: "Martin", prenom: "Sophie", email: "sophie.martin@example.fr", tel: "06 12 34 56 78", adresse: "24 Rue Oberkampf", cp: "75011", ville: "Paris", heard: "Instagram" },
          items: [{ cat: "canape", places: "3", config: "angle", matiere: "Velours côtelé", qty: "1", frozenPrice: 139 }],
          attribution: { source: "Instagram", campaign: "reel_avant_apres" }
        },
        {
          id: 2, ref: "CAR-9E6D118A", type: "devis", status: "Devis envoyé", slot: null,
          total: null, deposit: 20, balance: null, quote_amount: 340, notes: "Moquette bureaux 45 m².", tags: "Professionnel B2B, Devis en attente",
          lat: 48.8924, lng: 2.2369, created_at: new Date().toISOString(),
          customer: { nom: "Agence Horizon", prenom: "Marc", email: "contact@agence-horizon.fr", tel: "01 42 68 55 00", adresse: "12 Esplanade du Général de Gaulle", cp: "92400", ville: "Courbevoie", heard: "Google" },
          items: [{ cat: "moquette", surface: "45", matiere: "Dalles polyamide", qty: "1" }],
          attribution: { source: "Google", campaign: "seo_moquette" }
        },
        {
          id: 3, ref: "CAR-7A2F441D", type: "devis", status: "Demande reçue", slot: null,
          total: null, deposit: 20, balance: null, quote_amount: null, notes: "Grand tapis berbère en laine 3m x 2m.", tags: "À chiffrer, Particulier",
          lat: 48.8534, lng: 2.3488, created_at: new Date().toISOString(),
          customer: { nom: "Benali", prenom: "Karim", email: "karim.benali@example.fr", tel: "06 77 44 55 66", adresse: "8 Rue de Rivoli", cp: "75004", ville: "Paris", heard: "Meta Ads" },
          items: [{ cat: "tapis", surface: "6", matiere: "Laine berbère", qty: "1" }],
          attribution: { source: "Meta Ads", campaign: "meta_tapis" }
        },
        {
          id: 4, ref: "CAR-2C4B883F", type: "devis", status: "Accepté", slot: day2 + " 14:00",
          total: 165, deposit: 20, balance: 145, quote_amount: 165, notes: "Devis accepté en ligne, prêt à planifier.", tags: "Particulier",
          lat: 48.8473, lng: 2.4395, created_at: new Date().toISOString(),
          customer: { nom: "Moreau", prenom: "Claire", email: "claire.moreau@example.fr", tel: "06 33 99 88 77", adresse: "19 Avenue du Château", cp: "94300", ville: "Vincennes", heard: "Google Ads" },
          items: [{ cat: "canape", places: "4", config: "panoramique", matiere: "Microfibre", qty: "1", frozenPrice: 165 }],
          attribution: { source: "Google Ads", campaign: "search_canape" }
        },
        {
          id: 5, ref: "CAR-1D8E332B", type: "reservation", status: "Terminé", slot: yesterday + " 08:00",
          total: 148, deposit: 20, balance: 0, quote_amount: null, notes: "Prestation terminée et solde réglé.", tags: "VIP, Fidèle",
          lat: 48.8718, lng: 2.3316, created_at: new Date().toISOString(),
          customer: { nom: "Laurent", prenom: "Émilie", email: "emilie.laurent@example.fr", tel: "06 21 43 65 87", adresse: "30 Rue La Fayette", cp: "75009", ville: "Paris", heard: "Google" },
          items: [{ cat: "canape", places: "3", config: "droit", qty: "1", frozenPrice: 99 }, { cat: "fauteuil", qty: "1", frozenPrice: 49 }],
          attribution: { source: "Google", campaign: "fiche_google_maps" }
        }
      ],
      contacts: [
        { id: 1, name: "Sophie Martin", email: "sophie.martin@example.fr", phone: "06 12 34 56 78", address: "24 Rue Oberkampf", city: "Paris", postal_code: "75011", status: "Client actif", tags: "VIP, Fidèle", notes: "Code porte 4582B", source: "Instagram", created_at: new Date().toISOString() },
        { id: 2, name: "Marc — Agence Horizon", email: "contact@agence-horizon.fr", phone: "01 42 68 55 00", address: "12 Esplanade du Général de Gaulle", city: "Courbevoie", postal_code: "92400", status: "En cours", tags: "Professionnel B2B", notes: "Moquette bureaux 45 m²", source: "Google", created_at: new Date().toISOString() },
        { id: 3, name: "Émilie Laurent", email: "emilie.laurent@example.fr", phone: "06 21 43 65 87", address: "30 Rue La Fayette", city: "Paris", postal_code: "75009", status: "Client actif", tags: "VIP, Fidèle", notes: "Cliente très satisfaite", source: "Google", created_at: new Date().toISOString() }
      ],
      conversations: [
        { id: 1, booking_id: 1, contact_id: 1, recipient: "06 12 34 56 78", subject: "Confirmation WhatsApp", channel: "whatsapp", direction: "inbound", body: "Bonjour, pouvez-vous bien prévoir le détachant café pour demain ?", status: "reçu", created_at: new Date().toISOString() },
        { id: 2, booking_id: 2, contact_id: 2, recipient: "contact@agence-horizon.fr", subject: "Devis CARPEO #CAR-9E6D118A", channel: "email", direction: "outbound", body: "Bonjour Marc, veuillez trouver votre devis de 340 € TTC.", status: "sent", created_at: new Date().toISOString() },
        { id: 3, booking_id: 3, contact_id: null, recipient: "@karim.benali", subject: "DM Instagram", channel: "instagram", direction: "inbound", body: "Bonjour CARPEO, je viens d'envoyer une demande de devis pour mon tapis berbère !", status: "reçu", created_at: new Date().toISOString() }
      ],
      tasks: [
        { id: 1, booking_id: 1, title: "Préparer détachant tanin & buse velours (CAR-8F4A219B)", due_at: tomorrow + "T11:00", status: "À faire", assignee: "Technicien 1", priority: "Haute" },
        { id: 2, booking_id: 3, title: "Chiffrer le devis tapis berbère 6m² (CAR-7A2F441D)", due_at: tomorrow + "T17:00", status: "À faire", assignee: "Commercial", priority: "Haute" }
      ],
      blockedSlots: [],
      payments: [
        { id: 1, booking_id: 1, ref: "CAR-8F4A219B", provider_id: "pi_demo_01", kind: "deposit", amount: 20, status: "paid", method: "stripe", created_at: new Date().toISOString() },
        { id: 2, booking_id: 5, ref: "CAR-1D8E332B", provider_id: "pi_demo_02", kind: "deposit", amount: 20, status: "paid", method: "stripe", created_at: new Date().toISOString() },
        { id: 3, booking_id: 5, ref: "CAR-1D8E332B", provider_id: "pi_demo_03", kind: "balance", amount: 128, status: "paid", method: "stripe", created_at: new Date().toISOString() }
      ],
      reviews: [
        { id: 1, customer_name: "Émilie Laurent", rating: 5, comment: "Le canapé en velours et le fauteuil ont retrouvé leur éclat d'origine. Ponctuel et très soigné !", reply: "Merci beaucoup Émilie pour votre confiance !", status: "Publié", created_at: new Date().toISOString() },
        { id: 2, customer_name: "Sophie Martin", rating: 5, comment: "Matériel professionnel et séchage rapide, je recommande.", reply: "Merci Sophie !", status: "Publié", created_at: new Date().toISOString() }
      ],
      notifications: [
        { id: 1, channel: "email", template: "j-1-reminder", status: "sent", send_at: new Date().toISOString(), payload: { ref: "CAR-8F4A219B" } }
      ],
      users: [
        { id: 1, email: "admin@carpeo.local", name: "Administrateur CARPEO", role: "admin", created_at: new Date().toISOString() }
      ],
      audit: [
        { id: 1, email: "admin@carpeo.local", action: "system.ready", entity_type: "system", entity_id: "1", created_at: new Date().toISOString() }
      ]
    };
    saveLocalStore(store);
    return store;
  }
  function saveLocalStore(store) {
    try { localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function localApi(url, options) {
    options = options || {};
    var method = (options.method || "GET").toUpperCase();
    var bodyObj = {};
    if (options.body) {
      try { bodyObj = typeof options.body === "string" ? JSON.parse(options.body) : options.body; } catch (e) {}
    }
    var path = url.split("?")[0];
    var st = getLocalStore();

    if (path === "/api/auth/login" && method === "POST") {
      st.loggedIn = true;
      saveLocalStore(st);
      return { user: st.user, csrf: "local-csrf" };
    }
    if (path === "/api/auth/me") {
      if (!st.loggedIn) throw new Error("Authentification requise");
      return { user: st.user, csrf: "local-csrf" };
    }
    if (path === "/api/auth/logout") {
      st.loggedIn = false;
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/dashboard") {
      var group = {};
      ALL_STATUSES.forEach(function (s) { group[s] = 0; });
      st.bookings.forEach(function (b) { group[b.status] = (group[b.status] || 0) + 1; });
      var active = st.bookings.filter(function (b) { return b.status !== "Annulé" && (b.total != null || b.quote_amount != null); });
      var rev = active.reduce(function (s, b) { return s + Number(b.total != null ? b.total : b.quote_amount || 0); }, 0);
      var deps = active.reduce(function (s, b) { return s + Number(b.deposit || 20); }, 0);
      var bals = active.reduce(function (s, b) { return s + Number(b.balance || 0); }, 0);
      var coll = st.payments.filter(function (p) { return p.status === "paid"; }).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
      var won = st.bookings.filter(function (b) { return ["Accepté", "Confirmé", "Planifié", "Terminé"].indexOf(b.status) !== -1; }).length;
      return {
        counts: Object.keys(group).map(function (k) { return { status: k, count: group[k] }; }),
        money: { revenue: rev, deposits: deps, balances: bals, collected: coll, average: active.length ? Math.round(rev / active.length) : 0 },
        contacts: st.contacts.length,
        conversion: st.bookings.length ? Math.round((won / st.bookings.length) * 1000) / 10 : 0,
        cancellations: { count: group["Annulé"] || 0, rate: 0 },
        satisfaction: { rating: 5.0, count: st.reviews.length },
        serviceBreakdown: [{ category: "canape", count: 3 }, { category: "tapis", count: 1 }, { category: "moquette", count: 1 }],
        attribution: [
          { source: "Google Ads", leads: 2, won: 2, revenue: 313 },
          { source: "Instagram", leads: 1, won: 1, revenue: 139 },
          { source: "Google", leads: 2, won: 1, revenue: 340 }
        ],
        alerts: {
          quotesToPrice: group["Demande reçue"] || 0,
          quotesToConvert: group["Accepté"] || 0,
          unreadMessages: st.conversations.filter(function (c) { return c.direction === "inbound" && c.status === "reçu"; }).length,
          pendingTasks: st.tasks.filter(function (t) { return t.status !== "Terminé"; }).length
        }
      };
    }
    if (path === "/api/admin/bookings" && method === "GET") return { bookings: st.bookings };
    if (path === "/api/admin/bookings" && method === "POST") {
      var nb = {
        id: Date.now(),
        ref: "CAR-" + Math.random().toString(16).slice(2, 10).toUpperCase(),
        type: bodyObj.type || "reservation",
        status: bodyObj.status || "Confirmé",
        slot: bodyObj.slot || null,
        total: bodyObj.total ? Number(bodyObj.total) : 99,
        deposit: 20,
        balance: bodyObj.total ? Math.max(0, Number(bodyObj.total) - 20) : 79,
        quote_amount: bodyObj.quoteAmount ? Number(bodyObj.quoteAmount) : null,
        notes: bodyObj.notes || "",
        tags: bodyObj.tags || "",
        customer: bodyObj.customer || {},
        items: bodyObj.items || [{ cat: "canape", places: "3", config: "droit", qty: "1" }],
        created_at: new Date().toISOString()
      };
      st.bookings.unshift(nb);
      saveLocalStore(st);
      return { id: nb.id, ref: nb.ref, key: "LOCALKEY" };
    }
    var mBook = /^\/api\/admin\/bookings\/(\d+)$/.exec(path);
    if (mBook) {
      var bid = Number(mBook[1]);
      var bk = st.bookings.find(function (x) { return Number(x.id) === bid; });
      if (method === "DELETE") {
        st.bookings = st.bookings.filter(function (x) { return Number(x.id) !== bid; });
        saveLocalStore(st);
        return { ok: true };
      }
      if (bk && method === "PATCH") {
        if (bodyObj.status) bk.status = bodyObj.status;
        if (bodyObj.slot !== undefined) bk.slot = bodyObj.slot;
        if (bodyObj.notes !== undefined) bk.notes = bodyObj.notes;
        if (bodyObj.tags !== undefined) bk.tags = bodyObj.tags;
        if (bodyObj.quoteAmount !== undefined && bodyObj.quoteAmount !== "") bk.quote_amount = Number(bodyObj.quoteAmount);
        if (bodyObj.action === "sendQuote") bk.status = "Devis envoyé";
        if (bodyObj.action === "convertToIntervention") {
          bk.status = "Planifié";
          if (bk.quote_amount && !bk.total) {
            bk.total = bk.quote_amount;
            bk.deposit = 20;
            bk.balance = Math.max(0, bk.total - 20);
          }
        }
        saveLocalStore(st);
        return { ok: true };
      }
    }
    if (path === "/api/admin/contacts" && method === "GET") {
      return {
        contacts: st.contacts.map(function (c) {
          var cb = st.bookings.filter(function (b) { return (b.customer && b.customer.email) === c.email; });
          var spent = cb.reduce(function (s, b) { return s + Number(b.total || b.quote_amount || 0); }, 0);
          return Object.assign({}, c, {
            bookingsCount: cb.length,
            totalSpent: spent,
            averageBasket: cb.length ? Math.round(spent / cb.length) : 0,
            bookings: cb,
            timeline: cb.map(function (b) { return { date: b.created_at, label: "Dossier " + b.ref + " (" + b.status + ")", detail: b.type }; })
          });
        })
      };
    }
    if (path === "/api/admin/contacts" && method === "POST") {
      st.contacts.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, bodyObj));
      saveLocalStore(st);
      return { ok: true };
    }
    var mCont = /^\/api\/admin\/contacts\/(\d+)$/.exec(path);
    if (mCont) {
      var cid = Number(mCont[1]);
      if (method === "DELETE") st.contacts = st.contacts.filter(function (x) { return Number(x.id) !== cid; });
      if (method === "PATCH") {
        var ct = st.contacts.find(function (x) { return Number(x.id) === cid; });
        if (ct) Object.assign(ct, bodyObj);
      }
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/conversations") {
      if (method === "POST") {
        st.conversations.unshift({ id: Date.now(), channel: bodyObj.channel || "email", direction: bodyObj.direction || "outbound", recipient: bodyObj.recipient || "", subject: bodyObj.subject || "", body: bodyObj.body || "", status: bodyObj.direction === "inbound" ? "reçu" : "sent", created_at: new Date().toISOString() });
        saveLocalStore(st);
        return { ok: true };
      }
      return { conversations: st.conversations };
    }
    var mConv = /^\/api\/admin\/conversations\/(\d+)$/.exec(path);
    if (mConv && method === "PATCH") {
      var cv = st.conversations.find(function (x) { return Number(x.id) === Number(mConv[1]); });
      if (cv) Object.assign(cv, bodyObj);
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/tasks") {
      if (method === "POST") {
        st.tasks.unshift({ id: Date.now(), title: bodyObj.title, due_at: bodyObj.dueAt, assignee: bodyObj.assignee || "Équipe", priority: bodyObj.priority || "Normale", status: "À faire" });
        saveLocalStore(st);
        return { ok: true };
      }
      return { tasks: st.tasks, blockedSlots: st.blockedSlots };
    }
    var mTask = /^\/api\/admin\/tasks\/(\d+)$/.exec(path);
    if (mTask) {
      var tid = Number(mTask[1]);
      if (method === "DELETE") st.tasks = st.tasks.filter(function (x) { return Number(x.id) !== tid; });
      if (method === "PATCH") {
        var tk = st.tasks.find(function (x) { return Number(x.id) === tid; });
        if (tk) Object.assign(tk, bodyObj);
      }
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/blocked-slots") {
      if (method === "POST") {
        st.blockedSlots.unshift({ id: Date.now(), slot_start: bodyObj.start, slot_end: bodyObj.end || bodyObj.start, reason: bodyObj.reason || "Indisponible" });
        saveLocalStore(st);
        return { ok: true };
      }
      return { blockedSlots: st.blockedSlots };
    }
    var mBlk = /^\/api\/admin\/blocked-slots\/(\d+)$/.exec(path);
    if (mBlk && method === "DELETE") {
      st.blockedSlots = st.blockedSlots.filter(function (x) { return Number(x.id) !== Number(mBlk[1]); });
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/optimize-route") {
      var stops = st.bookings.filter(function (b) { return b.slot; }).map(function (b, idx) {
        return { id: b.id, ref: b.ref, status: b.status, slot: b.slot, customer: b.customer || {}, lat: b.lat || 48.8566, lng: b.lng || 2.3522, routeOrder: idx + 1, legKm: 4.2, legMinutes: 14 };
      });
      return { base: { lat: 48.8350076, lng: 2.4096267, label: "Départ CARPEO" }, totalKm: stops.length * 4.2, totalMinutes: stops.length * 14, stops: stops };
    }
    if (path === "/api/admin/payments") {
      if (method === "POST") {
        st.payments.unshift({ id: Date.now(), booking_ref: bodyObj.ref || "CAR-DEMO", ref: bodyObj.ref || "CAR-DEMO", provider_id: "pi_local_" + Date.now(), kind: bodyObj.kind || "deposit", amount: Number(bodyObj.amount || 20), status: "paid", method: bodyObj.method || "stripe", created_at: new Date().toISOString() });
        saveLocalStore(st);
        return { ok: true };
      }
      return { payments: st.payments, stripeConfigured: false };
    }
    var mRef = /^\/api\/admin\/payments\/(\d+)\/refund$/.exec(path);
    if (mRef && method === "POST") {
      var py = st.payments.find(function (x) { return Number(x.id) === Number(mRef[1]); });
      if (py) py.status = "refunded";
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/reviews") {
      if (method === "POST") {
        st.reviews.unshift({ id: Date.now(), customer_name: bodyObj.customerName, rating: Number(bodyObj.rating || 5), comment: bodyObj.comment || "", reply: bodyObj.reply || "", status: "Publié", created_at: new Date().toISOString() });
        saveLocalStore(st);
        return { ok: true };
      }
      return { reviews: st.reviews };
    }
    var mRev = /^\/api\/admin\/reviews\/(\d+)$/.exec(path);
    if (mRev) {
      if (method === "DELETE") st.reviews = st.reviews.filter(function (x) { return Number(x.id) !== Number(mRev[1]); });
      if (method === "PATCH") {
        var rv = st.reviews.find(function (x) { return Number(x.id) === Number(mRev[1]); });
        if (rv) Object.assign(rv, bodyObj);
      }
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/automations") return { notifications: st.notifications };
    if (path === "/api/admin/automations/run") {
      st.notifications.unshift({ id: Date.now(), kind: "reminder_j1", template: "reminder-j1", channel: "sms", status: "sent", send_at: new Date().toISOString(), booking_ref: "CAR-8F4A219B", payload: { ref: "CAR-8F4A219B" } });
      saveLocalStore(st);
      return { ok: true, queued: 2, dispatched: 2 };
    }
    if (path === "/api/admin/pricing") {
      var p = window.CARPEO_PRICING ? window.CARPEO_PRICING.load() : { deposit: 20, items: {} };
      if (method === "PUT") {
        p = JSON.parse(JSON.stringify(p));
        if (bodyObj.deposit != null) {
          p.deposit = Math.max(0, Number(bodyObj.deposit) || 0);
          st.settings.deposit = String(p.deposit);
        }
        Object.keys(bodyObj.items || {}).forEach(function (key) {
          if (!p.items[key]) return;
          p.items[key].mode = bodyObj.items[key].mode === "price" ? "price" : "quote";
          p.items[key].price = Math.max(0, Number(bodyObj.items[key].price) || 0);
        });
        try { localStorage.setItem(window.CARPEO_PRICING.storageKey, JSON.stringify(p)); } catch (e) {}
        saveLocalStore(st);
      }
      var itemsOut = {};
      if (window.CARPEO_PRICING) {
        Object.keys(window.CARPEO_PRICING.definitions).forEach(function (k) {
          var def = window.CARPEO_PRICING.definitions[k];
          var cur = (bodyObj.items && bodyObj.items[k]) || window.CARPEO_PRICING.get(k);
          itemsOut[k] = { label: def.label, group: def.group, mode: cur.mode, price: cur.price };
        });
      }
      return { deposit: Number(st.settings.deposit || 20), items: itemsOut };
    }
    if (path === "/api/admin/settings") {
      if (method === "PUT" && bodyObj.settings) {
        Object.assign(st.settings, bodyObj.settings);
        saveLocalStore(st);
        return { ok: true };
      }
      return { settings: st.settings, envStatus: { supabase: false, stripe: false } };
    }
    if (path === "/api/admin/users") {
      if (method === "POST") {
        st.users.push({ id: Date.now(), name: bodyObj.name, email: bodyObj.email, role: bodyObj.role || "team", created_at: new Date().toISOString() });
        saveLocalStore(st);
        return { ok: true };
      }
      return { users: st.users };
    }
    var mUsr = /^\/api\/admin\/users\/([^/]+)$/.exec(path);
    if (mUsr) {
      if (method === "DELETE") st.users = st.users.filter(function (x) { return String(x.id) !== String(mUsr[1]); });
      if (method === "PATCH") {
        var us = st.users.find(function (x) { return String(x.id) === String(mUsr[1]); });
        if (us) Object.assign(us, bodyObj);
      }
      saveLocalStore(st);
      return { ok: true };
    }
    if (path === "/api/admin/audit") return { audit: st.audit };
    if (path === "/api/admin/backup") return { file: "sauvegarde-locale-carpeo.json" };
    if (path === "/api/admin/seed") {
      localStorage.removeItem(LOCAL_STORE_KEY);
      var fresh = getLocalStore();
      fresh.loggedIn = true;
      saveLocalStore(fresh);
      return { ok: true, seeded: true };
    }
    return { ok: true };
  }

  async function api(url, options) {
    options = options || {};
    var origBody = options.body;
    options.headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (adminToken) options.headers["X-Admin-Token"] = adminToken;
    if (csrf) options.headers["X-CSRF-Token"] = csrf;
    if (options.body && typeof options.body !== "string") {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    try {
      var r = await fetch(url, options);
      var data = await r.json().catch(function () { return {}; });
      if (r.status === 503 || r.status === 404 || r.status === 405) {
        return localApi(url, { method: options.method, body: origBody });
      }
      if (!r.ok) throw new Error(data.error || "Erreur serveur (" + r.status + ")");
      return data;
    } catch (err) {
      if (err && err.message && !/fetch|network|Erreur serveur|Supabase/i.test(err.message)) {
        throw err;
      }
      return localApi(url, { method: options.method, body: origBody });
    }
  }

  function triggerDownload(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 250);
  }

  async function downloadCsv() {
    var d = await api("/api/admin/bookings");
    var rows = d.bookings || [];
    var csv = [
      "reference,type,statut,nom,prenom,email,telephone,adresse,code_postal,ville,creneau,total,acompte,solde,devis_montant,tags,cree_le"
    ].concat(rows.map(function (r) {
      var c = r.customer || {};
      return [r.ref, r.type, r.status, c.nom, c.prenom, c.email, c.tel, c.adresse, c.cp, c.ville, r.slot, r.total, r.deposit, r.balance, r.quote_amount, r.tags, r.created_at]
        .map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(",");
    })).join("\r\n");
    triggerDownload("carpeo-dossiers.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
    note("Export CSV téléchargé (" + rows.length + " dossiers).");
  }

  async function downloadIcs() {
    var d = await api("/api/admin/bookings");
    var rows = (d.bookings || []).filter(function (r) { return r.slot && r.status !== "Annulé"; });
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CARPEO//Planning//FR", "X-WR-CALNAME:CARPEO Interventions"];
    rows.forEach(function (row) {
      var c = row.customer || {};
      var cleanSlot = String(row.slot || "").replace(/[-: ]/g, "");
      var start = cleanSlot.slice(0, 8) + "T" + (cleanSlot.slice(8, 12) || "0800") + "00";
      var endHour = String(Math.min(22, Number(cleanSlot.slice(8, 10) || 8) + 2)).padStart(2, "0");
      var end = cleanSlot.slice(0, 8) + "T" + endHour + (cleanSlot.slice(10, 12) || "00") + "00";
      lines.push(
        "BEGIN:VEVENT",
        "UID:" + row.ref + "@carpeo.fr",
        "DTSTART:" + start,
        "DTEND:" + end,
        "SUMMARY:CARPEO [" + row.status + "] - " + (c.prenom || "") + " " + (c.nom || "Client"),
        "DESCRIPTION:" + String(row.notes || "").replace(/\r?\n/g, " ") + " - Tel: " + (c.tel || ""),
        "LOCATION:" + [c.adresse, c.cp, c.ville].filter(Boolean).join(" "),
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    triggerDownload("carpeo-planning.ics", lines.join("\r\n"), "text/calendar;charset=utf-8");
    note("Planning .ics exporté (" + rows.length + " interventions).");
  }

  function renderShell(html) {
    if (ui.leafletMap) {
      try { ui.leafletMap.remove(); } catch (e) {}
      ui.leafletMap = null;
    }
    viewHost.innerHTML = html;
    viewHost.querySelectorAll('a[href="/api/admin/export.csv"]').forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); downloadCsv(); };
    });
    viewHost.querySelectorAll('a[href="/api/admin/calendar.ics"]').forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); downloadIcs(); };
    });
  }

  // ============================================================================
  // A. TABLEAU DE BORD (DASHBOARD) & ATTRIBUTION MARKETING
  // ============================================================================
  async function viewDashboard() {
    var d = await api("/api/admin/dashboard?period=" + encodeURIComponent(ui.period));
    var maxPipe = Math.max.apply(null, (d.counts || []).map(function (x) { return x.count; }).concat([1]));
    var maxCat = Math.max.apply(null, (d.serviceBreakdown || []).map(function (x) { return x.count; }).concat([1]));
    var alerts = d.alerts || {};

    var html =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">' +
      '<div class="Subtle-pills" style="margin:0">' +
      [["all", "Toutes les périodes"], ["7d", "7 derniers jours"], ["30d", "30 derniers jours"], ["90d", "90 derniers jours"]].map(function (p) {
        return '<button type="button" class="pill ' + (ui.period === p[0] ? "is-on" : "") + '" data-period="' + p[0] + '">' + p[1] + '</button>';
      }).join("") +
      '</div>' +
      '<div class="btn-row" style="margin:0">' +
      '<button type="button" class="btn btn-ghost" id="btn-seed" style="min-height:38px;padding:0.4rem 0.85rem;font-size:0.88rem">Synchroniser données démo / Supabase</button>' +
      '</div></div>' +

      // Notifications internes / Alertes opérationnelles
      '<div class="alert-strip">' +
      '<div class="alert-item" data-goto="bookings"><div><span>Devis à chiffrer</span><br><small class="note">Étape 1 du pipeline</small></div><strong>' + (alerts.quotesToPrice || 0) + '</strong></div>' +
      '<div class="alert-item" data-goto="bookings"><div><span>Devis acceptés à planifier</span><br><small class="note">Prêts pour intervention</small></div><strong>' + (alerts.quotesToConvert || 0) + '</strong></div>' +
      '<div class="alert-item" data-goto="conversations"><div><span>Messages entrants</span><br><small class="note">Boîte unifiée</small></div><strong>' + (alerts.unreadMessages || 0) + '</strong></div>' +
      '<div class="alert-item" data-goto="planning"><div><span>Tâches d\'équipe actives</span><br><small class="note">Planning &amp; tournées</small></div><strong>' + (alerts.pendingTasks || 0) + '</strong></div>' +
      '</div>' +

      // 6 KPIs exigés au §3.A
      '<div class="stats">' +
      '<div><strong>' + eur(d.money.revenue) + '</strong><span>Chiffre d’affaires</span><small>Confirmé &amp; en cours</small></div>' +
      '<div><strong>' + eur(d.money.collected) + '</strong><span>Encaissements reçus</span><small>Soldes restants : ' + eur(d.money.balances) + '</small></div>' +
      '<div><strong>' + d.conversion + ' %</strong><span>Taux de conversion</span><small>' + d.contacts + ' contacts CRM</small></div>' +
      '<div><strong>' + (d.cancellations ? d.cancellations.rate : 0) + ' %</strong><span>Taux d’annulation</span><small>' + (d.cancellations ? d.cancellations.count : 0) + ' dossier(s) annulé(s)</small></div>' +
      '<div><strong>' + eur(d.money.average) + '</strong><span>Panier moyen</span><small>Acomptes : ' + eur(d.money.deposits) + '</small></div>' +
      '<div><strong>' + (d.satisfaction ? d.satisfaction.rating : "4.9") + ' / 5 ★</strong><span>Satisfaction client</span><small>' + (d.satisfaction ? d.satisfaction.count : 0) + ' avis vérifiés</small></div>' +
      '</div>' +

      '<div class="grid-2" style="align-items:stretch;margin-bottom:1.25rem">' +
      // Graphique 1 : Entonnoir Pipeline 7 étapes (interactif)
      '<div class="panel">' +
      '<h3>Pipeline commercial (7 étapes)</h3>' +
      '<p class="note">Cliquez sur une étape pour filtrer les dossiers correspondants.</p>' +
      '<div class="pipeline-chart">' +
      (d.counts || []).map(function (x) {
        var pct = Math.max(4, Math.round((x.count / maxPipe) * 100));
        return '<div data-pipe-stage="' + esc(x.status) + '" style="cursor:pointer" title="Voir les dossiers : ' + esc(x.status) + '"><span>' + esc(x.status) + '</span><i style="width:' + pct + '%"></i><strong>' + x.count + '</strong></div>';
      }).join("") +
      '</div></div>' +

      // Graphique 2 : Répartition par prestation textile + Suivi financier
      '<div class="panel">' +
      '<h3>Volume par famille de textile &amp; Trésorerie</h3>' +
      '<p class="note">Articles traités et répartition financière des encaissements.</p>' +
      '<div class="pipeline-chart">' +
      ((d.serviceBreakdown && d.serviceBreakdown.length) ? d.serviceBreakdown.map(function (s) {
        var pct = Math.max(6, Math.round((s.count / maxCat) * 100));
        return '<div><span style="text-transform:capitalize">' + esc(s.category) + '</span><i style="width:' + pct + '%"></i><strong>' + s.count + '</strong></div>';
      }).join("") : '<p class="note">Aucune prestation enregistrée sur cette période.</p>') +
      '</div>' +
      '<hr style="border:0;border-top:1px solid var(--line);margin:0.9rem 0">' +
      '<div class="pipeline-chart">' +
      (function () {
        var maxFin = Math.max(d.money.revenue || 1, d.money.collected || 1, d.money.balances || 1, 1);
        return [
          ["CA Confirmé", d.money.revenue],
          ["Encaissé", d.money.collected],
          ["Acomptes", d.money.deposits],
          ["Soldes dus", d.money.balances]
        ].map(function (row) {
          var p = Math.max(4, Math.round(((row[1] || 0) / maxFin) * 100));
          return '<div><span>' + row[0] + '</span><i style="width:' + p + '%"></i><strong>' + eur(row[1]) + '</strong></div>';
        }).join("");
      })() +
      '</div></div>' +
      '</div>' +

      // Tableau Attribution Publicitaire (§5 : Campagne -> Lead -> Réservation -> CA)
      '<div class="panel">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">' +
      '<div><h3>Attribution Marketing &amp; Campagnes Publicitaires</h3><p class="note">Suivi de bout en bout : Source / Campagne → Leads → Dossiers confirmés → Chiffre d’affaires (GA4, Meta Pixel, CAPI, Google Ads).</p></div>' +
      '<button type="button" class="pill is-on" data-goto="marketing">Gérer les campagnes &amp; leads →</button>' +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Canal / Campagne</th><th>Leads générés</th><th>Dossiers signés</th><th>Conversion</th><th>Chiffre d’affaires attribué</th></tr></thead><tbody>' +
      ((d.attribution && d.attribution.length) ? d.attribution.map(function (a) {
        var conv = a.leads ? Math.round((a.won / a.leads) * 100) : 0;
        return '<tr><td><strong>' + esc(a.source) + '</strong></td><td>' + a.leads + '</td><td>' + a.won + '</td><td><span class="badge">' + conv + ' %</span></td><td><strong>' + eur(a.revenue) + '</strong></td></tr>';
      }).join("") : '<tr><td colspan="5">Aucune donnée d’attribution pour le moment.</td></tr>') +
      '</tbody></table></div></div>';

    renderShell(html);

    document.querySelectorAll("[data-period]").forEach(function (btn) {
      btn.onclick = function () { ui.period = btn.dataset.period; viewDashboard(); };
    });
    document.querySelectorAll("[data-goto]").forEach(function (box) {
      box.onclick = function () { showTab(box.dataset.goto); };
    });
    document.querySelectorAll("[data-pipe-stage]").forEach(function (row) {
      row.onclick = function () {
        ui.bookingFilter = "all";
        ui.bookingSearch = row.dataset.pipeStage;
        ui.bookingMode = "list";
        showTab("bookings");
      };
    });
    var seedBtn = document.getElementById("btn-seed");
    if (seedBtn) {
      seedBtn.onclick = async function () {
        seedBtn.disabled = true;
        var res = await api("/api/admin/seed", { method: "POST" });
        note(res.seeded ? "Données de démonstration CARPEO initialisées avec succès." : "Les données sont déjà présentes et synchronisées.");
        viewDashboard();
      };
    }
  }

  // ============================================================================
  // B. GESTION COMMERCIALE & PIPELINE KANBAN (7 ÉTAPES)
  // ============================================================================
  async function viewBookings() {
    var d = await api("/api/admin/bookings");
    var all = d.bookings || [];

    var filtered = all.filter(function (b) {
      if (ui.bookingFilter === "reservation" && b.type !== "reservation") return false;
      if (ui.bookingFilter === "devis" && b.type !== "devis") return false;
      if (ui.bookingFilter === "todo_quote" && !(b.type === "devis" && b.status === "Demande reçue")) return false;
      if (ui.bookingFilter === "accepted_quote" && b.status !== "Accepté") return false;
      if (ui.bookingFilter === "cancelled" && b.status !== "Annulé") return false;
      if (ui.bookingSearch) {
        var q = ui.bookingSearch.toLowerCase();
        var c = b.customer || {};
        var hay = [b.ref, c.nom, c.prenom, c.email, c.tel, c.ville, b.status, b.notes, b.tags].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var pf = ui.prefillCustomer || {};
    var showNewForm = Boolean(ui.prefillCustomer);
    ui.prefillCustomer = null;

    var toolbar =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">' +
      '<div class="Subtle-pills" style="margin:0">' +
      '<button type="button" class="pill ' + (ui.bookingMode === "kanban" ? "is-on" : "") + '" id="mode-kanban">Kanban (7 étapes)</button>' +
      '<button type="button" class="pill ' + (ui.bookingMode === "list" ? "is-on" : "") + '" id="mode-list">Vue Fiches détaillées (' + filtered.length + ')</button>' +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">' +
      '<input id="booking-search" placeholder="Rechercher réf, client, ville…" value="' + esc(ui.bookingSearch) + '" style="margin:0;width:230px;padding:0.48rem 0.75rem">' +
      (ui.bookingSearch ? '<button type="button" class="pill" id="clear-booking-search">Réinitialiser</button>' : '') +
      '<button type="button" class="btn btn-ocean" id="toggle-new-booking" style="min-height:40px;padding:0.45rem 0.9rem;font-size:0.9rem">+ Nouveau dossier / devis</button>' +
      '</div></div>' +

      '<div class="Subtle-pills">' +
      [
        ["all", "Tous les dossiers (" + all.length + ")"],
        ["reservation", "Réservations"],
        ["devis", "Demandes de devis"],
        ["todo_quote", "Devis à chiffrer"],
        ["accepted_quote", "Devis acceptés à planifier"],
        ["cancelled", "Annulés"]
      ].map(function (f) {
        return '<button type="button" class="pill ' + (ui.bookingFilter === f[0] ? "is-on" : "") + '" data-bfilter="' + f[0] + '">' + f[1] + '</button>';
      }).join("") +
      '</div>' +

      // Formulaire création rapide d'un dossier / devis
      '<form id="new-booking-form" class="panel" ' + (showNewForm ? '' : 'hidden') + ' style="margin-bottom:1.25rem">' +
      '<h3>Créer un dossier ou un devis personnalisé</h3>' +
      '<div class="grid-3">' +
      '<div><label>Prénom</label><input id="nb-prenom" value="' + esc(pf.prenom || "") + '" required></div>' +
      '<div><label>Nom</label><input id="nb-nom" value="' + esc(pf.nom || "") + '" required></div>' +
      '<div><label>Téléphone</label><input id="nb-tel" value="' + esc(pf.tel || "") + '" required></div>' +
      '<div><label>E-mail</label><input id="nb-email" type="email" value="' + esc(pf.email || "") + '" required></div>' +
      '<div><label>Adresse</label><input id="nb-adresse" value="' + esc(pf.adresse || "") + '" required></div>' +
      '<div><label>Code postal &amp; Ville</label><div style="display:grid;grid-template-columns:100px 1fr;gap:0.4rem"><input id="nb-cp" value="' + esc(pf.cp || "") + '" placeholder="75001" required><input id="nb-ville" value="' + esc(pf.ville || "") + '" placeholder="Ville" required></div></div>' +
      '<div><label>Type de dossier</label><select id="nb-type"><option value="reservation">Réservation</option><option value="devis">Devis personnalisé</option></select></div>' +
      '<div><label>Prestation principale</label><select id="nb-cat"><option value="canape">Canapé</option><option value="matelas">Matelas</option><option value="tapis">Tapis</option><option value="moquette">Moquette</option><option value="fauteuil">Fauteuil</option><option value="chaise">Chaises</option><option value="coussin">Coussins</option></select></div>' +
      '<div><label>Créneau (si connu)</label><input id="nb-slot" placeholder="AAAA-MM-JJ HH:MM"></div>' +
      '<div><label>Montant (€)</label><input id="nb-total" type="number" min="0" step="0.01" placeholder="Calcul auto si vide"></div>' +
      '<div><label>Étiquettes (Tags)</label><input id="nb-tags" value="' + esc(pf.tags || "") + '" placeholder="Particulier, Urgent…"></div>' +
      '<div><label>Notes</label><input id="nb-notes" placeholder="Détails taches, accès…"></div>' +
      '</div>' +
      '<button class="btn btn-ocean" type="submit" style="min-height:42px;font-size:0.95rem">Créer le dossier</button>' +
      '</form>';

    var boardHtml = "";
    if (ui.bookingMode === "kanban") {
      boardHtml = '<div class="kanban-board">' + KANBAN_STAGES.map(function (stage, stageIdx) {
        var items = filtered.filter(function (b) { return b.status === stage; });
        return '<div class="kanban-col" data-stage="' + esc(stage) + '">' +
          '<div class="kanban-head"><h3>' + (stageIdx + 1) + '. ' + esc(stage) + '</h3><span class="badge" style="margin:0">' + items.length + '</span></div>' +
          items.map(function (b) {
            var c = b.customer || {};
            var itemsSummary = (b.items || []).map(function (i) { return i.cat + (i.places ? " " + i.places + "p" : "") + (i.surface ? " " + i.surface + "m²" : ""); }).join(", ");
            var priceText = b.total != null ? eur(b.total) : (b.quote_amount != null ? "Devis : " + eur(b.quote_amount) : "À chiffrer");
            return '<article class="kanban-card" draggable="true" data-drag-id="' + b.id + '">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
              '<span class="badge" style="margin:0">' + esc(b.ref) + '</span>' +
              '<strong style="color:var(--ocean)">' + esc(priceText) + '</strong>' +
              '</div>' +
              '<h4>' + esc(c.prenom) + ' ' + esc(c.nom) + '</h4>' +
              '<p class="note" style="margin-bottom:0.3rem">' + esc(itemsSummary || b.type) + '<br>' + esc(c.ville || "") + (b.slot ? " · <strong>" + esc(b.slot) + "</strong>" : "") + '</p>' +
              // Actions contextuelles rapides selon l'étape
              (stage === "Demande reçue" || b.type === "devis" && b.quote_amount == null ? (
                '<div style="display:flex;gap:0.35rem;margin-top:0.4rem">' +
                '<input type="number" min="0" placeholder="Devis €" data-quick-quote="' + b.id + '" style="margin:0;padding:0.35rem 0.5rem;font-size:0.82rem">' +
                '<button type="button" class="pill is-on" data-send-quote="' + b.id + '" style="white-space:nowrap">Envoyer devis</button>' +
                '</div>'
              ) : "") +
              (stage === "Accepté" ? (
                '<div style="margin-top:0.4rem">' +
                '<input type="text" placeholder="AAAA-MM-JJ HH:MM" value="' + esc(b.slot || ui.selectedDate + " 08:00") + '" data-conv-slot="' + b.id + '" style="margin:0 0 0.35rem;padding:0.35rem 0.5rem;font-size:0.8rem">' +
                '<button type="button" class="pill is-on" data-convert-int="' + b.id + '" style="width:100%">Transformer en intervention</button>' +
                '</div>'
              ) : "") +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem;padding-top:0.4rem;border-top:1px solid var(--line)">' +
              '<select data-quick-stage="' + b.id + '" style="margin:0;padding:0.25rem 0.4rem;font-size:0.78rem;width:auto">' +
              ALL_STATUSES.map(function (s) { return '<option' + (s === b.status ? ' selected' : '') + '>' + s + '</option>'; }).join("") +
              '</select>' +
              '<button type="button" class="mini" data-inspect="' + esc(b.ref) + '" style="font-size:0.78rem">Détails</button>' +
              '</div>' +
              '</article>';
          }).join("") +
          '</div>';
      }).join("") + '</div>';
    } else {
      boardHtml = '<div class="admin-cards">' + filtered.map(function (b) {
        var c = b.customer || {};
        var itemsList = (b.items || []).map(function (it) {
          return "<li>" + esc(it.cat) +
            (it.places ? " " + esc(it.places) + " places (" + esc(it.config || "droit") + ")" : "") +
            (it.surface ? " " + esc(it.surface) + " m²" : "") +
            (it.matiere ? " · " + esc(it.matiere) : "") +
            (it.stain ? " · Tache : " + esc(it.stain) : "") +
            (it.frozenPrice != null ? " — <strong>" + eur(it.frozenPrice) + "</strong> (prix garanti)" : "") +
            "</li>";
        }).join("");
        var photosHtml = (b.photos && b.photos.length)
          ? '<div class="previews" style="margin:0.5rem 0">' + b.photos.map(function (src) { return '<a href="' + esc(src) + '" target="_blank"><img src="' + esc(src) + '" alt="Photo client"></a>'; }).join("") + '</div>'
          : "";

        return '<article class="panel">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span class="sur" style="margin:0">' + esc(b.ref) + ' · ' + esc((b.type || "reservation").toUpperCase()) + '</span>' +
          '<span class="badge" style="margin:0">' + esc(b.status) + '</span>' +
          '</div>' +
          '<h3 style="margin-top:0.3rem">' + esc(c.prenom) + ' ' + esc(c.nom) + '</h3>' +
          '<p class="note">' + esc(c.tel) + ' · <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a><br>' +
          esc([c.adresse, c.cp, c.ville].filter(Boolean).join(" ")) +
          (c.etage ? ' (Étage ' + esc(c.etage) + ', ascenseur : ' + esc(c.ascenseur || "non") + ')' : '') + '</p>' +
          '<ul style="font-size:0.88rem;padding-left:1.1rem;margin:0.4rem 0">' + itemsList + '</ul>' +
          photosHtml +
          '<p style="font-size:0.9rem;margin:0.4rem 0"><strong>Total :</strong> ' + (b.total != null ? eur(b.total) : "Sur devis") +
          ' · <strong>Acompte :</strong> ' + (b.deposit != null ? eur(b.deposit) : "20 €") +
          ' · <strong>Solde :</strong> ' + (b.balance != null ? eur(b.balance) : "—") + '</p>' +
          '<div class="grid-2">' +
          '<div><label>Étape du pipeline</label><select data-status="' + b.id + '">' +
          ALL_STATUSES.map(function (s) { return '<option' + (s === b.status ? ' selected' : '') + '>' + s + '</option>'; }).join("") +
          '</select></div>' +
          '<div><label>Montant devis (€)</label><input type="number" min="0" step=".01" data-quote="' + b.id + '" value="' + (b.quote_amount == null ? "" : b.quote_amount) + '"></div>' +
          '</div>' +
          '<div class="grid-2">' +
          '<div><label>Créneau d’intervention</label><input data-slot="' + b.id + '" value="' + esc(b.slot || "") + '" placeholder="AAAA-MM-JJ HH:MM"></div>' +
          '<div><label>Étiquettes (Tags)</label><input data-tags="' + b.id + '" value="' + esc(b.tags || "") + '" placeholder="VIP, Particulier…"></div>' +
          '</div>' +
          '<label>Notes internes &amp; instructions</label><textarea data-notes="' + b.id + '" style="min-height:70px">' + esc(b.notes || "") + '</textarea>' +
          '<div class="btn-row" style="margin-top:0.5rem">' +
          '<button type="button" class="btn btn-ocean" data-save="' + b.id + '" style="min-height:40px;padding:0.45rem 0.9rem;font-size:0.9rem">Enregistrer</button>' +
          '<button type="button" class="btn btn-ghost" data-send-quote-card="' + b.id + '" style="min-height:40px;padding:0.45rem 0.9rem;font-size:0.9rem">Chiffrer &amp; Envoyer devis</button>' +
          '<button type="button" class="btn btn-night" data-convert-card="' + b.id + '" style="min-height:40px;padding:0.45rem 0.9rem;font-size:0.9rem">Convertir en intervention</button>' +
          '<a class="pill" href="suivi.html?ref=' + encodeURIComponent(b.ref) + '" target="_blank" style="text-decoration:none">Espace suivi</a>' +
          '<button type="button" class="mini" data-del-booking="' + b.id + '" style="color:#b91c1c">Supprimer</button>' +
          '</div>' +
          '</article>';
      }).join("") + '</div>';
    }

    renderShell(toolbar + boardHtml);

    // Events
    document.getElementById("mode-kanban").onclick = function () { ui.bookingMode = "kanban"; viewBookings(); };
    document.getElementById("mode-list").onclick = function () { ui.bookingMode = "list"; viewBookings(); };
    var clearSearch = document.getElementById("clear-booking-search");
    if (clearSearch) clearSearch.onclick = function () { ui.bookingSearch = ""; viewBookings(); };
    document.querySelectorAll("[data-bfilter]").forEach(function (btn) {
      btn.onclick = function () { ui.bookingFilter = btn.dataset.bfilter; viewBookings(); };
    });
    var searchInput = document.getElementById("booking-search");
    if (searchInput) {
      searchInput.oninput = function () { ui.bookingSearch = searchInput.value; viewBookings(); };
    }
    var toggleNew = document.getElementById("toggle-new-booking");
    if (toggleNew) {
      toggleNew.onclick = function () {
        var f = document.getElementById("new-booking-form");
        f.hidden = !f.hidden;
      };
    }
    var nbForm = document.getElementById("new-booking-form");
    if (nbForm) {
      nbForm.onsubmit = async function (e) {
        e.preventDefault();
        var created = await api("/api/admin/bookings", {
          method: "POST",
          body: {
            type: document.getElementById("nb-type").value,
            cat: document.getElementById("nb-cat").value,
            slot: document.getElementById("nb-slot").value,
            total: document.getElementById("nb-total").value,
            quoteAmount: document.getElementById("nb-type").value === "devis" ? document.getElementById("nb-total").value : null,
            tags: document.getElementById("nb-tags").value,
            notes: document.getElementById("nb-notes").value,
            customer: {
              prenom: document.getElementById("nb-prenom").value,
              nom: document.getElementById("nb-nom").value,
              tel: document.getElementById("nb-tel").value,
              email: document.getElementById("nb-email").value,
              adresse: document.getElementById("nb-adresse").value,
              cp: document.getElementById("nb-cp").value,
              ville: document.getElementById("nb-ville").value
            }
          }
        });
        note("Dossier " + created.ref + " créé (Clé client : " + created.key + ").");
        viewBookings();
      };
    }

    // HTML5 Drag & Drop on Kanban
    var draggedId = null;
    document.querySelectorAll("[data-drag-id]").forEach(function (card) {
      card.addEventListener("dragstart", function () { draggedId = card.dataset.dragId; });
    });
    document.querySelectorAll(".kanban-col").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("drag-over"); });
      col.addEventListener("drop", async function (e) {
        e.preventDefault();
        col.classList.remove("drag-over");
        if (!draggedId) return;
        var targetStage = col.dataset.stage;
        await api("/api/admin/bookings/" + draggedId, { method: "PATCH", body: { status: targetStage } });
        note("Dossier déplacé vers « " + targetStage + " ».");
        viewBookings();
      });
    });

    // Quick Kanban actions
    document.querySelectorAll("[data-quick-stage]").forEach(function (sel) {
      sel.onchange = async function () {
        var id = sel.dataset.quickStage;
        await api("/api/admin/bookings/" + id, { method: "PATCH", body: { status: sel.value } });
        note("Statut mis à jour : " + sel.value);
        viewBookings();
      };
    });
    document.querySelectorAll("[data-send-quote]").forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.sendQuote;
        var val = document.querySelector('[data-quick-quote="' + id + '"]').value;
        if (!val) { note("Saisissez un montant de devis en euros."); return; }
        await api("/api/admin/bookings/" + id, { method: "PATCH", body: { quoteAmount: val, action: "sendQuote" } });
        note("Devis chiffré à " + eur(val) + " et mis en file d'envoi client.");
        viewBookings();
      };
    });
    document.querySelectorAll("[data-convert-int]").forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.convertInt;
        var slot = document.querySelector('[data-conv-slot="' + id + '"]').value;
        await api("/api/admin/bookings/" + id, { method: "PATCH", body: { slot: slot, action: "convertToIntervention" } });
        note("Devis accepté transformé en intervention planifiée (" + slot + ").");
        viewBookings();
      };
    });
    document.querySelectorAll("[data-inspect]").forEach(function (btn) {
      btn.onclick = function () {
        ui.bookingSearch = btn.dataset.inspect || "";
        ui.bookingMode = "list";
        viewBookings();
      };
    });

    // List mode actions
    document.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.save;
        await api("/api/admin/bookings/" + id, {
          method: "PATCH",
          body: {
            status: document.querySelector('[data-status="' + id + '"]').value,
            quoteAmount: document.querySelector('[data-quote="' + id + '"]').value,
            slot: document.querySelector('[data-slot="' + id + '"]').value,
            tags: document.querySelector('[data-tags="' + id + '"]').value,
            notes: document.querySelector('[data-notes="' + id + '"]').value
          }
        });
        note("Dossier enregistré.");
        viewBookings();
      };
    });
    document.querySelectorAll("[data-send-quote-card]").forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.sendQuoteCard;
        var qVal = document.querySelector('[data-quote="' + id + '"]').value;
        if (!qVal) { note("Indiquez d'abord un montant de devis (€)."); return; }
        await api("/api/admin/bookings/" + id, { method: "PATCH", body: { quoteAmount: qVal, action: "sendQuote" } });
        note("Devis envoyé au client et déplacé dans « Devis envoyé ».");
        viewBookings();
      };
    });
    document.querySelectorAll("[data-convert-card]").forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.convertCard;
        var slot = document.querySelector('[data-slot="' + id + '"]').value || (ui.selectedDate + " 08:00");
        var qVal = document.querySelector('[data-quote="' + id + '"]').value;
        await api("/api/admin/bookings/" + id, { method: "PATCH", body: { slot: slot, quoteAmount: qVal, action: "convertToIntervention" } });
        note("Dossier converti en intervention planifiée.");
        viewBookings();
      };
    });
    document.querySelectorAll("[data-del-booking]").forEach(function (btn) {
      btn.onclick = async function () {
        await api("/api/admin/bookings/" + btn.dataset.delBooking, { method: "DELETE" });
        note("Dossier supprimé.");
        viewBookings();
      };
    });
  }

  // ============================================================================
  // C. GESTION DES CONTACTS (CRM) & SMART LISTS
  // ============================================================================
  async function viewContacts() {
    var d = await api("/api/admin/contacts");
    var all = d.contacts || [];

    var filtered = all.filter(function (c) {
      if (ui.smartList === "vip" && !(c.totalSpent >= 140 || c.bookingsCount >= 2 || String(c.tags || "").toLowerCase().indexOf("vip") !== -1)) return false;
      if (ui.smartList === "pending_quote" && !c.hasPendingQuote) return false;
      if (ui.smartList === "b2b" && String(c.tags + " " + c.need).toLowerCase().indexOf("pro") === -1 && String(c.tags).toLowerCase().indexOf("b2b") === -1) return false;
      if (ui.smartList === "leads" && c.bookingsCount > 0) return false;
      if (ui.contactSearch) {
        var q = ui.contactSearch.toLowerCase();
        var hay = [c.name, c.email, c.phone, c.city, c.tags, c.notes, c.source].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var selected = filtered.find(function (c) { return String(c.id) === String(ui.selectedContactId); }) || filtered[0] || null;
    if (selected) ui.selectedContactId = selected.id;

    var html =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">' +
      '<div class="Subtle-pills" style="margin:0">' +
      [
        ["all", "Tous les contacts (" + all.length + ")"],
        ["vip", "Smart List : Clients VIP & Fidèles"],
        ["pending_quote", "Smart List : Devis en attente"],
        ["b2b", "Smart List : Professionnels (B2B)"],
        ["leads", "Smart List : Nouveaux leads"]
      ].map(function (s) {
        return '<button type="button" class="pill ' + (ui.smartList === s[0] ? "is-on" : "") + '" data-smart="' + s[0] + '">' + s[1] + '</button>';
      }).join("") +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;align-items:center">' +
      '<input id="crm-search" placeholder="Chercher nom, e-mail, tag…" value="' + esc(ui.contactSearch) + '" style="margin:0;width:220px;padding:0.45rem 0.75rem">' +
      '<button type="button" class="btn btn-ocean" id="btn-new-contact" style="min-height:40px;padding:0.45rem 0.9rem;font-size:0.9rem">+ Nouveau contact</button>' +
      '</div></div>' +

      '<form id="new-contact-form" class="panel" hidden style="margin-bottom:1.25rem">' +
      '<h3>Ajouter une fiche client CRM</h3>' +
      '<div class="grid-3">' +
      '<div><label>Nom complet / Entreprise</label><input id="nc-name" required></div>' +
      '<div><label>E-mail</label><input id="nc-email" type="email" required></div>' +
      '<div><label>Téléphone</label><input id="nc-phone"></div>' +
      '<div><label>Adresse</label><input id="nc-address"></div>' +
      '<div><label>Ville</label><input id="nc-city"></div>' +
      '<div><label>Étiquettes (Tags)</label><input id="nc-tags" placeholder="VIP, Particulier, B2B…"></div>' +
      '</div>' +
      '<label>Notes internes</label><textarea id="nc-notes" style="min-height:60px"></textarea>' +
      '<button type="submit" class="btn btn-ocean" style="min-height:40px;font-size:0.9rem">Enregistrer le contact</button>' +
      '</form>' +

      '<div class="crm-split">' +
      '<div class="crm-list">' +
      (filtered.length ? filtered.map(function (c) {
        return '<div class="crm-item ' + (selected && selected.id === c.id ? "is-on" : "") + '" data-cid="' + c.id + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<strong>' + esc(c.name) + '</strong>' +
          '<strong style="color:var(--ocean);font-size:0.9rem">' + eur(c.totalSpent) + '</strong>' +
          '</div>' +
          '<p class="note" style="margin:0.15rem 0">' + esc(c.email) + (c.phone ? " · " + esc(c.phone) : "") + '</p>' +
          (c.tags ? '<div style="margin-top:0.25rem">' + c.tags.split(",").filter(Boolean).map(function (t) { return '<span class="badge" style="margin:0 0.25rem 0 0">' + esc(t.trim()) + '</span>'; }).join("") + '</div>' : "") +
          '</div>';
      }).join("") : '<p style="padding:1rem" class="note">Aucun contact dans cette Smart List.</p>') +
      '</div>' +

      '<div class="panel">' +
      (selected ? (
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem">' +
        '<div><p class="sur" style="margin:0">Fiche Client CRM · Source : ' + esc(selected.source || "Site web") + '</p>' +
        '<h2 style="margin:0.2rem 0">' + esc(selected.name) + '</h2></div>' +
        '<span class="badge">' + esc(selected.status || "Client") + '</span>' +
        '</div>' +

        // Indicateurs de performance par client
        '<div class="stats" style="margin:1rem 0">' +
        '<div><strong>' + eur(selected.totalSpent) + '</strong><span>Chiffre d’affaires client</span></div>' +
        '<div><strong>' + selected.bookingsCount + '</strong><span>Dossiers / Interventions</span></div>' +
        '<div><strong>' + eur(selected.averageBasket) + '</strong><span>Panier moyen client</span></div>' +
        '</div>' +

        '<form id="edit-contact-form">' +
        '<div class="grid-2">' +
        '<div><label>Nom complet</label><input id="ec-name" value="' + esc(selected.name) + '" required></div>' +
        '<div><label>E-mail</label><input id="ec-email" type="email" value="' + esc(selected.email) + '" required></div>' +
        '<div><label>Téléphone</label><input id="ec-phone" value="' + esc(selected.phone) + '"></div>' +
        '<div><label>Statut CRM</label><select id="ec-status">' +
        ["Nouveau", "En cours", "Client actif", "VIP", "À relancer", "Archivé"].map(function (st) {
          return '<option' + (selected.status === st ? ' selected' : '') + '>' + st + '</option>';
        }).join("") +
        '</select></div>' +
        '<div><label>Adresse</label><input id="ec-address" value="' + esc(selected.address) + '"></div>' +
        '<div><label>Ville &amp; Code postal</label><div style="display:grid;grid-template-columns:100px 1fr;gap:0.4rem"><input id="ec-cp" value="' + esc(selected.postal_code) + '" placeholder="CP"><input id="ec-city" value="' + esc(selected.city) + '" placeholder="Ville"></div></div>' +
        '</div>' +
        '<label>Étiquettes &amp; Catégorisation (séparées par des virgules : VIP, Particulier, Professionnel B2B, Fidèle)</label>' +
        '<input id="ec-tags" value="' + esc(selected.tags) + '">' +
        '<label>Notes internes</label>' +
        '<textarea id="ec-notes" style="min-height:80px">' + esc(selected.notes) + '</textarea>' +
        '<div class="btn-row" style="margin-top:0.5rem">' +
        '<button type="submit" class="btn btn-ocean" style="min-height:40px;padding:0.45rem 1rem;font-size:0.9rem">Enregistrer la fiche</button>' +
        '<button type="button" class="btn btn-ghost" id="btn-create-dossier-client" style="min-height:40px;padding:0.45rem 1rem;font-size:0.9rem">+ Créer un dossier</button>' +
        '<button type="button" class="btn btn-ghost" id="btn-msg-client" style="min-height:40px;padding:0.45rem 1rem;font-size:0.9rem">Envoyer un message</button>' +
        '<button type="button" class="mini" id="btn-del-contact" style="color:#b91c1c">Supprimer</button>' +
        '</div>' +
        '</form>' +

        '<h3 style="margin-top:1.5rem">Timeline unifiée &amp; Historique des interactions</h3>' +
        '<div class="timeline">' +
        ((selected.timeline && selected.timeline.length) ? selected.timeline.map(function (ev) {
          return '<div class="timeline-item">' +
            '<strong>' + esc(ev.label) + '</strong> <span class="note">· ' + fmtDateTime(ev.date) + '</span>' +
            '<p class="note" style="margin:0.15rem 0 0">' + esc(ev.detail || "") + '</p>' +
            '</div>';
        }).join("") : '<p class="note">Aucune interaction enregistrée.</p>') +
        '</div>'
      ) : '<p class="note">Sélectionnez un contact dans la liste à gauche.</p>') +
      '</div></div>';

    renderShell(html);

    document.querySelectorAll("[data-smart]").forEach(function (btn) {
      btn.onclick = function () { ui.smartList = btn.dataset.smart; viewContacts(); };
    });
    document.querySelectorAll("[data-cid]").forEach(function (row) {
      row.onclick = function () { ui.selectedContactId = Number(row.dataset.cid); viewContacts(); };
    });
    var crmSearch = document.getElementById("crm-search");
    if (crmSearch) crmSearch.oninput = function () { ui.contactSearch = crmSearch.value; viewContacts(); };

    var btnNew = document.getElementById("btn-new-contact");
    if (btnNew) btnNew.onclick = function () {
      var f = document.getElementById("new-contact-form");
      f.hidden = !f.hidden;
    };
    var ncForm = document.getElementById("new-contact-form");
    if (ncForm) {
      ncForm.onsubmit = async function (e) {
        e.preventDefault();
        var r = await api("/api/admin/contacts", {
          method: "POST",
          body: {
            name: document.getElementById("nc-name").value,
            email: document.getElementById("nc-email").value,
            phone: document.getElementById("nc-phone").value,
            address: document.getElementById("nc-address").value,
            city: document.getElementById("nc-city").value,
            tags: document.getElementById("nc-tags").value,
            notes: document.getElementById("nc-notes").value
          }
        });
        ui.selectedContactId = r.id;
        note("Fiche client créée.");
        viewContacts();
      };
    }

    var ecForm = document.getElementById("edit-contact-form");
    if (ecForm && selected) {
      ecForm.onsubmit = async function (e) {
        e.preventDefault();
        await api("/api/admin/contacts/" + selected.id, {
          method: "PATCH",
          body: {
            name: document.getElementById("ec-name").value,
            email: document.getElementById("ec-email").value,
            phone: document.getElementById("ec-phone").value,
            status: document.getElementById("ec-status").value,
            address: document.getElementById("ec-address").value,
            postal_code: document.getElementById("ec-cp").value,
            city: document.getElementById("ec-city").value,
            tags: document.getElementById("ec-tags").value,
            notes: document.getElementById("ec-notes").value
          }
        });
        note("Fiche client mise à jour.");
        viewContacts();
      };
    }
    var btnCreateDossier = document.getElementById("btn-create-dossier-client");
    if (btnCreateDossier && selected) {
      btnCreateDossier.onclick = function () {
        var parts = String(selected.name || "").trim().split(/\s+/);
        ui.prefillCustomer = {
          prenom: parts[0] || "",
          nom: parts.slice(1).join(" ") || parts[0] || "",
          email: selected.email || "",
          tel: selected.phone || "",
          adresse: selected.address || "",
          cp: selected.postal_code || "",
          ville: selected.city || "",
          tags: selected.tags || ""
        };
        showTab("bookings");
      };
    }
    var btnMsg = document.getElementById("btn-msg-client");
    if (btnMsg && selected) {
      btnMsg.onclick = function () {
        ui.prefillRecipient = selected.email || selected.phone || "";
        ui.prefillSubject = "Suivi CARPEO — " + (selected.name || "");
        showTab("conversations");
      };
    }
    var btnDelContact = document.getElementById("btn-del-contact");
    if (btnDelContact && selected) {
      btnDelContact.onclick = async function () {
        await api("/api/admin/contacts/" + selected.id, { method: "DELETE" });
        ui.selectedContactId = null;
        note("Contact supprimé.");
        viewContacts();
      };
    }
  }

  // ============================================================================
  // D. BOÎTE DE RÉCEPTION UNIFIÉE (CONVERSATIONS OMNICANALES)
  // ============================================================================
  async function viewConversations() {
    var d = await api("/api/admin/conversations");
    var all = d.conversations || [];

    var filtered = all.filter(function (c) {
      if (ui.convChannel !== "all" && c.channel !== ui.convChannel) return false;
      return true;
    });

    var preRecip = ui.prefillRecipient || "";
    var preSubj = ui.prefillSubject || "";
    ui.prefillRecipient = "";
    ui.prefillSubject = "";

    var html =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">' +
      '<div class="Subtle-pills" style="margin:0">' +
      [
        ["all", "Tous les canaux (" + all.length + ")"],
        ["email", "E-mail"],
        ["whatsapp", "WhatsApp"],
        ["sms", "SMS"],
        ["instagram", "Instagram (DM)"],
        ["form", "Formulaires Site Web"]
      ].map(function (ch) {
        return '<button type="button" class="pill ' + (ui.convChannel === ch[0] ? "is-on" : "") + '" data-chan="' + ch[0] + '">' + ch[1] + '</button>';
      }).join("") +
      '</div></div>' +

      '<div class="inbox-split">' +
      // Colonne gauche : composer un message omnicanal
      '<div class="panel">' +
      '<h3>Nouveau message / Enregistrer échange</h3>' +
      '<p class="note">Centralisez vos échanges E-mail, SMS, WhatsApp et Instagram DM.</p>' +
      '<div class="Subtle-pills" style="margin:0 0 0.75rem">' +
      '<button type="button" class="pill" data-tpl="Bonjour, nous vous confirmons votre rendez-vous CARPEO. Notre technicien vous contactera 30 min avant son arrivée.">Modèle : Confirmation RDV</button>' +
      '<button type="button" class="pill" data-tpl="Bonjour, votre devis personnalisé CARPEO est disponible dans votre espace suivi en ligne. N’hésitez pas si vous avez des questions !">Modèle : Relance devis</button>' +
      '<button type="button" class="pill" data-tpl="Bonjour, l’acompte de réservation est de 20 €. Vous pouvez le régler directement depuis votre espace suivi CARPEO.">Modèle : Acompte 20 €</button>' +
      '</div>' +
      '<form id="conv-form">' +
      '<label for="conv-channel">Canal de communication</label>' +
      '<select id="conv-channel">' +
      '<option value="whatsapp">WhatsApp Business</option>' +
      '<option value="email">E-mail transactionnel</option>' +
      '<option value="sms">SMS</option>' +
      '<option value="instagram">Message Instagram (DM)</option>' +
      '<option value="form">Formulaire site web</option>' +
      '</select>' +
      '<label for="conv-dir">Sens de l’échange</label>' +
      '<select id="conv-dir">' +
      '<option value="outbound">Sortant (Envoyer au client)</option>' +
      '<option value="inbound">Entrant (Message reçu du client)</option>' +
      '</select>' +
      '<label for="conv-recipient">Destinataire / Contact (E-mail, Tél ou @Instagram)</label>' +
      '<input id="conv-recipient" value="' + esc(preRecip) + '" placeholder="ex. sophie.martin@example.fr ou 06 12 34 56 78" required>' +
      '<label for="conv-subject">Objet / Référence dossier</label>' +
      '<input id="conv-subject" value="' + esc(preSubj) + '" placeholder="Confirmation RDV CARPEO">' +
      '<label for="conv-body">Contenu du message</label>' +
      '<textarea id="conv-body" required placeholder="Votre message…"></textarea>' +
      '<button type="submit" class="btn btn-ocean" style="width:100%;min-height:42px;font-size:0.95rem">Envoyer / Enregistrer dans la boîte unifiée</button>' +
      '</form></div>' +

      // Colonne droite : flux unifié des conversations
      '<div class="panel">' +
      '<h3>Boîte de réception unifiée (' + filtered.length + ' messages)</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Canal</th><th>Sens</th><th>Client / Destinataire</th><th>Message</th><th>Statut / Action</th></tr></thead><tbody>' +
      (filtered.length ? filtered.map(function (c) {
        var chanClass = "chan-" + (c.channel || "email");
        var who = c.contact_name || c.recipient || c.contact_email || c.booking_ref || "Client";
        var replyTarget = c.recipient || c.contact_email || c.contact_phone || who;
        return '<tr>' +
          '<td style="white-space:nowrap;font-size:0.84rem">' + fmtDateTime(c.created_at) + '</td>' +
          '<td><span class="chan-badge ' + chanClass + '">' + esc(c.channel) + '</span></td>' +
          '<td>' + (c.direction === "inbound" ? "<strong>↙ Entrant</strong>" : "↗ Sortant") + '</td>' +
          '<td><strong>' + esc(who) + '</strong>' + (c.booking_ref ? '<br><small class="note">' + esc(c.booking_ref) + '</small>' : '') + '</td>' +
          '<td>' + (c.subject ? '<strong>' + esc(c.subject) + ' : </strong>' : '') + esc(c.body) + '</td>' +
          '<td style="white-space:nowrap"><span class="badge">' + esc(c.status) + '</span> ' +
          '<button type="button" class="mini" data-reply-chan="' + esc(c.channel || "whatsapp") + '" data-reply-to="' + esc(replyTarget) + '" data-reply-ref="' + esc(c.booking_ref || c.subject || "") + '">Répondre</button>' +
          (c.direction === "inbound" && c.status === "reçu" ? ' <button type="button" class="mini" data-mark-read="' + c.id + '">Marquer lu</button>' : '') +
          '</td>' +
          '</tr>';
      }).join("") : '<tr><td colspan="6">Aucun message pour ce canal.</td></tr>') +
      '</tbody></table></div></div></div>';

    renderShell(html);

    document.querySelectorAll("[data-chan]").forEach(function (btn) {
      btn.onclick = function () { ui.convChannel = btn.dataset.chan; viewConversations(); };
    });
    document.querySelectorAll("[data-tpl]").forEach(function (btn) {
      btn.onclick = function () {
        var box = document.getElementById("conv-body");
        if (box) box.value = btn.dataset.tpl;
      };
    });
    document.querySelectorAll("[data-reply-to]").forEach(function (btn) {
      btn.onclick = function () {
        document.getElementById("conv-channel").value = btn.dataset.replyChan || "whatsapp";
        document.getElementById("conv-dir").value = "outbound";
        document.getElementById("conv-recipient").value = btn.dataset.replyTo || "";
        document.getElementById("conv-subject").value = btn.dataset.replyRef ? ("Re: " + btn.dataset.replyRef) : "Réponse CARPEO";
        document.getElementById("conv-body").focus();
      };
    });
    document.querySelectorAll("[data-mark-read]").forEach(function (btn) {
      btn.onclick = async function () {
        await api("/api/admin/conversations/" + btn.dataset.markRead, { method: "PATCH", body: { status: "lu" } });
        note("Message marqué comme lu.");
        viewConversations();
      };
    });
    var form = document.getElementById("conv-form");
    if (form) {
      form.onsubmit = async function (e) {
        e.preventDefault();
        await api("/api/admin/conversations", {
          method: "POST",
          body: {
            channel: document.getElementById("conv-channel").value,
            direction: document.getElementById("conv-dir").value,
            recipient: document.getElementById("conv-recipient").value,
            subject: document.getElementById("conv-subject").value,
            body: document.getElementById("conv-body").value
          }
        });
        note("Message enregistré dans la boîte de réception unifiée.");
        viewConversations();
      };
    }
  }

  // ============================================================================
  // E. GESTION DES INTERVENTIONS, AGENDA HEBDOMADAIRE, CARTE LEAFLET & TOURNÉES
  // ============================================================================
  function getWeekDays(offsetWeeks) {
    var now = new Date();
    var day = now.getDay();
    var diffToMonday = (day === 0 ? -6 : 1) - day + (offsetWeeks * 7);
    var monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    var days = [];
    for (var i = 0; i < 6; i++) {
      var d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        iso: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })
      });
    }
    return days;
  }

  function blockedSlotAt(block, slot) {
    var start = String(block.slot_start || "");
    var end = String(block.slot_end || block.slot_start || "");
    if (start.length === 10) start += " 00:00";
    if (end.length === 10) end += " 23:59";
    return Boolean(start && end && slot >= start && slot <= end);
  }

  async function viewPlanning() {
    var [bData, tData] = await Promise.all([
      api("/api/admin/bookings"),
      api("/api/admin/tasks")
    ]);
    var bookings = (bData.bookings || []).filter(function (b) { return b.status !== "Annulé"; });
    var tasks = tData.tasks || [];
    var blocked = tData.blockedSlots || [];

    var weekDays = getWeekDays(ui.weekOffset);
    var times = ["08:00", "11:00", "14:00", "17:00"];
    var dayInterventions = bookings.filter(function (b) {
      return b.slot && b.slot.indexOf(ui.selectedDate) === 0;
    });

    var agendaCells = '<div class="agenda-head">Créneau</div>' + weekDays.map(function (wd) {
      return '<div class="agenda-head">' + esc(wd.label) + '</div>';
    }).join("");

    times.forEach(function (tm) {
      agendaCells += '<div class="agenda-cell" style="font-weight:600;background:var(--mist);display:grid;place-items:center">' + tm + '</div>';
      weekDays.forEach(function (wd) {
        var slotKey = wd.iso + " " + tm;
        var slotBookings = bookings.filter(function (b) { return b.slot === slotKey; });
        var isBlocked = blocked.find(function (bl) { return blockedSlotAt(bl, slotKey); });
        var inner = slotBookings.map(function (b) {
          var c = b.customer || {};
          return '<div class="agenda-event"><strong>' + esc(b.ref) + '</strong><br>' + esc(c.nom || "") + ' (' + esc(c.ville || "") + ')</div>';
        }).join("");
        if (isBlocked) {
          inner += '<div class="agenda-blocked">Indisponible (' + esc(isBlocked.reason || "Bloqué") + ')</div>';
        }
        agendaCells += '<div class="agenda-cell">' + inner + '</div>';
      });
    });

    var html =
      // 1. Agenda hebdomadaire
      '<div class="panel" style="margin-bottom:1.25rem">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.8rem">' +
      '<div><h3 style="margin:0">Agenda hebdomadaire des interventions</h3><p class="note" style="margin:0">Vue synchronisée en temps réel avec les créneaux disponibles sur le site public.</p></div>' +
      '<div class="btn-row" style="margin:0">' +
      '<button type="button" class="pill" id="week-prev">← Semaine préc.</button>' +
      '<button type="button" class="pill is-on" id="week-now">Cette semaine</button>' +
      '<button type="button" class="pill" id="week-next">Semaine suiv. →</button>' +
      '<a class="pill" href="/api/admin/calendar.ics" style="text-decoration:none">Exporter .ics (Apple/Google/Outlook)</a>' +
      '</div></div>' +
      '<div style="overflow-x:auto"><div class="agenda-grid">' + agendaCells + '</div></div>' +
      '</div>' +

      // 2. Cartographie Leaflet & Optimisation de tournée + Vue quotidienne
      '<div class="grid-2" style="align-items:stretch;margin-bottom:1.25rem">' +
      '<div class="panel">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.6rem">' +
      '<h3>Cartographie &amp; Optimisation des tournées</h3>' +
      '<button type="button" class="btn btn-ocean" id="btn-optimize" style="min-height:38px;padding:0.4rem 0.85rem;font-size:0.88rem">Optimiser l’ordre de la tournée</button>' +
      '</div>' +
      '<p class="note">Carte OpenStreetMap / Carto avec géolocalisation automatique et calcul des distances et temps de trajet.</p>' +
      '<div id="route-map"></div>' +
      '<div id="route-summary" style="margin-top:0.75rem"></div>' +
      '</div>' +

      '<div class="panel">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.6rem">' +
      '<h3>Vue quotidienne des interventions</h3>' +
      '<input type="date" id="daily-date" value="' + esc(ui.selectedDate) + '" style="margin:0;width:165px;padding:0.4rem 0.6rem">' +
      '</div>' +
      '<div id="daily-list">' +
      (dayInterventions.length ? dayInterventions.map(function (b, idx) {
        var c = b.customer || {};
        return '<div class="agenda-event" style="padding:0.65rem 0.8rem;margin-bottom:0.55rem">' +
          '<div style="display:flex;justify-content:space-between"><strong>#' + (b.route_order || (idx + 1)) + ' · ' + esc(b.slot) + ' — ' + esc(c.prenom) + ' ' + esc(c.nom) + '</strong><span class="badge">' + esc(b.status) + '</span></div>' +
          '<p class="note" style="margin:0.2rem 0 0">' + esc([c.adresse, c.cp, c.ville].filter(Boolean).join(" ")) + ' · Tél : ' + esc(c.tel) + '</p>' +
          '</div>';
      }).join("") : '<p class="note">Aucune intervention sur ce jour précis. Cliquez sur « Optimiser l’ordre de la tournée » pour calculer l’itinéraire sur l’ensemble des dossiers planifiés.</p>') +
      '</div>' +

      '<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">' +
      '<h3>Bloquer des jours ou une période</h3>' +
      '<form id="block-slot-form" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:0.5rem;align-items:end">' +
      '<div><label for="bs-start">Date de début</label><input id="bs-start" type="date" value="' + esc(ui.selectedDate) + '" required style="margin:0"></div>' +
      '<div><label for="bs-end">Date de fin incluse</label><input id="bs-end" type="date" value="' + esc(ui.selectedDate) + '" required style="margin:0"></div>' +
      '<div><label for="bs-reason">Motif</label><input id="bs-reason" placeholder="Congé, maintenance…" style="margin:0"></div>' +
      '<button type="submit" class="btn btn-night" style="min-height:42px;padding:0.5rem 0.9rem;font-size:0.88rem">Bloquer la période</button>' +
      '</form>' +
      (blocked.length ? '<div style="margin-top:0.65rem">' + blocked.map(function (bl) {
        return '<span class="badge" style="margin:0.2rem 0.3rem 0 0">' + esc(bl.slot_start) + (bl.slot_end && bl.slot_end !== bl.slot_start ? ' → ' + esc(bl.slot_end) : '') + ' (' + esc(bl.reason || "Bloqué") + ') <button type="button" class="mini" data-unblock="' + bl.id + '">×</button></span>';
      }).join("") + '</div>' : "") +
      '</div></div>' +

      // 3. Gestion des tâches de l'équipe
      '<div class="panel">' +
      '<h3>Gestion des tâches de l’équipe</h3>' +
      '<form id="task-form" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:0.5rem;align-items:end;margin-bottom:1rem">' +
      '<div><label>Tâche à réaliser</label><input id="task-title" required placeholder="Ex: Rappeler client, préparer injecteur-extracteur…" style="margin:0"></div>' +
      '<div><label>Responsable</label><input id="task-assignee" placeholder="Technicien / Commercial" style="margin:0"></div>' +
      '<div><label>Priorité</label><select id="task-priority" style="margin:0"><option>Normale</option><option>Haute</option><option>Urgente</option></select></div>' +
      '<div><label>Échéance</label><input id="task-due" type="datetime-local" style="margin:0"></div>' +
      '<button class="btn btn-ocean" type="submit" style="min-height:42px;padding:0.5rem 1rem;font-size:0.9rem">Ajouter</button>' +
      '</form>' +
      '<div class="table-wrap"><table><thead><tr><th>Tâche</th><th>Dossier</th><th>Responsable</th><th>Priorité</th><th>Échéance</th><th>Statut</th><th>Action</th></tr></thead><tbody>' +
      (tasks.length ? tasks.map(function (t) {
        return '<tr>' +
          '<td><strong>' + esc(t.title) + '</strong></td>' +
          '<td>' + esc(t.booking_ref || "—") + '</td>' +
          '<td>' + esc(t.assignee || "Équipe") + '</td>' +
          '<td><span class="badge">' + esc(t.priority || "Normale") + '</span></td>' +
          '<td>' + fmtDateTime(t.due_at) + '</td>' +
          '<td><select data-task-status="' + t.id + '" style="margin:0;padding:0.25rem 0.5rem;width:auto">' +
          ["À faire", "En cours", "Terminé"].map(function (s) { return '<option' + (t.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join("") +
          '</select></td>' +
          '<td><button type="button" class="mini" data-del-task="' + t.id + '">Supprimer</button></td>' +
          '</tr>';
      }).join("") : '<tr><td colspan="7">Aucune tâche en cours.</td></tr>') +
      '</tbody></table></div></div>';

    renderShell(html);

    // Initialize Leaflet Map with Carto / OpenStreetMap
    if (window.L && document.getElementById("route-map")) {
      var map = window.L.map("route-map").setView([48.8350076, 2.4096267], 11);
      ui.leafletMap = map;
      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
        maxZoom: 19
      }).addTo(map);

      var bounds = [];
      bookings.forEach(function (b, i) {
        if (b.lat && b.lng) {
          var c = b.customer || {};
          var m = window.L.marker([b.lat, b.lng]).addTo(map);
          m.bindPopup("<strong>#" + (b.route_order || (i + 1)) + " · " + esc(b.ref) + "</strong><br>" + esc(c.prenom || "") + " " + esc(c.nom || "") + "<br>" + esc(c.adresse || "") + " " + esc(c.ville || "") + "<br>Créneau : " + esc(b.slot || "À planifier"));
          bounds.push([b.lat, b.lng]);
        }
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28] });
    }

    // Events
    document.getElementById("week-prev").onclick = function () { ui.weekOffset -= 1; viewPlanning(); };
    document.getElementById("week-now").onclick = function () { ui.weekOffset = 0; viewPlanning(); };
    document.getElementById("week-next").onclick = function () { ui.weekOffset += 1; viewPlanning(); };
    document.getElementById("daily-date").onchange = function (e) { ui.selectedDate = e.target.value; viewPlanning(); };

    document.getElementById("btn-optimize").onclick = async function () {
      var btn = document.getElementById("btn-optimize");
      btn.disabled = true; btn.textContent = "Calcul d’itinéraire…";
      try {
        var r = await api("/api/admin/optimize-route", { method: "POST", body: { date: "" } });
        btn.disabled = false; btn.textContent = "Optimiser l’ordre de la tournée";
        var sumBox = document.getElementById("route-summary");
        sumBox.innerHTML =
          '<div class="summary" style="padding:0.75rem 1rem">' +
          '<strong>Tournée optimisée : ' + r.stops.length + ' interventions · Distance totale : ' + r.totalKm + ' km · Temps de trajet estimé : ' + r.totalMinutes + ' min</strong>' +
          '<ol style="margin:0.5rem 0 0;padding-left:1.2rem;font-size:0.88rem">' +
          r.stops.map(function (st) {
            return '<li><strong>' + esc(st.ref) + ' — ' + esc(st.customer.prenom || "") + ' ' + esc(st.customer.nom || "") + '</strong> (' + esc(st.customer.ville || "") + ') · <em>+' + st.legKm + ' km (~' + st.legMinutes + ' min)</em></li>';
          }).join("") +
          '</ol></div>';

        if (ui.leafletMap && window.L && r.stops.length) {
          var coords = [[r.base.lat, r.base.lng]].concat(r.stops.map(function (s) { return [s.lat, s.lng]; }));
          window.L.polyline(coords, { color: "#0382af", weight: 4, dashArray: "8, 6" }).addTo(ui.leafletMap);
          ui.leafletMap.fitBounds(coords, { padding: [30, 30] });
        }
        note("Ordre des interventions optimisé (" + r.totalKm + " km, " + r.totalMinutes + " min de trajet).");
      } catch (err) {
        btn.disabled = false; btn.textContent = "Optimiser l’ordre de la tournée";
        note(err.message);
      }
    };

    document.getElementById("block-slot-form").onsubmit = async function (e) {
      e.preventDefault();
      await api("/api/admin/blocked-slots", {
        method: "POST",
        body: { start: document.getElementById("bs-start").value, end: document.getElementById("bs-end").value, reason: document.getElementById("bs-reason").value }
      });
      note("Période bloquée dans le planning et retirée des créneaux publics.");
      viewPlanning();
    };
    document.querySelectorAll("[data-unblock]").forEach(function (btn) {
      btn.onclick = async function () {
        await api("/api/admin/blocked-slots/" + btn.dataset.unblock, { method: "DELETE" });
        note("Créneau débloqué.");
        viewPlanning();
      };
    });

    document.getElementById("task-form").onsubmit = async function (e) {
      e.preventDefault();
      await api("/api/admin/tasks", {
        method: "POST",
        body: {
          title: document.getElementById("task-title").value,
          assignee: document.getElementById("task-assignee").value,
          priority: document.getElementById("task-priority").value,
          dueAt: document.getElementById("task-due").value
        }
      });
      note("Tâche ajoutée au planning d'équipe.");
      viewPlanning();
    };
    document.querySelectorAll("[data-task-status]").forEach(function (sel) {
      sel.onchange = async function () {
        await api("/api/admin/tasks/" + sel.dataset.taskStatus, { method: "PATCH", body: { status: sel.value } });
        note("Statut de la tâche mis à jour.");
      };
    });
    document.querySelectorAll("[data-del-task]").forEach(function (btn) {
      btn.onclick = async function () {
        await api("/api/admin/tasks/" + btn.dataset.delTask, { method: "DELETE" });
        viewPlanning();
      };
    });
  }

  // ============================================================================
  // F. PAIEMENTS EN LIGNE STRIPE, SOLDES & REMBOURSEMENTS (§4)
  // ============================================================================
  async function viewPayments() {
    var d = await api("/api/admin/payments");
    var payments = d.payments || [];
    var totalPaid = payments.filter(function (p) { return p.status === "paid"; }).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
    var totalRefunded = payments.filter(function (p) { return p.status === "refunded"; }).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);

    var html =
      '<div class="stats">' +
      '<div><strong>' + eur(totalPaid) + '</strong><span>Total encaissé</span><small>Acomptes &amp; soldes</small></div>' +
      '<div><strong>' + eur(totalRefunded) + '</strong><span>Total remboursé</span><small>Remboursements clients</small></div>' +
      '<div><strong>' + payments.length + '</strong><span>Transactions</span><small>' + (d.stripeConfigured ? "Stripe Live/Test actif" : "Mode Stripe prêt à brancher") + '</small></div>' +
      '</div>' +

      '<div class="grid-2" style="align-items:start">' +
      '<div class="panel">' +
      '<h3>Enregistrer un paiement (Acompte ou Solde)</h3>' +
      '<p class="note">Synchronise automatiquement le statut et le solde restant du dossier client.</p>' +
      '<form id="new-pay-form">' +
      '<label for="np-ref">Référence du dossier (ex. CAR-8F4A219B)</label>' +
      '<input id="np-ref" required placeholder="CAR-…">' +
      '<label for="np-kind">Type de règlement</label>' +
      '<select id="np-kind"><option value="deposit">Acompte de réservation</option><option value="balance">Solde restant après intervention</option></select>' +
      '<label for="np-amount">Montant (€)</label>' +
      '<input id="np-amount" type="number" min="1" step="0.01" placeholder="20" required>' +
      '<label for="np-method">Moyen de paiement</label>' +
      '<select id="np-method"><option value="stripe">Stripe (Carte bancaire)</option><option value="virement">Virement / Urssaf Avance immédiate</option><option value="especes">Espèces / Chèque</option></select>' +
      '<button type="submit" class="btn btn-ocean" style="width:100%">Valider le paiement</button>' +
      '</form></div>' +

      '<div class="panel">' +
      '<h3>Historique des transactions &amp; Remboursements</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Dossier</th><th>Type</th><th>Montant</th><th>Statut</th><th>Action</th></tr></thead><tbody>' +
      (payments.length ? payments.map(function (p) {
        var c = p.customer || {};
        return '<tr>' +
          '<td style="font-size:0.85rem">' + fmtDateTime(p.created_at) + '</td>' +
          '<td><strong>' + esc(p.booking_ref || "#" + p.booking_id) + '</strong><br><small class="note">' + esc((c.prenom || "") + " " + (c.nom || "")) + '</small></td>' +
          '<td>' + (p.kind === "balance" ? "Solde" : "Acompte") + '<br><small class="note">' + esc(p.method || "stripe") + '</small></td>' +
          '<td><strong>' + eur(p.amount) + '</strong></td>' +
          '<td><span class="badge">' + esc(p.status) + '</span></td>' +
          '<td>' + (p.status === "paid" ? '<button type="button" class="mini" data-refund="' + p.id + '">Rembourser</button>' : '—') + '</td>' +
          '</tr>';
      }).join("") : '<tr><td colspan="6">Aucune transaction enregistrée.</td></tr>') +
      '</tbody></table></div></div></div>';

    renderShell(html);

    document.getElementById("new-pay-form").onsubmit = async function (e) {
      e.preventDefault();
      await api("/api/admin/payments", {
        method: "POST",
        body: {
          ref: document.getElementById("np-ref").value,
          kind: document.getElementById("np-kind").value,
          amount: document.getElementById("np-amount").value,
          method: document.getElementById("np-method").value
        }
      });
      note("Paiement enregistré et dossier client synchronisé.");
      viewPayments();
    };
    document.querySelectorAll("[data-refund]").forEach(function (btn) {
      btn.onclick = async function () {
        await api("/api/admin/payments/" + btn.dataset.refund + "/refund", { method: "POST" });
        note("Transaction remboursée avec succès.");
        viewPayments();
      };
    });
  }

  // ============================================================================
  // G. MARKETING, AUTOMATISATIONS & GESTION DES AVIS CLIENTS (§3.F)
  // ============================================================================
  async function viewMarketing() {
    var [autoData, revData] = await Promise.all([
      api("/api/admin/automations"),
      api("/api/admin/reviews")
    ]);
    var notifications = autoData.notifications || [];
    var reviews = revData.reviews || [];

    var html =
      '<div class="grid-2" style="align-items:start;margin-bottom:1.25rem">' +
      // Scénarios d'automatisation + Importation de Leads Publicitaires (§3.F & §5)
      '<div>' +
      '<div class="panel" style="margin-bottom:1.25rem">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">' +
      '<h3>Scénarios d’automatisation Marketing</h3>' +
      '<button type="button" class="btn btn-ocean" id="run-automations" style="min-height:38px;padding:0.4rem 0.85rem;font-size:0.88rem">Exécuter les relances maintenant</button>' +
      '</div>' +
      '<ul style="font-size:0.92rem;padding-left:1.2rem;margin:0.8rem 0">' +
      '<li><strong>Rappel J-1 :</strong> Envoi automatique la veille d’une intervention planifiée (E-mail / SMS / WhatsApp).</li>' +
      '<li><strong>Relance Devis J+2 :</strong> Relance automatique des devis en attente de réponse après 48h.</li>' +
      '<li><strong>Demande d’avis J+1 :</strong> Envoi automatique d’une demande d’avis le lendemain d’une prestation terminée.</li>' +
      '</ul>' +
      '<div class="table-wrap"><table><thead><tr><th>Échéance</th><th>Scénario</th><th>Dossier</th><th>Canal</th><th>Statut</th></tr></thead><tbody>' +
      (notifications.length ? notifications.map(function (n) {
        var k = n.kind || n.template || "";
        var label = (k.indexOf("reminder") !== -1 || k.indexOf("j-1") !== -1) ? "Rappel intervention J-1" : (k.indexOf("quote") !== -1 ? "Relance devis en attente" : "Demande d'avis après prestation");
        return '<tr><td style="font-size:0.84rem">' + fmtDateTime(n.send_at) + '</td><td><strong>' + label + '</strong></td><td>' + esc(n.booking_ref || (n.payload && n.payload.ref) || "#" + n.booking_id) + '</td><td>' + esc(n.channel) + '</td><td><span class="badge">' + esc(n.status) + '</span></td></tr>';
      }).join("") : '<tr><td colspan="5">Aucune notification en file.</td></tr>') +
      '</tbody></table></div></div>' +

      '<div class="panel">' +
      '<h3>Importation &amp; Suivi des Leads Publicitaires</h3>' +
      '<p class="note">Importez un lead issu de vos campagnes Meta Ads, Google Ads ou Instagram pour suivre sa conversion jusqu’au chiffre d’affaires.</p>' +
      '<form id="lead-import-form">' +
      '<div class="grid-2">' +
      '<div><label>Nom du prospect</label><input id="li-name" required placeholder="Ex: Julien Mercier"></div>' +
      '<div><label>E-mail</label><input id="li-email" type="email" required placeholder="julien@example.fr"></div>' +
      '<div><label>Téléphone</label><input id="li-phone" placeholder="06 11 22 33 44"></div>' +
      '<div><label>Campagne / Source</label><select id="li-source"><option value="Meta Ads">Meta Ads (Facebook / Instagram)</option><option value="Google Ads">Google Ads (Search / Local)</option><option value="Instagram">Instagram Organique / DM</option><option value="Google">Google Maps / SEO</option></select></div>' +
      '</div>' +
      '<label>Besoin textile / Campagne associée</label>' +
      '<input id="li-need" placeholder="Ex: Canapé d’angle + Tapis — Campagne Promo -50%">' +
      '<button type="submit" class="btn btn-night" style="min-height:40px;font-size:0.9rem;width:100%">Importer le lead dans le CRM</button>' +
      '</form></div>' +
      '</div>' +

      // Gestion des avis clients et réponses
      '<div class="panel">' +
      '<h3>Gestion des avis clients &amp; réponses</h3>' +
      '<form id="review-form" style="margin-bottom:1rem;background:var(--mist);padding:0.85rem;border-radius:12px">' +
      '<div class="grid-2">' +
      '<div><label>Nom du client</label><input id="rv-name" required placeholder="Ex: Sophie M." style="margin:0"></div>' +
      '<div><label>Note (sur 5)</label><select id="rv-rating" style="margin:0"><option value="5">5 ★★★★★</option><option value="4">4 ★★★★</option><option value="3">3 ★★★</option><option value="2">2 ★★</option><option value="1">1 ★</option></select></div>' +
      '</div>' +
      '<label style="margin-top:0.5rem">Commentaire client</label><textarea id="rv-comment" required style="min-height:60px;margin-bottom:0.5rem"></textarea>' +
      '<label>Réponse officielle CARPEO</label><input id="rv-reply" placeholder="Merci pour votre confiance !">' +
      '<button type="submit" class="btn btn-ocean" style="min-height:38px;padding:0.4rem 0.9rem;font-size:0.88rem">Ajouter l’avis</button>' +
      '</form>' +

      '<div>' +
      reviews.map(function (r) {
        return '<div class="panel" style="margin-bottom:0.75rem;padding:0.85rem">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<strong>' + esc(r.customer_name) + ' · ' + "★".repeat(Number(r.rating || 5)) + '</strong>' +
          '<span class="badge">' + esc(r.status) + '</span>' +
          '</div>' +
          '<p style="margin:0.4rem 0;font-size:0.92rem">« ' + esc(r.comment) + ' »</p>' +
          '<label style="font-size:0.82rem">Réponse CARPEO</label>' +
          '<div style="display:flex;gap:0.4rem">' +
          '<input data-rv-reply="' + r.id + '" value="' + esc(r.reply || "") + '" placeholder="Votre réponse publique…" style="margin:0;padding:0.4rem 0.6rem;font-size:0.86rem">' +
          '<button type="button" class="pill is-on" data-rv-save="' + r.id + '">Répondre</button>' +
          '<button type="button" class="mini" data-rv-del="' + r.id + '">Suppr.</button>' +
          '</div></div>';
      }).join("") +
      '</div></div></div>';

    renderShell(html);

    document.getElementById("run-automations").onclick = async function () {
      var res = await api("/api/admin/automations/run", { method: "POST" });
      note("Scénarios exécutés (" + res.dispatched + " notifications traitées).");
      viewMarketing();
    };
    var leadForm = document.getElementById("lead-import-form");
    if (leadForm) {
      leadForm.onsubmit = async function (e) {
        e.preventDefault();
        await api("/api/admin/contacts", {
          method: "POST",
          body: {
            name: document.getElementById("li-name").value,
            email: document.getElementById("li-email").value,
            phone: document.getElementById("li-phone").value,
            source: document.getElementById("li-source").value,
            tags: "Lead Publicitaire, " + document.getElementById("li-source").value,
            need: document.getElementById("li-need").value,
            notes: "Lead importé depuis campagne " + document.getElementById("li-source").value + " : " + document.getElementById("li-need").value,
            status: "Nouveau"
          }
        });
        note("Lead publicitaire importé dans le CRM avec attribution source.");
        leadForm.reset();
      };
    }
    document.getElementById("review-form").onsubmit = async function (e) {
      e.preventDefault();
      await api("/api/admin/reviews", {
        method: "POST",
        body: {
          customerName: document.getElementById("rv-name").value,
          rating: document.getElementById("rv-rating").value,
          comment: document.getElementById("rv-comment").value,
          reply: document.getElementById("rv-reply").value
        }
      });
      note("Avis client publié.");
      viewMarketing();
    };
    document.querySelectorAll("[data-rv-save]").forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.rvSave;
        var reply = document.querySelector('[data-rv-reply="' + id + '"]').value;
        await api("/api/admin/reviews/" + id, { method: "PATCH", body: { reply: reply } });
        note("Réponse à l'avis enregistrée.");
        viewMarketing();
      };
    });
    document.querySelectorAll("[data-rv-del]").forEach(function (btn) {
      btn.onclick = async function () {
        await api("/api/admin/reviews/" + btn.dataset.rvDel, { method: "DELETE" });
        viewMarketing();
      };
    });
  }

  // ============================================================================
  // H. PARAMÈTRES, TARIFS, ÉQUIPE & JOURNAL D'AUDIT (§3.G & §6)
  // ============================================================================
  async function viewSettings() {
    var [pData, uData, sData, aData] = await Promise.all([
      api("/api/admin/pricing"),
      api("/api/admin/users"),
      api("/api/admin/settings"),
      api("/api/admin/audit")
    ]);
    var defs = (window.CARPEO_PRICING && window.CARPEO_PRICING.definitions) || {};
    var settings = sData.settings || {};

    var html =
      '<div class="grid-2" style="align-items:start;margin-bottom:1.25rem">' +
      // 1. Grille des tarifs & acompte
      '<div class="panel">' +
      '<h3>Modification des tarifs &amp; acompte</h3>' +
      '<p class="note">Les prix appliqués aux dossiers déjà confirmés sont conservés automatiquement.</p>' +
      '<form id="pricing-admin">' +
      '<label for="deposit-admin">Montant de l’acompte de réservation (€)</label>' +
      '<input id="deposit-admin" type="number" min="0" value="' + pData.deposit + '">' +
      '<div class="table-wrap" style="max-height:420px;overflow-y:auto"><table><thead><tr><th>Prestation</th><th>Mode</th><th>Prix (€)</th></tr></thead><tbody>' +
      Object.keys(pData.items).map(function (k) {
        var v = pData.items[k];
        return '<tr><td>' + esc(v.label || (defs[k] && defs[k].label) || k) + '</td>' +
          '<td><select data-mode="' + k + '" style="margin:0;padding:0.35rem"><option value="price"' + (v.mode === "price" ? " selected" : "") + '>Prix ferme</option><option value="quote"' + (v.mode === "quote" ? " selected" : "") + '>Sur devis</option></select></td>' +
          '<td><input data-price="' + k + '" type="number" min="0" step=".01" value="' + v.price + '" style="margin:0;padding:0.35rem;width:95px"></td></tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<button class="btn btn-ocean" type="submit" style="margin-top:0.8rem;width:100%">Enregistrer les tarifs pour tout le site</button>' +
      '</form></div>' +

      // 2. Paramètres généraux, Zone, Google Maps & Tracking + Utilisateurs
      '<div>' +
      '<div class="panel" style="margin-bottom:1.25rem">' +
      '<h3>Zone d’intervention, Google Maps &amp; Tracking RGPD</h3>' +
      '<form id="settings-form">' +
      '<label>Zone d’intervention affichée</label>' +
      '<input id="set-area" value="' + esc(settings.area || "Intervention à domicile et en entreprise") + '">' +
      '<label>Horaires</label>' +
      '<input id="set-hours" value="' + esc(settings.hours || "7 jours sur 7, de 9 h à 19 h") + '">' +
      '<label>Lien Google Maps CARPEO</label>' +
      '<input id="set-maps" value="' + esc(settings.maps_url || "https://www.google.com/maps/place/Carpeo/@48.8350077,2.4096267,11z/data=!3m1!4b1!4m6!3m5!1s0x42afe645686fa375:0xe9c68ae617bca720!8m2!3d48.8350076!4d2.4096267!16s%2Fg%2F11zzsk71ns?entry=ttu&g_ep=EgoyMDI2MTEwMy4wIKXMDSoASAFQAw%3D%3D") + '">' +
      '<div class="grid-2">' +
      '<div><label>Google Analytics 4 (GA4)</label><input id="set-ga4" value="' + esc(settings.ga4_id || "G-XXXXXXXX") + '"></div>' +
      '<div><label>Google Tag Manager (GTM)</label><input id="set-gtm" value="' + esc(settings.gtm_id || "GTM-XXXXXXX") + '"></div>' +
      '<div><label>Meta Pixel ID</label><input id="set-pixel" value="' + esc(settings.meta_pixel_id || "000000000000000") + '"></div>' +
      '<div><label>Google Ads ID</label><input id="set-gads" value="' + esc(settings.google_ads_id || "AW-XXXXXXXX") + '"></div>' +
      '</div>' +
      '<button class="btn btn-ocean" type="submit">Enregistrer les paramètres</button>' +
      '</form></div>' +

      '<div class="panel">' +
      '<h3>Gestion multi-utilisateurs &amp; Permissions</h3>' +
      '<p class="note">Profils : Administrateur (accès total), Équipe (exploitation), Lecture seule.</p>' +
      '<form id="user-form">' +
      '<div class="grid-2">' +
      '<div><label>Nom</label><input id="user-name" required></div>' +
      '<div><label>E-mail</label><input id="user-email" type="email" required></div>' +
      '<div><label>Profil / Rôle</label><select id="user-role"><option value="team">Équipe</option><option value="readonly">Lecture seule</option><option value="admin">Administrateur</option></select></div>' +
      '<div><label>Mot de passe (12+ car.)</label><input id="user-password" type="password" minlength="12" required></div>' +
      '</div>' +
      '<button class="btn btn-night" type="submit">Créer le compte utilisateur</button>' +
      '</form>' +
      '<div class="table-wrap" style="margin-top:0.8rem"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Profil</th><th>Action</th></tr></thead><tbody>' +
      (uData.users || []).map(function (x) {
        return '<tr><td><strong>' + esc(x.name) + '</strong></td><td>' + esc(x.email) + '</td>' +
          '<td><select data-user-role="' + esc(x.id) + '" style="margin:0;padding:0.25rem 0.5rem;width:auto">' +
          [["admin", "Administrateur"], ["team", "Équipe"], ["readonly", "Lecture seule"]].map(function (r) {
            return '<option value="' + r[0] + '"' + (x.role === r[0] ? ' selected' : '') + '>' + r[1] + '</option>';
          }).join("") +
          '</select></td>' +
          '<td><button type="button" class="mini" data-del-user="' + esc(x.id) + '">Supprimer</button></td></tr>';
      }).join("") +
      '</tbody></table></div></div>' +
      '</div></div>' +

      // 3. Journal d'audit des actions sensibles
      '<div class="panel">' +
      '<h3>Journal d’audit &amp; Traçabilité des actions</h3>' +
      '<div class="table-wrap" style="max-height:360px;overflow-y:auto"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Cible</th></tr></thead><tbody>' +
      (aData.audit || []).slice(0, 100).map(function (a) {
        return '<tr><td>' + fmtDateTime(a.created_at) + '</td><td>' + esc(a.email || "Système / Client") + '</td><td><code>' + esc(a.action) + '</code></td><td>' + esc(a.entity_type) + ' ' + esc(a.entity_id || "") + '</td></tr>';
      }).join("") +
      '</tbody></table></div></div>';

    renderShell(html);

    document.getElementById("pricing-admin").onsubmit = async function (e) {
      e.preventDefault();
      var items = {};
      document.querySelectorAll("[data-mode]").forEach(function (n) {
        var k = n.dataset.mode;
        items[k] = { mode: n.value, price: Number(document.querySelector('[data-price="' + k + '"]').value) || 0 };
      });
      await api("/api/admin/pricing", {
        method: "PUT",
        body: { deposit: Number(document.getElementById("deposit-admin").value) || 0, items: items }
      });
      if (window.CARPEO_PRICING && window.CARPEO_PRICING.refresh) await window.CARPEO_PRICING.refresh();
      note("Grille tarifaire et acompte mis à jour.");
    };

    document.getElementById("settings-form").onsubmit = async function (e) {
      e.preventDefault();
      await api("/api/admin/settings", {
        method: "PUT",
        body: {
          settings: {
            area: document.getElementById("set-area").value,
            hours: document.getElementById("set-hours").value,
            maps_url: document.getElementById("set-maps").value,
            ga4_id: document.getElementById("set-ga4").value,
            gtm_id: document.getElementById("set-gtm").value,
            meta_pixel_id: document.getElementById("set-pixel").value,
            google_ads_id: document.getElementById("set-gads").value
          }
        }
      });
      note("Paramètres enregistrés.");
    };

    document.getElementById("user-form").onsubmit = async function (e) {
      e.preventDefault();
      await api("/api/admin/users", {
        method: "POST",
        body: {
          name: document.getElementById("user-name").value,
          email: document.getElementById("user-email").value,
          role: document.getElementById("user-role").value,
          password: document.getElementById("user-password").value
        }
      });
      note("Nouvel utilisateur créé.");
      viewSettings();
    };
    document.querySelectorAll("[data-user-role]").forEach(function (sel) {
      sel.onchange = async function () {
        await api("/api/admin/users/" + sel.dataset.userRole, { method: "PATCH", body: { role: sel.value } });
        note("Rôle utilisateur mis à jour.");
      };
    });
    document.querySelectorAll("[data-del-user]").forEach(function (btn) {
      btn.onclick = async function () {
        await api("/api/admin/users/" + btn.dataset.delUser, { method: "DELETE" });
        note("Utilisateur supprimé.");
        viewSettings();
      };
    });
  }

  // ============================================================================
  // NAVIGATION & AUTHENTICATION SHELL
  // ============================================================================
  var TABS = [
    ["dashboard", "Tableau de bord", viewDashboard],
    ["bookings", "Pipeline & Devis (Kanban)", viewBookings],
    ["contacts", "Contacts CRM", viewContacts],
    ["conversations", "Conversations (Inbox)", viewConversations],
    ["planning", "Interventions & Tournées", viewPlanning],
    ["payments", "Paiements Stripe", viewPayments],
    ["marketing", "Marketing & Avis", viewMarketing],
    ["settings", "Paramètres, Tarifs & Audit", viewSettings]
  ];

  async function showTab(name) {
    activeTab = name;
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.tab === name);
    });
    var entry = TABS.find(function (t) { return t[0] === name; }) || TABS[0];
    try {
      await entry[2]();
    } catch (e) {
      note(e.message);
    }
  }

  async function enter() {
    try {
      var me = await api("/api/auth/me");
      if (me.csrf) {
        csrf = me.csrf;
        try { sessionStorage.setItem("carpeo_admin_csrf", csrf); } catch (e) {}
      }
      currentUser = me.user;
      loginPanel.hidden = true;
      app.hidden = false;
      if (quickBar) {
        quickBar.hidden = false;
        quickBar.querySelectorAll('a[href="/api/admin/export.csv"]').forEach(function (a) {
          a.onclick = function (e) { e.preventDefault(); downloadCsv(); };
        });
        quickBar.querySelectorAll('a[href="/api/admin/calendar.ics"]').forEach(function (a) {
          a.onclick = function (e) { e.preventDefault(); downloadIcs(); };
        });
      }
      document.getElementById("logout").hidden = false;
      if (userBadge && currentUser) {
        userBadge.textContent = currentUser.name + " (" + currentUser.role + ")";
        userBadge.hidden = false;
      }
      navTabs.innerHTML = TABS.map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join("");
      navTabs.querySelectorAll("[data-tab]").forEach(function (b) {
        b.onclick = function () { showTab(b.dataset.tab); };
      });
      showTab(activeTab);
    } catch (e) {
      loginPanel.hidden = false;
      app.hidden = true;
      if (quickBar) quickBar.hidden = true;
    }
  }

  var loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.onsubmit = async function (e) {
      e.preventDefault();
      try {
        var d = await api("/api/auth/login", {
          method: "POST",
          body: {
            email: document.getElementById("admin-email").value,
            password: document.getElementById("admin-password").value
          }
        });
        csrf = d.csrf || "local-csrf";
        adminToken = d.token || "";
        try {
          sessionStorage.setItem("carpeo_admin_csrf", csrf);
          if (adminToken) sessionStorage.setItem("carpeo_admin_token", adminToken);
        } catch (err) {}
        note("Bienvenue dans le back-office CARPEO.");
        enter();
      } catch (x) {
        note(x.message);
      }
    };
  }

  var logoutBtn = document.getElementById("logout");
  if (logoutBtn) {
    logoutBtn.onclick = async function () {
      await api("/api/auth/logout", { method: "POST" }).catch(function () {});
      try {
        sessionStorage.removeItem("carpeo_admin_csrf");
        sessionStorage.removeItem("carpeo_admin_token");
      } catch (err) {}
      location.reload();
    };
  }

  var quickBackup = document.getElementById("quick-backup");
  if (quickBackup) {
    quickBackup.onclick = async function () {
      try {
        var x = await api("/api/admin/backup", { method: "POST" });
        note("Sauvegarde créée : " + x.file);
      } catch (err) {
        note(err.message);
      }
    };
  }

  enter();
})();
