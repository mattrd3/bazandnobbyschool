import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_URL = (process.env.SITE_URL || "https://bazandnobbyschool.pages.dev").replace(/\/$/, "");
const ADMIN_PIN = process.env.ADMIN_PIN || "2727";
const args = new Map(process.argv.slice(2).map(a => a.startsWith("--") ? a.slice(2).split("=") : [a, true]));
const minutes = Number(args.get("minutes") || 60);
const intervalMs = Number(args.get("intervalMs") || 750);
const RUN_ID = `SOAK${Date.now()}`;
const PIN = "1111";
const TEST_DATES = ["2099-06-01","2099-06-02","2099-06-03","2099-06-04","2099-06-05"];
const PLAYERS = Array.from({length:12}, (_,i)=>`${RUN_ID}-P${String(i+1).padStart(2,"0")}`);
const expected = new Map(TEST_DATES.map(d => [d, { players: new Set(), locked: false, competition: "", removed: false }]));
const stats = { iterations:0, failures:0, responses:[], operations:{} };
function inc(k){ stats.operations[k]=(stats.operations[k]||0)+1; }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
async function get(path) { const t=Date.now(); const res=await fetch(`${SITE_URL}${path}`); stats.responses.push(Date.now()-t); const body=await res.json().catch(()=>({})); return { status:res.status, body }; }
async function post(path,payload){ const t=Date.now(); const res=await fetch(`${SITE_URL}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); stats.responses.push(Date.now()-t); const body=await res.json().catch(()=>({})); return { status:res.status, body }; }
async function cleanup(){ for(const d of TEST_DATES) await post("/api/admin/delete-day", {dateKey:d, adminPin:ADMIN_PIN}).catch(()=>{}); }
async function seedPins(){ for(const p of PLAYERS) await post("/api/admin/player-pin", {adminPin:ADMIN_PIN, name:p, pin:PIN}); }
function assertNoDuplicates(arr){ assert.equal(arr.length, new Set(arr).size, `duplicates: ${arr.join(",")}`); }
function assertExpectedDay(dateKey, day){ const e=expected.get(dateKey); if(e.removed) return; const got=new Set((day.players||[]).filter(p=>p.startsWith(RUN_ID))); assertNoDuplicates(day.players||[]); assert.equal("maybes" in day, false, "maybes should not exist in v15 data"); assert.deepEqual([...got].sort(), [...e.players].sort(), `players mismatch for ${dateKey}`); }
async function verifyRandom(){ const r=await get("/api/schedule"); assert.equal(r.body.ok,true); for(const d of TEST_DATES) assertExpectedDay(d, r.body.schedule[d] || {players:[], competition:""}); inc("verify"); }
async function opTogglePublic(){ const dateKey=pick(TEST_DATES.filter(d=>!expected.get(d).locked)); const player=pick(PLAYERS); const e=expected.get(dateKey); const before=e.players.has(player); const status=before?"none":"playing"; const r=await post("/api/player-status", {dateKey,name:player,status,playerName:player,playerPin:PIN,competition:e.competition||"Soak Test"}); assert.equal(r.body.ok,true); before ? e.players.delete(player) : e.players.add(player); inc(status==="playing"?"public add":"public remove"); }
async function opAdminAdd(){ const dateKey=pick(TEST_DATES); const player=pick(PLAYERS); const e=expected.get(dateKey); const r=await post("/api/admin/add-player", {dateKey,name:player,adminPin:ADMIN_PIN,competition:e.competition||"Soak Admin"}); assert.equal(r.body.ok,true); e.players.add(player); inc("admin add"); }
async function opAdminRemove(){ const dateKey=pick(TEST_DATES); const e=expected.get(dateKey); const player=e.players.size?pick([...e.players]):pick(PLAYERS); const r=await post("/api/admin/remove-player", {dateKey,name:player,adminPin:ADMIN_PIN}); assert.equal(r.body.ok,true); e.players.delete(player); inc("admin remove"); }
async function opCompetition(){ const dateKey=pick(TEST_DATES); const comp=`Soak ${Math.floor(Math.random()*1000)}`; const r=await post("/api/admin/competition", {dateKey,competition:comp,adminPin:ADMIN_PIN}); assert.equal(r.body.ok,true); expected.get(dateKey).competition=comp; inc("competition"); }
async function opAdminLock(){ const dateKey=pick(TEST_DATES); const r=await post("/api/admin/lock", {dateKey,locked:true,adminPin:ADMIN_PIN}); assert.equal(r.body.ok,true); expected.get(dateKey).locked=true; inc("admin lock"); }
async function opAdminUnlock(){ const dateKey=pick(TEST_DATES); const r=await post("/api/admin/lock", {dateKey,locked:false,adminPin:ADMIN_PIN}); assert.equal(r.body.ok,true); expected.get(dateKey).locked=false; inc("admin unlock"); }
async function opLockedCheck(){ const locked=TEST_DATES.filter(d=>expected.get(d).locked); if(!locked.length) return; const dateKey=pick(locked), player=pick(PLAYERS); const r=await post("/api/player-status", {dateKey,name:player,status:"playing",playerName:player,playerPin:PIN}); assert.equal(r.status,403); inc("locked check"); }
const ops=[opTogglePublic,opTogglePublic,opAdminAdd,opAdminRemove,opCompetition,opAdminLock,opAdminUnlock,opLockedCheck];
console.log(`Starting soak test against ${SITE_URL} for ${minutes} minute(s). Run id: ${RUN_ID}`);
await cleanup(); await seedPins(); const end=Date.now()+minutes*60*1000;
try { while(Date.now()<end){ try{ await pick(ops)(); stats.iterations++; if(stats.iterations%10===0) await verifyRandom(); } catch(e){ stats.failures++; console.error("FAIL", e.message); } await new Promise(r=>setTimeout(r,intervalMs)); } await verifyRandom(); }
finally { await cleanup(); }
const avg=stats.responses.reduce((a,b)=>a+b,0)/(stats.responses.length||1); const report={runId:RUN_ID, site:SITE_URL, minutes, iterations:stats.iterations, failures:stats.failures, averageResponseMs:Math.round(avg), slowestResponseMs:Math.max(0,...stats.responses), operations:stats.operations, finishedAt:new Date().toISOString()};
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const reportDir=path.join(__dirname,"reports"); fs.mkdirSync(reportDir,{recursive:true}); const out=path.join(reportDir,`soak-${RUN_ID}.json`); fs.writeFileSync(out, JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2)); console.log(`Report written to ${out}`); if(stats.failures) process.exit(1);
