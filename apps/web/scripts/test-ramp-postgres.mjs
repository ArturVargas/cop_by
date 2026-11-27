// Explicit isolated PostgreSQL integration test. Never uses DATABASE_URL or production credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const require = createRequire(import.meta.url);
const container = process.env.RAMP_TEST_CONTAINER;
if (!container || !/^copby-ramp-test-[a-z0-9-]+$/.test(container)) throw new Error("Set RAMP_TEST_CONTAINER to a disposable copby-ramp-test-* PostgreSQL container");
const appRoot = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "copby-ramp-postgres-"));
symlinkSync(join(appRoot,"node_modules"),join(temporary,"node_modules"),"dir");
const { buildSync } = require(require.resolve("esbuild", { paths: [require.resolve("wrangler")] }));
function psql(input) { return execFileSync("docker", ["exec", "-i", container, "psql", "-Xq", "--csv", "--pset=footer=off", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "ramp_test"], { input, encoding: "utf8" }); }
function csv(input) {
  const rows=[];let row=[],field="",quoted=false;
  for(let i=0;i<input.length;i++) { const c=input[i]; if(c==='"') {if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')) {row.push(field);field="";if(c==='\n'){rows.push(row);row=[];}}else field+=c; }
  if(field||row.length){row.push(field);rows.push(row);}const headers=rows.shift()??[];
  return rows.filter(row=>row.length===headers.length).map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]===""?null:key==="version"?Number(row[i]):["relevant","processed"].includes(key)?row[i]==="t":row[i]])));
}
// psql test transport for the exact tagged SQL used by Neon in production.
const literal=value=>value===null?"NULL":typeof value==="number"?String(value):typeof value==="boolean"?String(value):"'"+String(value).replaceAll("'","''")+"'";
const sql=async(strings,...values)=>csv(psql(strings.reduce((query,part,i)=>query+part+(i<values.length?literal(values[i]):""),"")));
try {
  buildSync({entryPoints:[join(appRoot,"src/lib/ramp/repository.ts"),join(appRoot,"src/lib/ramp/codec.ts"),join(appRoot,"src/lib/ramp/service.ts"),join(appRoot,"src/lib/ramp/providers/mock.ts")],outdir:temporary,outbase:join(appRoot,"src/lib/ramp"),bundle:true,platform:"node",format:"cjs",packages:"external",alias:{"@":join(appRoot,"src")},logLevel:"silent"});
  const {PostgresRampRepository}=require(join(temporary,"repository.js")),{RampCodec}=require(join(temporary,"codec.js")),{RampService}=require(join(temporary,"service.js")),{MockRampProvider}=require(join(temporary,"providers/mock.js"));
  // The named test database is deliberately disposable. Migration must be repeatable.
  psql("DROP TABLE IF EXISTS ramp_webhook_events, ramp_operation_events, ramp_operations CASCADE;");
  const migration=readFileSync(join(appRoot,"migrations/001_ramp.sql"),"utf8");psql(migration);psql(migration);
  const codec=new RampCodec(Buffer.alloc(32,9).toString("base64")),repo=new PostgresRampRepository(sql,codec),provider=new MockRampProvider(),service=new RampService(repo,()=>provider,codec);
  const request={provider:"mock",network:"testnet",sourceAddress:"GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I",amount:"15",pixKey:"private'key@example.com",thirdParty:true,kycUserId:"11111111-1111-4111-8111-111111111111"};
  const operation=await service.create("alice","postgres-key",request);
  assert.equal(operation.state,"quoted");assert.equal((await service.create("alice","postgres-key",request)).id,operation.id);
  assert.equal(await repo.get("bob",operation.id),null);
  const a=await repo.get("alice",operation.id),b=await repo.get("alice",operation.id);a.version++;b.version++;a.state="awaiting_funding";b.state="failed";
  assert.equal(await repo.save(a,a.version-1),true);assert.equal(await repo.save(b,b.version-1),false);
  assert.equal((await repo.get("alice",operation.id)).state,"awaiting_funding");
  const data=psql("SELECT encrypted_data FROM ramp_operations;");assert.ok(!data.includes(request.pixKey));
  const event={id:"webhook-1",digest:"a".repeat(64),actionId:operation.quote.providerActionId,relevant:true};
  await repo.inbox("mock",event);await repo.inbox("mock",event);assert.equal((await repo.pendingEvents(10)).length,1);
  await assert.rejects(()=>repo.inbox("mock",{...event,digest:"b".repeat(64)}));
  assert.equal((await repo.byAction("mock",event.actionId)).id,operation.id);await repo.completeEvent("mock",event.id);assert.equal((await repo.pendingEvents(10)).length,0);
  assert.equal((await repo.candidates(10)).length,1);
  const second=await service.create("alice","postgres-key-2",{...request,pixKey:"other@example.com"});
  const firstAttempt=await repo.candidates(1),nextAttempt=await repo.candidates(1);
  assert.notEqual(firstAttempt[0].id,nextAttempt[0].id);assert.deepEqual(new Set([firstAttempt[0].id,nextAttempt[0].id]),new Set([operation.id,second.id])); // Fair rotation without a successful provider call.
  assert.equal(csv(psql("SELECT COUNT(*) AS total FROM ramp_operation_events;"))[0].total,"5");
  const lookups=[];
  provider.getStatus=async(_request,quote)=>{lookups.push(quote.providerQuoteId);if(quote.providerQuoteId===operation.quote.providerQuoteId)throw new Error("Provider unavailable");return {state:"processing",observedAt:Date.now()};};
  await service.reconcileBatch(1);await service.reconcileBatch(1);
  assert.equal(new Set(lookups).size,2);assert.equal((await repo.get("alice",second.id)).state,"processing");
  console.log("PostgreSQL integration passed: repeatable migration, encrypted snapshot, owner isolation, idempotency, CAS/audit and durable webhook deduplication.");
} finally { rmSync(temporary,{recursive:true,force:true}); }
