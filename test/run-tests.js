import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequest, __test } from "../functions/api/[[path]].js";

class FakeDB {
  constructor() { this.rows = new Map(); }
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
    throw new Error("Unsupported all SQL: " + this.sql);
  }
  async run() {
    if (this.sql.includes("INSERT INTO days")) {
      const [dateKey, data, updatedAt] = this.args;
      this.db.rows.set(dateKey, { data, updatedAt });
      return { success: true };
    }
    if (this.sql.includes("DELETE FROM days WHERE dateKey")) {
      this.db.rows.delete(this.args[0]);
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

const { normaliseDateKey, safeDay, buildGroups, isSignupClosedDateKey, londonLocalDateTimeToUtcMillis } = __test;

assert.equal(normaliseDateKey("2026-06-07"), "2026-06-07");
assert.equal(normaliseDateKey("Sun May 10 2026 00:00:00 GMT+0100 (British Summer Time)"), "2026-05-10");
assert.deepEqual(safeDay({ players:["Bob", "Bob", "", "Colin"], maybes:["Ethan"], locked: 1 }).players, ["Bob", "Colin"]);
assert.equal("maybes" in safeDay({ players:["Bob"], maybes:["Ethan"] }), false, "v15 should not expose maybes");
assert.equal(buildGroups(["A","B","C","D","E"]).flat().length, 5);
assert.equal(isSignupClosedDateKey("2026-05-16", londonLocalDateTimeToUtcMillis(2026,5,6,18,49)), false);
assert.equal(isSignupClosedDateKey("2026-05-16", londonLocalDateTimeToUtcMillis(2026,5,6,18,50)), true);
assert.equal(isSignupClosedDateKey("2026-05-17", londonLocalDateTimeToUtcMillis(2026,5,7,18,49)), false);
assert.equal(isSignupClosedDateKey("2026-05-17", londonLocalDateTimeToUtcMillis(2026,5,7,18,50)), true);

const db = new FakeDB();
let r = await call(db, "/api/schedule");
assert.equal(r.status, 200);
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.schedule, {});

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
assert.equal(r.json.data.audit.at(-1).action, "joined");

r = await call(db, "/api/player-status", "POST", { dateKey:"2026-06-07", name:"Jason", status:"none", playerName:"Jason", playerPin:"1111" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, []);
assert.equal(r.json.data.audit.at(-1).action, "removed_self");

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

r = await call(db, "/api/schedule");
assert.equal(r.json.schedule["2026-06-07"].players[0], "Ethan");
assert.equal("maybes" in r.json.schedule["2026-06-07"], false);

r = await call(db, "/api/admin/delete-day", "POST", { dateKey:"2026-06-07", adminPin:"2727" });
assert.equal(r.json.ok, true);

console.log("PASS: 24 API/helper tests passed");

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!html.includes('const VERSION = "v15"')) throw new Error("v15 marker missing");
if (!html.includes('LIVE- ${VERSION}')) throw new Error('short live version label missing');
if (!html.includes("upcoming.slice(0,8)")) throw new Error("non-admin 8-week future limit missing");
if (!html.includes("Copy confirmed attendee list for WhatsApp")) throw new Error("WhatsApp confirmed attendee list button missing");
if (!html.includes("Copy sign-up reminder for WhatsApp")) throw new Error("WhatsApp reminder button missing");
if (!html.includes("setEditingComp(false); setCompInput(\"\"); }, [dateKey])")) throw new Error("competition edit reset on date change missing");
if (!html.includes("getSignupCutoff")) throw new Error("client signup cutoff helper missing");
if (!html.includes("Add to booking?")) throw new Error("add confirmation modal missing");
if (!html.includes("CONFIRMED FOR THIS DATE")) throw new Error("locked-date confirmed summary box missing");
if (!html.includes("--page-bg: #e9f0e4")) throw new Error("soft sage page background missing");
if (!html.includes("YOUR PLAYER LOGIN")) throw new Error("player login box missing");
if (!html.includes("PLAYER PIN MANAGEMENT")) throw new Error("admin PIN management UI missing");
if (!html.includes("priorityBtn")) throw new Error("early tee priority UI missing");
if (!html.includes("Activity log")) throw new Error("admin audit log UI missing");
for (const forbidden of ["Maybe", "currentMaybes", "confirmMaybe", "chooseMaybe", "maybeBtn", "maybeChip"]) {
  if (html.includes(forbidden)) throw new Error(`Maybe feature should be removed from UI: ${forbidden}`);
}
if (html.includes("MAYBE PLAYING") || html.includes("CHOOSE PLAYING OR MAYBE")) throw new Error("Maybe user-facing copy should be removed");
console.log("PASS: v15 UI regression checks passed");
