const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const ADMIN_PIN = "2727";
const PIN_CONFIG_KEY = "__config_member_pins__";
const ROSTER_CONFIG_KEY = "__config_member_roster__";
const AUDIT_EVENTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  dateKey TEXT NOT NULL,
  ts INTEGER NOT NULL,
  action TEXT NOT NULL,
  name TEXT,
  actor TEXT,
  actorType TEXT,
  details TEXT
)`;
const AUDIT_EVENTS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_audit_events_date_ts ON audit_events (dateKey, ts DESC)`;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PLAYER_STATUS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS player_status (
  dateKey TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  updatedAt INTEGER NOT NULL,
  actor TEXT,
  actorType TEXT,
  PRIMARY KEY (dateKey, name)
)`;
const BRS_BOOKINGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS brs_bookings (
  id TEXT PRIMARY KEY,
  dateKey TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  createdBy TEXT,
  bookersJson TEXT NOT NULL,
  confirmedPlayersJson TEXT NOT NULL,
  groupsJson TEXT NOT NULL,
  spareBookersJson TEXT,
  detailsJson TEXT
)`;
const BRS_BOOKINGS_DATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_brs_bookings_date ON brs_bookings (dateKey, createdAt DESC)`;
const DEFAULT_MEMBERS = ["Baby Dave", "Bob", "Colin", "Danny", "Dean", "Doc", "Ethan", "Jason", "Kevin", "Lewis", "Major", "Mark Mark", "Matt", "Meeky", "Muller", "Nathan", "Pedders", "Ryan", "Sam", "Simon H", "Wayne"];

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
function auditDateLabel(dateKey) { const p = parseDateKeyParts(dateKey); if (!p) return String(dateKey || ""); const d = new Date(Date.UTC(p.y, p.m - 1, p.d)); return `${DAY_NAMES[d.getUTCDay()]} ${p.d} ${MONTH_NAMES[p.m - 1]}`; }
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
function initDay(competition = "") { return { players: [], unavailablePlayers: [], priorityPlayers: [], locked: false, competition, audit: [], draw: null }; }
function safeDay(raw, competition = "") {
  const base = initDay(competition); if (!raw || typeof raw !== "object") return base;
  const { maybes, ...rest } = raw;
  const players = cleanNames(raw.players); const playerSet = new Set(players);
  const unavailablePlayers = cleanNames(raw.unavailablePlayers).filter(n => !playerSet.has(n));
  const priorityPlayers = cleanNames(raw.priorityPlayers).filter(n => playerSet.has(n));
  // v15: the maybe feature has been removed. Old maybe values in stored records are ignored and not returned.
  // v32: unavailablePlayers is a definite response and is kept separate from confirmed players.
  return { ...base, ...rest, players, unavailablePlayers, priorityPlayers, locked: Boolean(raw.locked), competition: (typeof raw.competition === "string" && raw.competition.trim()) ? raw.competition.trim() : competition, audit: Array.isArray(raw.audit) ? raw.audit : [], draw: raw.draw || null };
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
async function getRosterConfig(db) {
  const raw = await getRawRow(db, ROSTER_CONFIG_KEY);
  const members = raw && Array.isArray(raw.members) ? raw.members : DEFAULT_MEMBERS;
  return cleanNames([...DEFAULT_MEMBERS, ...members]).sort();
}
async function saveRosterConfig(db, members) {
  const clean = cleanNames(members).sort();
  const ts = Date.now();
  await db.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind(ROSTER_CONFIG_KEY, JSON.stringify({ members: clean, updatedAt: ts }), ts).run();
  return clean;
}

async function ensureOperationalTables(db) {
  await db.prepare(AUDIT_EVENTS_TABLE_SQL).run();
  await db.prepare(AUDIT_EVENTS_INDEX_SQL).run();
  await db.prepare(PLAYER_STATUS_TABLE_SQL).run();
  await db.prepare(BRS_BOOKINGS_TABLE_SQL).run();
  await db.prepare("ALTER TABLE brs_bookings ADD COLUMN spareBookersJson TEXT").run().catch(() => {});
  await db.prepare("ALTER TABLE brs_bookings ADD COLUMN detailsJson TEXT").run().catch(() => {});
  await db.prepare(BRS_BOOKINGS_DATE_INDEX_SQL).run();
}
async function appendAuditEvent(db, dateKey, entry) {
  await ensureOperationalTables(db);
  const key = normaliseDateKey(dateKey);
  const ts = Number(entry.ts || Date.now());
  const id = `${key}-${ts}-${Math.random().toString(36).slice(2, 10)}`;
  const { action = "unknown", name = "", actor = "Unknown", actorType = "unknown", ...details } = entry || {};
  await db.prepare("INSERT INTO audit_events (id, dateKey, ts, action, name, actor, actorType, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, key, ts, String(action), String(name || ""), String(actor || "Unknown"), String(actorType || "unknown"), JSON.stringify(details || {}))
    .run();
}
async function addAuditAndLog(db, dateKey, day, action, name, ts = Date.now(), details = {}) {
  // v23: activity log is DB-first. Keep any legacy day.audit array for old exported data,
  // but do not append new events into the JSON day blob because that was prone to lost updates.
  // v24: enrich every audit entry with the amended booking date so the activity log is readable.
  const key = normaliseDateKey(dateKey);
  await appendAuditEvent(db, key, { action, name, ts, dateKey: key, dateLabel: auditDateLabel(key), ...details });
  return { ...day, updatedAt: ts };
}
async function migrateLegacyAuditEvents(db, dateKey) {
  await ensureOperationalTables(db);
  const key = normaliseDateKey(dateKey);
  const legacy = await getRawRow(db, key);
  if (!Array.isArray(legacy?.audit) || !legacy.audit.length) return 0;
  let migrated = 0;
  for (let i = 0; i < legacy.audit.length; i++) {
    const entry = legacy.audit[i] || {};
    const ts = Number(entry.ts || 0) || Date.now();
    const action = String(entry.action || "unknown");
    const name = String(entry.name || "");
    const actor = String(entry.actor || "Unknown");
    const actorType = String(entry.actorType || "unknown");
    const { action: _a, name: _n, actor: _actor, actorType: _actorType, ts: _ts, ...details } = entry;
    const id = `${key}-legacy-${ts}-${i}-${action}-${name}`.replace(/[^a-zA-Z0-9:_-]/g, "_");
    await db.prepare("INSERT OR IGNORE INTO audit_events (id, dateKey, ts, action, name, actor, actorType, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, key, ts, action, name, actor, actorType, JSON.stringify(details || {}))
      .run();
    migrated++;
  }
  return migrated;
}
async function readAuditEvents(db, dateKey, limit = 300) {
  await migrateLegacyAuditEvents(db, dateKey);
  const key = normaliseDateKey(dateKey);
  const rows = await db.prepare("SELECT ts, action, name, actor, actorType, details FROM audit_events WHERE dateKey = ? ORDER BY ts DESC LIMIT ?").bind(key, limit).all();
  return (rows.results || []).map(row => {
    let details = {};
    try { details = row.details ? JSON.parse(row.details) : {}; } catch {}
    return { ts: row.ts, action: row.action, name: row.name, actor: row.actor, actorType: row.actorType, ...details };
  });
}
async function writePlayerStatus(db, dateKey, name, status, actor = "Unknown", actorType = "unknown", ts = Date.now()) {
  await ensureOperationalTables(db);
  await db.prepare(`INSERT INTO player_status (dateKey, name, status, updatedAt, actor, actorType)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(dateKey, name) DO UPDATE SET status = excluded.status, updatedAt = excluded.updatedAt, actor = excluded.actor, actorType = excluded.actorType`)
    .bind(normaliseDateKey(dateKey), String(name || "").trim(), status, ts, actor, actorType)
    .run();
}
async function applyStatusRows(db, dateKey, day) {
  await ensureOperationalTables(db);
  const key = normaliseDateKey(dateKey);
  const rows = await db.prepare("SELECT name, status FROM player_status WHERE dateKey = ?").bind(key).all();
  const results = rows.results || [];
  if (!results.length) return safeDay(day);
  const players = new Set(cleanNames(day.players));
  const unavailablePlayers = new Set(cleanNames(day.unavailablePlayers));
  for (const row of results) {
    const name = String(row.name || "").trim();
    if (!name) continue;
    if (row.status === "playing") { players.add(name); unavailablePlayers.delete(name); }
    else if (row.status === "unavailable") { players.delete(name); unavailablePlayers.add(name); }
    else { players.delete(name); unavailablePlayers.delete(name); }
  }
  return safeDay({ ...day, players: [...players], unavailablePlayers: [...unavailablePlayers], priorityPlayers: cleanNames(day.priorityPlayers).filter(n => players.has(n)) });
}
async function applyAllStatusRows(db, schedule) {
  await ensureOperationalTables(db);
  const rows = await db.prepare("SELECT dateKey, name, status FROM player_status").all();
  for (const row of rows.results || []) {
    const key = normaliseDateKey(row.dateKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const base = schedule[key] || initDay();
    const players = new Set(cleanNames(base.players));
    const unavailablePlayers = new Set(cleanNames(base.unavailablePlayers));
    const name = String(row.name || "").trim();
    if (!name) continue;
    if (row.status === "playing") { players.add(name); unavailablePlayers.delete(name); }
    else if (row.status === "unavailable") { players.delete(name); unavailablePlayers.add(name); }
    else { players.delete(name); unavailablePlayers.delete(name); }
    schedule[key] = safeDay({ ...base, players: [...players], unavailablePlayers: [...unavailablePlayers], priorityPlayers: cleanNames(base.priorityPlayers).filter(n => players.has(n)) });
  }
  return schedule;
}

function maskedPins(pins) { const configured={}; for(const [name,pin] of Object.entries(pins||{})) configured[name]=Boolean(pin); return configured; }
async function verifyPlayerIdentity(db, input, targetName) { const actorName=String(input.playerName||input.actor||"").trim(), playerPin=String(input.playerPin||"").trim(), name=String(targetName||"").trim(); if(!actorName||!playerPin) return { ok:false, error:"Select your name and enter your player PIN before changing a booking." }; if(actorName!==name) return { ok:false, error:"You can only change your own booking status." }; const pins=await getPinConfig(db); if(!pins[name]) return { ok:false, error:"No player PIN has been set for you yet. Ask admin to set one." }; if(String(pins[name])!==playerPin) return { ok:false, error:"Incorrect player PIN." }; return { ok:true, actor:name, actorType:"player" }; }
async function getDay(db, dateKey) { const key=normaliseDateKey(dateKey); const row=await db.prepare("SELECT data FROM days WHERE dateKey = ?").bind(key).first(); let day=initDay(); if(row){ try { day=safeDay(JSON.parse(row.data)); } catch { day=initDay(); } } return applyStatusRows(db,key,day); }
async function upsertDay(db, dateKey, day) { const key=normaliseDateKey(dateKey); const ts=Date.now(); const clean=safeDay(day); clean.updatedAt=clean.updatedAt||ts; await db.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind(key, JSON.stringify(clean), clean.updatedAt).run(); return clean; }
async function readSchedule(db) { const rows=await db.prepare("SELECT dateKey, data FROM days ORDER BY dateKey").all(); const schedule={}; for(const row of rows.results||[]){ const key=normaliseDateKey(row.dateKey); if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue; try { schedule[key]=safeDay(JSON.parse(row.data)); } catch {} } return applyAllStatusRows(db, schedule); }

function dateKeyToUtcDate(dateKey) { const p = parseDateKeyParts(dateKey); return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : null; }
function utcDateToDateKey(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }
function addUtcDays(d, days) { const n = new Date(d.getTime()); n.setUTCDate(n.getUTCDate() + days); return n; }
function clampStartDate(a, b) { if (!a) return b; if (!b) return a; return a.getTime() > b.getTime() ? a : b; }
function weekendDateKeysBetween(startDate, endDate) {
  const out = [];
  if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) return out;
  const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  while (d.getTime() <= endDate.getTime()) {
    const dow = d.getUTCDay();
    if (dow === 6 || dow === 0) out.push(utcDateToDateKey(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function getSeasonBounds(asOf = "") {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(asOf || "")) ? dateKeyToUtcDate(asOf) : new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const startYear = m >= 4 ? y : y - 1;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: `${startYear}/${String(startYear + 1).slice(2)}`
  };
}
function buildBRSBookingGroups(confirmedPlayers, selectedBookers) {
  const confirmed = cleanNames(confirmedPlayers);
  const bookers = cleanNames(selectedBookers);
  const playingSet = new Set(confirmed);
  const teeTimesNeeded = Math.ceil(confirmed.length / 4);
  const activeBookers = bookers.slice(0, teeTimesNeeded);
  const spareBookers = bookers.slice(teeTimesNeeded);
  const groups = activeBookers.map(booker => ({ booker, players: [] }));
  const assigned = new Set();
  for (const group of groups) {
    if (playingSet.has(group.booker)) {
      group.players.push(group.booker);
      assigned.add(group.booker);
    }
  }
  const remaining = confirmed.filter(name => !assigned.has(name));
  for (const group of groups) {
    while (group.players.length < 4 && remaining.length) {
      const next = remaining.shift();
      group.players.push(next);
      assigned.add(next);
    }
  }
  const unassignedPlayers = remaining;
  return {
    teeTimesNeeded,
    bookers,
    activeBookers,
    spareBookers,
    groups,
    unassignedPlayers,
    missingTeeTimes: Math.max(0, teeTimesNeeded - activeBookers.length),
    confirmedCount: confirmed.length
  };
}
async function saveBRSBooking(db, { dateKey, createdBy, bookers, confirmedPlayers, result }) {
  await ensureOperationalTables(db);
  const key = normaliseDateKey(dateKey);
  const createdAt = Date.now();
  const id = `${key}-${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
  const details = {
    teeTimesNeeded: result.teeTimesNeeded,
    missingTeeTimes: result.missingTeeTimes,
    confirmedCount: result.confirmedCount,
    unassignedPlayers: result.unassignedPlayers || [],
    leagueEligible: false,
    leagueRecordedVersion: "v41",
    note: "BRS league parked; create groups is not counted as a final booking result."
  };
  await db.prepare("INSERT INTO brs_bookings (id, dateKey, createdAt, createdBy, bookersJson, confirmedPlayersJson, groupsJson, spareBookersJson, detailsJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, key, createdAt, String(createdBy || "Unknown"), JSON.stringify(bookers || []), JSON.stringify(confirmedPlayers || []), JSON.stringify(result.groups || []), JSON.stringify(result.spareBookers || []), JSON.stringify(details))
    .run();
  await appendAuditEvent(db, key, { action:"brs_booking_created", name:"BRS Booking", ts:createdAt, actor:String(createdBy || "Unknown"), actorType:"player", dateKey:key, dateLabel:auditDateLabel(key), bookers:bookers || [], playerCount:(confirmedPlayers || []).length, groupCount:(result.groups || []).length });
  return { id, dateKey:key, createdAt, createdBy:String(createdBy || "Unknown"), ...result };
}
async function buildBRSLeague(db, { asOf = "" } = {}) {
  await ensureOperationalTables(db);
  const season = getSeasonBounds(asOf);
  const rows = await db.prepare("SELECT dateKey, createdAt, createdBy, bookersJson, detailsJson FROM brs_bookings WHERE dateKey >= ? AND dateKey <= ? ORDER BY dateKey DESC, createdAt DESC").bind(season.start, season.end).all();
  const counts = new Map();
  let eligibleRecordCount = 0;
  for (const row of rows.results || []) {
    let details = {};
    try { details = JSON.parse(row.detailsJson || "{}"); } catch { details = {}; }
    if (details.leagueEligible !== true) continue;
    eligibleRecordCount += 1;
    let bookers = [];
    try { bookers = JSON.parse(row.bookersJson || "[]"); } catch { bookers = []; }
    for (const name of cleanNames(bookers)) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const league = [...counts.entries()].map(([name, count]) => ({ name, count })).filter(r => r.count > 0).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
  return { season, league, bookingRecordCount: eligibleRecordCount, rawBookingRecordCount: (rows.results || []).length };
}
async function buildBookingStats(db, { period = "12", asOf = "" } = {}) {
  const schedule = await readSchedule(db);
  let statusRows = [];
  try {
    const rows = await db.prepare("SELECT dateKey, name, status FROM player_status").all();
    statusRows = rows.results || [];
  } catch (e) { statusRows = []; }
  const members = await getRosterConfig(db);
  const statusByDateName = new Map();
  const knownDateKeys = new Set();
  for (const [dateKey, day] of Object.entries(schedule || {})) {
    const key = normaliseDateKey(dateKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const hasPlayers = cleanNames(day.players).length || cleanNames(day.unavailablePlayers).length;
    if (hasPlayers) knownDateKeys.add(key);
    for (const name of cleanNames(day.players)) statusByDateName.set(`${key}::${name}`, "playing");
    for (const name of cleanNames(day.unavailablePlayers)) if (!statusByDateName.has(`${key}::${name}`)) statusByDateName.set(`${key}::${name}`, "unavailable");
  }
  for (const row of statusRows) {
    const key = normaliseDateKey(row.dateKey);
    const name = String(row.name || "").trim();
    const status = ["playing", "unavailable", "none"].includes(String(row.status)) ? String(row.status) : "none";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !name) continue;
    knownDateKeys.add(key);
    statusByDateName.set(`${key}::${name}`, status);
  }
  const knownDates = [...knownDateKeys].map(dateKeyToUtcDate).filter(Boolean).sort((a, b) => a - b);
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(asOf || "")) ? dateKeyToUtcDate(asOf) : new Date();
  const endDate = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));
  let requestedStart = null;
  const periodText = String(period || "12").toLowerCase();
  if (periodText !== "all") {
    const weeks = Math.max(1, Math.min(104, Number.parseInt(periodText, 10) || 12));
    requestedStart = addUtcDays(endDate, -(weeks * 7) + 1);
  }
  const earliestKnown = knownDates[0] || requestedStart || endDate;
  const startDate = periodText === "all" ? earliestKnown : clampStartDate(requestedStart, earliestKnown);
  const dateKeys = weekendDateKeysBetween(startDate, endDate);
  const stats = members.map(name => {
    let booked = 0, unavailable = 0, noResponse = 0;
    for (const dateKey of dateKeys) {
      const status = statusByDateName.get(`${dateKey}::${name}`) || "none";
      if (status === "playing") booked += 1;
      else if (status === "unavailable") unavailable += 1;
      else noResponse += 1;
    }
    return { name, booked, unavailable, noResponse, totalDays: dateKeys.length };
  });
  return { period: periodText, from: utcDateToDateKey(startDate), to: utcDateToDateKey(endDate), dateCount: dateKeys.length, stats };
}

async function bodyJson(request){ try { return await request.json(); } catch { return {}; } }
function isAdmin(input){ return String(input.adminPin||"")===ADMIN_PIN; }
function actorDetails(input, adminOverride, playerAuth=null){ if(adminOverride) return {actor:"Admin", actorType:"admin"}; if(playerAuth?.ok) return {actor:playerAuth.actor, actorType:"player"}; return {actor:"Unknown", actorType:"unknown"}; }

async function handle(request, env) {
  if (!env.DB) return json({ ok:false, error:"D1 binding DB is missing. Add a D1 binding named DB to this Pages project." }, 500);
  const url = new URL(request.url); const route=url.pathname.replace(/^\/api\/?/, "") || "schedule"; const method=request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status:204, headers:JSON_HEADERS });
  if (route === "schedule" && method === "GET") return json({ ok:true, schedule: await readSchedule(env.DB), members: await getRosterConfig(env.DB), serverNow: Date.now() });
  if (route === "day" && method === "GET") { const dateKey=normaliseDateKey(url.searchParams.get("dateKey")); return json({ ok:true, dateKey, data: await getDay(env.DB, dateKey) }); }
  if (route === "player-login" && method === "POST") { const input=await bodyJson(request); const name=String(input.name||"").trim(), pin=String(input.pin||"").trim(); const pins=await getPinConfig(env.DB); const members=await getRosterConfig(env.DB); if(!name||!pin) return json({ok:false,error:"Name and PIN are required"},400); if(!members.includes(name)) return json({ok:false,error:"This player is not on the roster yet. Ask admin to add them."},403); if(!pins[name]) return json({ok:false,error:"No player PIN has been set for this player yet. Ask admin to set one."},403); if(String(pins[name])!==pin) return json({ok:false,error:"Incorrect player PIN"},403); return json({ok:true,name}); }
  if (route === "player/weekend-summary" && method === "POST") { const input=await bodyJson(request); const name=String(input.playerName||input.name||"").trim(), pin=String(input.playerPin||input.pin||"").trim(); const pins=await getPinConfig(env.DB); const members=await getRosterConfig(env.DB); if(!name||!pin) return json({ok:false,error:"Name and PIN are required"},400); if(!members.includes(name)) return json({ok:false,error:"This player is not on the roster yet. Ask admin to add them."},403); if(!pins[name]) return json({ok:false,error:"No player PIN has been set for this player yet. Ask admin to set one."},403); if(String(pins[name])!==pin) return json({ok:false,error:"Incorrect player PIN"},403); const requested=Array.isArray(input.weekends)?input.weekends:[]; const schedule=await readSchedule(env.DB); const summary={}; for(const w of requested){ const sat=normaliseDateKey(w?.sat), sun=normaliseDateKey(w?.sun); if(!/^\d{4}-\d{2}-\d{2}$/.test(sat)||!/^\d{4}-\d{2}-\d{2}$/.test(sun)) continue; summary[sat]={ sat: cleanNames(schedule[sat]?.players).includes(name) ? "playing" : cleanNames(schedule[sat]?.unavailablePlayers).includes(name) ? "unavailable" : "none", sun: cleanNames(schedule[sun]?.players).includes(name) ? "playing" : cleanNames(schedule[sun]?.unavailablePlayers).includes(name) ? "unavailable" : "none" }; } return json({ok:true,name,summary}); }
  if (route === "brs-booking" && method === "POST") {
    const input = await bodyJson(request);
    const dateKey = normaliseDateKey(input.dateKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return json({ ok:false, error:"Invalid dateKey" }, 400);
    const adminOverride = isAdmin(input);
    let auth = null;
    if (!adminOverride) {
      auth = await verifyPlayerIdentity(env.DB, input, String(input.playerName || input.actor || "").trim());
      if (!auth.ok) return json({ ok:false, error:auth.error }, 403);
    }
    const actor = adminOverride ? "Admin" : auth.actor;
    const day = await getDay(env.DB, dateKey);
    const members = await getRosterConfig(env.DB);
    const validMembers = new Set(members);
    const bookers = cleanNames(input.bookers).filter(n => validMembers.has(n));
    if (!bookers.length) return json({ ok:false, error:"Select at least one BRS booker." }, 400);
    const confirmedPlayers = cleanNames(day.players);
    const result = buildBRSBookingGroups(confirmedPlayers, bookers);
    // v41: BRS Booking is an operational speed helper. Creating/regenerating groups should not
    // create league/reporting rows because users may redraw or multiple people may use it.
    return json({ ok:true, booking:{ id:null, dateKey, createdAt:Date.now(), createdBy:actor, ...result } });
  }
  if (route === "brs-booking/league" && method === "GET") {
    const adminOverride = url.searchParams.get("adminPin") === ADMIN_PIN;
    if (!adminOverride) {
      const name = String(url.searchParams.get("playerName") || "").trim();
      const pin = String(url.searchParams.get("playerPin") || "").trim();
      const pins = await getPinConfig(env.DB);
      if (!name || !pin || !pins[name] || String(pins[name]) !== pin) return json({ ok:false, error:"Player login required" }, 403);
    }
    const league = await buildBRSLeague(env.DB, { asOf: url.searchParams.get("asOf") || "" });
    return json({ ok:true, ...league });
  }
  if (route === "admin/pins" && method === "GET") { if(url.searchParams.get("adminPin")!==ADMIN_PIN) return json({ok:false,error:"Admin PIN required"},403); return json({ok:true, configured: maskedPins(await getPinConfig(env.DB))}); }
  if (route === "admin/roster" && method === "GET") { if(url.searchParams.get("adminPin")!==ADMIN_PIN) return json({ok:false,error:"Admin PIN required"},403); return json({ok:true, members: await getRosterConfig(env.DB)}); }
  if (route === "admin/audit" && method === "GET") { if(url.searchParams.get("adminPin")!==ADMIN_PIN) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(url.searchParams.get("dateKey")); if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return json({ok:false,error:"Invalid dateKey"},400); return json({ok:true,dateKey,events:await readAuditEvents(env.DB,dateKey)}); }
  if (route === "admin/booking-stats" && method === "GET") { const adminOverride=url.searchParams.get("adminPin")===ADMIN_PIN; if(!adminOverride){ const name=String(url.searchParams.get("playerName")||"").trim(); const pin=String(url.searchParams.get("playerPin")||"").trim(); const pins=await getPinConfig(env.DB); if(!name||!pin||!pins[name]||String(pins[name])!==pin) return json({ok:false,error:"Player login required"},403); } const result=await buildBookingStats(env.DB,{ period:url.searchParams.get("period")||"12", asOf:url.searchParams.get("asOf")||"" }); if(!adminOverride){ result.stats=(result.stats||[]).map(({ noResponse, ...row })=>row); } return json({ok:true,includeNoResponse:adminOverride,...result}); }
  if (route === "admin/member" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const name=String(input.name||"").trim(); const op=String(input.op||"add"); if(!name) return json({ok:false,error:"Missing player name"},400); let members=await getRosterConfig(env.DB); if(op==="remove"){ members=members.filter(n=>n!==name); } else { members=cleanNames([...members,name]).sort(); } members=await saveRosterConfig(env.DB,members); return json({ok:true,members,name,op}); }
  if (route === "admin/player-pin" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const name=String(input.name||"").trim(), pin=String(input.pin||"").trim(); if(!name) return json({ok:false,error:"Missing player name"},400); const pins=await getPinConfig(env.DB); if(pin) pins[name]=pin; else delete pins[name]; await savePinConfig(env.DB,pins); return json({ok:true, configured:maskedPins(pins), name, hasPin:Boolean(pin)}); }

  if (route === "player-status" && method === "POST") {
    const input=await bodyJson(request); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(), status=String(input.status||"").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return json({ok:false,error:"Invalid dateKey"},400); if(!name) return json({ok:false,error:"Missing player name"},400); if(!["playing","unavailable","none"].includes(status)) return json({ok:false,error:"Invalid player status"},400);
    let day=await getDay(env.DB,dateKey); if(!day.competition && input.competition) day.competition=String(input.competition).trim(); const adminOverride=isAdmin(input); let playerAuth=null;
    if(!adminOverride){ playerAuth=await verifyPlayerIdentity(env.DB,input,name); if(!playerAuth.ok) return json({ok:false,error:playerAuth.error},403); }
    if(day.locked&&!adminOverride) return json({ok:false,error:"List is locked"},403); if(isSignupClosedDateKey(dateKey)&&!adminOverride) return json({ok:false,error:"Sign-up is closed for this date. Contact admin to make changes."},403);
    const before=day.players.includes(name)?"playing":cleanNames(day.unavailablePlayers).includes(name)?"unavailable":"none"; const players=new Set(day.players||[]); const unavailablePlayers=new Set(day.unavailablePlayers||[]); let action="removed_self", verb="Removed";
    if(status==="playing"){ players.add(name); unavailablePlayers.delete(name); action="joined"; verb="Saved"; } else if(status==="unavailable"){ players.delete(name); unavailablePlayers.add(name); action="marked_unavailable"; verb="Marked unavailable"; } else { players.delete(name); unavailablePlayers.delete(name); action=before==="unavailable"?"cleared_unavailable":"removed_self"; verb="Removed"; }
    day={...day, players:[...players], unavailablePlayers:[...unavailablePlayers], priorityPlayers:(day.priorityPlayers||[]).filter(p=>players.has(p)), draw:null}; const ts=Date.now(); const actor=actorDetails(input,adminOverride,playerAuth); await writePlayerStatus(env.DB,dateKey,name,status,actor.actor,actor.actorType,ts); day=await addAuditAndLog(env.DB,dateKey,day,action,name,ts,{...actor, from:before, to:status}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day,message:`${verb} ${dateKey}: ${name}`});
  }
  if (route === "toggle-player" && method === "POST") { const input=await bodyJson(request); const name=String(input.name||"").trim(); const day=await getDay(env.DB,normaliseDateKey(input.dateKey)); return handle(new Request(request.url.replace(/toggle-player$/, "player-status"), {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...input,status:day.players.includes(name)?"none":"playing"})}), env); }
  if (route === "admin/add-player" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(); if(!name) return json({ok:false,error:"Missing player name"},400); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); const before=day.players.includes(name)?"playing":cleanNames(day.unavailablePlayers).includes(name)?"unavailable":"none"; if(!day.players.includes(name)) day.players.push(name); day.unavailablePlayers=cleanNames(day.unavailablePlayers).filter(p=>p!==name); day.draw=null; const ts=Date.now(); await writePlayerStatus(env.DB,dateKey,name,"playing","Admin","admin",ts); day=await addAuditAndLog(env.DB,dateKey,day,"admin_added",name,ts,{actor:"Admin",actorType:"admin",from:before,to:"playing"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/remove-player" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); const before=day.players.includes(name)?"playing":cleanNames(day.unavailablePlayers).includes(name)?"unavailable":"none"; day.players=day.players.filter(p=>p!==name); day.unavailablePlayers=cleanNames(day.unavailablePlayers).filter(p=>p!==name); day.priorityPlayers=(day.priorityPlayers||[]).filter(p=>p!==name); day.draw=null; const ts=Date.now(); await writePlayerStatus(env.DB,dateKey,name,"none","Admin","admin",ts); day=await addAuditAndLog(env.DB,dateKey,day,"admin_removed",name,ts,{actor:"Admin",actorType:"admin",from:before,to:"none"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/priority" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey), name=String(input.name||"").trim(); const priority=Boolean(input.priority); let day=await getDay(env.DB,dateKey); if(!day.players.includes(name)) return json({ok:false,error:"Only confirmed players can be prioritised"},400); const before=(day.priorityPlayers||[]).includes(name)?"early tee":"standard"; const set=new Set(day.priorityPlayers||[]); priority?set.add(name):set.delete(name); day.priorityPlayers=[...set].filter(p=>day.players.includes(p)); day.draw=null; day=await addAuditAndLog(env.DB,dateKey,day,priority?"priority_added":"priority_removed",name,Date.now(),{actor:"Admin",actorType:"admin",from:before,to:priority?"early tee":"standard"}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/competition" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); let day=await getDay(env.DB,dateKey); const before=String(day.competition||"").trim(); day.competition=String(input.competition||"").trim(); day=await addAuditAndLog(env.DB,dateKey,day,"competition_changed","Competition",Date.now(),{actor:"Admin",actorType:"admin",from:before,to:day.competition}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/lock" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); const before=day.locked?"locked":"open"; const lock=typeof input.locked==="boolean"?input.locked:!day.locked; day.locked=lock; if(lock&&day.players.length&&!day.draw) day.draw=buildGroups(day.players,day.priorityPlayers); if(!lock) day.draw=null; day=await addAuditAndLog(env.DB,dateKey,day,lock?"admin_locked":"admin_unlocked","Admin",Date.now(),{actor:"Admin",actorType:"admin",from:before,to:lock?"locked":"open",playerCount:(day.players||[]).length,groupCount:Array.isArray(day.draw)?day.draw.length:0}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/redraw" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); let day=await getDay(env.DB,dateKey); if(!day.competition&&input.competition) day.competition=String(input.competition).trim(); day.draw=buildGroups(day.players||[],day.priorityPlayers||[]); day=await addAuditAndLog(env.DB,dateKey,day,"draw_regenerated","Admin",Date.now(),{actor:"Admin",actorType:"admin",playerCount:(day.players||[]).length,groupCount:Array.isArray(day.draw)?day.draw.length:0}); day=await upsertDay(env.DB,dateKey,day); return json({ok:true,dateKey,data:day}); }
  if (route === "admin/import" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const schedule=input.schedule||{}, statements=[]; for(const [key,value] of Object.entries(schedule)){ const dateKey=normaliseDateKey(key), day=safeDay(value), ts=day.updatedAt||Date.now(); statements.push(env.DB.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind(dateKey, JSON.stringify(day), ts)); } if(statements.length) await env.DB.batch(statements); return json({ok:true, imported:statements.length}); }
  if (route === "admin/delete-day" && method === "POST") { const input=await bodyJson(request); if(!isAdmin(input)) return json({ok:false,error:"Admin PIN required"},403); const dateKey=normaliseDateKey(input.dateKey); if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return json({ok:false,error:"Invalid dateKey"},400); await env.DB.prepare("DELETE FROM days WHERE dateKey = ?").bind(dateKey).run(); await ensureOperationalTables(env.DB); await env.DB.prepare("DELETE FROM player_status WHERE dateKey = ?").bind(dateKey).run(); await env.DB.prepare("DELETE FROM audit_events WHERE dateKey = ?").bind(dateKey).run(); await ensureOperationalTables(env.DB); await env.DB.prepare("DELETE FROM brs_bookings WHERE dateKey = ?").bind(dateKey).run(); return json({ok:true,deleted:true,dateKey}); }
  if (route === "admin/export" && method === "GET") { if(url.searchParams.get("adminPin")!==ADMIN_PIN) return json({ok:false,error:"Admin PIN required"},403); return json({ok:true, exported:new Date().toISOString(), schedule:await readSchedule(env.DB)}); }
  return json({ ok:false, error:`No route for ${method} /api/${route}` }, 404);
}
export async function onRequest(context) { try { return await handle(context.request, context.env); } catch(err) { return json({ ok:false, error:err.message || String(err) }, 500); } }
export const __test = { normaliseDateKey, safeDay, initDay, addAudit, buildGroups, groupLabel, signupCutoffUtcMillis, isSignupClosedDateKey, londonLocalDateTimeToUtcMillis, PIN_CONFIG_KEY, ROSTER_CONFIG_KEY, DEFAULT_MEMBERS, applyStatusRows, applyAllStatusRows, migrateLegacyAuditEvents, readAuditEvents, auditDateLabel, buildBookingStats, buildBRSBookingGroups, getSeasonBounds, buildBRSLeague };
