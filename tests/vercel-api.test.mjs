import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/[...path].mjs";
import indexHandler from "../api/index.mjs";
import rootHandler from "../index.mjs";

async function callApi(url, method = "GET", bodyObj = null, headers = {}) {
  const resHeaders = {};
  let payload = "";
  const req = {
    url,
    method,
    headers,
    body: bodyObj,
    [Symbol.asyncIterator]: async function* () {}
  };
  const res = {
    statusCode: 0,
    setHeader(k, v) { resHeaders[k] = v; },
    end(v) { payload = v || ""; }
  };
  await handler(req, res);
  return { status: res.statusCode, headers: resHeaders, data: payload ? JSON.parse(payload) : null };
}

test("Vercel API works end-to-end with fallback store, slots, vacation blocking, and reviews", async () => {
  const health = await callApi("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const login = await callApi("/api/auth/login", "POST", { email: "admin@carpeo.local", password: "CarpeoAdmin2026!" });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);
  const authHeaders = { "x-admin-token": login.data.token, "x-csrf-token": login.data.csrf };

  const initialSlots = await callApi("/api/slots");
  assert.equal(initialSlots.status, 200);
  assert.ok(initialSlots.data.days.length >= 10);
  const targetDay = initialSlots.data.days[2].date;

  // Block a vacation day in Admin
  const blockRes = await callApi("/api/admin/blocked-slots", "POST", { start: targetDay, end: targetDay, reason: "Congé" }, authHeaders);
  assert.equal(blockRes.status, 201);

  // Verify slots on targetDay are now unavailable
  const afterBlockSlots = await callApi("/api/slots");
  const blockedDayObj = afterBlockSlots.data.days.find((d) => d.date === targetDay);
  assert.ok(blockedDayObj);
  assert.ok(blockedDayObj.slots.every((s) => s.available === false));

  // Unblock and verify available again
  await callApi(`/api/admin/blocked-slots/${blockRes.data.id}`, "DELETE", null, authHeaders);
  const afterUnblockSlots = await callApi("/api/slots");
  const unblockedDayObj = afterUnblockSlots.data.days.find((d) => d.date === targetDay);
  assert.ok(unblockedDayObj.slots.some((s) => s.available === true));

  // Verify Google reviews endpoint
  const reviews = await callApi("/api/reviews");
  assert.equal(reviews.status, 200);
  assert.ok(reviews.data.reviews.length >= 3);

  // Update prices and hours in Admin and verify /api/pricing reflects them
  const updPricing = await callApi("/api/admin/pricing", "PUT", { deposit: 25, items: { sofa2Straight: { mode: "price", price: 95 } } }, authHeaders);
  assert.equal(updPricing.status, 200);
  const updSettings = await callApi("/api/admin/settings", "PUT", { settings: { hours: "Lundi au samedi, 8 h à 20 h", area: "Intervention à domicile" } }, authHeaders);
  assert.equal(updSettings.status, 200);

  const pubPricing = await callApi("/api/pricing");
  assert.equal(pubPricing.status, 200);
  assert.equal(pubPricing.data.deposit, 25);
  assert.equal(pubPricing.data.items.sofa2Straight.price, 95);
  assert.equal(pubPricing.data.hours, "Lundi au samedi, 8 h à 20 h");
  assert.ok(pubPricing.data.updatedAt > 0);

  // Send a client message from website contact form and verify it appears in Admin Inbox & CRM
  const contactRes = await callApi("/api/contact", "POST", {
    name: "Nadia Mansouri",
    email: "nadia.mansouri@example.fr",
    phone: "06 99 88 77 66",
    need: "Canapé",
    message: "Bonjour, pouvez-vous intervenir samedi matin pour un canapé d'angle blanc ?"
  });
  assert.equal(contactRes.status, 201);

  const adminConvs = await callApi("/api/admin/conversations", "GET", null, authHeaders);
  assert.equal(adminConvs.status, 200);
  const foundMsg = adminConvs.data.conversations.find((c) => c.contact_email === "nadia.mansouri@example.fr");
  assert.ok(foundMsg);
  assert.equal(foundMsg.contact_name, "Nadia Mansouri");
  assert.equal(foundMsg.channel, "form");
  assert.equal(foundMsg.direction, "inbound");

  const adminContacts = await callApi("/api/admin/contacts", "GET", null, authHeaders);
  assert.equal(adminContacts.status, 200);
  assert.ok(adminContacts.data.contacts.some((c) => c.email === "nadia.mansouri@example.fr"));

  // Verify api/index.mjs works identically
  let indexStatus = 0, indexPayload = "";
  await indexHandler({ url: "/api/health", method: "GET", headers: {}, [Symbol.asyncIterator]: async function* () {} }, {
    statusCode: 0,
    setHeader() {},
    end(v) { indexPayload = v || ""; }
  });
  const indexData = JSON.parse(indexPayload);
  assert.equal(indexData.ok, true);

  // Verify root index.mjs serves root HTML, clean URLs, and API
  async function callRoot(url) {
    let status = 200, payload = "", headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      end(v) { payload = v || ""; }
    };
    await rootHandler({ url, method: "GET", headers: {}, [Symbol.asyncIterator]: async function* () {} }, res);
    return { status: res.statusCode, headers, payload: payload.toString() };
  }

  const rootRes = await callRoot("/");
  assert.equal(rootRes.status, 200);
  assert.ok(rootRes.headers["content-type"].includes("text/html"));
  assert.ok(rootRes.payload.includes("CARPEO"));

  const tarifsRes = await callRoot("/tarifs");
  assert.equal(tarifsRes.status, 200);
  assert.ok(tarifsRes.headers["content-type"].includes("text/html"));

  const cssRes = await callRoot("/css/styles.css");
  assert.equal(cssRes.status, 200);
  assert.ok(cssRes.headers["content-type"].includes("text/css"));

  const apiRes = await callRoot("/api/health");
  assert.equal(apiRes.status, 200);
  assert.ok(apiRes.payload.includes('"ok":true'));
});
