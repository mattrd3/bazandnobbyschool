const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const ADMIN_PIN = "2727";
const PIN_CONFIG_KEY = "__config_member_pins__";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function normaliseDateKey(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const oldSheetKey = s.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/);
  if (oldSheetKey) {
    const months = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
    return `${oldSheetKey[3]}-${String(months[oldSheetKey[1]]).padStart(2, "0")}-${String(Number(oldSheetKey[2])).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return s;
}
function parseDateKeyParts(dateKey) { const key = normaliseDateKey(dateKey); const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? { y:+m[1], m:+m[2], d:+m[3] } : null; }
function londonOffsetMinutesAtUtc(utcMillis) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/London", timeZoneName:"shortOffset", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }).formatToParts(new Date(utcMillis));
  const name = (parts.find(p => p.type === "timeZoneName") || {}).value || "GMT";
  const match = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/); if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (+match[2] * 60 + +(match[3] || 0));
}
function londonLocalDateTimeToUtcMillis(y, month, day, hour, minute) { let utc = Date.UTC(y, month-1, day, hour, minute, 0, 0); for (let i=0;i<2;i++) utc = Date.UTC(y, month-1, day, hour, minute, 0, 0) - londonOffsetMinutesAtUtc(utc)*60000; return utc; }
function signupCutoffUtcMillis(dateKey) { const p = parseDateKeyParts(dateKey); if (!p) return null; const cd = new Date(Date.UTC(p.y,p.m-1,p.d)); cd.setUTCDate(cd.getUTCDate()-10); return londonLocalDateTimeToUtcMillis(cd.getUTCFullYear(), cd.getUTCMonth()+1, cd.getUTCDate(), 18, 50); }
function isSignupClosedDateKey(dateKey, nowMs = Date.now()) { const cutoff = signupCutoffUtcMillis(dateKey); return cutoff !== null && nowMs >= cutoff; }
function cleanNames(arr) { return Array.isArray(arr) ? [...new Set(arr.map(String).map(s=>s.trim()).filter(Boolean))] : []; }
function initDay(competition = "") { return { players: [], maybes: [], priorityPlayers: [], locked: false, competition, audit: [], draw: null }; }
function safeDay(raw, competition = "") {
  const base = initDay(competition); if (!raw || typeof raw !== "object") return base;
  const players = cleanNames(raw.players); const playerSet = new Set(players);
  const maybes = cleanNames(raw.maybes).filter(n => !playerSet.has(n));
  const priorityPlayers = cleanNames(raw.priorityPlayers).filter(n => playerSet.has(n));
  return { ...base, ...raw, players, maybes, priorityPlayers, locked: Boolean(raw.locked), competition: (typeof raw.competition === "string" && raw.competition.trim()) ? raw.competition.trim() : competition, audit: Array.isArray(raw.audit) ? raw.audit : [], draw: raw.draw || null };
}
function addAudit(day, action, name, ts = Date.now(), details = {}) { return { ...day, audit: [...(day.audit || []), { action, name, ts, ...details }], updatedAt: ts }; }
function groupLabel(size) { if (size===4) return "4-ball"; if (size===3) return "3-ball"; if (size===2) return "2-ball"; return `${size}-ball`; }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function buildGroups(players, priorityPlayers = []) {
  const cleanPlayers = cleanNames(players); if (!cleanPlayers.length) return [];
  const playerSet = new Set(cleanPlayers); const priorities = cleanNames(priorityPlayers).filter(n => playerSet.has(n)); const prioritySet = new Set(priorities);
  const arr = [...shuffle(priorities), ...shuffle(cleanPlayers.filter(n => !prioritySet.has(n)))];
  const n=arr.length, numGroups=Math.ceil(n/4), base=Math.floor(n/numGroups), extras=n%numGroups, groups=[]; let idx=0;
  for(let g=0; g<numGroups; g++){ const size=base+(g<extras?1:0); groups.push(arr.slice(idx,idx+size)); idx+=size; }
  return groups;
}
async function getRawRow(db, key) { const row = await db.prepare("SELECT data FROM days WHERE dateKey = ?").bind(key).first(); if (!row) return null; try { return JSON.parse(row.data); } catch { return null; } }
async function getPinConfig(db) { const raw = await getRawRow(db, PIN_CONFIG_KEY); const pins = raw && typeof raw === "object" && raw.pins && typeof raw.pins === "object" ? raw.pins : {}; const clean={}; for(const [name,pin] of Object.entries(pins)){ const n=String(name||"").trim(), p=String(pin||"").trim(); if(n&&p) clean[n]=p; } return clean; }
async function savePinConfig(db, pins) { const ts=Date.now(); await db.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind(PIN_CONFIG_KEY, JSON.stringify({ pins, updatedAt:ts }), ts).run(); return pins; }
function maskedPins(pins) { const configured={}; for(const [name,pin] of Object.entries(pins||{})) configured[name]=Boolean(pin); return configured; }
async function verifyPlayerIdentity(db, input, targetName) { const actorName=String(input.playerName||input.actor||"").trim(), playerPin=String(input.playerPin||"").trim(), name=String(targetName||"").trim(); if(!actorName||!playerPin) return { ok:false, error:"Select your name and enter your player PIN before changing a booking." }; if(actorName!==name) return { ok:false, error:"You can only change your own booking status." }; const pins=await getPinConfig(db); if(!pins[name]) return { ok:false, error:"No player PIN has been set for you yet. Ask admin to set one." }; if(String(pins[name])!==playerPin) return { ok:false, error:"Incorrect player PIN." }; return { ok:true, actor:name, actorType:"player" }; }
async function getDay(db, dateKey) { const key=normaliseDateKey(dateKey); const row=await db.prepare("SELECT data FROM days WHERE dateKey = ?").bind(key).first(); if(!row) return initDay(); try { return safeDay(JSON.parse(row.data)); } catch { return initDay(); } }
async function upsertDay(db, dateKey, day) { const key=normaliseDateKey(dateKey); const ts=Date.now(); const clean=safeDay(day); clean.updatedAt=clean.updatedAt||ts; await db.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind(key, JSON.stringify(clean), clean.updatedAt).run(); return clean; }
async function readSchedule(db) { const rows=await db.prepare("SELECT dateKey, data FROM days ORDER BY dateKey").all(); const schedule={}; for(const row of rows.results||[]){ const key=normaliseDateKey(row.dateKey); if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue; try { schedule[key]=safeDay(JSON.parse(row.data)); } catch {} } return schedule; }
async function bodyJson(request){ try { return await request.json(); } catch { return {}; } }
function isAdmin(input){ return String(input.adminPin||"")===ADMIN_PIN; }
function actorDetails(input, adminOverride, playerAuth=null){ if(adminOverride) return {actor:"Admin", actorType:"admin"}; if(playerAuth?.ok) return {actor:playerAuth.actor, actorType:"player"}; return {actor:"Unknown", actorType:"unknown"}; }

async function handle(request, env) {
  if (!env.DB) return json({ ok:false, error:"D1 binding DB is missing. Add a D1 binding named DB to this Pages project." }, 500);
  const url = new URL(request.url); const route=url.pathname.replace(/^\/api\/?/, "") || "schedule"; const method=request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status:204, headers:JSON_HEADERS });
  if (route === "schedule" && method === "GET") return json({ ok:true, schedule: await readSchedule(env.DB), serverNow: Date.now() });
  if (route === "day" && method === "GET") { const dateKey=normaliseDateKey(url.searchParams.get("dateKey")); return json({ ok:true, dateKey, data: await getDay(env.DB, dateKey) }); }
  if (route === "player-login" && method === "POST") { const input=await bodyJson(request); const name=String(input.name||"").trim(), pin=String(input.pin||"").trim(); const pins=await getPinConfig(env.DB); if(!name||!pin) return json({ok:false,error:"Name and PIN are required"},400); if(!pins[name]) return json({ok:false,error:"No player PIN has been set for this player yet."},403); if(String(pins[name])!==pin) return json({ok:false,error:"Incorrect player PIN"},403); return json({ok:true,name}); }
  if (route === "admin/pins" && method === "GET") { if(url.searchParams.get("adminPin")!==ADMIN_PIN) return json({ok:false,error:"Admin PIN required"},403); return json({ok:true, configured: maskedPins(await getPinConfig(env.DB))}); }
  if (route === "admin/player-pin" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const name=String(input.name||"").trim(), pin=String(input.pin||"").trim(); if(!name) return json({ok:false,error:"Missing player name"},400); const pins=await getPinConfig(env.DB); if(pin) pins[name]=pin; else delete pins[name]; await savePinConfig(env.DB,pins); return json({ok:true, configured:maskedPins(pins), name, hasPin:Boolean(pin)}); }

  if (route === "player-status" && method === "POST") {
    const input=await bodyJson(request); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(), status=String(input.status||"").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return json({ok:false,error:"Invalid dateKey"},400); if(!name) return json({ok:false,error:"Missing player name"},400); if(!["playing","maybe","none"].includes(status)) return json({ok:false,error:"Invalid player status"},400);
    let day=await getDay(env.DB,dateKey); if(!day.competition && input.competition) day.competition=String(input.competition).trim(); const adminOverride=isAdmin(input); let playerAuth=null;
    if(!adminOverride){ playerAuth=await verifyPlayerIdentity(env.DB,input,name); if(!playerAuth.ok) return json({ok:false,error:playerAuth.error},403); }
    if(day.locked&&!adminOverride) return json({ok:false,error:"List is locked"},403); if(isSignupClosedDateKey(dateKey)&&!adminOverride) return json({ok:false,error:"Sign-up is closed for this date. Contact admin to make changes."},403);
    const before=day.players.includes(name)?"playing":(day.maybes||[]).includes(name)?"maybe":"none"; const players=new Set(day.players||[]), maybes=new Set(day.maybes||[]); let action="removed_self", verb="Removed";
    if(status==="playing"){ players.add(name); maybes.delete(name); action="joined"; verb="Saved"; } else if(status==="maybe"){ players.delete(name); maybes.add(name); action="maybe"; verb="Marked maybe"; } else { players.delete(name); maybes.delete(name); action="removed_self"; verb="Removed"; }
    day={...day, players:[...players], maybes:[...maybes], priorityPlayers:(day.priorityPlayers||[]).filter(p=>players.has(p)), draw:null}; day=addAudit(day,action,name,Date.now(),{...actorDetails(input,adminOverride,playerAuth), from:before, to:status}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day,message:`${verb} ${dateKey}: ${name}`});
  }
  if (route === "toggle-player" && method === "POST") { const input=await bodyJson(request); const name=String(input.name||"").trim(); const day=await getDay(env.DB,normaliseDateKey(input.dateKey)); return handle(new Request(request.url.replace(/toggle-player$/, "player-status"), {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...input,status:day.players.includes(name)?"none":"playing"})}), env); }
  if (route === "admin/add-player" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(); if(!name) return json({ok:false,error:"Missing player name"},400); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); const before=day.players.includes(name)?"playing":(day.maybes||[]).includes(name)?"maybe":"none"; if(!day.players.includes(name)) day.players.push(name); day.maybes=(day.maybes||[]).filter(p=>p!==name); day.draw=null; day=addAudit(day,"admin_added",name,Date.now(),{actor:"Admin",actorType:"admin",from:before,to:"playing"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/remove-player" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); const before=day.players.includes(name)?"playing":(day.maybes||[]).includes(name)?"maybe":"none"; day.players=day.players.filter(p=>p!==name); day.maybes=(day.maybes||[]).filter(p=>p!==name); day.priorityPlayers=(day.priorityPlayers||[]).filter(p=>p!==name); day.draw=null; day=addAudit(day,"admin_removed",name,Date.now(),{actor:"Admin",actorType:"admin",from:before,to:"none"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/priority" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(); const priority=Boolean(input.priority); let day=await getDay(env.DB,dateKey); if(!day.players.includes(name)) return json({ok:false,error:"Only confirmed players can be prioritised"},400); const set=new Set(day.priorityPlayers||[]); priority?set.add(name):set.delete(name); day.priorityPlayers=[...set].filter(p=>day.players.includes(p)); day.draw=null; day=addAudit(day,priority?"priority_added":"priority_removed",name,Date.now(),{actor:"Admin",actorType:"admin"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/competition" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); let day=await getDay(env.DB,dateKey); day.competition=String(input.competition||"").trim(); day=addAudit(day,"competition_changed","Competition",Date.now(),{actor:"Admin",actorType:"admin",to:day.competition}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/lock" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); const lock=typeof input.locked==="boolean"?input.locked:!day.locked; day.locked=lock; if(lock&&day.players.length&&!day.draw) day.draw=buildGroups(day.players,day.priorityPlayers); if(!lock) day.draw=null; day=addAudit(day,lock?"admin_locked":"admin_unlocked","Admin",Date.now(),{actor:"Admin",actorType:"admin"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/redraw" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); day.draw=buildGroups(day.players||[],day.priorityPlayers||[]); day=addAudit(day,"draw_regenerated","Admin",Date.now(),{actor:"Admin",actorType:"admin"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/import" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const schedule=input.schedule||{}, statements=[]; for(const [key,value] of Object.entries(schedule)){ const dateKey=normaliseDateKey(key), day=safeDay(value), ts=day.updatedAt||Date.now(); statements.push(env.DB.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind(dateKey, JSON.stringify(day), ts)); } if(statements.length) await env.DB.batch(statements); return json({ok:true, imported:statements.length}); }
  if (route === "admin/delete-day" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return json({ok:false,error:"Invalid dateKey"},400); await env.DB.prepare("DELETE FROM days WHERE dateKey = ?").bind(dateKey).run(); return json({ok:true,deleted:true,dateKey}); }
  if (route === "admin/export" && method === "GET") { if(url.searchParams.get("adminPin")!==ADMIN_PIN) return json({ok:false,error:"Admin PIN required"},403); return json({ok:true, exported:new Date().toISOString(), schedule:await readSchedule(env.DB)}); }
  return json({ ok:false, error:`No route for ${method} /api/${route}` }, 404);
}
export async function onRequest(context) { try { return await handle(context.request, context.env); } catch(err) { return json({ ok:false, error:err.message || String(err) }, 500); } }
export const __test = { normaliseDateKey, safeDay, initDay, addAudit, buildGroups, groupLabel, signupCutoffUtcMillis, isSignupClosedDateKey, londonLocalDateTimeToUtcMillis, PIN_CONFIG_KEY };
