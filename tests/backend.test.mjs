import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("backend health, auth, pricing and booking", async (t) => {
  const data = await mkdtemp(path.join(path.resolve("."), "test-data-"));
  const port = 19000 + (process.pid % 1000);
  const child = spawn(process.execPath, ["server.mjs"], { cwd: path.resolve("."), env: { ...process.env, PORT: String(port), CARPEO_DATA_DIR: data, CARPEO_ADMIN_PASSWORD: "Test-password-2026!" }, stdio: "inherit" });
  t.after(async () => { child.kill(); await once(child,"exit"); await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let health,lastError;
  for (let i=0;i<40;i++) { try { health=await fetch(`http://127.0.0.1:${port}/api/health`); if(health.ok)break; } catch (error) { lastError=error; } await new Promise(r=>setTimeout(r,100)); }
  if (!health && lastError) throw lastError;
  assert.equal(health?.status, 200);
  const pricing=await (await fetch(`http://127.0.0.1:${port}/api/pricing`)).json(); assert.equal(pricing.deposit,20); assert.equal(pricing.items.sofa3Straight.price,99);
  const login=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@carpeo.local",password:"Test-password-2026!"})});assert.equal(login.status,200);assert.match(login.headers.get("set-cookie"),/HttpOnly/);
  const auth=await login.json();
  const cookie=login.headers.get("set-cookie").split(";")[0];
  const adminHeaders={"Content-Type":"application/json","Cookie":cookie,"X-CSRF-Token":auth.csrf};
  const slots=await (await fetch(`http://127.0.0.1:${port}/api/slots`)).json();
  const blockedDate=slots.days[1].date;
  const block=await fetch(`http://127.0.0.1:${port}/api/admin/blocked-slots`,{method:"POST",headers:adminHeaders,body:JSON.stringify({start:blockedDate,end:blockedDate,reason:"Congé test"})});
  assert.equal(block.status,201);
  const slotsAfterBlock=await (await fetch(`http://127.0.0.1:${port}/api/slots`)).json();
  assert.ok(slotsAfterBlock.days.find((day)=>day.date===blockedDate).slots.every((slot)=>slot.available===false));
  const pricingUpdate=await fetch(`http://127.0.0.1:${port}/api/admin/pricing`,{method:"PUT",headers:adminHeaders,body:JSON.stringify({deposit:30,items:{sofa3Straight:{mode:"price",price:123}}})});
  assert.equal(pricingUpdate.status,200);
  const pricingAfterUpdate=await (await fetch(`http://127.0.0.1:${port}/api/pricing`)).json();
  assert.equal(pricingAfterUpdate.deposit,30);assert.equal(pricingAfterUpdate.items.sofa3Straight.price,123);
  const booking=await fetch(`http://127.0.0.1:${port}/api/bookings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:[{cat:"canape",places:"3",config:"droit",qty:"1"}],customer:{nom:"Test",prenom:"Client",email:"client@example.com",tel:"0600000000",adresse:"1 rue Test",cp:"75001",ville:"Paris"},slot:slots.days[0].slots[0].value,advance:"non"})});
  assert.equal(booking.status,201);const saved=await booking.json();assert.match(saved.ref,/^CAR-/);assert.equal(saved.total,123);assert.equal(saved.deposit,30);
  const blockedBooking=await fetch(`http://127.0.0.1:${port}/api/bookings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:[{cat:"canape",places:"3",config:"droit",qty:"1"}],customer:{nom:"Test",prenom:"Bloqué",email:"blocked@example.com",tel:"0600000001",adresse:"2 rue Test",cp:"75001",ville:"Paris"},slot:blockedDate+" 11:00",advance:"non"})});
  assert.equal(blockedBooking.status,409);
});
