import http from "node:http";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
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
const SESSION_HOURS = 12;
const MAX_BODY = 24 * 1024 * 1024;

await Promise.all([mkdir(DATA_DIR, { recursive: true }), mkdir(UPLOAD_DIR, { recursive: true }), mkdir(BACKUP_DIR, { recursive: true })]);

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
  quote_amount REAL, notes TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT DEFAULT '',
  need TEXT DEFAULT '', message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Nouveau', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL, channel TEXT NOT NULL,
  direction TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  title TEXT NOT NULL, due_at TEXT, status TEXT NOT NULL DEFAULT 'À faire', assignee TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocked_slots (
  id INTEGER PRIMARY KEY, slot_start TEXT NOT NULL, slot_end TEXT NOT NULL, reason TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, template TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
  send_at TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(booking_id, channel, template, send_at)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id TEXT UNIQUE, kind TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, name TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, meta_json TEXT NOT NULL, created_at TEXT NOT NULL
);
`);

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
db.prepare("INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES('deposit','20',?)").run(now());
db.prepare("INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES('area','Paris et ses alentours — Île-de-France',?)").run(now());

function passwordHash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
}
function safeEqualHex(a, b) {
  try { return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); } catch { return false; }
}
function hashToken(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function cleanText(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function json(value) { return JSON.stringify(value ?? null); }
function parseJson(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }

const adminEmail = cleanText(process.env.CARPEO_ADMIN_EMAIL || "admin@carpeo.local", 200).toLowerCase();
if (!db.prepare("SELECT id FROM users LIMIT 1").get() && process.env.CARPEO_ADMIN_PASSWORD) {
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("INSERT INTO users(email,name,role,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)")
    .run(adminEmail, "Administrateur CARPEO", "admin", salt, passwordHash(process.env.CARPEO_ADMIN_PASSWORD, salt), now());
}

function pricingPayload() {
  const items = {};
  for (const row of db.prepare("SELECT key,label,group_name,mode,price FROM pricing ORDER BY group_name,label").all()) {
    items[row.key] = { label: row.label, group: row.group_name, mode: row.mode, price: row.price };
  }
  return { deposit: Number(db.prepare("SELECT value FROM settings WHERE key='deposit'").get()?.value || 20), items };
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
const PROMOS = { BIENVENUE10: ["pct",10], CARPEO20: ["eur",20], FIDELITE15: ["pct",15], NOEL2026: ["pct",10] };
function calculate(items, advance, promoCode = "") {
  const prices = pricingPayload();
  const linePrices = items.map((item) => itemPrice(item, prices));
  const quote = linePrices.some((value) => value == null);
  if (quote) return { type: "devis", total: null, deposit: null, balance: null };
  const base = Math.round(linePrices.reduce((sum, value) => sum + value, 0) * 100) / 100;
  const promo = PROMOS[cleanText(promoCode, 50).toUpperCase()];
  const discount = promo ? (promo[0] === "pct" ? Math.round(base * promo[1]) / 100 : Math.min(base, promo[1])) : 0;
  const total = Math.round((base - discount) * 100) / 100;
  const due = advance === "oui" ? Math.round(total * 50) / 100 : total;
  const deposit = Math.min(prices.deposit, due);
  return { type: "reservation", total, deposit, balance: advance === "oui" ? due : Math.round((due - deposit) * 100) / 100, discount };
}

function stripeEvent(buffer, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw Object.assign(new Error("Webhook Stripe non configuré"), { status: 503 });
  const parts = Object.fromEntries(String(signature).split(",").map((x) => x.split("=")));
  const timestamp = Number(parts.t); if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) throw Object.assign(new Error("Signature Stripe expirée"), { status: 400 });
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
function allowed(req, limit = 120) {
  const key = `${req.socket.remoteAddress || "local"}:${new URL(req.url, "http://localhost").pathname}`;
  const minute = Math.floor(Date.now() / 60000);
  const record = rate.get(key);
  if (!record || record.minute !== minute) { rate.set(key, { minute, count: 1 }); return true; }
  record.count += 1;
  return record.count <= limit;
}
function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' https://js.stripe.com https://www.googletagmanager.com; connect-src 'self' https://api.stripe.com https://www.google-analytics.com; frame-src https://js.stripe.com https://hooks.stripe.com; base-uri 'self'; form-action 'self'");
}
function sendJson(res, status, data, extra = {}) {
  securityHeaders(res); for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  const body = JSON.stringify(data); res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) }); res.end(body);
}
function sendText(res, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  securityHeaders(res); for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body) }); res.end(body);
}
async function readBody(req, raw = false) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error("Payload trop volumineux"), { status: 413 }); chunks.push(chunk); }
  const buffer = Buffer.concat(chunks);
  if (raw) return buffer;
  if (!buffer.length) return {};
  try { return JSON.parse(buffer.toString("utf8")); } catch { throw Object.assign(new Error("JSON invalide"), { status: 400 }); }
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function safePublicBooking(row) {
  return { ref: row.ref, type: row.type, status: row.status, items: parseJson(row.items_json, []), slot: row.slot, total: row.total, deposit: row.deposit, balance: row.balance, quoteAmount: row.quote_amount, created: row.created_at, updated: row.updated_at };
}

async function storePhotos(bookingId, photos) {
  if (!Array.isArray(photos) || !photos.length) return [];
  const dir = path.join(UPLOAD_DIR, String(bookingId)); await mkdir(dir, { recursive: true });
  const saved = [];
  for (const photo of photos.slice(0, 16)) {
    const type = ["image/jpeg", "image/png", "image/webp"].includes(photo.type) ? photo.type : null;
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(photo.data || "");
    if (!type || !match) continue;
    const data = Buffer.from(match[2], "base64"); if (data.length > 5 * 1024 * 1024) continue;
    const ext = match[1] === "jpeg" ? "jpg" : match[1]; const name = `${crypto.randomUUID()}.${ext}`;
    await writeFile(path.join(dir, name), data); saved.push(name);
  }
  return saved;
}

function availableSlots(from = new Date()) {
  const booked = new Set(db.prepare("SELECT slot FROM bookings WHERE slot IS NOT NULL AND status NOT IN ('Annulé','Terminé')").all().map((x) => x.slot));
  const blocked = db.prepare("SELECT slot_start FROM blocked_slots").all().map((x) => x.slot_start);
  blocked.forEach((x) => booked.add(x));
  const result = [];
  for (let d = 1; d <= 12; d++) {
    const date = new Date(from); date.setDate(from.getDate() + d); if (date.getDay() === 0) continue;
    const iso = date.toISOString().slice(0, 10);
    result.push({ date: iso, slots: ["08:00", "11:00", "14:00", "17:00"].map((time) => ({ value: `${iso} ${time}`, available: !booked.has(`${iso} ${time}`) })) });
  }
  return result;
}

async function backupDatabase() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const target = path.join(BACKUP_DIR, `carpeo-${stamp}.sqlite`);
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`); return target;
}

async function stripeIntent(booking) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw Object.assign(new Error("Stripe n’est pas configuré"), { status: 503 });
  const params = new URLSearchParams({ amount: String(Math.round(booking.deposit * 100)), currency: "eur", "metadata[booking_id]": String(booking.id), "metadata[ref]": booking.ref, description: `Acompte CARPEO ${booking.ref}` });
  const response = await fetch("https://api.stripe.com/v1/payment_intents", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error?.message || "Erreur Stripe"), { status: 502 });
  db.prepare("INSERT OR REPLACE INTO payments(booking_id,provider_id,kind,amount,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(booking.id, data.id, "deposit", booking.deposit, data.status, now(), now());
  return { clientSecret: data.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "" };
}

function queueAutomations() {
  const rows = db.prepare("SELECT id,ref,status,slot,customer_json,updated_at FROM bookings").all();
  const insert = db.prepare("INSERT OR IGNORE INTO notifications(booking_id,channel,template,status,send_at,payload_json,created_at) VALUES(?,?,?,?,?,?,?)");
  for (const row of rows) {
    const customer = parseJson(row.customer_json, {});
    if (row.slot) {
      const sendAt = new Date(row.slot.replace(" ", "T") + ":00"); sendAt.setDate(sendAt.getDate() - 1);
      insert.run(row.id, customer.pref || "email", "reminder-j1", "queued", sendAt.toISOString(), json({ ref: row.ref, customer }), now());
    }
    if (row.type === "devis" && !["Accepté", "Refusé", "Terminé"].includes(row.status)) {
      const sendAt = new Date(row.updated_at); sendAt.setDate(sendAt.getDate() + 2);
      insert.run(row.id, customer.pref || "email", "quote-followup", "queued", sendAt.toISOString(), json({ ref: row.ref, customer }), now());
    }
    if (row.status === "Terminé") {
      const sendAt = new Date(row.updated_at); sendAt.setDate(sendAt.getDate() + 1);
      insert.run(row.id, customer.pref || "email", "review-request", "queued", sendAt.toISOString(), json({ ref: row.ref, customer }), now());
    }
  }
}

const CHANNEL_WEBHOOKS = { email: process.env.EMAIL_WEBHOOK_URL, sms: process.env.SMS_WEBHOOK_URL, whatsapp: process.env.WHATSAPP_WEBHOOK_URL, instagram: process.env.INSTAGRAM_WEBHOOK_URL };
async function dispatchQueues() {
  for (const item of db.prepare("SELECT * FROM notifications WHERE status='queued' AND send_at<=? ORDER BY send_at LIMIT 25").all(now())) {
    const endpoint = CHANNEL_WEBHOOKS[item.channel] || CHANNEL_WEBHOOKS.email;
    if (!endpoint) continue;
    try { const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: json({ template: item.template, ...parseJson(item.payload_json, {}) }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); db.prepare("UPDATE notifications SET status='sent' WHERE id=?").run(item.id); }
    catch (error) { db.prepare("UPDATE notifications SET status='error' WHERE id=?").run(item.id); }
  }
  for (const item of db.prepare("SELECT * FROM conversations WHERE direction='outbound' AND status='queued' ORDER BY created_at LIMIT 25").all()) {
    const endpoint = CHANNEL_WEBHOOKS[item.channel]; if (!endpoint) continue;
    try { const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: json(item) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); db.prepare("UPDATE conversations SET status='sent' WHERE id=?").run(item.id); }
    catch { db.prepare("UPDATE conversations SET status='error' WHERE id=?").run(item.id); }
  }
}

async function api(req, res, url) {
  if (!allowed(req, url.pathname === "/api/auth/login" ? 10 : 120)) return sendJson(res, 429, { error: "Trop de requêtes" });
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: true, database: true, time: now() });
  if (method === "GET" && url.pathname === "/api/pricing") return sendJson(res, 200, pricingPayload());
  if (method === "GET" && url.pathname === "/api/slots") return sendJson(res, 200, { days: availableSlots() });

  if (method === "POST" && url.pathname === "/api/stripe/webhook") {
    const event = stripeEvent(await readBody(req, true), req.headers["stripe-signature"]);
    const intent = event.data?.object;
    if (intent?.id) {
      const status = event.type === "payment_intent.succeeded" ? "paid" : intent.status || event.type;
      db.prepare("UPDATE payments SET status=?,updated_at=? WHERE provider_id=?").run(status, now(), intent.id);
      if (event.type === "payment_intent.succeeded") db.prepare("UPDATE bookings SET status='Confirmé',updated_at=? WHERE id=(SELECT booking_id FROM payments WHERE provider_id=?)").run(now(), intent.id);
    }
    return sendJson(res, 200, { received: true });
  }

  if (method === "POST" && url.pathname === "/api/contact") {
    const body = await readBody(req); const name = cleanText(body.name, 160), email = cleanText(body.email, 200).toLowerCase(), message = cleanText(body.message, 4000);
    if (!name || !validEmail(email) || !message) return sendJson(res, 422, { error: "Nom, e-mail et message valides requis" });
    const result = db.prepare("INSERT INTO contacts(name,email,phone,need,message,status,created_at) VALUES(?,?,?,?,?,'Nouveau',?)").run(name, email, cleanText(body.phone, 60), cleanText(body.need, 120), message, now());
    db.prepare("INSERT INTO conversations(contact_id,channel,direction,body,status,created_at) VALUES(?,?,'inbound',?,'reçu',?)").run(result.lastInsertRowid, "form", message, now());
    audit(null, "contact.created", "contact", result.lastInsertRowid); return sendJson(res, 201, { ok: true });
  }

  if (method === "POST" && url.pathname === "/api/bookings") {
    const body = await readBody(req); const items = Array.isArray(body.items) ? body.items.slice(0, 20) : []; const customer = body.customer || {};
    const email = cleanText(customer.email, 200).toLowerCase();
    if (!items.length || !cleanText(customer.nom, 120) || !cleanText(customer.prenom, 120) || !validEmail(email) || !cleanText(customer.tel, 60) || !cleanText(customer.adresse, 300) || !cleanText(customer.cp, 10) || !cleanText(customer.ville, 120)) return sendJson(res, 422, { error: "Informations client ou prestations incomplètes" });
    customer.email = email; const calc = calculate(items, body.advance, body.promo);
    if (calc.type === "reservation" && !cleanText(body.slot, 30)) return sendJson(res, 422, { error: "Créneau requis" });
    if (calc.type === "reservation") {
      const used = db.prepare("SELECT id FROM bookings WHERE slot=? AND status NOT IN ('Annulé','Terminé')").get(cleanText(body.slot, 30));
      if (used) return sendJson(res, 409, { error: "Ce créneau vient d’être réservé" });
    }
    const ref = `CAR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`; const accessKey = crypto.randomBytes(8).toString("base64url").toUpperCase(); const timestamp = now();
    const result = db.prepare("INSERT INTO bookings(ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,promo,advance,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(ref, hashToken(accessKey), calc.type, calc.type === "devis" ? "Demande reçue" : "Acompte à régler", json(customer), json(items), calc.type === "reservation" ? cleanText(body.slot, 30) : null, calc.total, calc.deposit, calc.balance, cleanText(body.promo, 50), cleanText(body.advance, 10), timestamp, timestamp);
    const savedPhotos = await storePhotos(result.lastInsertRowid, body.photos); audit(null, "booking.created", "booking", result.lastInsertRowid, { ref, photos: savedPhotos.length });
    queueAutomations(); return sendJson(res, 201, { ref, key: accessKey, ...calc, status: calc.type === "devis" ? "Demande reçue" : "Acompte à régler" });
  }

  const bookingMatch = /^\/api\/bookings\/([^/]+)$/.exec(url.pathname);
  if (method === "GET" && bookingMatch) {
    const row = db.prepare("SELECT * FROM bookings WHERE ref=?").get(cleanText(decodeURIComponent(bookingMatch[1]), 40).toUpperCase()); const key = cleanText(url.searchParams.get("key"), 100);
    if (!row || !safeEqualHex(row.access_key_hash, hashToken(key))) return sendJson(res, 404, { error: "Dossier introuvable" });
    return sendJson(res, 200, safePublicBooking(row));
  }
  if (method === "POST" && /^\/api\/bookings\/[^/]+\/accept$/.test(url.pathname)) {
    const ref = decodeURIComponent(url.pathname.split("/")[3]).toUpperCase(); const body = await readBody(req); const row = db.prepare("SELECT * FROM bookings WHERE ref=?").get(ref);
    if (!row || !safeEqualHex(row.access_key_hash, hashToken(cleanText(body.key, 100)))) return sendJson(res, 404, { error: "Dossier introuvable" });
    if (row.type !== "devis" || row.quote_amount == null) return sendJson(res, 409, { error: "Aucun devis à accepter" });
    db.prepare("UPDATE bookings SET status='Accepté',total=?,deposit=?,balance=?,updated_at=? WHERE id=?").run(row.quote_amount, Math.min(pricingPayload().deposit, row.quote_amount), Math.max(0, row.quote_amount - pricingPayload().deposit), now(), row.id);
    audit(null, "quote.accepted", "booking", row.id); return sendJson(res, 200, { ok: true });
  }
  if (method === "POST" && url.pathname === "/api/payments/create-intent") {
    const body = await readBody(req); const row = db.prepare("SELECT * FROM bookings WHERE ref=?").get(cleanText(body.ref, 40).toUpperCase());
    if (!row || !safeEqualHex(row.access_key_hash, hashToken(cleanText(body.key, 100))) || !row.deposit) return sendJson(res, 404, { error: "Dossier introuvable" });
    return sendJson(res, 200, await stripeIntent(row));
  }
  if (method === "POST" && url.pathname === "/api/events") {
    const body = await readBody(req); db.prepare("INSERT INTO events(name,payload_json,created_at) VALUES(?,?,?)").run(cleanText(body.name, 120), json(body.params || {}), now()); return sendJson(res, 202, { ok: true });
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req); const email = cleanText(body.email, 200).toLowerCase(); const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    if (!user || !safeEqualHex(user.password_hash, passwordHash(String(body.password || ""), user.salt))) return sendJson(res, 401, { error: "Identifiants incorrects" });
    const token = crypto.randomBytes(32).toString("base64url"), csrf = crypto.randomBytes(24).toString("base64url"), expires = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now()); db.prepare("INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)").run(hashToken(token), user.id, csrf, expires, now());
    audit(user.id, "auth.login", "user", user.id); return sendJson(res, 200, { user: { email: user.email, name: user.name, role: user.role }, csrf }, { "Set-Cookie": `carpeo_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}` });
  }
  if (method === "GET" && url.pathname === "/api/auth/me") {
    const session = requireAdmin(req, res); if (!session) return; return sendJson(res, 200, { user: { email: session.email, name: session.name, role: session.role }, csrf: session.csrf });
  }
  if (method === "POST" && url.pathname === "/api/auth/logout") {
    const session = requireAdmin(req, res, true); if (!session) return; db.prepare("DELETE FROM sessions WHERE token_hash=?").run(session.token_hash); return sendJson(res, 200, { ok: true }, { "Set-Cookie": "carpeo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }

  if (url.pathname.startsWith("/api/admin/")) {
    const mutating = !["GET", "HEAD"].includes(method); const session = requireAdmin(req, res, mutating); if (!session) return;
    if (mutating && session.role === "readonly") return sendJson(res, 403, { error: "Accès en lecture seule" });
    if (mutating && ["/api/admin/users","/api/admin/settings","/api/admin/pricing","/api/admin/backup"].includes(url.pathname) && session.role !== "admin") return sendJson(res, 403, { error: "Droits administrateur requis" });
    if (method === "GET" && url.pathname === "/api/admin/dashboard") {
      const counts = db.prepare("SELECT status,COUNT(*) count FROM bookings GROUP BY status").all();
      const money = db.prepare("SELECT COALESCE(SUM(total),0) revenue,COALESCE(SUM(deposit),0) deposits,COALESCE(SUM(balance),0) balances,COALESCE(AVG(total),0) average FROM bookings WHERE type='reservation'").get();
      const contacts = db.prepare("SELECT COUNT(*) count FROM contacts").get().count; const conversion = db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status IN ('Accepté','Confirmé','Planifié','Terminé') THEN 1 ELSE 0 END) won FROM bookings").get();
      return sendJson(res, 200, { counts, money, contacts, conversion: conversion.total ? Math.round((conversion.won || 0) / conversion.total * 1000) / 10 : 0 });
    }
    if (method === "GET" && url.pathname === "/api/admin/bookings") {
      const rows = db.prepare("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500").all().map((row) => ({ ...row, customer: parseJson(row.customer_json, {}), items: parseJson(row.items_json, []), customer_json: undefined, items_json: undefined, access_key_hash: undefined })); return sendJson(res, 200, { bookings: rows });
    }
    const adminBooking = /^\/api\/admin\/bookings\/(\d+)$/.exec(url.pathname);
    if (method === "PATCH" && adminBooking) {
      const body = await readBody(req); const row = db.prepare("SELECT * FROM bookings WHERE id=?").get(Number(adminBooking[1])); if (!row) return sendJson(res, 404, { error: "Dossier introuvable" });
      const status = cleanText(body.status ?? row.status, 80), slot = cleanText(body.slot ?? row.slot, 40) || null, notes = cleanText(body.notes ?? row.notes, 4000), quote = body.quoteAmount === "" || body.quoteAmount == null ? row.quote_amount : Math.max(0, Number(body.quoteAmount));
      db.prepare("UPDATE bookings SET status=?,slot=?,notes=?,quote_amount=?,updated_at=? WHERE id=?").run(status, slot, notes, Number.isFinite(quote) ? quote : null, now(), row.id); audit(session.user_id, "booking.updated", "booking", row.id, { status, slot, quote }); queueAutomations(); return sendJson(res, 200, { ok: true });
    }
    if (method === "GET" && url.pathname === "/api/admin/contacts") return sendJson(res, 200, { contacts: db.prepare("SELECT * FROM contacts ORDER BY created_at DESC LIMIT 500").all() });
    if (method === "GET" && url.pathname === "/api/admin/conversations") return sendJson(res, 200, { conversations: db.prepare("SELECT * FROM conversations ORDER BY created_at DESC LIMIT 500").all() });
    if (method === "POST" && url.pathname === "/api/admin/conversations") {
      const body = await readBody(req); const result = db.prepare("INSERT INTO conversations(booking_id,contact_id,channel,direction,body,status,created_at) VALUES(?,?,?,'outbound',?,'queued',?)").run(body.bookingId || null, body.contactId || null, cleanText(body.channel, 40), cleanText(body.body, 4000), now()); audit(session.user_id, "conversation.queued", "conversation", result.lastInsertRowid); return sendJson(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "GET" && url.pathname === "/api/admin/tasks") return sendJson(res, 200, { tasks: db.prepare("SELECT * FROM tasks ORDER BY due_at IS NULL,due_at").all() });
    if (method === "POST" && url.pathname === "/api/admin/tasks") {
      const body = await readBody(req); const result = db.prepare("INSERT INTO tasks(booking_id,title,due_at,status,assignee,created_at) VALUES(?,?,?,?,?,?)").run(body.bookingId || null, cleanText(body.title, 300), cleanText(body.dueAt, 40) || null, cleanText(body.status || "À faire", 40), cleanText(body.assignee, 120), now()); audit(session.user_id, "task.created", "task", result.lastInsertRowid); return sendJson(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "GET" && url.pathname === "/api/admin/pricing") return sendJson(res, 200, pricingPayload());
    if (method === "PUT" && url.pathname === "/api/admin/pricing") {
      const body = await readBody(req); const update = db.prepare("UPDATE pricing SET mode=?,price=?,updated_at=? WHERE key=?");
      for (const [key, value] of Object.entries(body.items || {})) if (PRICES[key]) update.run(value.mode === "price" ? "price" : "quote", Math.max(0, Number(value.price) || 0), now(), key);
      if (body.deposit != null) db.prepare("UPDATE settings SET value=?,updated_at=? WHERE key='deposit'").run(String(Math.max(0, Number(body.deposit) || 0)), now()); audit(session.user_id, "pricing.updated", "pricing", null); return sendJson(res, 200, pricingPayload());
    }
    if (method === "POST" && url.pathname === "/api/admin/blocked-slots") {
      const body = await readBody(req); const result = db.prepare("INSERT INTO blocked_slots(slot_start,slot_end,reason,created_at) VALUES(?,?,?,?)").run(cleanText(body.start, 40), cleanText(body.end || body.start, 40), cleanText(body.reason, 300), now()); audit(session.user_id, "slot.blocked", "blocked_slot", result.lastInsertRowid); return sendJson(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "GET" && url.pathname === "/api/admin/audit") return sendJson(res, 200, { audit: db.prepare("SELECT audit.*,users.email FROM audit LEFT JOIN users ON users.id=audit.user_id ORDER BY audit.created_at DESC LIMIT 500").all() });
    if (method === "GET" && url.pathname === "/api/admin/users") return sendJson(res, 200, { users: db.prepare("SELECT id,email,name,role,created_at FROM users ORDER BY name").all() });
    if (method === "POST" && url.pathname === "/api/admin/users") {
      const body = await readBody(req), email = cleanText(body.email, 200).toLowerCase(), password = String(body.password || ""), role = ["admin","team","readonly"].includes(body.role) ? body.role : "readonly";
      if (!validEmail(email) || password.length < 12 || !cleanText(body.name,120)) return sendJson(res, 422, { error: "Nom, e-mail et mot de passe de 12 caractères requis" });
      const salt = crypto.randomBytes(16).toString("hex");
      try { const result=db.prepare("INSERT INTO users(email,name,role,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)").run(email,cleanText(body.name,120),role,salt,passwordHash(password,salt),now()); audit(session.user_id,"user.created","user",result.lastInsertRowid,{role}); return sendJson(res,201,{id:result.lastInsertRowid}); }
      catch { return sendJson(res,409,{error:"Cet e-mail existe déjà"}); }
    }
    if (method === "GET" && url.pathname === "/api/admin/settings") return sendJson(res, 200, { settings: Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value])) });
    if (method === "PUT" && url.pathname === "/api/admin/settings") { const body=await readBody(req); for(const [key,value] of Object.entries(body.settings||{})) if(["area"].includes(key)) db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key,cleanText(value,500),now()); audit(session.user_id,"settings.updated","settings",null); return sendJson(res,200,{ok:true}); }
    if (method === "POST" && url.pathname === "/api/admin/backup") { const file = await backupDatabase(); audit(session.user_id, "backup.created", "database", path.basename(file)); return sendJson(res, 201, { file: path.basename(file) }); }
    if (method === "GET" && url.pathname === "/api/admin/export.csv") {
      const rows = db.prepare("SELECT * FROM bookings ORDER BY created_at DESC").all(); const csv = ["reference,type,status,nom,prenom,email,telephone,ville,creneau,total,acompte,solde,cree_le", ...rows.map((row) => { const c = parseJson(row.customer_json, {}); return [row.ref,row.type,row.status,c.nom,c.prenom,c.email,c.tel,c.ville,row.slot,row.total,row.deposit,row.balance,row.created_at].map((v) => `"${String(v ?? "").replaceAll('"','""')}"`).join(","); })].join("\r\n"); return sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": "attachment; filename=carpeo-dossiers.csv" });
    }
    if (method === "GET" && url.pathname === "/api/admin/calendar.ics") {
      const rows = db.prepare("SELECT ref,slot,customer_json FROM bookings WHERE slot IS NOT NULL AND status!='Annulé'").all(); const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//CARPEO//Planning//FR"];
      for (const row of rows) { const c = parseJson(row.customer_json, {}), start = row.slot.replace(/[-: ]/g, "").slice(0, 13) + "00"; lines.push("BEGIN:VEVENT",`UID:${row.ref}@carpeo.fr`,`DTSTART:${start}`,`DTEND:${start}`,`SUMMARY:CARPEO - ${c.nom || "Client"}`,`LOCATION:${[c.adresse,c.cp,c.ville].filter(Boolean).join(" ")}`,"END:VEVENT"); }
      lines.push("END:VCALENDAR"); return sendText(res, 200, lines.join("\r\n"), "text/calendar; charset=utf-8", { "Content-Disposition": "attachment; filename=carpeo-planning.ics" });
    }
  }
  return sendJson(res, 404, { error: "Route introuvable" });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
async function staticFile(req, res, url) {
  let pathname = decodeURIComponent(url.pathname); if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(ROOT, "." + pathname); if (!file.startsWith(ROOT + path.sep) || file.startsWith(DATA_DIR + path.sep)) return sendText(res, 403, "Interdit");
  try {
    const info = await stat(file); if (!info.isFile()) return sendText(res, 404, "Introuvable"); const data = await readFile(file); securityHeaders(res); res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": data.length, "Cache-Control": pathname.startsWith("/assets/") ? "public,max-age=86400" : "no-cache" }); res.end(data);
  } catch { sendText(res, 404, "Introuvable"); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try { if (url.pathname.startsWith("/api/")) await api(req, res, url); else await staticFile(req, res, url); }
  catch (error) { console.error(error); if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : "Erreur interne" }); else res.end(); }
});

queueAutomations(); setInterval(queueAutomations, 15 * 60 * 1000).unref();
dispatchQueues(); setInterval(dispatchQueues, 60 * 1000).unref();
setInterval(() => backupDatabase().catch(console.error), 24 * 60 * 60 * 1000).unref();
server.listen(PORT, HOST, () => {
  console.log(`CARPEO backend running at http://${HOST}:${PORT}`);
  if (!db.prepare("SELECT id FROM users LIMIT 1").get()) console.warn("No admin account. Restart once with CARPEO_ADMIN_PASSWORD set.");
});

export { server, db, pricingPayload, calculate };
