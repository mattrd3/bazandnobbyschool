import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequest, __test } from "../functions/api/[[path]].js";

class FakeDB {
  constructor() { this.rows = new Map(); this.statusRows = new Map(); this.auditRows = []; }
  prepare(sql) { return new FakeStmt(this, sql); }
  async batch(statements) { for (const s of statements) await s.run(); }
}
class FakeStmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.includes("SELECT data FROM days WHERE dateKey")) {
      const row = this.db.rows.get(this.args[0]);
      return row ? { data: row.data } : null;
    }
    throw new Error("Unsupported first SQL: " + this.sql);
  }
  async all() {
    if (this.sql.includes("SELECT dateKey, data FROM days")) {
      return { results: [...this.db.rows.entries()].sort().map(([dateKey, row]) => ({ dateKey, data: row.data })) };
    }
    if (this.sql.includes("SELECT name, status FROM player_status WHERE dateKey")) {
      const dateKey = this.args[0];
      return { results: [...this.db.statusRows.values()].filter(r => r.dateKey === dateKey).map(r => ({ name: r.name, status: r.status })) };
    }
    if (this.sql.includes("SELECT dateKey, name, status FROM player_status")) {
      return { results: [...this.db.statusRows.values()].map(r => ({ dateKey: r.dateKey, name: r.name, status: r.status })) };
    }
    if (this.sql.includes("SELECT ts, action, name, actor, actorType, details FROM audit_events")) {
      const dateKey = this.args[0];
      const limit = this.args[1] || 300;
      return { results: this.db.auditRows.filter(r => r.dateKey === dateKey).sort((a,b)=>b.ts-a.ts).slice(0, limit) };
    }
    throw new Error("Unsupported all SQL: " + this.sql);
  }
  async run() {
    if (this.sql.includes("INSERT INTO days")) {
      const [dateKey, data, updatedAt] = this.args;
      this.db.rows.set(dateKey, { data, updatedAt });
      return { success: true };
    }
    if (this.sql.includes("CREATE TABLE IF NOT EXISTS") || this.sql.includes("CREATE INDEX IF NOT EXISTS")) {
      return { success: true };
    }
    if (this.sql.includes("INSERT INTO player_status")) {
      const [dateKey, name, status, updatedAt, actor, actorType] = this.args;
      this.db.statusRows.set(`${dateKey}::${name}`, { dateKey, name, status, updatedAt, actor, actorType });
      return { success: true };
    }
    if (this.sql.includes("INSERT INTO audit_events") || this.sql.includes("INSERT OR IGNORE INTO audit_events")) {
      const [id, dateKey, ts, action, name, actor, actorType, details] = this.args;
      this.db.auditRows.push({ id, dateKey, ts, action, name, actor, actorType, details });
      return { success: true };
    }
    if (this.sql.includes("DELETE FROM days WHERE dateKey")) {
      this.db.rows.delete(this.args[0]);
      return { success: true };
    }
    if (this.sql.includes("DELETE FROM player_status WHERE dateKey")) {
      const key = this.args[0];
      for (const k of [...this.db.statusRows.keys()]) if (k.startsWith(`${key}::`)) this.db.statusRows.delete(k);
      return { success: true };
    }
    if (this.sql.includes("DELETE FROM audit_events WHERE dateKey")) {
      const key = this.args[0];
      this.db.auditRows = this.db.auditRows.filter(r => r.dateKey !== key);
      return { success: true };
    }
    throw new Error("Unsupported run SQL: " + this.sql);
  }
}
async function call(db, path, method="GET", body=null) {
  const req = new Request("https://example.pages.dev" + path, {
    method,
    headers: body ? { "Content-Type":"application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const res = await onRequest({ request: req, env: { DB: db } });
  const json = await res.json();
  return { status: res.status, json };
}

const { normaliseDateKey, safeDay, buildGroups, isSignupClosedDateKey, londonLocalDateTimeToUtcMillis, DEFAULT_MEMBERS, auditDateLabel } = __test;

assert.equal(normaliseDateKey("2026-06-07"), "2026-06-07");
assert.equal(normaliseDateKey("Sun May 10 2026 00:00:00 GMT+0100 (British Summer Time)"), "2026-05-10");
assert.deepEqual(safeDay({ players:["Bob", "Bob", "", "Colin"], maybes:["Ethan"], locked: 1 }).players, ["Bob", "Colin"]);
assert.equal("maybes" in safeDay({ players:["Bob"], maybes:["Ethan"] }), false, "v15 should not expose maybes");
assert.equal(buildGroups(["A","B","C","D","E"]).flat().length, 5);
assert.equal(isSignupClosedDateKey("2026-05-16", londonLocalDateTimeToUtcMillis(2026,5,6,18,49)), false);
assert.equal(isSignupClosedDateKey("2026-05-16", londonLocalDateTimeToUtcMillis(2026,5,6,18,50)), true);
assert.equal(isSignupClosedDateKey("2026-05-17", londonLocalDateTimeToUtcMillis(2026,5,7,18,49)), false);
assert.equal(isSignupClosedDateKey("2026-05-17", londonLocalDateTimeToUtcMillis(2026,5,7,18,50)), true);
assert.equal(auditDateLabel("2026-06-07"), "Sunday 7 June", "v25 keeps v24 audit date label with amended booking day/date");

const db = new FakeDB();
let r = await call(db, "/api/schedule");
assert.equal(r.status, 200);
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.schedule, {});
assert.ok(r.json.members.includes("Danny"), "Danny should be present in default roster");


r = await call(db, "/api/admin/member", "POST", { name:"Zoe", op:"add", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.ok(r.json.members.includes("Zoe"));
r = await call(db, "/api/schedule");
assert.ok(r.json.members.includes("Zoe"));
r = await call(db, "/api/admin/member", "POST", { name:"Zoe", op:"remove", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.members.includes("Zoe"), false);

r = await call(db, "/api/admin/player-pin", "POST", { name:"Jason", pin:"1111", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.configured.Jason, true);

r = await call(db, "/api/player-login", "POST", { name:"Jason", pin:"1111" });
assert.equal(r.json.ok, true);

r = await call(db, "/api/player-status", "POST", { dateKey:"2026-06-07", name:"Jason", status:"maybe", playerName:"Jason", playerPin:"1111" });
assert.equal(r.status, 400, "maybe status should be rejected in v15");
assert.equal(r.json.ok, false);

r = await call(db, "/api/player-status", "POST", { dateKey:"2026-06-07", name:"Jason", status:"playing", playerName:"Jason", playerPin:"1111" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, ["Jason"]);
assert.equal("maybes" in r.json.data, false);
r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2026-06-07");
assert.equal(r.json.ok, true);
assert.equal(r.json.events[0].action, "joined", "v23 should read joined events from audit_events table");
assert.equal(r.json.events[0].dateLabel, "Sunday 7 June", "v25 keeps v24 audit event amended booking day/date");
assert.equal(r.json.events[0].from, "none", "v25 keeps v24 audit event previous booking status");
assert.equal(r.json.events[0].to, "playing", "v25 keeps v24 audit event new booking status");

r = await call(db, "/api/player-status", "POST", { dateKey:"2026-06-07", name:"Jason", status:"none", playerName:"Jason", playerPin:"1111" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, []);
r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2026-06-07");
assert.equal(r.json.ok, true);
assert.ok(r.json.events.some(e => e.action === "joined"));
assert.ok(r.json.events.some(e => e.action === "removed_self"));

await db.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind("2026-06-08", JSON.stringify({ players: [], audit: [{ ts: 123, action: "legacy_event", name: "Legacy", actor: "Admin", actorType: "admin" }] }), 123).run();
r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2026-06-08");
assert.equal(r.json.ok, true);
assert.ok(r.json.events.some(e => e.action === "legacy_event"), "v23 should migrate legacy day.audit into audit_events on lookup");

r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2026-06-07", name:"Ethan", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, ["Ethan"]);

r = await call(db, "/api/admin/priority", "POST", { dateKey:"2026-06-07", name:"Ethan", priority:true, adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.priorityPlayers, ["Ethan"]);

r = await call(db, "/api/admin/lock", "POST", { dateKey:"2026-06-07", locked:true, adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.data.locked, true);
assert.ok(Array.isArray(r.json.data.draw));

r = await call(db, "/api/admin/competition", "POST", { dateKey:"2026-06-07", competition:"Stableford", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.data.competition, "Stableford");
r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2026-06-07");
assert.ok(r.json.events.some(e => e.action === "competition_changed" && e.dateLabel === "Sunday 7 June" && e.to === "Stableford"), "v25 keeps v24 competition audit date and new value");

r = await call(db, "/api/schedule");
assert.equal(r.json.schedule["2026-06-07"].players[0], "Ethan");
assert.equal("maybes" in r.json.schedule["2026-06-07"], false);

r = await call(db, "/api/admin/delete-day", "POST", { dateKey:"2026-06-07", adminPin:"2727" });
assert.equal(r.json.ok, true);

console.log("PASS: 30 API/helper tests passed");

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!html.includes('const VERSION = "v25"')) throw new Error("v25 marker missing");
if (!html.includes('LIVE- ${VERSION}')) throw new Error('short live version label missing');
if (!html.includes('.status { position:absolute; top:18px; left:14px;')) throw new Error('v25 live version status should be positioned top-left');
if (!html.includes('setActiveDay("sat");') || !html.includes('const saturdayKey = e.target.value;')) throw new Error("v20 weekend change must default selected day to Saturday");
if (!html.includes("upcoming.slice(0, 8)")) throw new Error("non-admin 8-week future limit missing");
if (!html.includes("Copy confirmed attendee list for WhatsApp")) throw new Error("WhatsApp confirmed attendee list button missing");
if (!html.includes("Copy sign-up reminder for WhatsApp")) throw new Error("WhatsApp reminder button missing");
if (!html.includes("setEditingComp(false); setCompInput(\"\"); }, [dateKey])")) throw new Error("competition edit reset on date change missing");
if (!html.includes("getSignupCutoff")) throw new Error("client signup cutoff helper missing");
if (!html.includes("Add to booking?")) throw new Error("add confirmation modal missing");
if (!html.includes("CONFIRMED FOR THIS DATE")) throw new Error("locked-date confirmed summary box missing");
if (!html.includes("--page-bg: #e9f0e4")) throw new Error("soft sage page background missing");
if (!html.includes("YOUR PLAYER LOGIN")) throw new Error("player login box missing");
if (!html.includes("PLAYER PIN MANAGEMENT")) throw new Error("admin PIN management UI missing");
if (!html.includes("ROSTER MANAGEMENT")) throw new Error("admin roster management UI missing");
if (!html.includes("admin/member")) throw new Error("admin member API call missing");
if (!html.includes("Danny")) throw new Error("Danny missing from default roster");
if (!html.includes("priorityBtn")) throw new Error("early tee priority UI missing");
if (!html.includes("Activity log")) throw new Error("admin audit log UI missing");
for (const forbidden of ["Maybe", "currentMaybes", "confirmMaybe", "chooseMaybe", "maybeBtn", "maybeChip"]) {
  if (html.includes(forbidden)) throw new Error(`Maybe feature should be removed from UI: ${forbidden}`);
}
if (html.includes("MAYBE PLAYING") || html.includes("CHOOSE PLAYING OR MAYBE")) throw new Error("Maybe user-facing copy should be removed");
if (!html.includes("shouldPinLoggedInPlayer")) throw new Error("v21 logged-in player pinning helper missing");
if (!html.includes("(!effectiveLocked || currentPlayers.includes(playerName))")) throw new Error("v21 locked/not-playing exception missing");
if (!html.includes("[playerName, ...basePlayerDisplayNames.filter(name => name !== playerName)]")) throw new Error("v21 logged-in player should be placed first when pinned");
if (!html.includes("playerLogoutBtn")) throw new Error("v22 player logout button style missing");
if (!html.includes("!adminMode && !pinLoggedIn && React.createElement")) throw new Error("v22 login box should hide once player is logged in");
if (!html.includes("!adminMode && pinLoggedIn && React.createElement(\"button\", { className: \"playerLogoutBtn\"")) throw new Error("v22 logged-in player logout button missing");
if (!html.includes("LOG OFF ${playerName}")) throw new Error("v22 logout button should show logged-in player name");
if (!html.includes("Activity log, live DB")) throw new Error("v23 audit log should be labelled as live DB-backed");
if (!html.includes("setInterval(loadAudit, 5000)")) throw new Error("v23 audit log should live-poll the D1 lookup while open");
if (!html.includes("Reading latest activity directly from D1")) throw new Error("v23 audit status copy missing");
if (!html.includes("changed booking status for ${day}")) throw new Error("v24 audit log should describe the amended booking day/date");
if (!html.includes("changed ${name} for ${day}")) throw new Error("v24 audit log should describe player booking changes by day/date");
if (!html.includes("changed competition for ${day}")) throw new Error("v24 audit log should describe competition changes by day/date");
if (html.includes("auditEvents.length || (current.audit || []).length")) throw new Error("v23 UI should not fall back to local day.audit counts");
console.log("PASS: v25 UI regression checks passed");

