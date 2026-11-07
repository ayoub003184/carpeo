import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/[...path].mjs";

test("Vercel API refuses to start without Supabase secrets", async () => {
  const headers={};let payload="";
  const req={url:"/api/health",method:"GET",headers:{},[Symbol.asyncIterator]:async function*(){}};
  const res={statusCode:0,setHeader(k,v){headers[k]=v;},end(v){payload=v||"";}};
  await handler(req,res);
  assert.equal(res.statusCode,503);
  assert.match(payload,/Supabase/);
});
