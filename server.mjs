import http from "node:http";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.CARPEO_DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DB_PATH = path.join(DATA_DIR, "carpeo.sqlite");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const SESSION_HOURS = 24;
const MAX_BODY = 24 * 1024 * 1024;

await Promise.all([
  mkdir(DATA_DIR, { recursive: true }),
  mkdir(UPLOAD_DIR, { recursive: true }),
  mkdir(BACKUP_DIR, { recursive: true })
]);

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
  salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pricing (
  key TEXT PRIMARY KEY, label TEXT NOT NULL, group_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('price','quote')), price REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, ref TEXT UNIQUE NOT NULL, access_key_hash TEXT NOT NULL,
  type TEXT NOT NULL, status TEXT NOT NULL, customer_json TEXT NOT NULL, items_json TEXT NOT NULL,
  slot TEXT, total REAL, deposit REAL, balance REAL, promo TEXT, advance TEXT,
  quote_amount REAL, notes TEXT DEFAULT '', tags TEXT DEFAULT '',
  lat REAL, lng REAL, route_order INTEGER, attribution_json TEXT DEFAULT '{}', photos_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT DEFAULT '',
  address TEXT DEFAULT '', city TEXT DEFAULT '', postal_code TEXT DEFAULT '',
  need TEXT DEFAULT '', message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Nouveau',
  tags TEXT DEFAULT '', notes TEXT DEFAULT '', source TEXT DEFAULT 'Site web',
  attribution_json TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  recipient TEXT DEFAULT '', subject TEXT DEFAULT '',
  channel TEXT NOT NULL, direction TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  title TEXT NOT NULL, due_at TEXT, status TEXT NOT NULL DEFAULT 'À faire',
  assignee TEXT DEFAULT '', priority TEXT DEFAULT 'Normale', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocked_slots (
  id INTEGER PRIMARY KEY, slot_start TEXT NOT NULL, slot_end TEXT NOT NULL, reason TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, template TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
  send_at TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(booking_id, channel, template)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id TEXT UNIQUE, kind TEXT NOT NULL DEFAULT 'deposit', amount REAL NOT NULL,
  status TEXT NOT NULL, method TEXT DEFAULT 'stripe', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 5, comment TEXT DEFAULT '',
  reply TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Publié', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, name TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, meta_json TEXT NOT NULL, created_at TEXT NOT NULL
);
`);

// Safe migrations for existing SQLite databases
const safeAlter = [
  "ALTER TABLE bookings ADD COLUMN tags TEXT DEFAULT ''",
  "ALTER TABLE bookings ADD COLUMN lat REAL",
  "ALTER TABLE bookings ADD COLUMN lng REAL",
  "ALTER TABLE bookings ADD COLUMN route_order INTEGER",
  "ALTER TABLE bookings ADD COLUMN attribution_json TEXT DEFAULT '{}'",
  "ALTER TABLE bookings ADD COLUMN photos_json TEXT DEFAULT '[]'",
  "ALTER TABLE contacts ADD COLUMN address TEXT DEFAULT ''",
  "ALTER TABLE contacts ADD COLUMN city TEXT DEFAULT ''",
  "ALTER TABLE contacts ADD COLUMN postal_code TEXT DEFAULT ''",
  "ALTER TABLE contacts ADD COLUMN tags TEXT DEFAULT ''",
  "ALTER TABLE contacts ADD COLUMN notes TEXT DEFAULT ''",
  "ALTER TABLE contacts ADD COLUMN source TEXT DEFAULT 'Site web'",
  "ALTER TABLE contacts ADD COLUMN attribution_json TEXT DEFAULT '{}'",
  "ALTER TABLE contacts ADD COLUMN updated_at TEXT DEFAULT ''",
  "ALTER TABLE conversations ADD COLUMN recipient TEXT DEFAULT ''",
  "ALTER TABLE conversations ADD COLUMN subject TEXT DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'Normale'",
  "ALTER TABLE payments ADD COLUMN method TEXT DEFAULT 'stripe'"
];
for (const sql of safeAlter) {
  try { db.exec(sql); } catch {}
}

const PRICES = {
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

const now = () => new Date().toISOString();
const insertPrice = db.prepare("INSERT OR IGNORE INTO pricing(key,label,group_name,mode,price,updated_at) VALUES(?,?,?,?,?,?)");
for (const [key, values] of Object.entries(PRICES)) insertPrice.run(key, ...values, now());

const DEFAULT_SETTINGS = {
  deposit: "20",
  area: "Intervention à domicile et en entreprise",
  hours: "7 jours sur 7, de 9 h à 19 h",
  maps_url: "https://www.google.com/maps/place/Carpeo/@48.8350077,2.4096267,11z/data=!3m1!4b1!4m6!3m5!1s0x42afe645686fa375:0xe9c68ae617bca720!8m2!3d48.8350076!4d2.4096267!16s%2Fg%2F11zzsk71ns?entry=ttu&g_ep=EgoyMDI2MTEwMy4wIKXMDSoASAFQAw%3D%3D",
  base_lat: "48.8350076",
  base_lng: "2.4096267",
  base_address: "CARPEO — Point de départ des tournées",
  auto_reminder_j1: "true",
  auto_quote_followup: "true",
  auto_review_request: "true",
  gtm_id: "GTM-XXXXXXX",
  ga4_id: "G-XXXXXXXX",
  meta_pixel_id: "000000000000000",
  google_ads_id: "AW-XXXXXXXX"
};
const insertSetting = db.prepare("INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)");
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v, now());
// Clean up any legacy Île-de-France text in settings
const currentArea = db.prepare("SELECT value FROM settings WHERE key='area'").get()?.value || "";
if (currentArea.includes("Île-de-France")) {
  db.prepare("UPDATE settings SET value='Intervention à domicile et en entreprise', updated_at=? WHERE key='area'").run(now());
}

function passwordHash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
}
function safeEqualHex(a, b) {
  try { return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); } catch { return false; }
}
function hashToken(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function cleanText(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function json(value) { return JSON.stringify(value ?? null); }
function parseJson(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }

// Ensure the configured admin user exists and matches the configured password
const adminEmail = cleanText(process.env.CARPEO_ADMIN_EMAIL || "admin@carpeo.local", 200).toLowerCase();
const adminPassword = process.env.CARPEO_ADMIN_PASSWORD || "CarpeoAdmin2026!";
const existingAdmin = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
const adminSalt = crypto.randomBytes(16).toString("hex");
if (!existingAdmin) {
  db.prepare("INSERT INTO users(email,name,role,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)")
    .run(adminEmail, "Administrateur CARPEO", "admin", adminSalt, passwordHash(adminPassword, adminSalt), now());
} else {
  db.prepare("UPDATE users SET role='admin', salt=?, password_hash=? WHERE id=?")
    .run(adminSalt, passwordHash(adminPassword, adminSalt), existingAdmin.id);
}

function pricingPayload() {
  const items = {};
  for (const row of db.prepare("SELECT key,label,group_name,mode,price FROM pricing ORDER BY group_name,label").all()) {
    items[row.key] = { label: row.label, group: row.group_name, mode: row.mode, price: row.price };
  }
  const settings = Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map((x) => [x.key, x.value]));
  return {
    deposit: Number(settings.deposit || 20),
    area: settings.area || "Intervention à domicile et en entreprise",
    hours: settings.hours || "7 jours sur 7, de 9 h à 19 h",
    items
  };
}

function sofaKey(item) {
  if (item.config === "panoramique") return "sofaPanoramic";
  if (item.config === "convertible") return "sofaConvertible";
  if (item.config === "meridienne") return item.places === "3" ? "sofa3Meridienne" : "sofa2Meridienne";
  if (item.config === "angle") return item.places === "4" ? "sofa4Angle" : item.places === "3" ? "sofa3Angle" : "sofa2Angle";
  return item.places === "4" ? "sofa4Straight" : item.places === "3" ? "sofa3Straight" : "sofa2Straight";
}
function itemPrice(item, prices) {
  const qty = Math.max(1, Math.min(100, Number(item.qty) || 1));
  let key;
  if (item.cat === "canape") key = sofaKey(item);
  else key = ({ matelas: item.faces === "2" ? "mattress2" : "mattress1", fauteuil: "armchair", tapis: "rug", moquette: "carpet", coussin: "cushion", tete: "headboard", autre: "other" })[item.cat];
  if (item.cat === "chaise") {
    const single = prices.items.chair, bundle = prices.items.chairs6;
    if (!single || !bundle || single.mode !== "price" || bundle.mode !== "price") return null;
    return Math.floor(qty / 6) * bundle.price + (qty % 6) * single.price;
  }
  const entry = prices.items[key];
  if (!entry || entry.mode !== "price") return null;
  return entry.price * (item.cat === "canape" ? 1 : qty);
}
const PROMOS = { BIENVENUE10: ["pct", 10], CARPEO20: ["eur", 20], FIDELITE15: ["pct", 15], NOEL2026: ["pct", 10] };
function calculate(items, advance, promoCode = "") {
  const prices = pricingPayload();
  const linePrices = items.map((item) => itemPrice(item, prices));
  const quote = linePrices.some((value) => value == null);
  const pricedItems = items.map((item, idx) => ({ ...item, frozenPrice: linePrices[idx] }));
  if (quote) return { type: "devis", total: null, deposit: null, balance: null, pricedItems };
  const base = Math.round(linePrices.reduce((sum, value) => sum + value, 0) * 100) / 100;
  const promo = PROMOS[cleanText(promoCode, 50).toUpperCase()];
  const discount = promo ? (promo[0] === "pct" ? Math.round(base * promo[1]) / 100 : Math.min(base, promo[1])) : 0;
  const total = Math.round((base - discount) * 100) / 100;
  const due = advance === "oui" ? Math.round(total * 50) / 100 : total;
  const deposit = prices.deposit || 20;
  return { type: "reservation", total, deposit, balance: Math.max(0, Math.round((due - deposit) * 100) / 100), discount, pricedItems };
}

function stripeEvent(buffer, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw Object.assign(new Error("Webhook Stripe non configuré"), { status: 503 });
  const parts = Object.fromEntries(String(signature).split(",").map((x) => x.split("=")));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) throw Object.assign(new Error("Signature Stripe expirée"), { status: 400 });
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${buffer}`).digest("hex");
  if (!safeEqualHex(expected, parts.v1 || "")) throw Object.assign(new Error("Signature Stripe invalide"), { status: 400 });
  return JSON.parse(buffer.toString("utf8"));
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((part) => part.trim().split(/=(.*)/s)).filter((x) => x[0]).map(([k, v]) => [k, decodeURIComponent(v || "")]));
}
function currentSession(req) {
  const token = cookies(req).carpeo_session;
  if (!token) return null;
  return db.prepare(`SELECT sessions.*,users.email,users.name,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?`).get(hashToken(token), now()) || null;
}
function requireAdmin(req, res, csrf = false) {
  const session = currentSession(req);
  if (!session) { sendJson(res, 401, { error: "Authentification requise" }); return null; }
  if (csrf && req.headers["x-csrf-token"] !== session.csrf) { sendJson(res, 403, { error: "Jeton CSRF invalide" }); return null; }
  return session;
}
function audit(userId, action, entityType, entityId, meta = {}) {
  db.prepare("INSERT INTO audit(user_id,action,entity_type,entity_id,meta_json,created_at) VALUES(?,?,?,?,?,?)")
    .run(userId || null, action, entityType, entityId == null ? null : String(entityId), json(meta), now());
}

const rate = new Map();
function allowed(req, limit = 180) {
  const key = `${req.socket.remoteAddress || "local"}:${new URL(req.url, "http://localhost").pathname}`;
  const minute = Math.floor(Date.now() / 60000);
  const record = rate.get(key);
  if (!record || record.minute !== minute) { rate.set(key, { minute, count: 1 }); return true; }
  record.count += 1;
  return record.count <= limit;
}
function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://unpkg.com https://*.googleapis.com https://*.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com https://unpkg.com; connect-src 'self' https://api.stripe.com https://www.google-analytics.com https://api-adresse.data.gouv.fr https://nominatim.openstreetmap.org https://router.project-osrm.org; frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.google.com https://maps.google.com; base-uri 'self'; form-action 'self'");
}
function sendJson(res, status, data, extra = {}) {
  securityHeaders(res);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}
function sendText(res, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  securityHeaders(res);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}
async function readBody(req, raw = false) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Payload trop volumineux"), { status: 413 });
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (raw) return buffer;
  if (!buffer.length) return {};
  try { return JSON.parse(buffer.toString("utf8")); } catch { throw Object.assign(new Error("JSON invalide"), { status: 400 }); }
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

function safePublicBooking(row) {
  const payments = db.prepare("SELECT kind,amount,status,method,created_at FROM payments WHERE booking_id=? ORDER BY created_at DESC").all(row.id);
  const convs = db.prepare("SELECT channel,direction,body,status,created_at FROM conversations WHERE booking_id=? ORDER BY created_at DESC LIMIT 20").all(row.id);
  return {
    ref: row.ref,
    type: row.type,
    status: row.status,
    items: parseJson(row.items_json, []),
    slot: row.slot,
    total: row.total,
    deposit: row.deposit,
    balance: row.balance,
    quoteAmount: row.quote_amount,
    payments,
    history: convs,
    created: row.created_at,
    updated: row.updated_at
  };
}

async function storePhotos(bookingId, photos) {
  if (!Array.isArray(photos) || !photos.length) return [];
  const dir = path.join(UPLOAD_DIR, String(bookingId));
  await mkdir(dir, { recursive: true });
  const saved = [];
  for (const photo of photos.slice(0, 16)) {
    const type = ["image/jpeg", "image/png", "image/webp"].includes(photo.type) ? photo.type : null;
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(photo.data || "");
    if (!type || !match) continue;
    const data = Buffer.from(match[2], "base64");
    if (data.length > 5 * 1024 * 1024) continue;
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const name = `${crypto.randomUUID()}.${ext}`;
    await writeFile(path.join(dir, name), data);
    saved.push(`/api/admin/uploads/${bookingId}/${name}`);
  }
  return saved;
}

function availableSlots(from = new Date()) {
  const booked = new Set(db.prepare("SELECT slot FROM bookings WHERE slot IS NOT NULL AND status NOT IN ('Annulé','Terminé')").all().map((x) => x.slot));
  const blockedRows = db.prepare("SELECT id,slot_start,slot_end,reason FROM blocked_slots ORDER BY slot_start").all();
  const isBlocked = (slot) => blockedRows.some((row) => {
    const start = String(row.slot_start || "").length === 10 ? `${row.slot_start} 00:00` : String(row.slot_start || "");
    const rawEnd = String(row.slot_end || row.slot_start || "");
    const end = rawEnd.length === 10 ? `${rawEnd} 23:59` : rawEnd;
    return Boolean(start && end && slot >= start && slot <= end);
  });
  const result = [];
  for (let d = 1; d <= 14; d++) {
    const date = new Date(from);
    date.setDate(from.getDate() + d);
    if (date.getDay() === 0) continue;
    const iso = date.toISOString().slice(0, 10);
    result.push({
      date: iso,
      slots: ["08:00", "11:00", "14:00", "17:00"].map((time) => ({
        value: `${iso} ${time}`,
        time,
        available: !booked.has(`${iso} ${time}`) && !isBlocked(`${iso} ${time}`)
      }))
    });
  }
  return { days: result, blocked: blockedRows };
}

async function backupDatabase() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(BACKUP_DIR, `carpeo-${stamp}.sqlite`);
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  return target;
}

async function stripeIntent(booking, kind = "deposit") {
  const amountEur = kind === "balance" ? Number(booking.balance || 0) : Number(booking.deposit || 20);
  if (amountEur <= 0) throw Object.assign(new Error("Aucun montant à régler"), { status: 400 });
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    // Mode simulation fonctionnel si la clé Stripe n'est pas encore renseignée
    const simId = `pi_sim_${crypto.randomBytes(6).toString("hex")}`;
    db.prepare("INSERT OR REPLACE INTO payments(booking_id,provider_id,kind,amount,status,method,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(booking.id, simId, kind, amountEur, "paid", "stripe_simulation", now(), now());
    if (kind === "deposit") {
      db.prepare("UPDATE bookings SET status='Confirmé', updated_at=? WHERE id=?").run(now(), booking.id);
    } else {
      db.prepare("UPDATE bookings SET balance=0, status='Terminé', updated_at=? WHERE id=?").run(now(), booking.id);
    }
    return { simulated: true, providerId: simId, amount: amountEur, status: "paid" };
  }
  const params = new URLSearchParams({
    amount: String(Math.round(amountEur * 100)),
    currency: "eur",
    "metadata[booking_id]": String(booking.id),
    "metadata[ref]": booking.ref,
    "metadata[kind]": kind,
    description: `${kind === "balance" ? "Solde" : "Acompte"} CARPEO ${booking.ref}`
  });
  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message || "Erreur Stripe"), { status: 502 });
  db.prepare("INSERT OR REPLACE INTO payments(booking_id,provider_id,kind,amount,status,method,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(booking.id, data.id, kind, amountEur, data.status, "stripe", now(), now());
  return { clientSecret: data.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "", providerId: data.id, amount: amountEur };
}

async function sendMetaCapi(eventName, customer = {}, customData = {}) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return;
  try {
    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: {
          em: customer.email ? [hashToken(customer.email.toLowerCase())] : undefined,
          ph: customer.tel ? [hashToken(customer.tel.replace(/\D/g, ""))] : undefined
        },
        custom_data: customData
      }]
    };
    await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {}
}

function queueAutomations() {
  const settings = Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map((x) => [x.key, x.value]));
  const rows = db.prepare("SELECT id,ref,type,status,slot,customer_json,updated_at FROM bookings").all();
  const insert = db.prepare("INSERT OR IGNORE INTO notifications(booking_id,channel,template,status,send_at,payload_json,created_at) VALUES(?,?,?,?,?,?,?)");
  let queuedCount = 0;
  for (const row of rows) {
    const customer = parseJson(row.customer_json, {});
    const chan = customer.pref === "telephone" ? "sms" : (customer.pref || "email");
    if (row.slot && settings.auto_reminder_j1 !== "false" && !["Annulé", "Terminé"].includes(row.status)) {
      const sendAt = new Date(row.slot.replace(" ", "T") + ":00");
      if (!isNaN(sendAt.getTime())) {
        sendAt.setDate(sendAt.getDate() - 1);
        const r = insert.run(row.id, chan, "reminder-j1", "queued", sendAt.toISOString(), json({ ref: row.ref, slot: row.slot, customer }), now());
        queuedCount += r.changes;
      }
    }
    if ((row.type === "devis" || row.status === "Devis envoyé") && settings.auto_quote_followup !== "false" && !["Accepté", "Confirmé", "Planifié", "Terminé", "Annulé"].includes(row.status)) {
      const sendAt = new Date(row.updated_at);
      sendAt.setDate(sendAt.getDate() + 2);
      const r = insert.run(row.id, chan, "quote-followup", "queued", sendAt.toISOString(), json({ ref: row.ref, customer }), now());
      queuedCount += r.changes;
    }
    if (row.status === "Terminé" && settings.auto_review_request !== "false") {
      const sendAt = new Date(row.updated_at);
      sendAt.setDate(sendAt.getDate() + 1);
      const r = insert.run(row.id, chan, "review-request", "queued", sendAt.toISOString(), json({ ref: row.ref, customer }), now());
      queuedCount += r.changes;
    }
  }
  return queuedCount;
}

const CHANNEL_WEBHOOKS = {
  email: process.env.EMAIL_WEBHOOK_URL,
  sms: process.env.SMS_WEBHOOK_URL,
  whatsapp: process.env.WHATSAPP_WEBHOOK_URL,
  instagram: process.env.INSTAGRAM_WEBHOOK_URL
};

async function dispatchQueues(force = false) {
  let processed = 0;
  const dueNotifications = force
    ? db.prepare("SELECT * FROM notifications WHERE status='queued' ORDER BY send_at LIMIT 50").all()
    : db.prepare("SELECT * FROM notifications WHERE status='queued' AND send_at<=? ORDER BY send_at LIMIT 25").all(now());
  for (const item of dueNotifications) {
    const endpoint = CHANNEL_WEBHOOKS[item.channel] || CHANNEL_WEBHOOKS.email;
    if (!endpoint) {
      if (force) {
        db.prepare("UPDATE notifications SET status='sent' WHERE id=?").run(item.id);
        processed++;
      }
      continue;
    }
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: json({ template: item.template, ...parseJson(item.payload_json, {}) }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      db.prepare("UPDATE notifications SET status='sent' WHERE id=?").run(item.id);
      processed++;
    } catch {
      db.prepare("UPDATE notifications SET status='error' WHERE id=?").run(item.id);
    }
  }
  for (const item of db.prepare("SELECT * FROM conversations WHERE direction='outbound' AND status='queued' ORDER BY created_at LIMIT 25").all()) {
    const endpoint = CHANNEL_WEBHOOKS[item.channel];
    if (!endpoint) {
      if (force) {
        db.prepare("UPDATE conversations SET status='sent' WHERE id=?").run(item.id);
        processed++;
      }
      continue;
    }
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: json(item) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      db.prepare("UPDATE conversations SET status='sent' WHERE id=?").run(item.id);
      processed++;
    } catch {
      db.prepare("UPDATE conversations SET status='error' WHERE id=?").run(item.id);
    }
  }
  return processed;
}

// Geocoding & Route Optimization helper
const CITY_COORDS = {
  paris: [48.8566, 2.3522],
  boulogne: [48.8397, 2.2399],
  neuilly: [48.8848, 2.2685],
  levallois: [48.8932, 2.2879],
  courbevoie: [48.8967, 2.2567],
  versailles: [48.8049, 2.1204],
  creteil: [48.7904, 2.4556],
  vincennes: [48.8473, 2.4395],
  montreuil: [48.8638, 2.4485],
  nanterre: [48.8924, 2.2071],
  issy: [48.8245, 2.2743],
  saintcloud: [48.8439, 2.2189],
  lyon: [45.7640, 4.8357],
  marseille: [43.2965, 5.3698],
  bordeaux: [44.8378, -0.5792],
  lille: [50.6292, 3.0573]
};

async function geocodeAddress(customer = {}) {
  const query = [customer.adresse, customer.cp, customer.ville].filter(Boolean).join(" ").trim();
  if (!query) return { lat: 48.8566, lng: 2.3522 };
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = await res.json();
      const coords = data?.features?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        return { lng: coords[0], lat: coords[1] };
      }
    }
  } catch {}
  const cityKey = String(customer.ville || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\s-]/g, "");
  for (const [k, [lat, lng]] of Object.entries(CITY_COORDS)) {
    if (cityKey.includes(k)) {
      const hash = crypto.createHash("md5").update(query).digest();
      return {
        lat: Math.round((lat + ((hash[0] - 128) / 128) * 0.018) * 100000) / 100000,
        lng: Math.round((lng + ((hash[1] - 128) / 128) * 0.025) * 100000) / 100000
      };
    }
  }
  const hash = crypto.createHash("md5").update(query).digest();
  return {
    lat: Math.round((48.8566 + ((hash[0] - 128) / 128) * 0.045) * 100000) / 100000,
    lng: Math.round((2.3522 + ((hash[1] - 128) / 128) * 0.065) * 100000) / 100000
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.28 * 10) / 10; // 1.28 urban road factor
}

function seedDemoData() {
  const existing = db.prepare("SELECT COUNT(*) c FROM bookings").get().c;
  if (existing >= 5) return { seeded: false, bookings: existing };

  const today = new Date();
  const fmtDate = (offsetDays, time = "08:00") => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return `${d.toISOString().slice(0, 10)} ${time}`;
  };

  const sampleBookings = [
    {
      ref: "CAR-8F4A219B",
      key: "K9M2P4X1",
      type: "reservation",
      status: "Planifié",
      slot: fmtDate(1, "17:00"),
      total: 139, deposit: 20, balance: 119, promo: "", advance: "non", quote_amount: null,
      notes: "Code porte 4582B, 2e étage avec ascenseur. Tache de café sur méridienne.",
      tags: "Particulier, Fidèle",
      lat: 48.8648, lng: 2.3798, route_order: 1,
      customer: { nom: "Martin", prenom: "Sophie", email: "sophie.martin@example.fr", tel: "06 12 34 56 78", adresse: "24 Rue Oberkampf", cp: "75011", ville: "Paris", etage: "2", ascenseur: "oui", pref: "whatsapp", heard: "Instagram" },
      items: [{ cat: "canape", places: "3", config: "angle", matiere: "Velours côtelé", qty: "1", stain: "Boisson", age: "Quelques jours", odor: "non", frozenPrice: 139 }],
      attribution: { source: "Instagram", medium: "social", campaign: "reel_avant_apres" }
    },
    {
      ref: "CAR-3D9E712C",
      key: "T7V8L2N5",
      type: "reservation",
      status: "Planifié",
      slot: fmtDate(1, "11:00"),
      total: 179, deposit: 20, balance: 159, promo: "BIENVENUE10", advance: "non", quote_amount: null,
      notes: "Canapé droit 3 places + Matelas 2 faces.",
      tags: "VIP, Particulier",
      lat: 48.8412, lng: 2.2405, route_order: 2,
      customer: { nom: "Dubois", prenom: "Thomas", email: "thomas.dubois@example.fr", tel: "06 45 78 90 12", adresse: "15 Avenue Jean Jaurès", cp: "92100", ville: "Boulogne-Billancourt", etage: "4", ascenseur: "oui", pref: "email", heard: "Google Ads" },
      items: [
        { cat: "canape", places: "3", config: "droit", matiere: "Tissu chiné", qty: "1", stain: "Nourriture", age: "Quelques semaines", odor: "non", frozenPrice: 99 },
        { cat: "matelas", faces: "2", size: "160 x 200", qty: "1", stain: "Autre", age: "Plusieurs mois", odor: "non", frozenPrice: 89 }
      ],
      attribution: { source: "Google Ads", medium: "cpc", campaign: "search_nettoyage_canape" }
    },
    {
      ref: "CAR-5B1C904E",
      key: "P3Q6R9W2",
      type: "reservation",
      status: "Confirmé",
      slot: fmtDate(1, "14:00"),
      total: 90, deposit: 20, balance: 70, promo: "", advance: "non", quote_amount: null,
      notes: "Lot de 6 chaises en velours vert.",
      tags: "Particulier",
      lat: 48.8842, lng: 2.2695, route_order: 3,
      customer: { nom: "Leroy", prenom: "Camille", email: "camille.leroy@example.fr", tel: "06 88 11 22 33", adresse: "42 Boulevard du Château", cp: "92200", ville: "Neuilly-sur-Seine", etage: "1", ascenseur: "oui", pref: "whatsapp", heard: "Recommandation" },
      items: [{ cat: "chaise", qty: "6", matiere: "Velours", stain: "Graisse", age: "Quelques semaines", odor: "non", frozenPrice: 90 }],
      attribution: { source: "Recommandation", medium: "referral", campaign: "bouche_a_oreille" }
    },
    {
      ref: "CAR-7A2F441D",
      key: "M4N8B1Z7",
      type: "devis",
      status: "Demande reçue",
      slot: null,
      total: null, deposit: null, balance: null, promo: "", advance: "non", quote_amount: null,
      notes: "Grand tapis berbère en laine 3m x 2m + 4 coussins.",
      tags: "À chiffrer, Particulier",
      lat: 48.8534, lng: 2.3488, route_order: null,
      customer: { nom: "Benali", prenom: "Karim", email: "karim.benali@example.fr", tel: "06 77 44 55 66", adresse: "8 Rue de Rivoli", cp: "75004", ville: "Paris", etage: "3", ascenseur: "non", pref: "whatsapp", heard: "Meta Ads" },
      items: [
        { cat: "tapis", length: "3", width: "2", surface: "6", matiere: "Laine berbère", qty: "1", stain: "Boisson", age: "Quelques jours", odor: "non" },
        { cat: "coussin", qty: "4", matiere: "Lin", stain: "", age: "", odor: "non" }
      ],
      attribution: { source: "Meta Ads", medium: "paid_social", campaign: "meta_retargeting_tapis" }
    },
    {
      ref: "CAR-9E6D118A",
      key: "H5J7K2L9",
      type: "devis",
      status: "Devis envoyé",
      slot: null,
      total: null, deposit: null, balance: null, promo: "", advance: "non", quote_amount: 340,
      notes: "Moquette bureaux 45 m² — intervention souhaitée en fin de journée.",
      tags: "Professionnel B2B, Devis en attente",
      lat: 48.8924, lng: 2.2369, route_order: null,
      customer: { nom: "Agence Horizon", prenom: "Marc", email: "contact@agence-horizon.fr", tel: "01 42 68 55 00", adresse: "12 Esplanade du Général de Gaulle", cp: "92400", ville: "Courbevoie", etage: "5", ascenseur: "oui", pref: "email", heard: "Google" },
      items: [{ cat: "moquette", surface: "45", matiere: "Dalles polyamide", qty: "1", stain: "Boisson", age: "Plusieurs mois", odor: "non" }],
      attribution: { source: "Google", medium: "organic", campaign: "seo_moquette_bureaux" }
    },
    {
      ref: "CAR-2C4B883F",
      key: "W8X3C6V1",
      type: "devis",
      status: "Accepté",
      slot: fmtDate(2, "11:00"),
      total: 165, deposit: 20, balance: 145, promo: "", advance: "non", quote_amount: 165,
      notes: "Devis accepté en ligne par la cliente, prêt à convertir en intervention.",
      tags: "Particulier",
      lat: 48.8473, lng: 2.4395, route_order: null,
      customer: { nom: "Moreau", prenom: "Claire", email: "claire.moreau@example.fr", tel: "06 33 99 88 77", adresse: "19 Avenue du Château", cp: "94300", ville: "Vincennes", etage: "1", ascenseur: "oui", pref: "email", heard: "Instagram" },
      items: [{ cat: "canape", places: "4", config: "panoramique", matiere: "Microfibre", qty: "1", stain: "Nourriture", age: "Quelques semaines", odor: "non" }],
      attribution: { source: "Instagram", medium: "social", campaign: "story_promo" }
    },
    {
      ref: "CAR-6F1A509D",
      key: "B2N4M7Q8",
      type: "reservation",
      status: "Acompte à régler",
      slot: fmtDate(3, "14:00"),
      total: 89, deposit: 20, balance: 69, promo: "", advance: "non", quote_amount: null,
      notes: "En attente du règlement de l'acompte de 20 €.",
      tags: "Particulier",
      lat: 48.8245, lng: 2.2743, route_order: null,
      customer: { nom: "Petit", prenom: "Lucas", email: "lucas.petit@example.fr", tel: "06 54 32 10 98", adresse: "5 Rue Ernest Renan", cp: "92130", ville: "Issy-les-Moulineaux", etage: "2", ascenseur: "oui", pref: "whatsapp", heard: "Google Ads" },
      items: [{ cat: "canape", places: "2", config: "droit", matiere: "Coton", qty: "1", stain: "Boisson", age: "Quelques jours", odor: "non", frozenPrice: 89 }],
      attribution: { source: "Google Ads", medium: "cpc", campaign: "search_nettoyage_canape" }
    },
    {
      ref: "CAR-1D8E332B",
      key: "L9K4J2H6",
      type: "reservation",
      status: "Terminé",
      slot: fmtDate(-2, "08:00"),
      total: 148, deposit: 20, balance: 0, promo: "", advance: "non", quote_amount: null,
      notes: "Prestation terminée et solde réglé. Client très satisfait.",
      tags: "VIP, Fidèle",
      lat: 48.8718, lng: 2.3316, route_order: null,
      customer: { nom: "Laurent", prenom: "Émilie", email: "emilie.laurent@example.fr", tel: "06 21 43 65 87", adresse: "30 Rue La Fayette", cp: "75009", ville: "Paris", etage: "3", ascenseur: "oui", pref: "email", heard: "Google" },
      items: [
        { cat: "canape", places: "3", config: "droit", matiere: "Velours", qty: "1", frozenPrice: 99 },
        { cat: "fauteuil", qty: "1", matiere: "Velours", frozenPrice: 49 }
      ],
      attribution: { source: "Google", medium: "organic", campaign: "fiche_google_maps" }
    }
  ];

  const insBooking = db.prepare(`INSERT OR IGNORE INTO bookings(
    ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,promo,advance,
    quote_amount,notes,tags,lat,lng,route_order,attribution_json,photos_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insContact = db.prepare(`INSERT INTO contacts(
    name,email,phone,address,city,postal_code,need,message,status,tags,notes,source,attribution_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insConv = db.prepare(`INSERT INTO conversations(
    booking_id,contact_id,recipient,subject,channel,direction,body,status,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?)`);

  const insPayment = db.prepare(`INSERT OR IGNORE INTO payments(
    booking_id,provider_id,kind,amount,status,method,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?)`);

  const insTask = db.prepare(`INSERT INTO tasks(booking_id,title,due_at,status,assignee,priority,created_at) VALUES(?,?,?,?,?,?,?)`);
  const insReview = db.prepare(`INSERT INTO reviews(booking_id,customer_name,rating,comment,reply,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`);

  for (const b of sampleBookings) {
    const ts = now();
    const res = insBooking.run(
      b.ref, hashToken(b.key), b.type, b.status, json(b.customer), json(b.items),
      b.slot, b.total, b.deposit, b.balance, b.promo, b.advance,
      b.quote_amount, b.notes, b.tags, b.lat, b.lng, b.route_order,
      json(b.attribution), "[]", ts, ts
    );
    const bId = res.lastInsertRowid;
    if (!bId) continue;

    const cRes = insContact.run(
      `${b.customer.prenom} ${b.customer.nom}`, b.customer.email, b.customer.tel,
      b.customer.adresse, b.customer.ville, b.customer.cp,
      b.items.map((i) => i.cat).join(", "), b.notes,
      b.status === "Terminé" ? "Client actif" : "En cours",
      b.tags, b.notes, b.attribution.source || "Site web", json(b.attribution), ts, ts
    );
    const cId = cRes.lastInsertRowid;

    if (["Confirmé", "Planifié", "Terminé"].includes(b.status) && b.deposit) {
      insPayment.run(bId, `pi_${b.ref.toLowerCase()}_dep`, "deposit", b.deposit, "paid", "stripe", ts, ts);
    }
    if (b.status === "Terminé" && b.total) {
      insPayment.run(bId, `pi_${b.ref.toLowerCase()}_bal`, "balance", b.total - (b.deposit || 0), "paid", "stripe", ts, ts);
    }
    if (b.ref === "CAR-8F4A219B") {
      insConv.run(bId, cId, b.customer.tel, "Confirmation WhatsApp", "whatsapp", "inbound", "Bonjour, est-ce possible de bien prévoir le détachant café pour demain matin à 8h ?", "reçu", ts);
      insConv.run(bId, cId, b.customer.tel, "Réponse équipe", "whatsapp", "outbound", "Bonjour Sophie, oui tout est prêt ! Notre technicien arrivera à 8h00 précises.", "sent", ts);
      insTask.run(bId, "Préparer détachant tanin & buse velours (Dossier CAR-8F4A219B)", b.slot?.replace(" ", "T"), "À faire", "Technicien 1", "Haute", ts);
    }
    if (b.ref === "CAR-7A2F441D") {
      insConv.run(bId, cId, "@karim.benali", "DM Instagram", "instagram", "inbound", "Bonjour CARPEO, je viens d'envoyer une demande de devis pour mon tapis berbère 3x2m !", "reçu", ts);
      insTask.run(bId, "Chiffrer le devis tapis berbère 6m² (CAR-7A2F441D)", fmtDate(0, "17:00").replace(" ", "T"), "À faire", "Commercial", "Haute", ts);
    }
    if (b.ref === "CAR-9E6D118A") {
      insConv.run(bId, cId, b.customer.email, "Devis CARPEO #CAR-9E6D118A", "email", "outbound", "Bonjour Marc, veuillez trouver votre devis de 340 € TTC pour les 45 m² de moquette de vos bureaux.", "sent", ts);
    }
    if (b.ref === "CAR-1D8E332B") {
      insReview.run(bId, "Émilie Laurent", 5, "Le canapé en velours et le fauteuil ont retrouvé leur éclat d'origine. Ponctuel et très soigné !", "Merci beaucoup Émilie pour votre confiance ! Au plaisir de prendre soin de vos textiles.", "Publié", ts, ts);
    }
  }

  insReview.run(null, "Thomas Dubois", 5, "Intervention rapide sur notre matelas et notre canapé, séchage en une après-midi et plus aucune trace.", "Merci Thomas pour votre retour !", "Publié", now(), now());
  insReview.run(null, "Hôtel Le Parc", 5, "Prestation impeccable sur 24 fauteuils et moquettes de chambres. Nous recommandons CARPEO.", "", "Publié", now(), now());

  queueAutomations();
  return { seeded: true, bookings: sampleBookings.length };
}

// Seed initial rich dataset if DB is empty
seedDemoData();

function buildDashboardData(period = "all") {
  let sinceIso = null;
  if (period === "7d") sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
  else if (period === "30d") sinceIso = new Date(Date.now() - 30 * 86400000).toISOString();
  else if (period === "90d") sinceIso = new Date(Date.now() - 90 * 86400000).toISOString();

  const allBookings = db.prepare("SELECT * FROM bookings ORDER BY created_at DESC").all();
  const bookings = sinceIso ? allBookings.filter((b) => b.created_at >= sinceIso) : allBookings;
  const payments = db.prepare("SELECT * FROM payments WHERE status='paid'").all();
  const reviews = db.prepare("SELECT * FROM reviews WHERE status='Publié'").all();
  const contactsCount = db.prepare("SELECT COUNT(*) count FROM contacts").get().count;
  const unreadMessages = db.prepare("SELECT COUNT(*) count FROM conversations WHERE direction='inbound' AND status='reçu'").get().count;
  const pendingTasks = db.prepare("SELECT COUNT(*) count FROM tasks WHERE status!='Terminé'").get().count;

  const KANBAN_STEPS = ["Demande reçue", "Devis envoyé", "Accepté", "Acompte à régler", "Confirmé", "Planifié", "Terminé"];
  const statusMap = Object.fromEntries([...KANBAN_STEPS, "Annulé"].map((s) => [s, 0]));
  for (const b of bookings) statusMap[b.status] = (statusMap[b.status] || 0) + 1;
  const counts = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

  const activeBookings = bookings.filter((b) => b.status !== "Annulé" && (b.total != null || b.quote_amount != null));
  const revenue = Math.round(activeBookings.reduce((sum, b) => sum + Number(b.total ?? b.quote_amount ?? 0), 0) * 100) / 100;
  const deposits = Math.round(activeBookings.reduce((sum, b) => sum + Number(b.deposit || 0), 0) * 100) / 100;
  const balances = Math.round(activeBookings.reduce((sum, b) => sum + Number(b.balance || 0), 0) * 100) / 100;
  const collected = Math.round(payments.reduce((sum, p) => sum + Number(p.amount || 0), 0) * 100) / 100;
  const average = activeBookings.length ? Math.round((revenue / activeBookings.length) * 100) / 100 : 0;

  const wonCount = bookings.filter((b) => ["Accepté", "Confirmé", "Planifié", "Terminé"].includes(b.status)).length;
  const cancelledCount = bookings.filter((b) => b.status === "Annulé").length;
  const conversion = bookings.length ? Math.round((wonCount / bookings.length) * 1000) / 10 : 0;
  const cancellationRate = bookings.length ? Math.round((cancelledCount / bookings.length) * 1000) / 10 : 0;

  const avgRating = reviews.length ? Math.round((reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / reviews.length) * 10) / 10 : 4.9;

  // Textile category breakdown
  const catCounts = {};
  const attribMap = {};
  for (const b of bookings) {
    const items = parseJson(b.items_json, []);
    for (const it of items) {
      const cat = it.cat || "autre";
      catCounts[cat] = (catCounts[cat] || 0) + (Number(it.qty) || 1);
    }
    const cust = parseJson(b.customer_json, {});
    const attr = parseJson(b.attribution_json, {});
    const source = attr.source || cust.heard || "Direct / Site web";
    if (!attribMap[source]) attribMap[source] = { source, leads: 0, won: 0, revenue: 0 };
    attribMap[source].leads += 1;
    if (["Accepté", "Confirmé", "Planifié", "Terminé"].includes(b.status)) {
      attribMap[source].won += 1;
      attribMap[source].revenue += Number(b.total ?? b.quote_amount ?? 0);
    }
  }

  return {
    counts,
    money: { revenue, deposits, balances, collected, average },
    contacts: contactsCount,
    conversion,
    cancellations: { count: cancelledCount, rate: cancellationRate },
    satisfaction: { rating: avgRating, count: reviews.length },
    serviceBreakdown: Object.entries(catCounts).map(([category, count]) => ({ category, count })),
    attribution: Object.values(attribMap).sort((a, b) => b.revenue - a.revenue),
    alerts: {
      quotesToPrice: statusMap["Demande reçue"] || 0,
      quotesToConvert: statusMap["Accepté"] || 0,
      unreadMessages,
      pendingTasks
    }
  };
}

function buildUnifiedContacts() {
  const contactRows = db.prepare("SELECT * FROM contacts ORDER BY created_at DESC LIMIT 500").all();
  const bookingRows = db.prepare("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500").all();
  const convRows = db.prepare("SELECT * FROM conversations ORDER BY created_at DESC LIMIT 500").all();

  const byEmail = new Map();
  for (const c of contactRows) {
    const key = (c.email || "").toLowerCase();
    byEmail.set(key, {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone || "",
      address: c.address || "",
      city: c.city || "",
      postal_code: c.postal_code || "",
      need: c.need || "",
      message: c.message || "",
      status: c.status || "Nouveau",
      tags: c.tags || "",
      notes: c.notes || "",
      source: c.source || "Site web",
      created_at: c.created_at,
      bookingsCount: 0,
      totalSpent: 0,
      hasPendingQuote: false,
      bookings: [],
      timeline: [{ type: "contact", date: c.created_at, label: `Contact initial (${c.need || "Formulaire"})`, detail: c.message }]
    });
  }

  for (const b of bookingRows) {
    const cust = parseJson(b.customer_json, {});
    const email = (cust.email || "").toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) {
      const res = db.prepare("INSERT INTO contacts(name,email,phone,address,city,postal_code,need,message,status,tags,notes,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(`${cust.prenom || ""} ${cust.nom || ""}`.trim() || email, email, cust.tel || "", cust.adresse || "", cust.ville || "", cust.cp || "", b.type, b.notes || "", "Client", b.tags || "", b.notes || "", cust.heard || "Réservation", b.created_at, b.updated_at);
      byEmail.set(email, {
        id: res.lastInsertRowid,
        name: `${cust.prenom || ""} ${cust.nom || ""}`.trim() || email,
        email,
        phone: cust.tel || "",
        address: cust.adresse || "",
        city: cust.ville || "",
        postal_code: cust.cp || "",
        need: b.type,
        message: b.notes || "",
        status: "Client",
        tags: b.tags || "",
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

  for (const m of convRows) {
    for (const entry of byEmail.values()) {
      if (m.contact_id === entry.id || entry.bookings.some((b) => b.id === m.booking_id)) {
        entry.timeline.push({ type: "message", date: m.created_at, label: `${m.channel.toUpperCase()} (${m.direction === "inbound" ? "Reçu" : "Envoyé"})`, detail: m.body });
        break;
      }
    }
  }

  return Array.from(byEmail.values()).map((c) => ({
    ...c,
    averageBasket: c.bookingsCount ? Math.round((c.totalSpent / c.bookingsCount) * 100) / 100 : 0,
    timeline: c.timeline.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }));
}

async function api(req, res, url) {
  if (!allowed(req, url.pathname === "/api/auth/login" ? 20 : 240)) return sendJson(res, 429, { error: "Trop de requêtes" });
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      database: "sqlite",
      supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      time: now()
    });
  }
  if (method === "GET" && url.pathname === "/api/pricing") return sendJson(res, 200, pricingPayload());
  if (method === "GET" && url.pathname === "/api/slots") return sendJson(res, 200, availableSlots());

  if (method === "POST" && url.pathname === "/api/stripe/webhook") {
    const event = stripeEvent(await readBody(req, true), req.headers["stripe-signature"]);
    const intent = event.data?.object;
    if (intent?.id) {
      const status = event.type === "payment_intent.succeeded" ? "paid" : intent.status || event.type;
      db.prepare("UPDATE payments SET status=?,updated_at=? WHERE provider_id=?").run(status, now(), intent.id);
      if (event.type === "payment_intent.succeeded") {
        db.prepare("UPDATE bookings SET status='Confirmé',updated_at=? WHERE id=(SELECT booking_id FROM payments WHERE provider_id=?)").run(now(), intent.id);
      }
    }
    return sendJson(res, 200, { received: true });
  }

  if (method === "POST" && url.pathname === "/api/webhooks/messages") {
    const body = await readBody(req);
    const channel = cleanText(body.channel || "whatsapp", 40);
    const sender = cleanText(body.from || body.sender || "", 160);
    const text = cleanText(body.body || body.message || "", 4000);
    if (!text) return sendJson(res, 422, { error: "Message vide" });
    const contact = sender ? db.prepare("SELECT id FROM contacts WHERE email=? OR phone LIKE ? LIMIT 1").get(sender.toLowerCase(), `%${sender.slice(-8)}%`) : null;
    const result = db.prepare("INSERT INTO conversations(contact_id,recipient,channel,direction,body,status,created_at) VALUES(?,?,?,'inbound',?,'reçu',?)")
      .run(contact?.id || null, sender, channel, text, now());
    return sendJson(res, 201, { id: result.lastInsertRowid });
  }

  if (method === "POST" && url.pathname === "/api/contact") {
    const body = await readBody(req);
    const name = cleanText(body.name, 160), email = cleanText(body.email, 200).toLowerCase(), message = cleanText(body.message, 4000);
    if (!name || !validEmail(email) || !message) return sendJson(res, 422, { error: "Nom, e-mail et message valides requis" });
    const attribution = body.attribution || {};
    const result = db.prepare("INSERT INTO contacts(name,email,phone,need,message,status,source,attribution_json,created_at,updated_at) VALUES(?,?,?,?,?,'Nouveau',?,?,?,?)")
      .run(name, email, cleanText(body.phone, 60), cleanText(body.need, 120), message, cleanText(attribution.source || "Formulaire contact", 80), json(attribution), now(), now());
    db.prepare("INSERT INTO conversations(contact_id,recipient,subject,channel,direction,body,status,created_at) VALUES(?,?,?,'form','inbound',?,'reçu',?)")
      .run(result.lastInsertRowid, email, cleanText(body.need || "Demande de contact", 120), message, now());
    sendMetaCapi("Lead", { email, tel: body.phone }, { content_name: body.need || "contact" });
    audit(null, "contact.created", "contact", result.lastInsertRowid);
    return sendJson(res, 201, { ok: true });
  }

  if (method === "POST" && url.pathname === "/api/bookings") {
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
    const customer = body.customer || {};
    const email = cleanText(customer.email, 200).toLowerCase();
    if (!items.length || !cleanText(customer.nom, 120) || !cleanText(customer.prenom, 120) || !validEmail(email) || !cleanText(customer.tel, 60) || !cleanText(customer.adresse, 300) || !cleanText(customer.cp, 10) || !cleanText(customer.ville, 120)) {
      return sendJson(res, 422, { error: "Informations client ou prestations incomplètes" });
    }
    customer.email = email;
    const calc = calculate(items, body.advance, body.promo);
    if (calc.type === "reservation" && !cleanText(body.slot, 30)) return sendJson(res, 422, { error: "Créneau requis" });
    if (calc.type === "reservation") {
      const requestedSlot = cleanText(body.slot, 30);
      const used = db.prepare("SELECT id FROM bookings WHERE slot=? AND status NOT IN ('Annulé','Terminé')").get(requestedSlot);
      if (used) return sendJson(res, 409, { error: "Ce créneau vient d’être réservé" });
      const blocked = db.prepare("SELECT slot_start,slot_end FROM blocked_slots").all().some((row) => {
        const start = String(row.slot_start || "").length === 10 ? `${row.slot_start} 00:00` : String(row.slot_start || "");
        const rawEnd = String(row.slot_end || row.slot_start || "");
        const end = rawEnd.length === 10 ? `${rawEnd} 23:59` : rawEnd;
        return requestedSlot >= start && requestedSlot <= end;
      });
      if (blocked) return sendJson(res, 409, { error: "Ce créneau est indisponible" });
    }
    const coords = await geocodeAddress(customer);
    const attribution = body.attribution || { source: customer.heard || "Site web" };
    const ref = `CAR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const accessKey = crypto.randomBytes(8).toString("base64url").toUpperCase();
    const timestamp = now();
    const status = calc.type === "devis" ? "Demande reçue" : "Acompte à régler";
    const result = db.prepare(`INSERT INTO bookings(
      ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,promo,advance,
      lat,lng,attribution_json,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      ref, hashToken(accessKey), calc.type, status, json(customer), json(calc.pricedItems),
      calc.type === "reservation" ? cleanText(body.slot, 30) : null,
      calc.total, calc.deposit, calc.balance, cleanText(body.promo, 50), cleanText(body.advance, 10),
      coords.lat, coords.lng, json(attribution), timestamp, timestamp
    );
    const savedPhotos = await storePhotos(result.lastInsertRowid, body.photos);
    if (savedPhotos.length) {
      db.prepare("UPDATE bookings SET photos_json=? WHERE id=?").run(json(savedPhotos), result.lastInsertRowid);
    }
    // Sync with CRM contacts
    const existingContact = db.prepare("SELECT id FROM contacts WHERE email=? LIMIT 1").get(email);
    if (!existingContact) {
      db.prepare("INSERT INTO contacts(name,email,phone,address,city,postal_code,need,message,status,tags,source,attribution_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(`${customer.prenom} ${customer.nom}`, email, customer.tel, customer.adresse, customer.ville, customer.cp, calc.type, `Dossier ${ref}`, "Client", "Particulier", customer.heard || "Site web", json(attribution), timestamp, timestamp);
    }
    audit(null, "booking.created", "booking", result.lastInsertRowid, { ref, photos: savedPhotos.length });
    queueAutomations();
    sendMetaCapi(calc.type === "devis" ? "Lead" : "Schedule", customer, { value: calc.total || 0, currency: "EUR" });
    return sendJson(res, 201, { ref, key: accessKey, ...calc, status });
  }

  const bookingMatch = /^\/api\/bookings\/([^/]+)$/.exec(url.pathname);
  if (method === "GET" && bookingMatch) {
    const row = db.prepare("SELECT * FROM bookings WHERE ref=?").get(cleanText(decodeURIComponent(bookingMatch[1]), 40).toUpperCase());
    const key = cleanText(url.searchParams.get("key"), 100);
    if (!row || !safeEqualHex(row.access_key_hash, hashToken(key))) return sendJson(res, 404, { error: "Dossier introuvable" });
    return sendJson(res, 200, safePublicBooking(row));
  }
  if (method === "POST" && /^\/api\/bookings\/[^/]+\/accept$/.test(url.pathname)) {
    const ref = decodeURIComponent(url.pathname.split("/")[3]).toUpperCase();
    const body = await readBody(req);
    const row = db.prepare("SELECT * FROM bookings WHERE ref=?").get(ref);
    if (!row || !safeEqualHex(row.access_key_hash, hashToken(cleanText(body.key, 100)))) return sendJson(res, 404, { error: "Dossier introuvable" });
    if (row.quote_amount == null) return sendJson(res, 409, { error: "Aucun devis à accepter" });
    const dep = Math.min(pricingPayload().deposit, row.quote_amount);
    db.prepare("UPDATE bookings SET status='Accepté',total=?,deposit=?,balance=?,updated_at=? WHERE id=?")
      .run(row.quote_amount, dep, Math.max(0, row.quote_amount - dep), now(), row.id);
    audit(null, "quote.accepted", "booking", row.id, { ref });
    return sendJson(res, 200, { ok: true });
  }
  if (method === "POST" && url.pathname === "/api/payments/create-intent") {
    const body = await readBody(req);
    const row = db.prepare("SELECT * FROM bookings WHERE ref=?").get(cleanText(body.ref, 40).toUpperCase());
    if (!row || !safeEqualHex(row.access_key_hash, hashToken(cleanText(body.key, 100)))) return sendJson(res, 404, { error: "Dossier introuvable" });
    return sendJson(res, 200, await stripeIntent(row, body.kind === "balance" ? "balance" : "deposit"));
  }
  if (method === "POST" && url.pathname === "/api/events") {
    const body = await readBody(req);
    db.prepare("INSERT INTO events(name,payload_json,created_at) VALUES(?,?,?)").run(cleanText(body.name, 120), json(body.params || {}), now());
    return sendJson(res, 202, { ok: true });
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const email = cleanText(body.email, 200).toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    if (!user || !safeEqualHex(user.password_hash, passwordHash(String(body.password || ""), user.salt))) {
      return sendJson(res, 401, { error: "Identifiants incorrects" });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const csrf = crypto.randomBytes(24).toString("base64url");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now());
    db.prepare("INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)").run(hashToken(token), user.id, csrf, expires, now());
    audit(user.id, "auth.login", "user", user.id);
    return sendJson(res, 200, { user: { id: user.id, email: user.email, name: user.name, role: user.role }, csrf }, {
      "Set-Cookie": `carpeo_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`
    });
  }
  if (method === "GET" && url.pathname === "/api/auth/me") {
    const session = requireAdmin(req, res);
    if (!session) return;
    return sendJson(res, 200, { user: { id: session.user_id, email: session.email, name: session.name, role: session.role }, csrf: session.csrf });
  }
  if (method === "POST" && url.pathname === "/api/auth/logout") {
    const session = requireAdmin(req, res, true);
    if (!session) return;
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(session.token_hash);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "carpeo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }

  // Protected Admin Routes
  if (url.pathname.startsWith("/api/admin/")) {
    const mutating = !["GET", "HEAD"].includes(method);
    const session = requireAdmin(req, res, mutating);
    if (!session) return;
    if (mutating && session.role === "readonly") return sendJson(res, 403, { error: "Accès en lecture seule" });
    if (mutating && ["/api/admin/users", "/api/admin/settings", "/api/admin/pricing", "/api/admin/backup"].some((p) => url.pathname.startsWith(p)) && session.role !== "admin") {
      return sendJson(res, 403, { error: "Droits administrateur requis" });
    }

    // Serve uploaded booking photos to authenticated admin/team
    const uploadMatch = /^\/api\/admin\/uploads\/(\d+)\/([a-zA-Z0-9._-]+)$/.exec(url.pathname);
    if (method === "GET" && uploadMatch) {
      const target = path.resolve(UPLOAD_DIR, uploadMatch[1], uploadMatch[2]);
      if (!target.startsWith(UPLOAD_DIR + path.sep)) return sendText(res, 403, "Interdit");
      try {
        const data = await readFile(target);
        const ext = path.extname(target).toLowerCase();
        return sendText(res, 200, data, TYPES[ext] || "application/octet-stream");
      } catch {
        return sendText(res, 404, "Fichier introuvable");
      }
    }

    if (method === "GET" && url.pathname === "/api/admin/dashboard") {
      return sendJson(res, 200, buildDashboardData(url.searchParams.get("period") || "all"));
    }

    if (method === "POST" && url.pathname === "/api/admin/seed") {
      const resSeed = seedDemoData();
      audit(session.user_id, "database.seeded", "system", null, resSeed);
      return sendJson(res, 200, { ok: true, ...resSeed });
    }

    // Bookings & Pipeline (7 Kanban steps)
    if (method === "GET" && url.pathname === "/api/admin/bookings") {
      const rows = db.prepare("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500").all().map((row) => ({
        ...row,
        customer: parseJson(row.customer_json, {}),
        items: parseJson(row.items_json, []),
        attribution: parseJson(row.attribution_json, {}),
        photos: parseJson(row.photos_json, []),
        customer_json: undefined,
        items_json: undefined,
        attribution_json: undefined,
        photos_json: undefined,
        access_key_hash: undefined
      }));
      return sendJson(res, 200, { bookings: rows });
    }

    if (method === "POST" && url.pathname === "/api/admin/bookings") {
      const body = await readBody(req);
      const customer = body.customer || {};
      const items = Array.isArray(body.items) && body.items.length ? body.items : [{ cat: body.cat || "canape", places: "3", config: "droit", qty: "1" }];
      const calc = calculate(items, body.advance || "non", body.promo || "");
      const coords = await geocodeAddress(customer);
      const ref = `CAR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const accessKey = crypto.randomBytes(8).toString("base64url").toUpperCase();
      const status = cleanText(body.status || (calc.type === "devis" ? "Demande reçue" : "Confirmé"), 60);
      const total = body.total != null && body.total !== "" ? Number(body.total) : calc.total;
      const deposit = total != null ? Math.min(pricingPayload().deposit, total) : null;
      const balance = total != null ? Math.max(0, total - (deposit || 0)) : null;
      const r = db.prepare(`INSERT INTO bookings(
        ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,quote_amount,notes,tags,lat,lng,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        ref, hashToken(accessKey), body.type || calc.type, status, json(customer), json(calc.pricedItems),
        cleanText(body.slot, 40) || null, total, deposit, balance,
        body.quoteAmount != null && body.quoteAmount !== "" ? Number(body.quoteAmount) : null,
        cleanText(body.notes, 4000), cleanText(body.tags, 300), coords.lat, coords.lng, now(), now()
      );
      audit(session.user_id, "booking.created.admin", "booking", r.lastInsertRowid, { ref });
      return sendJson(res, 201, { id: r.lastInsertRowid, ref, key: accessKey });
    }

    const adminBooking = /^\/api\/admin\/bookings\/(\d+)$/.exec(url.pathname);
    if (method === "PATCH" && adminBooking) {
      const body = await readBody(req);
      const row = db.prepare("SELECT * FROM bookings WHERE id=?").get(Number(adminBooking[1]));
      if (!row) return sendJson(res, 404, { error: "Dossier introuvable" });

      let status = cleanText(body.status ?? row.status, 80);
      let slot = body.slot === undefined ? row.slot : (cleanText(body.slot, 40) || null);
      const notes = cleanText(body.notes ?? row.notes, 4000);
      const tags = cleanText(body.tags ?? row.tags, 400);
      const quote = body.quoteAmount === "" || body.quoteAmount == null ? row.quote_amount : Math.max(0, Number(body.quoteAmount));
      let total = row.total, deposit = row.deposit, balance = row.balance;

      // Action: Send custom quote to client
      if (body.action === "sendQuote" && Number.isFinite(quote)) {
        status = "Devis envoyé";
        const cust = parseJson(row.customer_json, {});
        db.prepare("INSERT INTO conversations(booking_id,recipient,subject,channel,direction,body,status,created_at) VALUES(?,?,?,'email','outbound',?,'queued',?)")
          .run(row.id, cust.email || "", `Votre devis CARPEO ${row.ref}`, `Bonjour ${cust.prenom || ""}, votre devis personnalisé CARPEO pour le dossier ${row.ref} s'élève à ${quote} € TTC. Consultez et acceptez votre devis depuis votre espace suivi.`, now());
      }

      // Action: Transform accepted quote into scheduled intervention
      if (body.action === "convertToIntervention") {
        status = "Planifié";
        const finalAmount = Number.isFinite(quote) && quote > 0 ? quote : Number(row.total || 0);
        if (finalAmount > 0 && row.total == null) {
          total = finalAmount;
          deposit = Math.min(pricingPayload().deposit, finalAmount);
          balance = Math.max(0, finalAmount - deposit);
        }
        const cust = parseJson(row.customer_json, {});
        db.prepare("INSERT INTO tasks(booking_id,title,due_at,status,assignee,priority,created_at) VALUES(?,?,?,?,?,?,?)")
          .run(row.id, `Intervention ${row.ref} — ${cust.prenom || ""} ${cust.nom || ""} (${cust.ville || ""})`, slot ? slot.replace(" ", "T") : null, "À faire", "Équipe terrain", "Haute", now());
      }

      db.prepare("UPDATE bookings SET status=?,slot=?,notes=?,tags=?,quote_amount=?,total=?,deposit=?,balance=?,updated_at=? WHERE id=?")
        .run(status, slot, notes, tags, Number.isFinite(quote) ? quote : null, total, deposit, balance, now(), row.id);
      audit(session.user_id, "booking.updated", "booking", row.id, { status, slot, quote, action: body.action });
      queueAutomations();
      return sendJson(res, 200, { ok: true, status, slot });
    }

    if (method === "DELETE" && adminBooking) {
      db.prepare("DELETE FROM bookings WHERE id=?").run(Number(adminBooking[1]));
      audit(session.user_id, "booking.deleted", "booking", adminBooking[1]);
      return sendJson(res, 200, { ok: true });
    }

    // CRM Contacts
    if (method === "GET" && url.pathname === "/api/admin/contacts") {
      return sendJson(res, 200, { contacts: buildUnifiedContacts() });
    }
    if (method === "POST" && url.pathname === "/api/admin/contacts") {
      const body = await readBody(req);
      const name = cleanText(body.name, 160), email = cleanText(body.email, 200).toLowerCase();
      if (!name || !validEmail(email)) return sendJson(res, 422, { error: "Nom et e-mail valides requis" });
      const r = db.prepare("INSERT INTO contacts(name,email,phone,address,city,postal_code,need,message,status,tags,notes,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(name, email, cleanText(body.phone, 60), cleanText(body.address, 300), cleanText(body.city, 120), cleanText(body.postal_code, 20), cleanText(body.need, 120), cleanText(body.message, 2000), cleanText(body.status || "Nouveau", 60), cleanText(body.tags, 300), cleanText(body.notes, 4000), cleanText(body.source || "Manuel", 80), now(), now());
      audit(session.user_id, "contact.created.admin", "contact", r.lastInsertRowid);
      return sendJson(res, 201, { id: r.lastInsertRowid });
    }
    const adminContact = /^\/api\/admin\/contacts\/(\d+)$/.exec(url.pathname);
    if (method === "PATCH" && adminContact) {
      const body = await readBody(req);
      const row = db.prepare("SELECT * FROM contacts WHERE id=?").get(Number(adminContact[1]));
      if (!row) return sendJson(res, 404, { error: "Contact introuvable" });
      db.prepare("UPDATE contacts SET name=?,email=?,phone=?,address=?,city=?,postal_code=?,status=?,tags=?,notes=?,updated_at=? WHERE id=?")
        .run(
          cleanText(body.name ?? row.name, 160),
          cleanText(body.email ?? row.email, 200).toLowerCase(),
          cleanText(body.phone ?? row.phone, 60),
          cleanText(body.address ?? row.address, 300),
          cleanText(body.city ?? row.city, 120),
          cleanText(body.postal_code ?? row.postal_code, 20),
          cleanText(body.status ?? row.status, 60),
          cleanText(body.tags ?? row.tags, 300),
          cleanText(body.notes ?? row.notes, 4000),
          now(),
          row.id
        );
      audit(session.user_id, "contact.updated", "contact", row.id);
      return sendJson(res, 200, { ok: true });
    }
    if (method === "DELETE" && adminContact) {
      db.prepare("DELETE FROM contacts WHERE id=?").run(Number(adminContact[1]));
      audit(session.user_id, "contact.deleted", "contact", adminContact[1]);
      return sendJson(res, 200, { ok: true });
    }

    // Omnichannel Conversations
    if (method === "GET" && url.pathname === "/api/admin/conversations") {
      const rows = db.prepare(`
        SELECT conversations.*, bookings.ref AS booking_ref, contacts.name AS contact_name, contacts.email AS contact_email, contacts.phone AS contact_phone
        FROM conversations
        LEFT JOIN bookings ON bookings.id = conversations.booking_id
        LEFT JOIN contacts ON contacts.id = conversations.contact_id
        ORDER BY conversations.created_at DESC LIMIT 500
      `).all();
      return sendJson(res, 200, { conversations: rows });
    }
    if (method === "POST" && url.pathname === "/api/admin/conversations") {
      const body = await readBody(req);
      const direction = body.direction === "inbound" ? "inbound" : "outbound";
      const status = direction === "inbound" ? "reçu" : "queued";
      const result = db.prepare("INSERT INTO conversations(booking_id,contact_id,recipient,subject,channel,direction,body,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(body.bookingId || null, body.contactId || null, cleanText(body.recipient, 200), cleanText(body.subject, 200), cleanText(body.channel || "email", 40), direction, cleanText(body.body, 4000), status, now());
      audit(session.user_id, "conversation.created", "conversation", result.lastInsertRowid, { channel: body.channel, direction });
      dispatchQueues(true).catch(() => {});
      return sendJson(res, 201, { id: result.lastInsertRowid });
    }
    const adminConv = /^\/api\/admin\/conversations\/(\d+)$/.exec(url.pathname);
    if (method === "PATCH" && adminConv) {
      const body = await readBody(req);
      db.prepare("UPDATE conversations SET status=? WHERE id=?").run(cleanText(body.status || "lu", 40), Number(adminConv[1]));
      return sendJson(res, 200, { ok: true });
    }

    // Tasks & Blocked Slots & Route Optimization
    if (method === "GET" && url.pathname === "/api/admin/tasks") {
      const tasks = db.prepare("SELECT tasks.*, bookings.ref AS booking_ref FROM tasks LEFT JOIN bookings ON bookings.id=tasks.booking_id ORDER BY due_at IS NULL, due_at").all();
      const blockedSlots = db.prepare("SELECT * FROM blocked_slots ORDER BY slot_start DESC").all();
      return sendJson(res, 200, { tasks, blockedSlots });
    }
    if (method === "POST" && url.pathname === "/api/admin/tasks") {
      const body = await readBody(req);
      const result = db.prepare("INSERT INTO tasks(booking_id,title,due_at,status,assignee,priority,created_at) VALUES(?,?,?,?,?,?,?)")
        .run(body.bookingId || null, cleanText(body.title, 300), cleanText(body.dueAt, 40) || null, cleanText(body.status || "À faire", 40), cleanText(body.assignee || "Équipe", 120), cleanText(body.priority || "Normale", 40), now());
      audit(session.user_id, "task.created", "task", result.lastInsertRowid);
      return sendJson(res, 201, { id: result.lastInsertRowid });
    }
    const adminTask = /^\/api\/admin\/tasks\/(\d+)$/.exec(url.pathname);
    if (method === "PATCH" && adminTask) {
      const body = await readBody(req);
      const row = db.prepare("SELECT * FROM tasks WHERE id=?").get(Number(adminTask[1]));
      if (!row) return sendJson(res, 404, { error: "Tâche introuvable" });
      db.prepare("UPDATE tasks SET status=?,assignee=?,priority=?,title=? WHERE id=?")
        .run(cleanText(body.status ?? row.status, 40), cleanText(body.assignee ?? row.assignee, 120), cleanText(body.priority ?? row.priority, 40), cleanText(body.title ?? row.title, 300), row.id);
      return sendJson(res, 200, { ok: true });
    }
    if (method === "DELETE" && adminTask) {
      db.prepare("DELETE FROM tasks WHERE id=?").run(Number(adminTask[1]));
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/admin/blocked-slots") {
      return sendJson(res, 200, { blockedSlots: db.prepare("SELECT * FROM blocked_slots ORDER BY slot_start DESC").all() });
    }
    if (method === "POST" && url.pathname === "/api/admin/blocked-slots") {
      const body = await readBody(req);
      const result = db.prepare("INSERT INTO blocked_slots(slot_start,slot_end,reason,created_at) VALUES(?,?,?,?)")
        .run(cleanText(body.start, 40), cleanText(body.end || body.start, 40), cleanText(body.reason || "Indisponible", 300), now());
      audit(session.user_id, "slot.blocked", "blocked_slot", result.lastInsertRowid);
      return sendJson(res, 201, { id: result.lastInsertRowid });
    }
    const adminBlocked = /^\/api\/admin\/blocked-slots\/(\d+)$/.exec(url.pathname);
    if (method === "DELETE" && adminBlocked) {
      db.prepare("DELETE FROM blocked_slots WHERE id=?").run(Number(adminBlocked[1]));
      audit(session.user_id, "slot.unblocked", "blocked_slot", adminBlocked[1]);
      return sendJson(res, 200, { ok: true });
    }

    // Route calculation & optimization (Leaflet + OSM/OSRM)
    if (method === "POST" && url.pathname === "/api/admin/optimize-route") {
      const body = await readBody(req);
      const dateFilter = cleanText(body.date || "", 20);
      let rows = db.prepare("SELECT * FROM bookings WHERE status NOT IN ('Annulé') AND slot IS NOT NULL ORDER BY slot").all();
      if (dateFilter) rows = rows.filter((r) => String(r.slot || "").startsWith(dateFilter));
      if (!rows.length) rows = db.prepare("SELECT * FROM bookings WHERE status NOT IN ('Annulé') LIMIT 10").all();

      const points = [];
      for (const r of rows) {
        const cust = parseJson(r.customer_json, {});
        let lat = r.lat, lng = r.lng;
        if (lat == null || lng == null) {
          const geo = await geocodeAddress(cust);
          lat = geo.lat; lng = geo.lng;
          db.prepare("UPDATE bookings SET lat=?,lng=? WHERE id=?").run(lat, lng, r.id);
        }
        points.push({ id: r.id, ref: r.ref, status: r.status, slot: r.slot, customer: cust, items: parseJson(r.items_json, []), lat, lng });
      }

      // Nearest-Neighbor TSP starting from CARPEO base
      const baseLat = Number(db.prepare("SELECT value FROM settings WHERE key='base_lat'").get()?.value || 48.8566);
      const baseLng = Number(db.prepare("SELECT value FROM settings WHERE key='base_lng'").get()?.value || 2.3522);
      const remaining = [...points];
      const ordered = [];
      let curLat = baseLat, curLng = baseLng;
      let totalKm = 0, totalMinutes = 0;

      while (remaining.length) {
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const d = haversineKm(curLat, curLng, remaining[i].lat, remaining[i].lng);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const next = remaining.splice(bestIdx, 1)[0];
        const legMinutes = Math.max(8, Math.round((bestDist / 26) * 60)); // ~26 km/h urban speed
        totalKm = Math.round((totalKm + bestDist) * 10) / 10;
        totalMinutes += legMinutes;
        const orderNum = ordered.length + 1;
        db.prepare("UPDATE bookings SET route_order=? WHERE id=?").run(orderNum, next.id);
        ordered.push({ ...next, routeOrder: orderNum, legKm: bestDist, legMinutes });
        curLat = next.lat; curLng = next.lng;
      }

      return sendJson(res, 200, {
        base: { lat: baseLat, lng: baseLng, label: "Départ CARPEO" },
        totalKm,
        totalMinutes,
        stops: ordered
      });
    }

    // Payments & Refunds
    if (method === "GET" && url.pathname === "/api/admin/payments") {
      const rows = db.prepare(`
        SELECT payments.*, bookings.ref AS booking_ref, bookings.customer_json, bookings.total AS booking_total, bookings.balance AS booking_balance
        FROM payments
        LEFT JOIN bookings ON bookings.id = payments.booking_id
        ORDER BY payments.created_at DESC LIMIT 300
      `).all().map((p) => ({
        ...p,
        customer: parseJson(p.customer_json, {}),
        customer_json: undefined
      }));
      return sendJson(res, 200, { payments: rows, stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY) });
    }
    if (method === "POST" && url.pathname === "/api/admin/payments") {
      const body = await readBody(req);
      const booking = db.prepare("SELECT * FROM bookings WHERE id=? OR ref=?").get(Number(body.bookingId || 0), cleanText(body.ref, 40).toUpperCase());
      if (!booking) return sendJson(res, 404, { error: "Dossier introuvable" });
      const kind = body.kind === "balance" ? "balance" : "deposit";
      const amount = Math.max(0.01, Number(body.amount || (kind === "balance" ? booking.balance : booking.deposit) || 20));
      const pid = `pay_${crypto.randomBytes(6).toString("hex")}`;
      const r = db.prepare("INSERT INTO payments(booking_id,provider_id,kind,amount,status,method,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
        .run(booking.id, pid, kind, amount, cleanText(body.status || "paid", 30), cleanText(body.method || "stripe", 40), now(), now());
      if (kind === "deposit" && booking.status === "Acompte à régler") {
        db.prepare("UPDATE bookings SET status='Confirmé', updated_at=? WHERE id=?").run(now(), booking.id);
      } else if (kind === "balance") {
        db.prepare("UPDATE bookings SET balance=MAX(0, COALESCE(balance,0) - ?), updated_at=? WHERE id=?").run(amount, now(), booking.id);
      }
      audit(session.user_id, "payment.recorded", "payment", r.lastInsertRowid, { ref: booking.ref, amount, kind });
      return sendJson(res, 201, { id: r.lastInsertRowid });
    }
    const adminRefund = /^\/api\/admin\/payments\/(\d+)\/refund$/.exec(url.pathname);
    if (method === "POST" && adminRefund) {
      const pay = db.prepare("SELECT * FROM payments WHERE id=?").get(Number(adminRefund[1]));
      if (!pay) return sendJson(res, 404, { error: "Paiement introuvable" });
      if (process.env.STRIPE_SECRET_KEY && pay.provider_id && pay.provider_id.startsWith("pi_") && !pay.provider_id.startsWith("pi_sim_")) {
        const resp = await fetch("https://api.stripe.com/v1/refunds", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ payment_intent: pay.provider_id })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return sendJson(res, 502, { error: err.error?.message || "Erreur remboursement Stripe" });
        }
      }
      db.prepare("UPDATE payments SET status='refunded', updated_at=? WHERE id=?").run(now(), pay.id);
      audit(session.user_id, "payment.refunded", "payment", pay.id, { amount: pay.amount });
      return sendJson(res, 200, { ok: true });
    }

    // Reviews & Automations
    if (method === "GET" && url.pathname === "/api/admin/reviews") {
      const rows = db.prepare("SELECT reviews.*, bookings.ref AS booking_ref FROM reviews LEFT JOIN bookings ON bookings.id=reviews.booking_id ORDER BY reviews.created_at DESC").all();
      return sendJson(res, 200, { reviews: rows });
    }
    if (method === "POST" && url.pathname === "/api/admin/reviews") {
      const body = await readBody(req);
      const r = db.prepare("INSERT INTO reviews(booking_id,customer_name,rating,comment,reply,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
        .run(body.bookingId || null, cleanText(body.customerName || "Client CARPEO", 120), Math.min(5, Math.max(1, Number(body.rating) || 5)), cleanText(body.comment, 2000), cleanText(body.reply, 2000), cleanText(body.status || "Publié", 40), now(), now());
      audit(session.user_id, "review.created", "review", r.lastInsertRowid);
      return sendJson(res, 201, { id: r.lastInsertRowid });
    }
    const adminReview = /^\/api\/admin\/reviews\/(\d+)$/.exec(url.pathname);
    if (method === "PATCH" && adminReview) {
      const body = await readBody(req);
      const row = db.prepare("SELECT * FROM reviews WHERE id=?").get(Number(adminReview[1]));
      if (!row) return sendJson(res, 404, { error: "Avis introuvable" });
      db.prepare("UPDATE reviews SET reply=?,status=?,rating=?,comment=?,updated_at=? WHERE id=?")
        .run(cleanText(body.reply ?? row.reply, 2000), cleanText(body.status ?? row.status, 40), Math.min(5, Math.max(1, Number(body.rating ?? row.rating))), cleanText(body.comment ?? row.comment, 2000), now(), row.id);
      audit(session.user_id, "review.updated", "review", row.id);
      return sendJson(res, 200, { ok: true });
    }
    if (method === "DELETE" && adminReview) {
      db.prepare("DELETE FROM reviews WHERE id=?").run(Number(adminReview[1]));
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/admin/automations") {
      const notifications = db.prepare("SELECT notifications.*, bookings.ref AS booking_ref FROM notifications LEFT JOIN bookings ON bookings.id=notifications.booking_id ORDER BY send_at DESC LIMIT 200").all()
        .map((n) => ({ ...n, payload: parseJson(n.payload_json, {}), payload_json: undefined }));
      return sendJson(res, 200, { notifications });
    }
    if (method === "POST" && url.pathname === "/api/admin/automations/run") {
      const queued = queueAutomations();
      const dispatched = await dispatchQueues(true);
      audit(session.user_id, "automations.executed", "system", null, { queued, dispatched });
      return sendJson(res, 200, { ok: true, queued, dispatched });
    }

    // Pricing, Users, Settings, Audit, Exports
    if (method === "GET" && url.pathname === "/api/admin/pricing") return sendJson(res, 200, pricingPayload());
    if (method === "PUT" && url.pathname === "/api/admin/pricing") {
      const body = await readBody(req);
      const update = db.prepare("UPDATE pricing SET mode=?,price=?,updated_at=? WHERE key=?");
      for (const [key, value] of Object.entries(body.items || {})) {
        if (PRICES[key]) update.run(value.mode === "price" ? "price" : "quote", Math.max(0, Number(value.price) || 0), now(), key);
      }
      if (body.deposit != null) {
        db.prepare("UPDATE settings SET value=?,updated_at=? WHERE key='deposit'").run(String(Math.max(0, Number(body.deposit) || 0)), now());
      }
      audit(session.user_id, "pricing.updated", "pricing", null);
      return sendJson(res, 200, pricingPayload());
    }

    if (method === "GET" && url.pathname === "/api/admin/audit") {
      return sendJson(res, 200, { audit: db.prepare("SELECT audit.*,users.email FROM audit LEFT JOIN users ON users.id=audit.user_id ORDER BY audit.created_at DESC LIMIT 500").all() });
    }
    if (method === "GET" && url.pathname === "/api/admin/users") {
      return sendJson(res, 200, { users: db.prepare("SELECT id,email,name,role,created_at FROM users ORDER BY name").all() });
    }
    if (method === "POST" && url.pathname === "/api/admin/users") {
      const body = await readBody(req), email = cleanText(body.email, 200).toLowerCase(), password = String(body.password || ""), role = ["admin", "team", "readonly"].includes(body.role) ? body.role : "readonly";
      if (!validEmail(email) || password.length < 12 || !cleanText(body.name, 120)) return sendJson(res, 422, { error: "Nom, e-mail et mot de passe de 12 caractères requis" });
      const salt = crypto.randomBytes(16).toString("hex");
      try {
        const result = db.prepare("INSERT INTO users(email,name,role,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)")
          .run(email, cleanText(body.name, 120), role, salt, passwordHash(password, salt), now());
        audit(session.user_id, "user.created", "user", result.lastInsertRowid, { role });
        return sendJson(res, 201, { id: result.lastInsertRowid });
      } catch {
        return sendJson(res, 409, { error: "Cet e-mail existe déjà" });
      }
    }
    const adminUser = /^\/api\/admin\/users\/(\d+)$/.exec(url.pathname);
    if (method === "PATCH" && adminUser) {
      const body = await readBody(req);
      const role = ["admin", "team", "readonly"].includes(body.role) ? body.role : "readonly";
      db.prepare("UPDATE users SET role=? WHERE id=?").run(role, Number(adminUser[1]));
      audit(session.user_id, "user.updated", "user", adminUser[1], { role });
      return sendJson(res, 200, { ok: true });
    }
    if (method === "DELETE" && adminUser) {
      const targetId = Number(adminUser[1]);
      if (targetId === session.user_id) return sendJson(res, 400, { error: "Vous ne pouvez pas supprimer votre propre compte actif" });
      db.prepare("DELETE FROM users WHERE id=?").run(targetId);
      audit(session.user_id, "user.deleted", "user", targetId);
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/admin/settings") {
      return sendJson(res, 200, {
        settings: Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map((x) => [x.key, x.value])),
        envStatus: {
          supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
          stripe: Boolean(process.env.STRIPE_SECRET_KEY),
          emailWebhook: Boolean(process.env.EMAIL_WEBHOOK_URL),
          smsWebhook: Boolean(process.env.SMS_WEBHOOK_URL),
          whatsappWebhook: Boolean(process.env.WHATSAPP_WEBHOOK_URL),
          instagramWebhook: Boolean(process.env.INSTAGRAM_WEBHOOK_URL)
        }
      });
    }
    if (method === "PUT" && url.pathname === "/api/admin/settings") {
      const body = await readBody(req);
      const allowedKeys = ["area", "hours", "maps_url", "base_address", "base_lat", "base_lng", "auto_reminder_j1", "auto_quote_followup", "auto_review_request", "gtm_id", "ga4_id", "meta_pixel_id", "google_ads_id"];
      for (const [key, value] of Object.entries(body.settings || {})) {
        if (allowedKeys.includes(key)) {
          db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
            .run(key, cleanText(value, 500), now());
        }
      }
      audit(session.user_id, "settings.updated", "settings", null);
      return sendJson(res, 200, { ok: true });
    }
    if (method === "POST" && url.pathname === "/api/admin/backup") {
      const file = await backupDatabase();
      audit(session.user_id, "backup.created", "database", path.basename(file));
      return sendJson(res, 201, { file: path.basename(file) });
    }
    if (method === "GET" && url.pathname === "/api/admin/export.csv") {
      const rows = db.prepare("SELECT * FROM bookings ORDER BY created_at DESC").all();
      const csv = [
        "reference,type,status,nom,prenom,email,telephone,adresse,code_postal,ville,creneau,total,acompte,solde,devis_montant,tags,cree_le",
        ...rows.map((row) => {
          const c = parseJson(row.customer_json, {});
          return [row.ref, row.type, row.status, c.nom, c.prenom, c.email, c.tel, c.adresse, c.cp, c.ville, row.slot, row.total, row.deposit, row.balance, row.quote_amount, row.tags, row.created_at]
            .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",");
        })
      ].join("\r\n");
      return sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": "attachment; filename=carpeo-dossiers.csv" });
    }
    if (method === "GET" && url.pathname === "/api/admin/calendar.ics") {
      const rows = db.prepare("SELECT ref,slot,status,notes,customer_json FROM bookings WHERE slot IS NOT NULL AND status!='Annulé'").all();
      const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CARPEO//Planning//FR", "X-WR-CALNAME:CARPEO Interventions"];
      for (const row of rows) {
        const c = parseJson(row.customer_json, {});
        const cleanSlot = row.slot.replace(/[-: ]/g, "");
        const start = cleanSlot.slice(0, 8) + "T" + (cleanSlot.slice(8, 12) || "0800") + "00";
        const endHour = String(Math.min(22, Number(cleanSlot.slice(8, 10) || 8) + 2)).padStart(2, "0");
        const end = cleanSlot.slice(0, 8) + "T" + endHour + (cleanSlot.slice(10, 12) || "00") + "00";
        lines.push(
          "BEGIN:VEVENT",
          `UID:${row.ref}@carpeo.fr`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          `SUMMARY:CARPEO [${row.status}] - ${c.prenom || ""} ${c.nom || "Client"}`,
          `DESCRIPTION:${cleanText(row.notes || "", 200)} - Tel: ${c.tel || ""}`,
          `LOCATION:${[c.adresse, c.cp, c.ville].filter(Boolean).join(" ")}`,
          "END:VEVENT"
        );
      }
      lines.push("END:VCALENDAR");
      return sendText(res, 200, lines.join("\r\n"), "text/calendar; charset=utf-8", { "Content-Disposition": "attachment; filename=carpeo-planning.ics" });
    }
  }
  return sendJson(res, 404, { error: "Route introuvable" });
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};
async function staticFile(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(ROOT, "." + pathname);
  if (!file.startsWith(ROOT + path.sep) || file.startsWith(DATA_DIR + path.sep)) return sendText(res, 403, "Interdit");
  try {
    const info = await stat(file);
    if (!info.isFile()) return sendText(res, 404, "Introuvable");
    const data = await readFile(file);
    securityHeaders(res);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": pathname.startsWith("/assets/") ? "public,max-age=86400" : "no-cache"
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Introuvable");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : "Erreur interne" });
    else res.end();
  }
});

queueAutomations();
setInterval(queueAutomations, 15 * 60 * 1000).unref();
dispatchQueues();
setInterval(dispatchQueues, 60 * 1000).unref();
setInterval(() => backupDatabase().catch(console.error), 24 * 60 * 60 * 1000).unref();

if (process.env.CARPEO_NO_LISTEN !== "1") {
  server.listen(PORT, HOST, () => {
    console.log(`CARPEO backend running at http://${HOST}:${PORT}`);
  });
}

export { server, db, pricingPayload, calculate, api };
