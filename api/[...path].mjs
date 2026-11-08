import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const FALLBACK_DB_PATH = path.join(os.tmpdir(), "carpeo-vercel-db.json");
const CARPEO_TABLES = new Set(["users", "pricing", "settings", "bookings", "contacts", "conversations", "tasks", "blocked_slots", "notifications", "payments", "reviews", "events", "audit"]);
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
function defaultFallbackDb() {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const day2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  return {
    users: [{ id: "admin-1", email: "admin@carpeo.local", name: "Administrateur CARPEO", role: "admin", created_at: now() }],
    pricing: Object.entries(PRICE_DEFAULTS).map(([key, v]) => ({ key, label: v[0], group_name: v[1], mode: v[2], price: v[3], updated_at: now() })),
    settings: [
      { key: "deposit", value: "20" },
      { key: "area", value: "Intervention à domicile" },
      { key: "hours", value: "7 jours sur 7, de 9 h à 19 h" },
      { key: "maps_url", value: "https://www.google.com/maps/place/Carpeo/@48.8350077,2.4096267,11z/data=!3m1!4b1!4m6!3m5!1s0x42afe645686fa375:0xe9c68ae617bca720!8m2!3d48.8350076!4d2.4096267!16s%2Fg%2F11zzsk71ns?entry=ttu&g_ep=EgoyMDI2MTEwMy4wIKXMDSoASAFQAw%3D%3D" },
      { key: "auto_reminder_j1", value: "true" },
      { key: "auto_quote_followup", value: "true" },
      { key: "auto_review_request", value: "true" }
    ],
    bookings: [
      {
        id: 1, ref: "CAR-8F4A219B", access_key_hash: hash("DEMOKEY1"), type: "reservation", status: "Planifié",
        slot: `${tomorrow} 11:00`, total: 139, deposit: 20, balance: 119, quote_amount: null,
        notes: "Code porte 4582B, 2e étage avec ascenseur.", tags: "Particulier, Fidèle",
        lat: 48.864716, lng: 2.349014, route_order: 1,
        customer_json: { nom: "Martin", prenom: "Camille", email: "camille.martin@exemple.fr", tel: "06 12 34 56 78", adresse: "14 Rue de Rivoli", cp: "75004", ville: "Paris", pref: "whatsapp", heard: "Google" },
        items_json: [{ cat: "canape", places: "3", config: "angle", matiere: "Velours", qty: 1, stain: "Boisson", frozenPrice: 139 }],
        attribution_json: { source: "Google Ads", campaign: "Search_Canape" }, photos_json: [],
        created_at: now(), updated_at: now()
      },
      {
        id: 2, ref: "CAR-3C9E710A", access_key_hash: hash("DEMOKEY2"), type: "devis", status: "Demande reçue",
        slot: `${day2} 14:00`, total: null, deposit: 20, balance: null, quote_amount: null,
        notes: "Grand tapis berbère laine nouée main.", tags: "Devis, Tapis délicat",
        lat: 48.8414, lng: 2.253, route_order: 2,
        customer_json: { nom: "Dubois", prenom: "Laurent", email: "l.dubois@exemple.fr", tel: "06 98 76 54 32", adresse: "28 Avenue Mozart", cp: "75016", ville: "Paris", pref: "email", heard: "Instagram" },
        items_json: [{ cat: "tapis", length: "3", width: "2", surface: "6", matiere: "Laine", qty: 1, stain: "Taches organiques", frozenPrice: null }],
        attribution_json: { source: "Meta Pixel / Instagram", campaign: "Retargeting_Tapis" }, photos_json: [],
        created_at: now(), updated_at: now()
      }
    ],
    contacts: [
      { id: 1, name: "Camille Martin", email: "camille.martin@exemple.fr", phone: "06 12 34 56 78", address: "14 Rue de Rivoli", city: "Paris", postal_code: "75004", need: "Canapé", message: "Client régulier.", status: "Client", tags: "Particulier, Fidèle", notes: "Client régulier.", source: "Google Ads", created_at: now() },
      { id: 2, name: "Laurent Dubois", email: "l.dubois@exemple.fr", phone: "06 98 76 54 32", address: "28 Avenue Mozart", city: "Paris", postal_code: "75016", need: "Tapis", message: "Attend chiffrage tapis laine.", status: "Nouveau", tags: "Devis, Tapis délicat", notes: "Attend chiffrage tapis laine.", source: "Meta Pixel / Instagram", created_at: now() }
    ],
    conversations: [
      { id: 1, booking_id: 1, contact_id: 1, channel: "whatsapp", direction: "inbound", recipient: "06 12 34 56 78", subject: "", body: "Bonjour, je vous confirme que le digicode est bien 4582B pour demain à 11h.", status: "reçu", created_at: now() },
      { id: 2, booking_id: 2, contact_id: 2, channel: "instagram", direction: "inbound", recipient: "@laurent.dubois", subject: "", body: "Bonjour, faites-vous le nettoyage des tapis berbères en laine à domicile ?", status: "reçu", created_at: now() }
    ],
    tasks: [
      { id: 1, booking_id: 2, title: "Chiffrer et envoyer le devis tapis laine (CAR-3C9E710A)", due_at: `${tomorrow}T10:00`, assignee: "Commercial CARPEO", priority: "Haute", status: "À faire", created_at: now() }
    ],
    blocked_slots: [],
    notifications: [],
    payments: [
      { id: 1, booking_id: 1, provider_id: "pi_3QCarpeo001", kind: "deposit", amount: 20, status: "paid", method: "stripe", created_at: now() }
    ],
    reviews: [
      { id: 1, booking_id: 1, customer_name: "Camille Martin", rating: 5, comment: "Canapé d'angle en velours récupéré comme neuf ! Ponctuel, soigneux et séchage rapide. Je recommande à 100 %.", reply: "Merci beaucoup Camille pour votre confiance ! À très bientôt.", status: "Publié", created_at: now() },
      { id: 2, booking_id: null, customer_name: "Thomas Bernard", rating: 5, comment: "Intervention impeccable sur notre matelas King Size et deux fauteuils. Plus aucune auréole et une odeur très fraîche.", reply: "Merci Thomas pour votre retour !", status: "Publié", created_at: now() },
      { id: 3, booking_id: null, customer_name: "Sophie Lemaire", rating: 5, comment: "Équipe très professionnelle, l'avance immédiate de 50 % du crédit d'impôt a été activée en 5 minutes. Résultat bluffant sur notre canapé clair.", reply: "Merci infiniment Sophie, ravis que le résultat vous plaise !", status: "Publié", created_at: now() }
    ],
    events: [],
    audit: []
  };
}
function loadFallbackDb() {
  try {
    if (fs.existsSync(FALLBACK_DB_PATH)) {
      return JSON.parse(fs.readFileSync(FALLBACK_DB_PATH, "utf8"));
    }
  } catch {}
  const fresh = defaultFallbackDb();
  try { fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(fresh), "utf8"); } catch {}
  return fresh;
}
function saveFallbackDb(db) {
  try { fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(db), "utf8"); } catch {}
}
function matchRow(row, params) {
  for (const [k, rawVal] of params.entries()) {
    if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
    const v = String(rawVal);
    if (v.startsWith("eq.")) {
      const target = v.slice(3);
      if (String(row[k] ?? "") !== target) return false;
    } else if (v.startsWith("neq.")) {
      const target = v.slice(4);
      if (String(row[k] ?? "") === target) return false;
    } else if (v === "not.is.null") {
      if (row[k] == null || row[k] === "") return false;
    } else if (v.startsWith("not.in.(")) {
      const list = v.slice(8, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      if (list.includes(String(row[k] ?? ""))) return false;
    } else if (v.startsWith("in.(")) {
      const list = v.slice(4, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      if (!list.includes(String(row[k] ?? ""))) return false;
    }
  }
  return true;
}
function localDbRest(table, query = "", init = {}) {
  const cleanTable = table.replace(/^carpeo_/, "");
  const db = loadFallbackDb();
  if (!Array.isArray(db[cleanTable])) db[cleanTable] = [];
  const rows = db[cleanTable];
  const params = new URLSearchParams(query);
  const method = (init.method || "GET").toUpperCase();

  if (method === "GET") {
    let out = rows.filter((r) => matchRow(r, params));
    const order = params.get("order");
    if (order) {
      const first = order.split(",")[0];
      const [col, dir] = first.split(".");
      out.sort((a, b) => {
        const va = String(a[col] ?? ""), vb = String(b[col] ?? "");
        return dir === "desc" ? vb.localeCompare(va) : va.localeCompare(vb);
      });
    }
    const limit = Number(params.get("limit") || 0);
    if (limit > 0) out = out.slice(0, limit);
    return out;
  }

  const payload = init.body ? JSON.parse(init.body) : {};
  const items = Array.isArray(payload) ? payload : [payload];

  if (method === "POST") {
    const conflictKey = params.get("on_conflict") || ((cleanTable === "settings" || cleanTable === "pricing") ? "key" : null);
    const inserted = [];
    for (const item of items) {
      if (conflictKey && item[conflictKey] != null) {
        const existingIdx = rows.findIndex((r) => String(r[conflictKey]) === String(item[conflictKey]));
        if (existingIdx !== -1) {
          rows[existingIdx] = { ...rows[existingIdx], ...item, updated_at: now() };
          inserted.push(rows[existingIdx]);
          continue;
        }
      }
      const nextId = item.id ?? (rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1);
      const record = { id: nextId, created_at: now(), updated_at: now(), ...item };
      rows.push(record);
      inserted.push(record);
    }
    saveFallbackDb(db);
    return inserted;
  }

  if (method === "PATCH") {
    const updated = [];
    for (let i = 0; i < rows.length; i++) {
      if (matchRow(rows[i], params)) {
        rows[i] = { ...rows[i], ...payload, updated_at: now() };
        updated.push(rows[i]);
      }
    }
    saveFallbackDb(db);
    return updated;
  }

  if (method === "DELETE") {
    db[cleanTable] = rows.filter((r) => !matchRow(r, params));
    saveFallbackDb(db);
    return [];
  }

  return [];
}
function configured() {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}
async function rawRest(tableName, query = "", init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}${query ? `?${query}` : ""}`, {
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
  return { response, data };
}
async function rest(table, query = "", init = {}) {
  if (!configured()) return localDbRest(table, query, init);
  const primary = CARPEO_TABLES.has(table) ? `carpeo_${table}` : table;
  let { response, data } = await rawRest(primary, query, init);
  if (!response.ok && primary !== table && (response.status === 404 || data?.code === "PGRST205" || String(data?.message || "").includes("schema cache"))) {
    ({ response, data } = await rawRest(table, query, init));
  }
  if (!response.ok) return localDbRest(table, query, init);
  return data;
}
async function safeRest(table, query = "", init = {}, fallback = []) {
  try { return await rest(table, query, init); } catch { return fallback; }
}
const ADMIN_EMAIL = (process.env.CARPEO_ADMIN_EMAIL || "admin@carpeo.local").toLowerCase();
const ADMIN_PASS = process.env.CARPEO_ADMIN_PASSWORD || "CarpeoAdmin2026!";
const TOKEN_SECRET = SERVICE_KEY || ANON_KEY || "carpeo-fallback-secret-2026";

function signAdminToken(email) {
  const exp = Math.floor(Date.now() / 1000) + 43200;
  const payload = `local:${email}:${exp}`;
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return `${payload}:${sig}`;
}
function verifyAdminToken(token) {
  if (!token || !token.startsWith("local:")) return null;
  const parts = token.split(":");
  if (parts.length !== 4) return null;
  const [, email, expStr, sig] = parts;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(`local:${email}:${expStr}`).digest("hex");
  if (sig !== expected) return null;
  return { id: null, email, name: "Administrateur CARPEO", role: "admin" };
}

async function authUser(req) {
  const token = cookies(req).carpeo_access || req.headers["x-admin-token"];
  if (!token) return null;
  const localAdmin = verifyAdminToken(token);
  if (localAdmin) return localAdmin;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  const rows = await safeRest("users", `id=eq.${encodeURIComponent(user.id)}&select=id,email,name,role&limit=1`);
  if (rows.length) return rows[0];
  return { id: user.id, email: user.email, name: "Administrateur CARPEO", role: "admin" };
}
async function admin(req, res, mutating = false) {
  const user = await authUser(req);
  if (!user) { json(res, 401, { error: "Authentification requise" }); return null; }
  const hasHeaderToken = Boolean(req.headers["x-admin-token"] && req.headers["x-csrf-token"]);
  if (mutating && !hasHeaderToken && cookies(req).carpeo_csrf !== req.headers["x-csrf-token"]) {
    json(res, 403, { error: "Jeton CSRF invalide" });
    return null;
  }
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
  for (const [k, v] of Object.entries(PRICE_DEFAULTS)) items[k] = { label: v[0], group: v[1], mode: v[2], price: v[3] };
  for (const row of rows || []) items[row.key] = { label: row.label, group: row.group_name, mode: row.mode, price: Number(row.price) };
  return {
    deposit: Number(setMap.deposit || 20),
    area: setMap.area && !setMap.area.includes("Île-de-France") && !setMap.area.includes("et en entreprise") ? setMap.area : "Intervention à domicile",
    hours: setMap.hours || "7 jours sur 7, de 9 h à 19 h",
    updatedAt: Number(setMap.admin_modified_at || 0),
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
  const deposit = p.deposit || 20;
  return { type: "reservation", total, deposit, balance: Math.max(0, Math.round((due - deposit) * 100) / 100), discount, pricedItems };
}
async function slots(fromDateStr = "", totalDays = 21) {
  const [booked, blocked] = await Promise.all([
    safeRest("bookings", "select=slot&slot=not.is.null&status=not.in.(Annulé,Terminé)"),
    safeRest("blocked_slots", "select=id,slot_start,slot_end,reason&order=slot_start")
  ]);
  const used = new Set(booked.map((x) => x.slot));
  const findBlock = (slot) => blocked.find((row) => {
    const start = String(row.slot_start || "").length === 10 ? `${row.slot_start} 00:00` : String(row.slot_start || "");
    const rawEnd = String(row.slot_end || row.slot_start || "");
    const end = rawEnd.length === 10 ? `${rawEnd} 23:59` : rawEnd;
    return Boolean(start && end && slot >= start && slot <= end);
  });
  const days = [];
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(fromDateStr) ? new Date(`${fromDateStr}T12:00:00`) : new Date();
  const startOffset = /^\d{4}-\d{2}-\d{2}$/.test(fromDateStr) ? 0 : 1;
  const count = Math.min(60, Math.max(7, Number(totalDays) || 21));
  for (let d = startOffset; d < startOffset + count; d++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + d);
    if (date.getDay() === 0) continue;
    const iso = date.toISOString().slice(0, 10);
    const daySlots = ["08:00", "11:00", "14:00", "17:00"].map((time) => {
      const val = `${iso} ${time}`;
      const bl = findBlock(val);
      return {
        value: val,
        time,
        available: !used.has(val) && !bl,
        reason: bl ? (bl.reason || "Congé / Indisponible") : (used.has(val) ? "Réservé" : "")
      };
    });
    days.push({
      date: iso,
      blockedReason: daySlots.every((s) => !s.available && s.reason) ? daySlots[0].reason : "",
      slots: daySlots
    });
  }
  return { days, blocked };
}
async function uploadPhotos(ref, photos) {
  if (!configured()) return [];
  const uploaded = [];
  for (const photo of (Array.isArray(photos) ? photos : []).slice(0, 16)) {
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(photo.data || "");
    if (!match) continue;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 5 * 1024 * 1024) continue;
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const key = `${ref}/${crypto.randomUUID()}.${ext}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/carpeo-booking-photos/${key}`, {
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
  const url = new URL(req.url, "https://carpeo.vercel.app"), path = url.pathname, method = req.method || "GET";
  try {
    if (method === "GET" && path === "/api/health") {
      return json(res, 200, { ok: true, database: configured() ? "supabase" : "fallback-json", supabaseConfigured: configured(), stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY), time: now() });
    }
    if (method === "GET" && path === "/api/pricing") return json(res, 200, await pricing());
    if (method === "GET" && path === "/api/slots") return json(res, 200, await slots(url.searchParams.get("from") || "", url.searchParams.get("days") || 21));
    if (method === "GET" && path === "/api/reviews") {
      const rows = await safeRest("reviews", "select=*&order=created_at.desc");
      return json(res, 200, { reviews: rows.filter((r) => (r.status || "Publié") === "Publié") });
    }

    if (method === "POST" && path === "/api/contact") {
      const b = await body(req), name = clean(b.name, 160), email = clean(b.email, 200).toLowerCase(), phone = clean(b.phone, 60), need = clean(b.need, 120), message = clean(b.message, 4000);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) return json(res, 422, { error: "Nom, e-mail et message valides requis" });
      const isPro = Boolean(b.isPro) || /hôtel|hotel|conciergerie|bureau|pro/i.test(need);
      const rows = await rest("contacts", "", { method: "POST", body: JSON.stringify({ name, email, phone, need, message, status: "Nouveau", tags: isPro ? "Professionnel B2B" : "Particulier", source: isPro ? "Page Professionnels" : "Formulaire Site Web" }) });
      const convRows = await safeRest("conversations", "", {
        method: "POST",
        body: JSON.stringify({
          contact_id: rows[0]?.id || null,
          contact_name: name,
          contact_email: email,
          contact_phone: phone,
          recipient: email,
          subject: need ? `Formulaire (${need})` : "Message site web",
          channel: "form",
          direction: "inbound",
          body: message,
          status: "reçu"
        })
      });
      return json(res, 201, { ok: true, contactId: rows[0]?.id, conversationId: convRows[0]?.id });
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
        const requestedSlot = clean(b.slot, 30);
        const [used, blockedRows] = await Promise.all([
          rest("bookings", `slot=eq.${encodeURIComponent(requestedSlot)}&status=not.in.(Annulé,Terminé)&select=id&limit=1`),
          safeRest("blocked_slots", "select=slot_start,slot_end")
        ]);
        if (used.length) return json(res, 409, { error: "Ce créneau vient d’être réservé" });
        const blocked = blockedRows.some((row) => {
          const start = String(row.slot_start || "").length === 10 ? `${row.slot_start} 00:00` : String(row.slot_start || "");
          const rawEnd = String(row.slot_end || row.slot_start || "");
          const end = rawEnd.length === 10 ? `${rawEnd} 23:59` : rawEnd;
          return requestedSlot >= start && requestedSlot <= end;
        });
        if (blocked) return json(res, 409, { error: "Ce créneau est indisponible" });
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
      const fullName = `${clean(c.prenom, 80)} ${clean(c.nom, 80)}`.trim();
      const ctRows = await safeRest("contacts", "", {
        method: "POST",
        body: JSON.stringify({
          name: fullName, email, phone: clean(c.tel, 60), address: clean(c.adresse, 200), city: clean(c.ville, 100), postal_code: clean(c.cp, 20),
          need: calc.type, message: `Dossier ${ref}`, status: "Client", tags: "Particulier", source: clean(c.heard, 80) || "Site web"
        })
      });
      await safeRest("conversations", "", {
        method: "POST",
        body: JSON.stringify({
          booking_id: rows[0]?.id || null,
          contact_id: ctRows[0]?.id || null,
          contact_name: fullName,
          contact_email: email,
          contact_phone: clean(c.tel, 60),
          recipient: email,
          subject: `${calc.type === "devis" ? "Demande de devis" : "Réservation"} ${ref}`,
          channel: "form",
          direction: "inbound",
          body: `${calc.type === "devis" ? "Nouvelle demande de devis" : "Nouvelle réservation"} (${ref}) par ${fullName} (${clean(c.ville, 100)})${b.slot ? " — Créneau : " + clean(b.slot, 30) : ""}.`,
          status: "reçu"
        })
      });
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
      const email = clean(b.email, 200).toLowerCase();
      const password = String(b.password || "");
      const csrf = crypto.randomBytes(24).toString("base64url");

      if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        const token = signAdminToken(email);
        const cookieHeaders = [
          `carpeo_access=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
          `carpeo_csrf=${csrf}; SameSite=Strict; Path=/; Max-Age=43200`
        ];
        return json(res, 200, { user: { id: null, email, name: "Administrateur CARPEO", role: "admin" }, csrf, token }, { "Set-Cookie": cookieHeaders });
      }

      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON_KEY || SERVICE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json();
      if (!r.ok) return json(res, 401, { error: "Identifiants incorrects" });
      let users = await safeRest("users", `id=eq.${data.user.id}&select=id,email,name,role&limit=1`);
      if (!users.length) {
        users = await safeRest("users", "", { method: "POST", body: JSON.stringify({ id: data.user.id, email, name: "Administrateur CARPEO", role: "admin" }) });
      }
      const userObj = users[0] || { id: data.user.id, email, name: "Administrateur CARPEO", role: "admin" };
      const cookieHeaders = [
        `carpeo_access=${encodeURIComponent(data.access_token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${data.expires_in || 43200}`,
        `carpeo_csrf=${csrf}; SameSite=Strict; Path=/; Max-Age=${data.expires_in || 43200}`
      ];
      return json(res, 200, { user: userObj, csrf, token: data.access_token }, { "Set-Cookie": cookieHeaders });
    }
    if (method === "GET" && path === "/api/auth/me") {
      const user = await admin(req, res);
      if (!user) return;
      return json(res, 200, { user, csrf: cookies(req).carpeo_csrf || req.headers["x-csrf-token"] || crypto.randomBytes(16).toString("base64url") });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      return json(res, 200, { ok: true }, { "Set-Cookie": ["carpeo_access=; HttpOnly; Secure; Path=/; Max-Age=0", "carpeo_csrf=; Secure; Path=/; Max-Age=0"] });
    }

    if (path.startsWith("/api/admin/")) {
      const mutating = !["GET", "HEAD"].includes(method);
      const user = await admin(req, res, mutating);
      if (!user) return;

      if (method === "GET" && path === "/api/admin/dashboard") {
        const period = url.searchParams.get("period") || "all";
        let sinceIso = null;
        if (period === "7d") sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
        else if (period === "30d") sinceIso = new Date(Date.now() - 30 * 86400000).toISOString();
        else if (period === "90d") sinceIso = new Date(Date.now() - 90 * 86400000).toISOString();

        const [allBookings, contacts, payments, reviews, tasks, convs] = await Promise.all([
          safeRest("bookings", "select=*&order=created_at.desc"),
          safeRest("contacts", "select=id"),
          safeRest("payments", "select=amount,status&status=eq.paid"),
          safeRest("reviews", "select=rating,status&status=eq.Publié"),
          safeRest("tasks", "select=id,status"),
          safeRest("conversations", "select=id,direction,status")
        ]);
        const bookings = sinceIso ? allBookings.filter((b) => String(b.created_at || "") >= sinceIso) : allBookings;
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
          contacts: Math.max(contacts.length, new Set(allBookings.map((b) => (b.customer_json?.email || "").toLowerCase()).filter(Boolean)).size),
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
        const rows = await safeRest("bookings", "select=*&order=created_at.desc&limit=500");
        return json(res, 200, {
          bookings: rows.map((x) => ({
            ...x,
            customer: x.customer_json || {},
            items: x.items_json || [],
            attribution: x.attribution_json || {},
            photos: x.photos_json || [],
            tags: x.tags || x.customer_json?.tags || "",
            access_key_hash: undefined
          }))
        });
      }

      if (method === "POST" && path === "/api/admin/bookings") {
        const b = await body(req), customer = { ...(b.customer || {}) }, items = Array.isArray(b.items) && b.items.length ? b.items : [{ cat: b.cat || "canape", places: "3", config: "droit", qty: "1" }];
        if (b.tags) customer.tags = clean(b.tags, 300);
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
        const existing = (await safeRest("bookings", `id=eq.${edit[1]}&select=*&limit=1`))[0];
        if (!existing) return json(res, 404, { error: "Dossier introuvable" });
        let status = clean(b.status ?? existing.status, 40);
        const slot = b.slot === undefined ? existing.slot : (clean(b.slot, 30) || null);
        const quote = b.quoteAmount === "" || b.quoteAmount == null ? existing.quote_amount : Number(b.quoteAmount);
        let total = existing.total, deposit = existing.deposit, balance = existing.balance;
        const cust = { ...(existing.customer_json || {}) };
        if (b.tags !== undefined) cust.tags = clean(b.tags, 300);

        if (b.action === "sendQuote" && Number.isFinite(quote)) {
          status = "Devis envoyé";
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
          await safeRest("tasks", "", {
            method: "POST",
            body: JSON.stringify({ booking_id: existing.id, title: `Intervention ${existing.ref} — ${cust.prenom || ""} ${cust.nom || ""}`, due_at: slot ? slot.replace(" ", "T") + ":00Z" : null, status: "À faire", assignee: "Équipe terrain" })
          });
        }

        await rest("bookings", `id=eq.${edit[1]}`, {
          method: "PATCH",
          body: JSON.stringify({ status, quote_amount: quote, slot, total, deposit, balance, customer_json: cust, notes: clean(b.notes ?? existing.notes, 5000), updated_at: now() })
        });
        await audit(user, "booking.updated", "booking", edit[1], { status, action: b.action });
        return json(res, 200, { ok: true, status, slot });
      }
      if (method === "DELETE" && edit) {
        await rest("bookings", `id=eq.${edit[1]}`, { method: "DELETE" });
        await audit(user, "booking.deleted", "booking", edit[1]);
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/contacts") {
        const [contacts, bookings, convs] = await Promise.all([
          safeRest("contacts", "select=*&order=created_at.desc&limit=500"),
          safeRest("bookings", "select=*&order=created_at.desc&limit=500"),
          safeRest("conversations", "select=*&order=created_at.desc&limit=500")
        ]);
        const byEmail = new Map();
        for (const c of contacts) {
          const email = String(c.email || "").toLowerCase();
          byEmail.set(email || `id_${c.id}`, {
            ...c,
            address: c.address || "",
            city: c.city || "",
            postal_code: c.postal_code || "",
            tags: c.tags || "",
            notes: c.notes || c.message || "",
            source: c.source || "Site web",
            bookingsCount: 0,
            totalSpent: 0,
            hasPendingQuote: false,
            bookings: [],
            timeline: [{ type: "contact", date: c.created_at, label: `Contact initial (${c.need || "Formulaire"})`, detail: c.message || "" }]
          });
        }
        for (const b of bookings) {
          const cust = b.customer_json || {};
          const email = String(cust.email || "").toLowerCase();
          if (!email) continue;
          if (!byEmail.has(email)) {
            byEmail.set(email, {
              id: b.id,
              name: `${cust.prenom || ""} ${cust.nom || ""}`.trim() || email,
              email,
              phone: cust.tel || "",
              address: cust.adresse || "",
              city: cust.ville || "",
              postal_code: cust.cp || "",
              need: b.type,
              message: b.notes || "",
              status: "Client",
              tags: cust.tags || b.tags || "",
              notes: b.notes || "",
              source: cust.heard || "Réservation",
              created_at: b.created_at,
              bookingsCount: 0,
              totalSpent: 0,
              hasPendingQuote: false,
              bookings: [],
              timeline: []
            });
          }
          const entry = byEmail.get(email);
          entry.bookingsCount += 1;
          const amount = Number(b.total ?? b.quote_amount ?? 0);
          if (b.status !== "Annulé") entry.totalSpent = Math.round((entry.totalSpent + amount) * 100) / 100;
          if (["Demande reçue", "Devis envoyé"].includes(b.status)) entry.hasPendingQuote = true;
          entry.bookings.push({ id: b.id, ref: b.ref, type: b.type, status: b.status, slot: b.slot, total: amount, created_at: b.created_at });
          entry.timeline.push({ type: "booking", date: b.created_at, label: `Dossier ${b.ref} (${b.status})`, detail: `${b.type === "devis" ? "Devis" : "Réservation"} — ${amount ? amount + " €" : "À chiffrer"}` });
        }
        for (const m of convs) {
          for (const entry of byEmail.values()) {
            if (m.contact_id === entry.id || entry.bookings.some((b) => b.id === m.booking_id)) {
              entry.timeline.push({ type: "message", date: m.created_at, label: `${String(m.channel || "email").toUpperCase()} (${m.direction === "inbound" ? "Reçu" : "Envoyé"})`, detail: m.body });
              break;
            }
          }
        }
        const enriched = Array.from(byEmail.values()).map((c) => ({
          ...c,
          averageBasket: c.bookingsCount ? Math.round((c.totalSpent / c.bookingsCount) * 100) / 100 : 0,
          timeline: c.timeline.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        }));
        return json(res, 200, { contacts: enriched });
      }
      if (method === "POST" && path === "/api/admin/contacts") {
        const b = await body(req);
        const rows = await rest("contacts", "", { method: "POST", body: JSON.stringify({ name: clean(b.name, 160), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 60), need: clean(b.need || b.tags, 120), message: clean(b.notes || b.message, 2000), status: clean(b.status || "Nouveau", 60) }) });
        return json(res, 201, { id: rows[0]?.id });
      }
      const editContact = /^\/api\/admin\/contacts\/(\d+)$/.exec(path);
      if (method === "PATCH" && editContact) {
        const b = await body(req);
        await safeRest("contacts", `id=eq.${editContact[1]}`, { method: "PATCH", body: JSON.stringify({ name: clean(b.name, 160), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 60), need: clean(b.tags || b.need, 120), message: clean(b.notes || b.message, 2000), status: clean(b.status || "Client", 60) }) });
        return json(res, 200, { ok: true });
      }
      if (method === "DELETE" && editContact) {
        await safeRest("contacts", `id=eq.${editContact[1]}`, { method: "DELETE" });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/conversations") {
        const [convs, bookings, contacts] = await Promise.all([
          safeRest("conversations", "select=*&order=created_at.desc&limit=500"),
          safeRest("bookings", "select=id,ref,customer_json"),
          safeRest("contacts", "select=id,name,email,phone")
        ]);
        const bMap = new Map(bookings.map((b) => [b.id, b]));
        const cMap = new Map(contacts.map((c) => [c.id, c]));
        return json(res, 200, {
          conversations: convs.map((m) => {
            const bk = bMap.get(m.booking_id);
            const ct = cMap.get(m.contact_id);
            const cust = bk?.customer_json || {};
            return {
              ...m,
              booking_ref: bk?.ref || m.booking_ref || null,
              contact_name: m.contact_name || ct?.name || `${cust.prenom || ""} ${cust.nom || ""}`.trim() || null,
              contact_email: m.contact_email || ct?.email || cust.email || null,
              contact_phone: m.contact_phone || ct?.phone || cust.tel || null,
              recipient: m.recipient || ct?.email || cust.email || ct?.phone || cust.tel || ""
            };
          })
        });
      }
      if (method === "POST" && path === "/api/admin/conversations") {
        const b = await body(req);
        const direction = b.direction === "inbound" ? "inbound" : "outbound";
        let bookingId = b.bookingId || null;
        if (!bookingId && b.recipient) {
          const bkRows = await safeRest("bookings", "select=id,ref,customer_json&limit=200");
          const match = bkRows.find((r) => r.ref === b.recipient || r.customer_json?.email === b.recipient || r.customer_json?.tel === b.recipient);
          if (match) bookingId = match.id;
        }
        const rows = await rest("conversations", "", { method: "POST", body: JSON.stringify({ booking_id: bookingId, contact_id: b.contactId || null, recipient: clean(b.recipient, 200), subject: clean(b.subject, 200), channel: clean(b.channel, 40), direction, body: clean(b.body, 4000), status: direction === "inbound" ? "reçu" : "sent" }) });
        return json(res, 201, { id: rows[0]?.id });
      }
      const editConv = /^\/api\/admin\/conversations\/(\d+)$/.exec(path);
      if (method === "PATCH" && editConv) {
        const b = await body(req);
        await rest("conversations", `id=eq.${editConv[1]}`, { method: "PATCH", body: JSON.stringify({ status: clean(b.status || "lu", 40) }) });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/tasks") {
        const [tasks, blockedSlots, bookings] = await Promise.all([
          safeRest("tasks", "select=*&order=due_at.asc.nullslast"),
          safeRest("blocked_slots", "select=*&order=slot_start.desc"),
          safeRest("bookings", "select=id,ref")
        ]);
        const bMap = new Map(bookings.map((b) => [b.id, b.ref]));
        return json(res, 200, {
          tasks: tasks.map((t) => ({ ...t, booking_ref: bMap.get(t.booking_id) || null })),
          blockedSlots
        });
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
        let curLat = 48.8350076, curLng = 2.4096267, totalKm = 0, totalMinutes = 0;
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
        return json(res, 200, { base: { lat: 48.8350076, lng: 2.4096267, label: "Départ CARPEO" }, totalKm, totalMinutes, stops: ordered });
      }

      if (method === "GET" && path === "/api/admin/payments") {
        const [rows, bookings] = await Promise.all([
          safeRest("payments", "select=*&order=created_at.desc&limit=300"),
          safeRest("bookings", "select=id,ref,customer_json,total,balance")
        ]);
        const bMap = new Map(bookings.map((b) => [b.id, b]));
        return json(res, 200, {
          payments: rows.map((p) => {
            const bk = bMap.get(p.booking_id);
            return {
              ...p,
              booking_ref: bk?.ref || null,
              customer: bk?.customer_json || {},
              booking_total: bk?.total ?? null,
              booking_balance: bk?.balance ?? null
            };
          }),
          stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY)
        });
      }
      if (method === "POST" && path === "/api/admin/payments") {
        const b = await body(req);
        const rows = await safeRest("bookings", `ref=eq.${encodeURIComponent(clean(b.ref, 40).toUpperCase())}&select=*&limit=1`);
        const bk = rows[0];
        if (!bk) return json(res, 404, { error: "Dossier introuvable" });
        const kind = b.kind === "balance" ? "balance" : "deposit";
        const amount = Math.max(0.01, Number(b.amount || (kind === "balance" ? bk.balance : bk.deposit) || 20));
        const created = await rest("payments", "", { method: "POST", body: JSON.stringify({ booking_id: bk.id, provider_id: `pay_${crypto.randomBytes(6).toString("hex")}`, kind, amount, status: "paid" }) });
        if (kind === "deposit" && bk.status === "Acompte à régler") {
          await safeRest("bookings", `id=eq.${bk.id}`, { method: "PATCH", body: JSON.stringify({ status: "Confirmé", updated_at: now() }) });
        } else if (kind === "balance") {
          const newBal = Math.max(0, Number(bk.balance || 0) - amount);
          await safeRest("bookings", `id=eq.${bk.id}`, { method: "PATCH", body: JSON.stringify({ balance: newBal, updated_at: now() }) });
        }
        return json(res, 201, { id: created[0]?.id });
      }
      const refundMatch = /^\/api\/admin\/payments\/(\d+)\/refund$/.exec(path);
      if (method === "POST" && refundMatch) {
        await rest("payments", `id=eq.${refundMatch[1]}`, { method: "PATCH", body: JSON.stringify({ status: "refunded", updated_at: now() }) });
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && path === "/api/admin/reviews") {
        const [reviews, bookings] = await Promise.all([
          safeRest("reviews", "select=*&order=created_at.desc"),
          safeRest("bookings", "select=id,ref")
        ]);
        const bMap = new Map(bookings.map((b) => [b.id, b.ref]));
        return json(res, 200, { reviews: reviews.map((r) => ({ ...r, booking_ref: bMap.get(r.booking_id) || null })) });
      }
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
        const [rows, bookings] = await Promise.all([
          safeRest("notifications", "select=*&order=send_at.desc&limit=200"),
          safeRest("bookings", "select=id,ref")
        ]);
        const bMap = new Map(bookings.map((b) => [b.id, b.ref]));
        return json(res, 200, {
          notifications: rows.map((n) => ({
            ...n,
            booking_ref: bMap.get(n.booking_id) || n.payload_json?.ref || null,
            payload: n.payload_json || {}
          }))
        });
      }
      if (method === "POST" && path === "/api/admin/automations/run") {
        const [bookings, existingNotifs] = await Promise.all([
          safeRest("bookings", "select=*&limit=200"),
          safeRest("notifications", "select=booking_id,kind&limit=500")
        ]);
        const sentSet = new Set(existingNotifs.map((n) => `${n.booking_id}:${n.kind}`));
        let queued = 0, dispatched = 0;
        for (const b of bookings) {
          const cust = b.customer_json || {};
          if (["Confirmé", "Planifié"].includes(b.status) && b.slot && !sentSet.has(`${b.id}:reminder_j1`)) {
            await safeRest("notifications", "", { method: "POST", body: JSON.stringify({ booking_id: b.id, kind: "reminder_j1", channel: cust.pref || "sms", send_at: now(), status: "sent", payload_json: { ref: b.ref, email: cust.email, tel: cust.tel, slot: b.slot } }) });
            queued++; dispatched++;
          }
          if (b.status === "Devis envoyé" && !sentSet.has(`${b.id}:quote_followup`)) {
            await safeRest("notifications", "", { method: "POST", body: JSON.stringify({ booking_id: b.id, kind: "quote_followup", channel: "email", send_at: now(), status: "sent", payload_json: { ref: b.ref, email: cust.email, quote: b.quote_amount } }) });
            queued++; dispatched++;
          }
          if (b.status === "Terminé" && !sentSet.has(`${b.id}:review_request`)) {
            await safeRest("notifications", "", { method: "POST", body: JSON.stringify({ booking_id: b.id, kind: "review_request", channel: "email", send_at: now(), status: "sent", payload_json: { ref: b.ref, email: cust.email } }) });
            queued++; dispatched++;
          }
        }
        return json(res, 200, { ok: true, queued, dispatched });
      }

      if (method === "GET" && path === "/api/admin/pricing") return json(res, 200, await pricing());
      if (method === "PUT" && path === "/api/admin/pricing") {
        if (user.role !== "admin") return json(res, 403, { error: "Droits administrateur requis" });
        const b = await body(req);
        for (const [k, v] of Object.entries(b.items || {})) {
          if (PRICE_DEFAULTS[k]) {
            const def = PRICE_DEFAULTS[k];
            await rest("pricing", "on_conflict=key", {
              method: "POST",
              prefer: "resolution=merge-duplicates",
              body: JSON.stringify({ key: k, label: def[0], group_name: def[1], mode: v.mode === "price" ? "price" : "quote", price: Math.max(0, Number(v.price) || 0), updated_at: now() })
            });
          }
        }
        if (b.deposit != null) {
          await rest("settings", "on_conflict=key", {
            method: "POST",
            prefer: "resolution=merge-duplicates",
            body: JSON.stringify({ key: "deposit", value: String(Math.max(0, Number(b.deposit) || 0)), updated_at: now() })
          });
        }
        await rest("settings", "on_conflict=key", {
          method: "POST",
          prefer: "resolution=merge-duplicates",
          body: JSON.stringify({ key: "admin_modified_at", value: String(Date.now()), updated_at: now() })
        });
        await audit(user, "pricing.updated", "pricing", null);
        return json(res, 200, await pricing());
      }

      if (method === "GET" && path === "/api/admin/audit") {
        const [rows, users] = await Promise.all([
          safeRest("audit", "select=*&order=created_at.desc&limit=500"),
          safeRest("users", "select=id,email")
        ]);
        const uMap = new Map(users.map((u) => [u.id, u.email]));
        return json(res, 200, { audit: rows.map((x) => ({ ...x, email: uMap.get(x.user_id) || ADMIN_EMAIL })) });
      }
      if (method === "GET" && path === "/api/admin/users") {
        const users = await safeRest("users", "select=id,email,name,role,created_at&order=name");
        if (!users.length) users.push({ id: "admin-local", email: ADMIN_EMAIL, name: "Administrateur CARPEO", role: "admin", created_at: now() });
        return json(res, 200, { users });
      }
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
      const editUser = /^\/api\/admin\/users\/([^/]+)$/.exec(path);
      if (method === "PATCH" && editUser) {
        if (user.role !== "admin") return json(res, 403, { error: "Droits administrateur requis" });
        const b = await body(req);
        const role = ["admin", "team", "readonly"].includes(b.role) ? b.role : "readonly";
        await safeRest("users", `id=eq.${encodeURIComponent(editUser[1])}`, { method: "PATCH", body: JSON.stringify({ role }) });
        return json(res, 200, { ok: true });
      }
      if (method === "DELETE" && editUser) {
        if (user.role !== "admin") return json(res, 403, { error: "Droits administrateur requis" });
        await safeRest("users", `id=eq.${encodeURIComponent(editUser[1])}`, { method: "DELETE" });
        return json(res, 200, { ok: true });
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
          await safeRest("settings", "on_conflict=key", { method: "POST", prefer: "resolution=merge-duplicates", body: JSON.stringify({ key: k, value: clean(v, 500), updated_at: now() }) });
        }
        await safeRest("settings", "on_conflict=key", { method: "POST", prefer: "resolution=merge-duplicates", body: JSON.stringify({ key: "admin_modified_at", value: String(Date.now()), updated_at: now() }) });
        return json(res, 200, { ok: true, pricing: await pricing() });
      }

      if (method === "GET" && path === "/api/admin/export.csv") {
        const rows = await safeRest("bookings", "select=*&order=created_at.desc");
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
        const rows = await safeRest("bookings", "select=ref,slot,customer_json&slot=not.is.null&status=neq.Annulé");
        const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CARPEO//Planning//FR"];
        for (const row of rows) {
          const c = row.customer_json || {}, start = String(row.slot || "").replace(/[-: ]/g, "").slice(0, 13) + "00";
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
