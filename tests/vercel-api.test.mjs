import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/[...path].mjs";

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
});
