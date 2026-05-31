import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequest, __test } from "../functions/api/[[path]].js";

class FakeDB {
  constructor() { this.rows = new Map(); this.statusRows = new Map(); this.auditRows = []; this.brsRows = []; }
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
    if (this.sql.includes("SELECT dateKey, createdAt, createdBy, bookersJson") && this.sql.includes("FROM brs_bookings")) {
      const [start, end] = this.args;
      return { results: this.db.brsRows.filter(r => r.dateKey >= start && r.dateKey <= end).sort((a,b)=>b.dateKey.localeCompare(a.dateKey) || b.createdAt-a.createdAt) };
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
    if (this.sql.includes("INSERT INTO brs_bookings")) {
      const [id, dateKey, createdAt, createdBy, bookersJson, confirmedPlayersJson, groupsJson, spareBookersJson, detailsJson] = this.args;
      this.db.brsRows.push({ id, dateKey, createdAt, createdBy, bookersJson, confirmedPlayersJson, groupsJson, spareBookersJson, detailsJson });
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
    if (this.sql.includes("DELETE FROM brs_bookings WHERE dateKey")) {
      const key = this.args[0];
      this.db.brsRows = this.db.brsRows.filter(r => r.dateKey !== key);
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

const { normaliseDateKey, safeDay, buildGroups, isSignupClosedDateKey, londonLocalDateTimeToUtcMillis, DEFAULT_MEMBERS, auditDateLabel, buildBRSBookingGroups, getSeasonBounds } = __test;

assert.equal(normaliseDateKey("2027-06-06"), "2027-06-06");
assert.equal(normaliseDateKey("Sun May 10 2026 00:00:00 GMT+0100 (British Summer Time)"), "2026-05-10");
assert.deepEqual(safeDay({ players:["Bob", "Bob", "", "Colin"], maybes:["Ethan"], locked: 1 }).players, ["Bob", "Colin"]);
assert.equal("maybes" in safeDay({ players:["Bob"], maybes:["Ethan"] }), false, "v15 should not expose maybes");
assert.equal(buildGroups(["A","B","C","D","E"]).flat().length, 5);
assert.equal(isSignupClosedDateKey("2026-05-16", londonLocalDateTimeToUtcMillis(2026,5,6,18,49)), false);
assert.equal(isSignupClosedDateKey("2026-05-16", londonLocalDateTimeToUtcMillis(2026,5,6,18,50)), true);
assert.equal(isSignupClosedDateKey("2026-05-17", londonLocalDateTimeToUtcMillis(2026,5,7,18,49)), false);
assert.equal(isSignupClosedDateKey("2026-05-17", londonLocalDateTimeToUtcMillis(2026,5,7,18,50)), true);
assert.equal(auditDateLabel("2027-06-06"), "Sunday 6 June", "v29 keeps v24 audit date label with amended booking day/date");
assert.deepEqual(getSeasonBounds("2026-05-17"), { start:"2026-04-01", end:"2027-03-31", label:"2026/27" }, "v38 BRS league season should run April to March");
const brsScenario = buildBRSBookingGroups(["Baby Dave", "Meeky", "Kevin", "Mark", "Bob", "Danny", "Doc", "Wayne"], ["Baby Dave", "Colin"]);
assert.equal(brsScenario.teeTimesNeeded, 2, "v38 BRS helper should calculate tee times needed");
assert.equal(brsScenario.groups[0].booker, "Baby Dave", "v38 playing booker should own their group");
assert.ok(brsScenario.groups[0].players.includes("Baby Dave"), "v38 playing booker should be included as a player");
assert.equal(brsScenario.groups[1].booker, "Colin", "v38 non-playing booker should still own a BRS group");
assert.equal(brsScenario.groups[1].players.includes("Colin"), false, "v38 non-playing booker should not be added as a player");

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

r = await call(db, "/api/player/weekend-summary", "POST", { playerName:"Jason", playerPin:"1111", weekends:[{ sat:"2027-06-05", sun:"2027-06-06" }] });
assert.equal(r.json.ok, true, "v29 player weekend summary should authenticate and return personal booking indicators");
assert.deepEqual(r.json.summary["2027-06-05"], { sat:"none", sun:"none" }, "v32 initially shows no personal response for that weekend");

r = await call(db, "/api/player-status", "POST", { dateKey:"2027-06-06", name:"Jason", status:"maybe", playerName:"Jason", playerPin:"1111" });
assert.equal(r.status, 400, "maybe status should be rejected in v15");
assert.equal(r.json.ok, false);

r = await call(db, "/api/player-status", "POST", { dateKey:"2027-06-06", name:"Jason", status:"playing", playerName:"Jason", playerPin:"1111" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, ["Jason"]);
assert.equal("maybes" in r.json.data, false);

r = await call(db, "/api/player/weekend-summary", "POST", { playerName:"Jason", playerPin:"1111", weekends:[{ sat:"2027-06-05", sun:"2027-06-06" }] });
assert.deepEqual(r.json.summary["2027-06-05"], { sat:"none", sun:"playing" }, "v32 should show Jason playing on Sunday only");
r = await call(db, "/api/player-status", "POST", { dateKey:"2027-06-05", name:"Jason", status:"unavailable", playerName:"Jason", playerPin:"1111" });
assert.equal(r.json.ok, true, "v32 should allow players to mark themselves unavailable");
assert.deepEqual(r.json.data.unavailablePlayers, ["Jason"]);
r = await call(db, "/api/player/weekend-summary", "POST", { playerName:"Jason", playerPin:"1111", weekends:[{ sat:"2027-06-05", sun:"2027-06-06" }] });
assert.deepEqual(r.json.summary["2027-06-05"], { sat:"unavailable", sun:"playing" }, "v32 weekend summary should distinguish unavailable and playing days");

r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2027-06-06");
assert.equal(r.json.ok, true);
assert.equal(r.json.events[0].action, "joined", "v23 should read joined events from audit_events table");
assert.equal(r.json.events[0].dateLabel, "Sunday 6 June", "v29 keeps v24 audit event amended booking day/date");
assert.equal(r.json.events[0].from, "none", "v29 keeps v24 audit event previous booking status");
assert.equal(r.json.events[0].to, "playing", "v29 keeps v24 audit event new booking status");

r = await call(db, "/api/player-status", "POST", { dateKey:"2027-06-06", name:"Jason", status:"none", playerName:"Jason", playerPin:"1111" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, []);
r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2027-06-06");
assert.equal(r.json.ok, true);
assert.ok(r.json.events.some(e => e.action === "joined"));
assert.ok(r.json.events.some(e => e.action === "removed_self"));

await db.prepare(`INSERT INTO days (dateKey, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`).bind("2027-06-07", JSON.stringify({ players: [], audit: [{ ts: 123, action: "legacy_event", name: "Legacy", actor: "Admin", actorType: "admin" }] }), 123).run();
r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2027-06-07");
assert.equal(r.json.ok, true);
assert.ok(r.json.events.some(e => e.action === "legacy_event"), "v23 should migrate legacy day.audit into audit_events on lookup");

r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2027-06-06", name:"Ethan", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, ["Ethan"]);

r = await call(db, "/api/admin/priority", "POST", { dateKey:"2027-06-06", name:"Ethan", priority:true, adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.priorityPlayers, ["Ethan"]);
r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2027-06-06", name:"Bob", adminPin:"2727" });
assert.equal(r.json.ok, true);
r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2027-06-06", name:"Wayne", adminPin:"2727" });
assert.equal(r.json.ok, true);
r = await call(db, "/api/admin/priority", "POST", { dateKey:"2027-06-06", name:"Wayne", preference:"late", adminPin:"2727" });
assert.equal(r.json.ok, true, "v45 should allow admin to set a late tee preference");
assert.deepEqual(r.json.data.latePriorityPlayers, ["Wayne"]);
r = await call(db, "/api/admin/day-message", "POST", { dateKey:"2027-06-06", dayMessage:"Drawn competition - please be flexible on tee time.", adminPin:"2727" });
assert.equal(r.json.ok, true, "v45 should save an optional day booking message without a schema migration");
assert.equal(r.json.data.dayMessage, "Drawn competition - please be flexible on tee time.");

r = await call(db, "/api/admin/lock", "POST", { dateKey:"2027-06-06", locked:true, adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.data.locked, true);
assert.ok(Array.isArray(r.json.data.draw));
assert.equal(r.json.data.draw.flat()[0], "Ethan", "v45 early preference should be placed before standard/late players where possible");
assert.equal(r.json.data.draw.flat().at(-1), "Wayne", "v45 late preference should be placed after standard/early players where possible");

r = await call(db, "/api/admin/competition", "POST", { dateKey:"2027-06-06", competition:"Stableford", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.data.competition, "Stableford");
r = await call(db, "/api/admin/audit?adminPin=2727&dateKey=2027-06-06");
assert.ok(r.json.events.some(e => e.action === "competition_changed" && e.dateLabel === "Sunday 6 June" && e.to === "Stableford"), "v29 keeps v24 competition audit date and new value");

r = await call(db, "/api/schedule");
assert.equal(r.json.schedule["2027-06-06"].players[0], "Ethan");
assert.equal(r.json.schedule["2027-06-06"].dayMessage, "Drawn competition - please be flexible on tee time.");
assert.equal("maybes" in r.json.schedule["2027-06-06"], false);

r = await call(db, "/api/admin/booking-stats?adminPin=2727&period=12&asOf=2027-06-30");
assert.equal(r.json.ok, true, "v36 booking stats endpoint should return admin stats");
const jasonStats = r.json.stats.find(x => x.name === "Jason");
const ethanStats = r.json.stats.find(x => x.name === "Ethan");
assert.equal(jasonStats.unavailable, 1, "v36 stats should count unavailable player days");
assert.equal(ethanStats.booked, 1, "v36 stats should count booked player days");
assert.ok(jasonStats.noResponse >= 1, "v36 stats should count no-response days");

r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2027-06-13", name:"Baby Dave", adminPin:"2727" });
assert.equal(r.json.ok, true);
r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2027-06-13", name:"Meeky", adminPin:"2727" });
assert.equal(r.json.ok, true);
r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2027-06-13", name:"Kevin", adminPin:"2727" });
assert.equal(r.json.ok, true);
r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2027-06-13", name:"Mark Mark", adminPin:"2727" });
assert.equal(r.json.ok, true);
await db.prepare("INSERT INTO brs_bookings (id, dateKey, createdAt, createdBy, bookersJson, confirmedPlayersJson, groupsJson, spareBookersJson, detailsJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("legacy-brs", "2027-06-13", Date.now(), "Admin", JSON.stringify(["Meeky"]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify({})).run();
r = await call(db, "/api/brs-booking/league?adminPin=2727&asOf=2027-06-30");
assert.equal(r.json.ok, true, "v40 BRS league endpoint should return season stats");
assert.equal(r.json.season.label, "2027/28");
assert.equal(r.json.league.length, 0, "v40 BRS league should ignore historic/pre-v40 records with no league eligibility marker");
r = await call(db, "/api/brs-booking", "POST", { dateKey:"2027-06-13", bookers:["Baby Dave"], adminPin:"2727" });
assert.equal(r.json.ok, true, "v41 BRS Booking endpoint should create operational groups without league-save side effects");
assert.equal(r.json.booking.groups[0].booker, "Baby Dave");
assert.ok(r.json.booking.groups[0].players.includes("Baby Dave"));
r = await call(db, "/api/brs-booking/league?adminPin=2727&asOf=2027-06-30");
assert.equal(r.json.ok, true, "v41 BRS league endpoint should still return season stats while parked");
assert.equal(r.json.league.length, 0, "v41 BRS create groups should not add league rows because BRS reporting is parked");
r = await call(db, "/api/admin/booking-stats?playerName=Jason&playerPin=1111&period=12&asOf=2027-06-30");
assert.equal(r.json.ok, true, "v40 booking stats should be available to logged-in players");
assert.equal(r.json.includeNoResponse, false, "v40 non-admin booking stats should hide no-response visibility");
assert.equal("noResponse" in r.json.stats[0], false, "v40 non-admin booking stats should not include noResponse values");

r = await call(db, "/api/admin/delete-day", "POST", { dateKey:"2027-06-06", adminPin:"2727" });
assert.equal(r.json.ok, true);

console.log("PASS: 39 API/helper tests passed");

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!html.includes('const VERSION = "v50"')) throw new Error("v50 marker missing");
if (!html.includes('LIVE- ${VERSION}')) throw new Error('short live version label missing');
if (!html.includes('.versionBtn')) throw new Error('v29 live version should be a clickable release-notes button');
if (!html.includes('className: "headerRight"')) throw new Error('v29 version/admin controls should sit top-right');
if (!html.includes('setActiveDay("sat");') || !html.includes('const saturdayKey = e.target.value;')) throw new Error("v20 weekend change must default selected day to Saturday");
if (!html.includes("upcoming.slice(0, 8)")) throw new Error("non-admin 8-week future limit missing");
if (!html.includes("Copy confirmed attendee list for WhatsApp")) throw new Error("WhatsApp confirmed attendee list button missing");
if (!html.includes("Copy sign-up reminder for WhatsApp")) throw new Error("WhatsApp reminder button missing");
if (!html.includes("Copy not-booked weekend list for WhatsApp")) throw new Error("v30 WhatsApp not-booked weekend list button missing");
if (!html.includes("buildNotBookedWeekendText")) throw new Error("v30 not-booked weekend WhatsApp message builder missing");
if (!html.includes("notBookedForWeekend")) throw new Error("v30 not-booked weekend roster helper missing");
if (!html.includes("Players not booked and not marked unavailable for Saturday or Sunday")) throw new Error("v32 not-booked WhatsApp copy should exclude unavailable players");
if (!html.includes("setEditingComp(false); setCompInput(\"\");") || !html.includes("setShowTeeTimesEditor(false); setTeeTimeInputs([]);")) throw new Error("competition/tee-time edit reset on date change missing");
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
if (!html.includes("(!effectiveLocked || currentPlayers.includes(playerName) || currentUnavailable.includes(playerName))")) throw new Error("v32 locked/not-playing/unavailable pinning exception missing");
if (!html.includes("[playerName, ...basePlayerDisplayNames.filter(name => name !== playerName)]")) throw new Error("v21 logged-in player should be placed first when pinned");
if (!html.includes("playerLogoutBtn")) throw new Error("v22 player logout button style missing");
if (!html.includes("!adminMode && !pinLoggedIn && React.createElement")) throw new Error("v22 login box should hide once player is logged in");
if (!html.includes("!adminMode && pinLoggedIn && React.createElement(\"button\", { className: \"playerLogoutBtn\"")) throw new Error("v22 logged-in player logout button missing");
if (!html.includes("LOG OFF") || !html.includes("logoutName")) throw new Error("v29 logout button should show logged-in player name on a second row");
if (!html.includes("Activity log, live DB")) throw new Error("v23 audit log should be labelled as live DB-backed");
if (!html.includes("setInterval(loadAudit, 5000)")) throw new Error("v23 audit log should live-poll the D1 lookup while open");
if (!html.includes("Reading latest activity directly from D1")) throw new Error("v23 audit status copy missing");
if (!html.includes("changed booking status for ${day}")) throw new Error("v24 audit log should describe the amended booking day/date");
if (!html.includes("changed ${name} for ${day}")) throw new Error("v24 audit log should describe player booking changes by day/date");
if (!html.includes("changed competition for ${day}")) throw new Error("v24 audit log should describe competition changes by day/date");
if (html.includes("auditEvents.length || (current.audit || []).length")) throw new Error("v23 UI should not fall back to local day.audit counts");
if (!html.includes("padding: 8px 10px 8px")) throw new Error("v29 header should remain compact to save vertical space");
if (!html.includes("fontSize: 22, lineHeight: 1")) throw new Error("v29 golf icon should remain visible but smaller");
if (!html.includes('className: "headerLeft"')) throw new Error('v29 logoff control should move to the top-left');
if (!html.includes('String(playerName || "").toUpperCase()')) throw new Error('v29 logged-in player name should display in capitals');
if (!html.includes('className: "logoutName"')) throw new Error('v29 logoff player name should have safe truncation styling');
if (!html.includes('RELEASE_NOTES')) throw new Error('v28 release notes data missing');
if (!html.includes('setShowReleaseNotes(true)')) throw new Error('v27 version button should open release notes');

if (!html.includes('personalWeekendBookingIcon')) throw new Error('v32 personal weekend booking icon helper missing');
if (!html.includes('player/weekend-summary')) throw new Error('v32 should use a D1-backed player weekend summary lookup');
if (!html.includes('playerWeekendSummary')) throw new Error('v32 player weekend summary state missing');
if (!html.includes('statusIcon') || !html.includes('status === "playing" ? "🟢"') || !html.includes('status === "unavailable" ? "⚪"') || !html.includes(': "🔴"')) throw new Error('v32 weekend dropdown must distinguish booked, unavailable and no response with circular icons');
if (!html.includes('unavailablePlayers')) throw new Error('v32 unavailable player storage/display missing');
if (!html.includes('CHOOSE PLAYING OR UNAVAILABLE')) throw new Error('v32 unavailable UI label missing');
if (!html.includes('unavailableBtn')) throw new Error('v32 unavailable button missing');
if (!html.includes('MY BOOKINGS') || !html.includes('showMyBookings') || !html.includes('myBookingRows')) throw new Error('v32 My Bookings modal/button missing');
if (!html.includes('Players not booked and not marked unavailable for Saturday or Sunday')) throw new Error('v32 not-booked WhatsApp copy should exclude unavailable players');
if (html.includes('weekendStatusIcon') || html.includes('isClosedForWeekendPicker') || html.includes('return "🟠"')) throw new Error('v32 should not restore v28 open/closed amber weekend status icons');
if (html.includes('weekend-open') || html.includes('weekend-partial') || html.includes('weekend-closed')) throw new Error('v32 should not add weekend dropdown text-colour classes');
if (!html.includes('Kevin Request clarification: replaced the v28 open/closed weekend icons')) throw new Error('v29 release notes should retain the Kevin Request clarification');
if (!html.includes('return "In 1 week";') || !html.includes('return `In ${futureIndex} weeks`;')) throw new Error("v31 weekend dropdown should use shorter week-based labels");
if (html.includes("Next weekend") || html.includes("In ${futureIndex} weekends")) throw new Error("v31 should remove longer weekend-based future labels");
if (!html.includes('helpBtn')) throw new Error('v33 compact Help button missing');
if (!html.includes('showHelp')) throw new Error('v33 Help modal state missing');
if (!html.includes('Icons and personal weekend status')) throw new Error('v33 Help panel should explain personalised weekend icons');
if (!html.includes('Saturday booking closes at 6:50pm on Wednesday')) throw new Error('v33 Help panel should explain cutoff rules');
if (!html.includes('Admins can copy a sign-up reminder, a confirmed-player list, and a not-booked list')) throw new Error('v33 Help panel should explain WhatsApp tools');
if (!html.includes('setShowReleaseNotes(true)')) throw new Error('v33 Help panel should link to release notes');
if (!html.includes('{ version: "v33", title: "Compact help panel"')) throw new Error('v33 release notes entry missing');
if (!html.includes('One page to see all your bookings so you can see all the days on which you will play terrible golf!')) throw new Error('v34 My Bookings wording missing');
if (!html.includes('{ version: "v34", title: "My Bookings wording"')) throw new Error('v34 release notes entry missing');
if (html.includes('Your upcoming weekend status. This does not take up space on the main booking page.')) throw new Error('v34 should remove old My Bookings wording');

if (!html.includes('{ version: "v35", title: "My Bookings week jump"')) throw new Error('v35 release notes entry missing');
if (!html.includes('Click any week to jump to that weekend to book.')) throw new Error('v35 My Bookings jump instruction missing');
if (!html.includes('jumpToMyBookingWeekend')) throw new Error('v35 My Bookings jump helper missing');
if (!html.includes('onClick: () => jumpToMyBookingWeekend(row.key)')) throw new Error('v35 My Bookings rows should be clickable');
if (!html.includes('setActiveDay("sat");') || !html.includes('setSelectedKey(saturdayKey);')) throw new Error('v35 My Bookings jump should preserve Saturday default');
if (html.includes('View weekend') || html.includes('VIEW WEEKEND')) throw new Error('v35 should not add extra My Bookings view buttons');

if (!html.includes('{ version: "v36", title: "Admin booking stats"')) throw new Error('v36 release notes entry missing');
if (!html.includes('showReporting')) throw new Error('v39 Reporting modal state missing');
if (!html.includes('/api/admin/booking-stats')) throw new Error('v36 Booking Stats should use DB-backed admin endpoint');
if (!html.includes('REPORTING')) throw new Error('v39 Reporting footer button missing');
if (!html.includes('Booked') || !html.includes('Unavailable') || !html.includes('No response')) throw new Error('v36 Booking Stats table headings missing');
if (!html.includes('Most booked') || !html.includes('Least booked') || !html.includes('Most no response')) throw new Error('v36 Booking Stats sort options missing');
if (!html.includes('React.createElement("button", { className: "btn secondary"') || !html.includes('REPORTING')) throw new Error('v46 Reporting should remain admin-only inside compact admin menu');
if (!html.includes('React.createElement("option", { value: "mostNoResponse" }, "Most no response")')) throw new Error('v41 admin Reporting should include no-response sort');
if (!html.includes('React.createElement("th", { style: { textAlign: "right" } }, "No response")')) throw new Error('v41 admin Reporting should include no-response column');
if (!html.includes('Last 4 weeks') || !html.includes('Last 8 weeks') || !html.includes('Last 12 weeks') || !html.includes('All time')) throw new Error('v36 Booking Stats period options missing');
if (!html.includes('BRS League reporting is parked for now')) throw new Error('v41 Help panel should mention parked BRS reporting');
if (!html.includes('{ version: "v38", title: "BRS Booking"')) throw new Error('v38 release notes entry missing');
if (!html.includes('showBRSBooking')) throw new Error('v38 BRS Booking modal state missing');
if (!html.includes('BRS Booking')) throw new Error('v38 BRS Booking button/copy missing');
if (!html.includes('brs-booking')) throw new Error('v38 should use DB-backed BRS booking endpoints');
if (html.includes('🏆 BRS Booking League')) throw new Error('v41 should park/hide the BRS league panel');
if (!html.includes('Copy BRS groups for WhatsApp')) throw new Error('v38 BRS WhatsApp copy button missing');
if (!html.includes('Create groups')) throw new Error('v41 compact BRS group creation button missing');
if (!html.includes('{ version: "v41", title: "BRS Booking mobile cleanup"')) throw new Error('v41 release notes entry missing');

if (!html.includes('{ version: "v42", title: "Current-weekend dropdown fix"')) throw new Error('v42 release notes entry missing');
if (!html.includes('function getCurrentWeekendSaturday(now = new Date())')) throw new Error('v42 current weekend anchor helper missing');
if (!html.includes('day === 0') || !html.includes('day === 1 && minutes < 1')) throw new Error('v42 should keep the current weekend through Sunday and Monday 00:00');
if (html.includes('const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7')) throw new Error('v42 should not skip the current Saturday/Sunday as This weekend');
if (!html.includes('{ version: "v39", title: "Reporting area and BRS speed fix"')) throw new Error('v39 release notes entry missing');
if (!html.includes('clearBRSBooking(); setBRSStatus(""); setShowBRSBooking(true);')) throw new Error('v39 BRS Booking should open with no selected bookers');
if (!html.includes('reportingFooter') || !html.includes('reportingBtn')) throw new Error('v39 Reporting footer styling missing');
if (!html.includes('Admin-only player booking activity')) throw new Error('v41 Reporting should be simplified to admin-only booking activity');
if (!html.includes('brsModalHeader') || !html.includes('brsModalFooter')) throw new Error('v41 BRS modal should have compact sticky header/footer classes');
if (!html.includes('{ version: "v37", title: "Add to Calendar"')) throw new Error('v37 release notes entry missing');
if (!html.includes('calendarBtn')) throw new Error('v37 calendar icon button style missing');
if (!html.includes('buildGoogleCalendarUrl')) throw new Error('v37 Google Calendar URL helper missing');
if (!html.includes('text: "Weekend Golf"')) throw new Error('v37 calendar event title should be Weekend Golf');
if (!html.includes('location: "Druids Heath Golf Club"')) throw new Error('v37 calendar location should be Druids Heath Golf Club');
if (!html.includes('ctz: "Europe/London"')) throw new Error('v37 calendar timezone should be Europe/London');
if (!html.includes('buildGoogleCalendarUrl(date, competition = "", teeTimes = [])')) throw new Error('v43 calendar helper should accept tee times');
if (!html.includes('addHoursToTime(cleanTimes[0] || "08:00", 5)')) throw new Error('v43 calendar event should use first tee time plus five hours with 08:00 fallback');
if (!html.includes('Competition: ${String(competition).trim()}')) throw new Error('v37 calendar description should include competition only');
if (!html.includes('canAddToCalendar = pinLoggedIn && playerName && currentPlayers.includes(playerName)')) throw new Error('v37 calendar icon should only show for logged-in booked players');
if (!html.includes('Add to Google Calendar')) throw new Error('v37 calendar button title missing');
if (!html.includes('{ version: "v43", title: "Tee times and smarter draw/calendar"')) throw new Error('v43 release notes entry missing');
if (!html.includes('teeTimesLine')) throw new Error('v43 compact tee-time display missing');
if (!html.includes('admin/tee-times')) throw new Error('v43 admin tee-time API call missing');
if (!html.includes('Tee times: ')) throw new Error('v43 tee times display/copy text missing');
if (!html.includes('buildDrawWhatsAppText')) throw new Error('v43 draw WhatsApp copy builder missing');
if (!html.includes('Copy WhatsApp draw message')) throw new Error('v50 draw WhatsApp copy button missing');
if (!html.includes('teeTimeForGroup(i)')) throw new Error('v43 draw display should include tee times when available');
console.log("PASS: v43 UI regression checks passed");
