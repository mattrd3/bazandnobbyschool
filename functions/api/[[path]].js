const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const ADMIN_PIN = "2727";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function normaliseDateKey(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Preserve the visible local date from old Google Sheet keys such as
  // "Sun May 10 2026 00:00:00 GMT+0100 (British Summer Time)".
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


function parseDateKeyParts(dateKey) {
  const key = normaliseDateKey(dateKey);
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function londonOffsetMinutesAtUtc(utcMillis) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(utcMillis));
  const name = (parts.find(p => p.type === "timeZoneName") || {}).value || "GMT";
  const match = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function londonLocalDateTimeToUtcMillis(y, month, day, hour, minute) {
  // Initial UTC guess, then correct for the Europe/London offset at that instant.
  let utc = Date.UTC(y, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 2; i++) {
    const offset = londonOffsetMinutesAtUtc(utc);
    utc = Date.UTC(y, month - 1, day, hour, minute, 0, 0) - offset * 60000;
  }
  return utc;
}

function signupCutoffUtcMillis(dateKey) {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return null;
  // 10 local calendar days before the playing date.
  const cutoffDate = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 10);
  return londonLocalDateTimeToUtcMillis(
    cutoffDate.getUTCFullYear(),
    cutoffDate.getUTCMonth() + 1,
    cutoffDate.getUTCDate(),
    18,
    50
  );
}

function isSignupClosedDateKey(dateKey, nowMs = Date.now()) {
  const cutoff = signupCutoffUtcMillis(dateKey);
  return cutoff !== null && nowMs >= cutoff;
}

function initDay(competition = "") {
  return { players: [], locked: false, competition, audit: [], draw: null };
}

function safeDay(raw, competition = "") {
  const base = initDay(competition);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    players: Array.isArray(raw.players) ? [...new Set(raw.players.map(String).map(s => s.trim()).filter(Boolean))] : [],
    locked: Boolean(raw.locked),
    competition: (typeof raw.competition === "string" && raw.competition.trim()) ? raw.competition.trim() : competition,
    audit: Array.isArray(raw.audit) ? raw.audit : [],
    draw: raw.draw || null
  };
}

function addAudit(day, action, name, ts = Date.now()) {
  return {
    ...day,
    audit: [...(day.audit || []), { action, name, ts }],
    updatedAt: ts
  };
}

function groupLabel(size) {
  if (size === 4) return "4-ball";
  if (size === 3) return "3-ball";
  if (size === 2) return "2-ball";
  return `${size}-ball`;
}

function buildGroups(players) {
  if (!players.length) return [];
  const arr = [...players];
  // Deterministic-ish shuffle per generated draw time using Math.random server-side.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const n = arr.length;
  const numGroups = Math.ceil(n / 4);
  const base = Math.floor(n / numGroups);
  const extras = n % numGroups;
  const groups = [];
  let idx = 0;
  for (let g = 0; g < numGroups; g++) {
    const size = base + (g < extras ? 1 : 0);
    groups.push(arr.slice(idx, idx + size));
    idx += size;
  }
  return groups;
}

async function getDay(db, dateKey) {
  const key = normaliseDateKey(dateKey);
  const row = await db.prepare("SELECT data FROM days WHERE dateKey = ?").bind(key).first();
  if (!row) return initDay();
  try {
    return safeDay(JSON.parse(row.data));
  } catch {
    return initDay();
  }
}

async function upsertDay(db, dateKey, day) {
  const key = normaliseDateKey(dateKey);
  const ts = Date.now();
  const clean = safeDay(day);
  clean.updatedAt = clean.updatedAt || ts;
  await db.prepare(`
    INSERT INTO days (dateKey, data, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt
  `).bind(key, JSON.stringify(clean), clean.updatedAt).run();
  return clean;
}

async function readSchedule(db) {
  const rows = await db.prepare("SELECT dateKey, data FROM days ORDER BY dateKey").all();
  const schedule = {};
  for (const row of rows.results || []) {
    const key = normaliseDateKey(row.dateKey);
    try { schedule[key] = safeDay(JSON.parse(row.data)); } catch {}
  }
  return schedule;
}

async function bodyJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function isAdmin(input) {
  return String(input.adminPin || "") === ADMIN_PIN;
}

async function handle(request, env) {
  if (!env.DB) return json({ ok: false, error: "D1 binding DB is missing. Add a D1 binding named DB to this Pages project." }, 500);

  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "") || "schedule";
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

  if (route === "schedule" && method === "GET") {
    return json({ ok: true, schedule: await readSchedule(env.DB), serverNow: Date.now() });
  }

  if (route === "day" && method === "GET") {
    const dateKey = normaliseDateKey(url.searchParams.get("dateKey"));
    return json({ ok: true, dateKey, data: await getDay(env.DB, dateKey) });
  }

  if (route === "toggle-player" && method === "POST") {
    const input = await bodyJson(request);
    const dateKey = normaliseDateKey(input.dateKey);
    const name = String(input.name || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return json({ ok: false, error: "Invalid dateKey" }, 400);
    if (!name) return json({ ok: false, error: "Missing player name" }, 400);

    let day = await getDay(env.DB, dateKey);
    if (!day.competition && input.competition) day.competition = String(input.competition).trim();
    const adminOverride = isAdmin(input);
    if (day.locked && !adminOverride) return json({ ok: false, error: "List is locked" }, 403);
    if (isSignupClosedDateKey(dateKey) && !adminOverride) {
      return json({ ok: false, error: "Sign-up is closed for this date. Contact admin to make changes." }, 403);
    }

    const players = new Set(day.players || []);
    const alreadyIn = players.has(name);
    if (alreadyIn) players.delete(name); else players.add(name);
    day = { ...day, players: [...players], draw: null };
    day = addAudit(day, alreadyIn ? "removed_self" : "joined", name);
    day = await upsertDay(env.DB, dateKey, day);
    return json({ ok: true, dateKey, data: day, message: `${alreadyIn ? "Removed" : "Saved"} ${dateKey}: ${name}` });
  }

  if (route === "admin/add-player" && method === "POST") {
    const input = await bodyJson(request);
    if (!isAdmin(input)) return json({ ok: false, error: "Admin PIN required" }, 403);
    const dateKey = normaliseDateKey(input.dateKey);
    const name = String(input.name || "").trim();
    if (!name) return json({ ok: false, error: "Missing player name" }, 400);
    let day = await getDay(env.DB, dateKey);
    if (!day.competition && input.competition) day.competition = String(input.competition).trim();
    if (!day.players.includes(name)) day.players.push(name);
    day.draw = null;
    day = addAudit(day, "admin_added", name);
    day = await upsertDay(env.DB, dateKey, day);
    return json({ ok: true, dateKey, data: day });
  }

  if (route === "admin/remove-player" && method === "POST") {
    const input = await bodyJson(request);
    if (!isAdmin(input)) return json({ ok: false, error: "Admin PIN required" }, 403);
    const dateKey = normaliseDateKey(input.dateKey);
    const name = String(input.name || "").trim();
    let day = await getDay(env.DB, dateKey);
    if (!day.competition && input.competition) day.competition = String(input.competition).trim();
    day.players = day.players.filter(p => p !== name);
    day.draw = null;
    day = addAudit(day, "admin_removed", name);
    day = await upsertDay(env.DB, dateKey, day);
    return json({ ok: true, dateKey, data: day });
  }

  if (route === "admin/competition" && method === "POST") {
    const input = await bodyJson(request);
    if (!isAdmin(input)) return json({ ok: false, error: "Admin PIN required" }, 403);
    const dateKey = normaliseDateKey(input.dateKey);
    let day = await getDay(env.DB, dateKey);
    day.competition = String(input.competition || "").trim();
    day.updatedAt = Date.now();
    day = await upsertDay(env.DB, dateKey, day);
    return json({ ok: true, dateKey, data: day });
  }

  if (route === "admin/lock" && method === "POST") {
    const input = await bodyJson(request);
    if (!isAdmin(input)) return json({ ok: false, error: "Admin PIN required" }, 403);
    const dateKey = normaliseDateKey(input.dateKey);
    let day = await getDay(env.DB, dateKey);
    if (!day.competition && input.competition) day.competition = String(input.competition).trim();
    const lock = typeof input.locked === "boolean" ? input.locked : !day.locked;
    day.locked = lock;
    if (lock && day.players.length && !day.draw) day.draw = buildGroups(day.players);
    if (!lock) day.draw = null;
    day = addAudit(day, lock ? "admin_locked" : "admin_unlocked", "Admin");
    day = await upsertDay(env.DB, dateKey, day);
    return json({ ok: true, dateKey, data: day });
  }

  if (route === "admin/redraw" && method === "POST") {
    const input = await bodyJson(request);
    if (!isAdmin(input)) return json({ ok: false, error: "Admin PIN required" }, 403);
    const dateKey = normaliseDateKey(input.dateKey);
    let day = await getDay(env.DB, dateKey);
    if (!day.competition && input.competition) day.competition = String(input.competition).trim();
    day.draw = buildGroups(day.players || []);
    day = addAudit(day, "draw_regenerated", "Admin");
    day = await upsertDay(env.DB, dateKey, day);
    return json({ ok: true, dateKey, data: day });
  }

  if (route === "admin/import" && method === "POST") {
    const input = await bodyJson(request);
    if (!isAdmin(input)) return json({ ok: false, error: "Admin PIN required" }, 403);
    const schedule = input.schedule || {};
    const statements = [];
    for (const [key, value] of Object.entries(schedule)) {
      const dateKey = normaliseDateKey(key);
      const day = safeDay(value);
      const ts = day.updatedAt || Date.now();
      statements.push(env.DB.prepare(`
        INSERT INTO days (dateKey, data, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt
      `).bind(dateKey, JSON.stringify(day), ts));
    }
    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true, imported: statements.length });
  }

  if (route === "admin/export" && method === "GET") {
    const pin = url.searchParams.get("adminPin");
    if (pin !== ADMIN_PIN) return json({ ok: false, error: "Admin PIN required" }, 403);
    return json({ ok: true, exported: new Date().toISOString(), schedule: await readSchedule(env.DB) });
  }

  return json({ ok: false, error: `No route for ${method} /api/${route}` }, 404);
}

export async function onRequest(context) {
  try {
    return await handle(context.request, context.env);
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}

// Export internals for node tests.
export const __test = { normaliseDateKey, safeDay, initDay, addAudit, buildGroups, groupLabel, signupCutoffUtcMillis, isSignupClosedDateKey, londonLocalDateTimeToUtcMillis };
