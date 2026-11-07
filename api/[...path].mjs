import crypto from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const PROMOS = { BIENVENUE10: ["pct", 10], CARPEO20: ["eur", 20], FIDELITE15: ["pct", 15], NOEL2026: ["pct", 10] };
const PRICE_DEFAULTS = {
  sofa2Straight: ["Canapé droit, 2 places", "Canapés", "price", 89],
  sofa3Straight: ["Canapé droit, 3 places", "Canapés", "price", 99],
  sofa4Straight: ["Canapé droit, 4 places", "Canapés", "quote", 0],
  sofa2Angle: ["Canapé d’angle, 2 places", "Canapés", "price", 119],
  sofa3Angle: ["Canapé d’angle, 3 places", "Canapés", "price", 139],
  sofa4Angle: ["Canapé d’angle, 4 places", "Canapés", "quote", 0],
  sofa2Meridienne: ["Méridienne, 2 places", "Canapés", "price", 119],
  sofa3Meridienne: ["Méridienne, 3 places", "Canapés", "price", 139],
  sofaPanoramic: ["Canapé panoramique", "Canapés", "quote", 0],
  sofaConvertible: ["Canapé convertible", "Canapés", "quote", 0],
  mattress1: ["Matelas, une face", "Literie", "price", 79],
  mattress2: ["Matelas, deux faces", "Literie", "price", 89],
  headboard: ["Tête de lit", "Literie", "quote", 0],
  armchair: ["Fauteuil", "Assises", "price", 49],
  chair: ["Chaise rembourrée", "Assises", "price", 25],
  chairs6: ["Lot de 6 chaises", "Assises", "price", 90],
  rug: ["Tapis", "Surfaces", "quote", 39],
  carpet: ["Moquette", "Surfaces", "quote", 0],
  cushion: ["Coussin", "Autres textiles", "quote", 0],
  other: ["Autre demande", "Autres textiles", "quote", 0]
};

function json(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}
function text(res, status, data, type, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(data);
}
function clean(v, n = 500) { return String(v ?? "").trim().slice(0, n); }
function hash(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function now() { return new Date().toISOString(); }
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((x) => x.trim().split(/=(.*)/s)).filter((x) => x[0]).map(([k, v]) => [k, decodeURIComponent(v || "")]));
}
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function configured(res) {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    json(res, 503, { error: "Supabase n’est pas encore connecté à Vercel" });
    return false;
  }
  return true;
}
async function rest(table, query = "", init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: init.prefer || "return=representation",
      ...(init.headers || {})
    }
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.hint || `Supabase ${response.status}`), { status: response.status });
  return data;
}
async function safeRest(table, query = "", init = {}, fallback = []) {
  try { return await rest(table, query, init); } catch { return fallback; }
}
async function authUser(req) {
  const token = cookies(req).carpeo_access;
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  const rows = await rest("users", `id=eq.${encodeURIComponent(user.id)}&select=id,email,name,role&limit=1`);
  return rows[0] || null;
}
async function admin(req, res, mutating = false) {
  const user = await authUser(req);
  if (!user) { json(res, 401, { error: "Authentification requise" }); return null; }
  if (mutating && cookies(req).carpeo_csrf !== req.headers["x-csrf-token"]) { json(res, 403, { error: "Jeton CSRF invalide" }); return null; }
  if (mutating && user.role === "readonly") { json(res, 403, { error: "Accès en lecture seule" }); return null; }
  return user;
}
async function audit(user, action, type, id, meta = {}) {
  await safeRest("audit", "", { method: "POST", body: JSON.stringify({ user_id: user?.id || null, action, entity_type: type, entity_id: id == null ? null : String(id), meta_json: meta }) });
}
async function pricing() {
  const [rows, settings] = await Promise.all([
    safeRest("pricing", "select=key,label,group_name,mode,price&order=group_name,label"),
    safeRest("settings", "select=key,value")
  ]);
  const setMap = Object.fromEntries((settings || []).map((x) => [x.key, x.value]));
  const items = {};
  for (const row of rows || []) items[row.key] = { label: row.label, group: row.group_name, mode: row.mode, price: Number(row.price) };
  if (!Object.keys(items).length) {
    for (const [k, v] of Object.entries(PRICE_DEFAULTS)) items[k] = { label: v[0], group: v[1], mode: v[2], price: v[3] };
  }
  return {
    deposit: Number(setMap.deposit || 20),
    area: setMap.area && !setMap.area.includes("Île-de-France") ? setMap.area : "Intervention à domicile et en entreprise",
    hours: setMap.hours || "7 jours sur 7, de 9 h à 19 h",
    items
  };
}
function sofaKey(i) {
  if (i.config === "panoramique") return "sofaPanoramic";
  if (i.config === "convertible") return "sofaConvertible";
  if (i.config === "meridienne") return i.places === "3" ? "sofa3Meridienne" : "sofa2Meridienne";
  if (i.config === "angle") return i.places === "4" ? "sofa4Angle" : i.places === "3" ? "sofa3Angle" : "sofa2Angle";
  return i.places === "4" ? "sofa4Straight" : i.places === "3" ? "sofa3Straight" : "sofa2Straight";
}
function itemPrice(i, p) {
  const q = Math.max(1, Math.min(100, Number(i.qty) || 1));
  let k;
  if (i.cat === "canape") k = sofaKey(i);
  else k = ({ matelas: i.faces === "2" ? "mattress2" : "mattress1", fauteuil: "armchair", tapis: "rug", moquette: "carpet", coussin: "cushion", tete: "headboard", autre: "other" })[i.cat];
  if (i.cat === "chaise") {
    const a = p.items.chair, b = p.items.chairs6;
    if (!a || !b || a.mode !== "price" || b.mode !== "price") return null;
    return Math.floor(q / 6) * b.price + (q % 6) * a.price;
  }
  const v = p.items[k];
  if (!v || v.mode !== "price") return null;
  return v.price * (i.cat === "canape" ? 1 : q);
}
async function calculate(items, advance, promoCode) {
  const p = await pricing();
  const lines = items.map((i) => itemPrice(i, p));
  const pricedItems = items.map((item, idx) => ({ ...item, frozenPrice: lines[idx] }));
  if (lines.some((v) => v == null)) return { type: "devis", total: null, deposit: null, balance: null, pricedItems };
  const base = Math.round(lines.reduce((a, b) => a + b, 0) * 100) / 100;
  const promo = PROMOS[clean(promoCode, 50).toUpperCase()];
  const discount = promo ? (promo[0] === "pct" ? Math.round(base * promo[1]) / 100 : Math.min(base, promo[1])) : 0;
  const total = Math.round((base - discount) * 100) / 100;
  const due = advance === "oui" ? Math.round(total * 50) / 100 : total;
  const deposit = Math.min(p.deposit, due);
  return { type: "reservation", total, deposit, balance: advance === "oui" ? due : Math.round((due - deposit) * 100) / 100, discount, pricedItems };
}
async function slots() {
  const [booked, blocked] = await Promise.all([
    safeRest("bookings", "select=slot&slot=not.is.null&status=not.in.(Annulé,Terminé)"),
    safeRest("blocked_slots", "select=id,slot_start,slot_end,reason&order=slot_start")
  ]);
  const used = new Set([...booked.map((x) => x.slot), ...blocked.map((x) => x.slot_start)]);
  const days = [];
  const from = new Date();
  for (let d = 1; d <= 14; d++) {
    const date = new Date(from);
    date.setDate(from.getDate() + d);
    if (date.getDay() === 0) continue;
    const iso = date.toISOString().slice(0, 10);
    days.push({
      date: iso,
      slots: ["08:00", "11:00", "14:00", "17:00"].map((time) => ({
        value: `${iso} ${time}`,
        time,
        available: !used.has(`${iso} ${time}`)
      }))
    });
  }
  return { days, blocked };
}
async function uploadPhotos(ref, photos) {
  const uploaded = [];
  for (const photo of (Array.isArray(photos) ? photos : []).slice(0, 16)) {
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(photo.data || "");
    if (!match) continue;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 5 * 1024 * 1024) continue;
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const key = `${ref}/${crypto.randomUUID()}.${ext}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/booking-photos/${key}`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": photo.type || `image/${match[1]}`, "x-upsert": "false" },
      body: bytes
    });
    if (r.ok) uploaded.push(key);
  }
  return uploaded;
}
async function geocodeAddress(customer = {}) {
  const query = [customer.adresse, customer.cp, customer.ville].filter(Boolean).join(" ").trim();
  if (!query) return { lat: 48.8566, lng: 2.3522 };
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const coords = data?.features?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) return { lng: coords[0], lat: coords[1] };
    }
  } catch {}
  const h = crypto.createHash("md5").update(query).digest();
  return { lat: Math.round((48.8566 + ((h[0] - 128) / 128) * 0.04) * 100000) / 100000, lng: Math.round((2.3522 + ((h[1] - 128) / 128) * 100000) * 0.06) / 100000 };
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.28 * 10) / 10;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!configured(res)) return;
  const url = new URL(req.url, "https://carpeo.vercel.app"), path = url.pathname, method = req.method || "GET";
  try {
    if (method === "GET" && path === "/api/health") {
      return json(res, 200, { ok: true, database: "supabase", supabaseConfigured: true, stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY), time: now() });
    }
    if (method === "GET" && path === "/api/pricing") return json(res, 200, await pricing());
    if (method === "GET" && path === "/api/slots") return json(res, 200, await slots());

    if (method === "POST" && path === "/api/contact") {
      const b = await body(req), name = clean(b.name, 160), email = clean(b.email, 200).toLowerCase(), message = clean(b.message, 4000);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) return json(res, 422, { error: "Nom, e-mail et message valides requis" });
      const rows = await rest("contacts", "", { method: "POST", body: JSON.stringify({ name, email, phone: clean(b.phone, 60), need: clean(b.need, 120), message, status: "Nouveau" }) });
      await safeRest("conversations", "", { method: "POST", body: JSON.stringify({ contact_id: rows[0].id, channel: "form", direction: "inbound", body: message, status: "reçu" }) });
      return json(res, 201, { ok: true });
    }

    if (method === "POST" && path === "/api/bookings") {
      const b = await body(req), items = Array.isArray(b.items) ? b.items.slice(0, 20) : [], c = b.customer || {}, email = clean(c.email, 200).toLowerCase();
      if (!items.length || !clean(c.nom, 120) || !clean(c.prenom, 120) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !clean(c.tel, 60) || !clean(c.adresse, 300) || !clean(c.cp, 10) || !clean(c.ville, 120)) {
        return json(res, 422, { error: "Informations client ou prestations incomplètes" });
      }
      c.email = email;
      const calc = await calculate(items, b.advance, b.promo);
      if (calc.type === "reservation" && !clean(b.slot, 30)) return json(res, 422, { error: "Créneau requis" });
      if (calc.type === "reservation") {
        const used = await rest("bookings", `slot=eq.${encodeURIComponent(clean(b.slot, 30))}&status=not.in.(Annulé,Terminé)&select=id&limit=1`);
        if (used.length) return json(res, 409, { error: "Ce créneau vient d’être réservé" });
      }
      const ref = `CAR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, key = crypto.randomBytes(8).toString("base64url").toUpperCase();
      const status = calc.type === "devis" ? "Demande reçue" : "Acompte à régler";
      const rows = await rest("bookings", "", {
        method: "POST",
        body: JSON.stringify({
          ref, access_key_hash: hash(key), type: calc.type, status, customer_json: c, items_json: calc.pricedItems,
          slot: calc.type === "reservation" ? clean(b.slot, 30) : null,
          total: calc.total, deposit: calc.deposit, balance: calc.balance,
          promo: clean(b.promo, 50), advance: clean(b.advance, 10)
        })
      });
      await uploadPhotos(ref, b.photos);
      await audit(null, "booking.created", "booking", rows[0].id, { ref });
      return json(res, 201, { ref, key, ...calc, status });
    }

    const booking = /^\/api\/bookings\/([^/]+)$/.exec(path);
    if (method === "GET" && booking) {
      const ref = decodeURIComponent(booking[1]).toUpperCase();
      const rows = await rest("bookings", `ref=eq.${encodeURIComponent(ref)}&select=*&limit=1`);
      const row = rows[0];
      if (!row || row.access_key_hash !== hash(clean(url.searchParams.get("key"), 100))) return json(res, 404, { error: "Dossier introuvable" });
      return json(res, 200, {
        ref: row.ref, type: row.type, status: row.status, items: row.items_json, slot: row.slot,
        total: row.total == null ? null : Number(row.total), deposit: row.deposit == null ? null : Number(row.deposit),
        balance: row.balance == null ? null : Number(row.balance),
        quoteAmount: row.quote_amount == null ? null : Number(row.quote_amount),
        created: row.created_at, updated: row.updated_at
      });
    }

    if (method === "POST" && /^\/api\/bookings\/[^/]+\/accept$/.test(path)) {
      const ref = decodeURIComponent(path.split("/")[3]).toUpperCase(), b = await body(req);
      const rows = await rest("bookings", `ref=eq.${encodeURIComponent(ref)}&select=*&limit=1`), row = rows[0];
      if (!row || row.access_key_hash !== hash(clean(b.key, 100))) return json(res, 404, { error: "Dossier introuvable" });
      if (row.quote_amount == null) return json(res, 409, { error: "Aucun devis à accepter" });
      const p = await pricing(), amount = Number(row.quote_amount);
      await rest("bookings", `id=eq.${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Accepté", total: amount, deposit: Math.min(p.deposit, amount), balance: Math.max(0, amount - p.deposit), updated_at: now() })
      });
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && path === "/api/payments/create-intent") {
      const b = await body(req);
      const rows = await rest("bookings", `ref=eq.${encodeURIComponent(clean(b.ref, 40).toUpperCase())}&select=*&limit=1`), row = rows[0];
      if (!row || row.access_key_hash !== hash(clean(b.key, 100))) return json(res, 404, { error: "Dossier introuvable" });
      const kind = b.kind === "balance" ? "balance" : "deposit";
      const amountEur = kind === "balance" ? Number(row.balance || 0) : Number(row.deposit || 20);
      const simId = `pi_${crypto.randomBytes(6).toString("hex")}`;
      await safeRest("payments", "", { method: "POST", body: JSON.stringify({ booking_id: row.id, provider_id: simId, kind, amount: amountEur, status: "paid", method: "stripe" }) });
      await rest("bookings", `id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status: kind === "deposit" ? "Confirmé" : "Terminé", balance: kind === "balance" ? 0 : row.balance, updated_at: now() }) });
      return json(res, 200, { simulated: !process.env.STRIPE_SECRET_KEY, providerId: simId, amount: amountEur, status: "paid" });
    }

    if (method === "POST" && path === "/api/events") {
      const b = await body(req);
      await safeRest("events", "", { method: "POST", body: JSON.stringify({ name: clean(b.name, 120), payload_json: b.params || {} }), prefer: "return=minimal" });
      return json(res, 202, { ok: true });
    }

    if (method === "POST" && path === "/api/auth/login") {
      const b = await body(req);
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean(b.email, 200), password: String(b.password || "") })
      });
      const data = await r.json();
      if (!r.ok) return json(res, 401, { error: "Identifiants incorrects" });
      const users = await rest("users", `id=eq.${data.user.id}&select=id,email,name,role&limit=1`);
      if (!users.length) return json(res, 403, { error: "Utilisateur non autorisé dans le back-office" });
      const csrf = crypto.randomBytes(24).toString("base64url");
      const cookieHeaders = [
        `carpeo_access=${encodeURIComponent(data.access_token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${data.expires_in}`,
        `carpeo_csrf=${csrf}; Secure; SameSite=Strict; Path=/; Max-Age=${data.expires_in}`
      ];
      return json(res, 200, { user: users[0], csrf }, { "Set-Cookie": cookieHeaders });
    }
    if (method === "GET" && path === "/api/auth/me") {
      const user = await admin(req, res);
      if (!user) return;
      return json(res, 200, { user, csrf: cookies(req).carpeo_csrf });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      return json(res, 200, { ok: true }, { "Set-Cookie": ["carpeo_access=; HttpOnly; Secure; Path=/; Max-Age=0", "carpeo_csrf=; Secure; Path=/; Max-Age=0"] });
    }

    if (path.startsWith("/api/admin/")) {
      const mutating = !["GET", "HEAD"].includes(method);
      const user = await admin(req, res, mutating);
      if (!user) return;

      if (method === "GET" && path === "/api/admin/dashboard") {
        const [bookings, contacts, payments, reviews, tasks, convs] = await Promise.all([
          safeRest("bookings", "select=*&order=created_at.desc"),
          safeRest("contacts", "select=id"),
          safeRest("payments", "select=amount,status&status=eq.paid"),
          safeRest("reviews", "select=rating,status&status=eq.Publié"),
          safeRest("tasks", "select=id,status"),
          safeRest("conversations", "select=id,direction,status")
        ]);
        const KANBAN = ["Demande reçue", "Devis envoyé", "Accepté", "Acompte à régler", "Confirmé", "Planifié", "Terminé", "Annulé"];
        const group = Object.fromEntries(KANBAN.map((s) => [s, 0]));
        for (const b of bookings) group[b.status] = (group[b.status] || 0) + 1;
        const active = bookings.filter((x) => x.status !== "Annulé" && (x.total != null || x.quote_amount != null));
        const revenue = active.reduce((s, x) => s + Number(x.total ?? x.quote_amount ?? 0), 0);
        const deposits = active.reduce((s, x) => s + Number(x.deposit || 0), 0);
        const balances = active.reduce((s, x) => s + Number(x.balance || 0), 0);
        const collected = payments.reduce((s, x) => s + Number(x.amount || 0), 0);
        const average = active.length ? Math.round((revenue / active.length) * 100) / 100 : 0;
        const won = bookings.filter((x) => ["Accepté", "Confirmé", "Planifié", "Terminé"].includes(x.status)).length;
        const cancelled = bookings.filter((x) => x.status === "Annulé").length;
        const avgRating = reviews.length ? Math.round((reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / reviews.length) * 10) / 10 : 4.9;
        const catCounts = {}, attribMap = {};
        for (const b of bookings) {
          for (const it of (b.items_json || [])) catCounts[it.cat || "autre"] = (catCounts[it.cat || "autre"] || 0) + (Number(it.qty) || 1);
          const cust = b.customer_json || {}, attr = b.attribution_json || {};
          const src = attr.source || cust.heard || "Direct / Site web";
          if (!attribMap[src]) attribMap[src] = { source: src, leads: 0, won: 0, revenue: 0 };
          attribMap[src].leads += 1;
          if (["Accepté", "Confirmé", "Planifié", "Terminé"].includes(b.status)) {
            attribMap[src].won += 1;
            attribMap[src].revenue += Number(b.total ?? b.quote_amount ?? 0);
          }
        }
        return json(res, 200, {
          counts: Object.entries(group).map(([status, count]) => ({ status, count })),
          money: { revenue, deposits, balances, collected, average },
          contacts: contacts.length,
          conversion: bookings.length ? Math.round((won / bookings.length) * 1000) / 10 : 0,
          cancellations: { count: cancelled, rate: bookings.length ? Math.round((cancelled / bookings.length) * 1000) / 10 : 0 },
          satisfaction: { rating: avgRating, count: reviews.length },
          serviceBreakdown: Object.entries(catCounts).map(([category, count]) => ({ category, count })),
          attribution: Object.values(attribMap).sort((a, b) => b.revenue - a.revenue),
          alerts: {
            quotesToPrice: group["Demande reçue"] || 0,
            quotesToConvert: group["Accepté"] || 0,
            unreadMessages: convs.filter((c) => c.direction === "inbound" && c.status === "reçu").length,
            pendingTasks: tasks.filter((t) => t.status !== "Terminé").length
          }
        });
      }

      if (method === "GET" && path === "/api/admin/bookings") {
        const rows = await rest("bookings", "select=*&order=created_at.desc&limit=500");
        return json(res, 200, {
          bookings: rows.map((x) => ({
            ...x,
            customer: x.customer_json || {},
            items: x.items_json || [],
            attribution: x.attribution_json || {},
            photos: x.photos_json || [],
            access_key_hash: undefined
          }))
        });
      }

      if (method === "POST" && path === "/api/admin/bookings") {
        const b = await body(req), customer = b.customer || {}, items = Array.isArray(b.items) && b.items.length ? b.items : [{ cat: b.cat || "canape", places: "3", config: "droit", qty: "1" }];
        const calc = await calculate(items, b.advance || "non", b.promo || "");
        const ref = `CAR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, key = crypto.randomBytes(8).toString("base64url").toUpperCase();
        const status = clean(b.status || (calc.type === "devis" ? "Demande reçue" : "Confirmé"), 60);
        const total = b.total != null && b.total !== "" ? Number(b.total) : calc.total;
        const p = await pricing();
        const deposit = total != null ? Math.min(p.deposit, total) : null;
        const balance = total != null ? Math.max(0, total - (deposit || 0)) : null;
        const rows = await rest("bookings", "", {
          method: "POST",
          body: JSON.stringify({
            ref, access_key_hash: hash(key), type: b.type || calc.type, status, customer_json: customer, items_json: calc.pricedItems,
            slot: clean(b.slot, 40) || null, total, deposit, balance,
            quote_amount: b.quoteAmount != null && b.quoteAmount !== "" ? Number(b.quoteAmount) : null,
            notes: clean(b.notes, 4000)
          })
        });
        await audit(user, "booking.created.admin", "booking", rows[0]?.id, { ref });
        return json(res, 201, { id: rows[0]?.id, ref, key });
      }

      const edit = /^\/api\/admin\/bookings\/(\d+)$/.exec(path);
      if (method === "PATCH" && edit) {
        const b = await body(req);
        const existing = (await rest("bookings", `id=eq.${edit[1]}&select=*&limit=1`))[0];
        if (!existing) return json(res, 404, { error: "Dossier introuvable" });
        let status = clean(b.status ?? existing.status, 40);
        const slot = b.slot === undefined ? existing.slot : (clean(b.slot, 30) || null);
        const quote = b.quoteAmount === "" || b.quoteAmount == null ? existing.quote_amount : Number(b.quoteAmount);
        let total = existing.total, deposit = existing.deposit, balance = existing.balance;

        if (b.action === "sendQuote" && Number.isFinite(quote)) {
          status = "Devis envoyé";
          const cust = existing.customer_json || {};
          await safeRest("conversations", "", {
            method: "POST",
            body: JSON.stringify({ booking_id: existing.id, channel: "email", direction: "outbound", body: `Devis CARPEO ${existing.ref} : ${quote} € TTC.`, status: "queued" })
          });
        }
        if (b.action === "convertToIntervention") {
          status = "Planifié";
          const p = await pricing();
          const finalAmount = Number.isFinite(quote) && quote > 0 ? quote : Number(existing.total || 0);
          if (finalAmount > 0 && existing.total == null) {
            total = finalAmount;
            deposit = Math.min(p.deposit, finalAmount);
            balance = Math.max(0, finalAmount - deposit);
          }
          const cust = existing.customer_json || {};
          await safeRest("tasks", "", {
            method: "POST",
            body: JSON.stringify({ booking_id: existing.id, title: `Intervention ${existing.ref} — ${cust.prenom || ""} ${cust.nom || ""}`, due_at: slot ? slot.replace(" ", "T") + ":00Z" : null, status: "À faire", assignee: "Équipe terrain" })
          });
        }

        await rest("bookings", `id=eq.${edit[1]}`, {
          method: "PATCH",
          body: JSON.stringify({ status, quote_amount: quote, slot, total, deposit, balance, notes: clean(b.notes ?? existing.notes, 5000), updated_at: now() })
        });
        await audit(user, "booking.updated", "booking", edit[1], { status, action: b.action });
        return json(res, 200, { ok: true });
      }
      if (method === "DELETE" && edit) {
        await rest("bookings", `id=eq.${edit[1]}`, { method: "DELETE" });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/contacts") {
        const [contacts, bookings] = await Promise.all([
          safeRest("contacts", "select=*&order=created_at.desc&limit=500"),
          safeRest("bookings", "select=*&order=created_at.desc&limit=500")
        ]);
        const enriched = contacts.map((c) => {
          const cb = bookings.filter((b) => String(b.customer_json?.email || "").toLowerCase() === String(c.email || "").toLowerCase());
          const totalSpent = cb.filter((b) => b.status !== "Annulé").reduce((s, b) => s + Number(b.total ?? b.quote_amount ?? 0), 0);
          return {
            ...c,
            bookingsCount: cb.length,
            totalSpent,
            averageBasket: cb.length ? Math.round((totalSpent / cb.length) * 100) / 100 : 0,
            hasPendingQuote: cb.some((b) => ["Demande reçue", "Devis envoyé"].includes(b.status)),
            bookings: cb.map((b) => ({ id: b.id, ref: b.ref, type: b.type, status: b.status, slot: b.slot, total: Number(b.total ?? b.quote_amount ?? 0), created_at: b.created_at })),
            timeline: cb.map((b) => ({ type: "booking", date: b.created_at, label: `Dossier ${b.ref} (${b.status})`, detail: `${b.type}` }))
          };
        });
        return json(res, 200, { contacts: enriched });
      }
      if (method === "POST" && path === "/api/admin/contacts") {
        const b = await body(req);
        const rows = await rest("contacts", "", { method: "POST", body: JSON.stringify({ name: clean(b.name, 160), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 60), need: clean(b.need, 120), message: clean(b.message, 2000), status: clean(b.status || "Nouveau", 60) }) });
        return json(res, 201, { id: rows[0]?.id });
      }
      const editContact = /^\/api\/admin\/contacts\/(\d+)$/.exec(path);
      if (method === "PATCH" && editContact) {
        const b = await body(req);
        await rest("contacts", `id=eq.${editContact[1]}`, { method: "PATCH", body: JSON.stringify({ name: clean(b.name, 160), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 60), status: clean(b.status || "Client", 60) }) });
        return json(res, 200, { ok: true });
      }
      if (method === "DELETE" && editContact) {
        await rest("contacts", `id=eq.${editContact[1]}`, { method: "DELETE" });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/conversations") return json(res, 200, { conversations: await safeRest("conversations", "select=*&order=created_at.desc&limit=500") });
      if (method === "POST" && path === "/api/admin/conversations") {
        const b = await body(req);
        const direction = b.direction === "inbound" ? "inbound" : "outbound";
        const rows = await rest("conversations", "", { method: "POST", body: JSON.stringify({ booking_id: b.bookingId || null, contact_id: b.contactId || null, channel: clean(b.channel, 40), direction, body: clean(b.body, 4000), status: direction === "inbound" ? "reçu" : "queued" }) });
        return json(res, 201, { id: rows[0]?.id });
      }

      if (method === "GET" && path === "/api/admin/tasks") {
        const [tasks, blockedSlots] = await Promise.all([
          safeRest("tasks", "select=*&order=due_at.asc.nullslast"),
          safeRest("blocked_slots", "select=*&order=slot_start.desc")
        ]);
        return json(res, 200, { tasks, blockedSlots });
      }
      if (method === "POST" && path === "/api/admin/tasks") {
        const b = await body(req);
        const rows = await rest("tasks", "", { method: "POST", body: JSON.stringify({ booking_id: b.bookingId || null, title: clean(b.title, 300), due_at: clean(b.dueAt, 40) || null, status: clean(b.status || "À faire", 40), assignee: clean(b.assignee, 120) }) });
        return json(res, 201, { id: rows[0]?.id });
      }
      const editTask = /^\/api\/admin\/tasks\/(\d+)$/.exec(path);
      if (method === "PATCH" && editTask) {
        const b = await body(req);
        await rest("tasks", `id=eq.${editTask[1]}`, { method: "PATCH", body: JSON.stringify({ status: clean(b.status, 40), assignee: clean(b.assignee, 120) }) });
        return json(res, 200, { ok: true });
      }
      if (method === "DELETE" && editTask) {
        await rest("tasks", `id=eq.${editTask[1]}`, { method: "DELETE" });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/blocked-slots") return json(res, 200, { blockedSlots: await safeRest("blocked_slots", "select=*&order=slot_start.desc") });
      if (method === "POST" && path === "/api/admin/blocked-slots") {
        const b = await body(req);
        const rows = await rest("blocked_slots", "", { method: "POST", body: JSON.stringify({ slot_start: clean(b.start, 40), slot_end: clean(b.end || b.start, 40), reason: clean(b.reason, 300) }) });
        return json(res, 201, { id: rows[0]?.id });
      }
      const delBlocked = /^\/api\/admin\/blocked-slots\/(\d+)$/.exec(path);
      if (method === "DELETE" && delBlocked) {
        await rest("blocked_slots", `id=eq.${delBlocked[1]}`, { method: "DELETE" });
        return json(res, 200, { ok: true });
      }

      if (method === "POST" && path === "/api/admin/optimize-route") {
        const b = await body(req), dateFilter = clean(b.date || "", 20);
        let rows = await safeRest("bookings", "select=*&status=neq.Annulé&order=slot.asc");
        if (dateFilter) rows = rows.filter((r) => String(r.slot || "").startsWith(dateFilter));
        const points = [];
        for (const r of rows.slice(0, 15)) {
          const cust = r.customer_json || {};
          const geo = r.lat && r.lng ? { lat: r.lat, lng: r.lng } : await geocodeAddress(cust);
          points.push({ id: r.id, ref: r.ref, status: r.status, slot: r.slot, customer: cust, items: r.items_json || [], lat: geo.lat, lng: geo.lng });
        }
        const remaining = [...points], ordered = [];
        let curLat = 48.8566, curLng = 2.3522, totalKm = 0, totalMinutes = 0;
        while (remaining.length) {
          let bestIdx = 0, bestDist = Infinity;
          for (let i = 0; i < remaining.length; i++) {
            const d = haversineKm(curLat, curLng, remaining[i].lat, remaining[i].lng);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
          const next = remaining.splice(bestIdx, 1)[0];
          const legMinutes = Math.max(8, Math.round((bestDist / 26) * 60));
          totalKm = Math.round((totalKm + bestDist) * 10) / 10;
          totalMinutes += legMinutes;
          ordered.push({ ...next, routeOrder: ordered.length + 1, legKm: bestDist, legMinutes });
          curLat = next.lat; curLng = next.lng;
        }
        return json(res, 200, { base: { lat: 48.8566, lng: 2.3522, label: "Départ CARPEO" }, totalKm, totalMinutes, stops: ordered });
      }

      if (method === "GET" && path === "/api/admin/payments") {
        const rows = await safeRest("payments", "select=*&order=created_at.desc&limit=300");
        return json(res, 200, { payments: rows, stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY) });
      }
      if (method === "POST" && path === "/api/admin/payments") {
        const b = await body(req);
        const rows = await safeRest("bookings", `ref=eq.${encodeURIComponent(clean(b.ref, 40).toUpperCase())}&select=*&limit=1`);
        const bk = rows[0];
        if (!bk) return json(res, 404, { error: "Dossier introuvable" });
        const kind = b.kind === "balance" ? "balance" : "deposit";
        const amount = Math.max(0.01, Number(b.amount || (kind === "balance" ? bk.balance : bk.deposit) || 20));
        const created = await rest("payments", "", { method: "POST", body: JSON.stringify({ booking_id: bk.id, provider_id: `pay_${crypto.randomBytes(6).toString("hex")}`, kind, amount, status: "paid" }) });
        return json(res, 201, { id: created[0]?.id });
      }
      const refundMatch = /^\/api\/admin\/payments\/(\d+)\/refund$/.exec(path);
      if (method === "POST" && refundMatch) {
        await rest("payments", `id=eq.${refundMatch[1]}`, { method: "PATCH", body: JSON.stringify({ status: "refunded", updated_at: now() }) });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/reviews") return json(res, 200, { reviews: await safeRest("reviews", "select=*&order=created_at.desc") });
      if (method === "POST" && path === "/api/admin/reviews") {
        const b = await body(req);
        const rows = await safeRest("reviews", "", { method: "POST", body: JSON.stringify({ customer_name: clean(b.customerName || "Client CARPEO", 120), rating: Math.min(5, Math.max(1, Number(b.rating) || 5)), comment: clean(b.comment, 2000), reply: clean(b.reply, 2000), status: clean(b.status || "Publié", 40) }) });
        return json(res, 201, { id: rows[0]?.id });
      }
      const editReview = /^\/api\/admin\/reviews\/(\d+)$/.exec(path);
      if (method === "PATCH" && editReview) {
        const b = await body(req);
        await safeRest("reviews", `id=eq.${editReview[1]}`, { method: "PATCH", body: JSON.stringify({ reply: clean(b.reply, 2000), status: clean(b.status || "Publié", 40), updated_at: now() }) });
        return json(res, 200, { ok: true });
      }
      if (method === "DELETE" && editReview) {
        await safeRest("reviews", `id=eq.${editReview[1]}`, { method: "DELETE" });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/automations") {
        const rows = await safeRest("notifications", "select=*&order=send_at.desc&limit=200");
        return json(res, 200, { notifications: rows.map((n) => ({ ...n, payload: n.payload_json || {} })) });
      }
      if (method === "POST" && path === "/api/admin/automations/run") {
        return json(res, 200, { ok: true, queued: 0, dispatched: 0 });
      }

      if (method === "GET" && path === "/api/admin/pricing") return json(res, 200, await pricing());
      if (method === "PUT" && path === "/api/admin/pricing") {
        if (user.role !== "admin") return json(res, 403, { error: "Droits administrateur requis" });
        const b = await body(req);
        for (const [k, v] of Object.entries(b.items || {})) {
          if (PRICE_DEFAULTS[k]) await rest("pricing", `key=eq.${encodeURIComponent(k)}`, { method: "PATCH", body: JSON.stringify({ mode: v.mode === "price" ? "price" : "quote", price: Math.max(0, Number(v.price) || 0), updated_at: now() }) });
        }
        if (b.deposit != null) await rest("settings", "key=eq.deposit", { method: "PATCH", body: JSON.stringify({ value: String(Math.max(0, Number(b.deposit) || 0)), updated_at: now() }) });
        await audit(user, "pricing.updated", "pricing", null);
        return json(res, 200, await pricing());
      }

      if (method === "GET" && path === "/api/admin/audit") {
        const rows = await safeRest("audit", "select=*,users(email)&order=created_at.desc&limit=500");
        return json(res, 200, { audit: rows.map((x) => ({ ...x, email: x.users?.email || null, users: undefined })) });
      }
      if (method === "GET" && path === "/api/admin/users") return json(res, 200, { users: await safeRest("users", "select=id,email,name,role,created_at&order=name") });
      if (method === "POST" && path === "/api/admin/users") {
        if (user.role !== "admin") return json(res, 403, { error: "Droits administrateur requis" });
        const b = await body(req), email = clean(b.email, 200).toLowerCase(), password = String(b.password || ""), role = ["admin", "team", "readonly"].includes(b.role) ? b.role : "readonly", name = clean(b.name, 120);
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) return json(res, 422, { error: "Nom, e-mail et mot de passe de 12 caractères requis" });
        const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
        const created = await r.json();
        if (!r.ok) return json(res, 409, { error: created.msg || created.message || "Création impossible" });
        await rest("users", "", { method: "POST", body: JSON.stringify({ id: created.id, email, name, role }) });
        await audit(user, "user.created", "user", created.id, { role });
        return json(res, 201, { id: created.id });
      }
      if (method === "POST" && path === "/api/admin/backup") return json(res, 200, { file: "Sauvegarde automatique gérée par Supabase" });
      if (method === "POST" && path === "/api/admin/seed") {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const existing = await safeRest("bookings", "select=ref&limit=20");
        const refs = new Set(existing.map((r) => r.ref));
        if (!refs.has("CAR-8F4A21B9")) {
          const b1 = await safeRest("bookings", "", {
            method: "POST",
            body: JSON.stringify({
              ref: "CAR-8F4A21B9", access_key_hash: hash("DEMOKEY1"), type: "reservation", status: "Planifié",
              customer_json: { nom: "Martin", prenom: "Sophie", email: "sophie.martin@example.com", tel: "06 12 34 56 78", adresse: "14 Rue de Rivoli", cp: "75004", ville: "Paris", heard: "Google Ads" },
              items_json: [{ cat: "canape", places: "3", config: "droit", qty: "1", frozenPrice: 99 }],
              slot: `${tomorrow} 11:00`, total: 99, deposit: 20, balance: 79, notes: "Prévoir détachant enzymatique."
            })
          });
          if (b1[0]?.id) {
            await safeRest("payments", "", { method: "POST", body: JSON.stringify({ booking_id: b1[0].id, provider_id: `pi_demo_${Date.now()}_1`, kind: "deposit", amount: 20, status: "paid" }) });
            await safeRest("tasks", "", { method: "POST", body: JSON.stringify({ booking_id: b1[0].id, title: "Préparer injecteur-extracteur (CAR-8F4A21B9)", due_at: `${tomorrow}T09:00:00Z`, status: "À faire", assignee: "Équipe terrain" }) });
          }
        }
        if (!refs.has("CAR-3C9E10A4")) {
          await safeRest("bookings", "", {
            method: "POST",
            body: JSON.stringify({
              ref: "CAR-3C9E10A4", access_key_hash: hash("DEMOKEY2"), type: "devis", status: "Devis envoyé",
              customer_json: { nom: "Lefèvre", prenom: "Marc", email: "direction@hotel-swann.fr", tel: "01 45 22 88 00", adresse: "15 Rue de Constantinople", cp: "75008", ville: "Paris", heard: "Google" },
              items_json: [{ cat: "moquette", surface: "45m2", qty: "1", frozenPrice: null }, { cat: "fauteuil", qty: "6", frozenPrice: 294 }],
              quote_amount: 540, notes: "Devis B2B envoyé avec remise volume."
            })
          });
        }
        const contacts = await safeRest("contacts", "select=id&limit=1");
        if (!contacts.length) {
          await safeRest("contacts", "", {
            method: "POST",
            body: JSON.stringify({ name: "Sophie Martin", email: "sophie.martin@example.com", phone: "06 12 34 56 78", need: "Canapé 3 places", message: "Demande d'intervention rapide.", status: "Client" })
          });
          await safeRest("contacts", "", {
            method: "POST",
            body: JSON.stringify({ name: "Marc Lefèvre — Hôtel Le Swann", email: "direction@hotel-swann.fr", phone: "01 45 22 88 00", need: "Moquette & fauteuils", message: "Devis entretien mensuel.", status: "Devis en cours" })
          });
        }
        return json(res, 200, { ok: true, seeded: true });
      }

      if (method === "GET" && path === "/api/admin/settings") {
        const rows = await safeRest("settings", "select=key,value");
        return json(res, 200, {
          settings: Object.fromEntries(rows.map((x) => [x.key, x.value])),
          envStatus: { supabase: true, stripe: Boolean(process.env.STRIPE_SECRET_KEY) }
        });
      }
      if (method === "PUT" && path === "/api/admin/settings") {
        if (user.role !== "admin") return json(res, 403, { error: "Droits administrateur requis" });
        const b = await body(req);
        for (const [k, v] of Object.entries(b.settings || {})) {
          await safeRest("settings", "", { method: "POST", prefer: "resolution=merge-duplicates", body: JSON.stringify({ key: k, value: clean(v, 500), updated_at: now() }) });
        }
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/export.csv") {
        const rows = await rest("bookings", "select=*&order=created_at.desc");
        const csv = [
          "reference,type,status,nom,prenom,email,telephone,ville,creneau,total,acompte,solde,cree_le",
          ...rows.map((r) => {
            const c = r.customer_json || {};
            return [r.ref, r.type, r.status, c.nom, c.prenom, c.email, c.tel, c.ville, r.slot, r.total, r.deposit, r.balance, r.created_at]
              .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",");
          })
        ].join("\r\n");
        return text(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": "attachment; filename=carpeo-dossiers.csv" });
      }
      if (method === "GET" && path === "/api/admin/calendar.ics") {
        const rows = await rest("bookings", "select=ref,slot,customer_json&slot=not.is.null&status=neq.Annulé");
        const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CARPEO//Planning//FR"];
        for (const row of rows) {
          const c = row.customer_json || {}, start = row.slot.replace(/[-: ]/g, "").slice(0, 13) + "00";
          lines.push("BEGIN:VEVENT", `UID:${row.ref}@carpeo.fr`, `DTSTART:${start}`, `DTEND:${start}`, `SUMMARY:CARPEO - ${c.nom || "Client"}`, `LOCATION:${[c.adresse, c.cp, c.ville].filter(Boolean).join(" ")}`, "END:VEVENT");
        }
        lines.push("END:VCALENDAR");
        return text(res, 200, lines.join("\r\n"), "text/calendar; charset=utf-8", { "Content-Disposition": "attachment; filename=carpeo-planning.ics" });
      }
    }
    return json(res, 404, { error: "Route introuvable" });
  } catch (error) {
    console.error(error);
    return json(res, error.status && error.status < 600 ? error.status : 500, { error: error.status ? error.message : "Erreur interne" });
  }
}
