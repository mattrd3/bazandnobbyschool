import assert from "node:assert/strict";
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
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const res = await onRequest({ request: req, env: { DB: db } });
  const json = await res.json();
  return { status: res.status, json };
}

const { normaliseDateKey, safeDay, buildGroups, isSignupClosedDateKey, londonLocalDateTimeToUtcMillis } = __test;

assert.equal(normaliseDateKey("2026-06-07"), "2026-06-07");
assert.equal(normaliseDateKey("Sun May 10 2026 00:00:00 GMT+0100 (British Summer Time)"), "2026-05-10");
assert.deepEqual(safeDay({ players:["Bob", "Bob", "", "Colin"], locked: 1 }).players, ["Bob", "Colin"]);
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

r = await call(db, "/api/toggle-player", "POST", { dateKey:"2026-06-07", name:"Jason" });
assert.equal(r.json.ok, true);
assert.equal(r.json.dateKey, "2026-06-07");
assert.deepEqual(r.json.data.players, ["Jason"]);
assert.equal(r.json.data.audit[0].action, "joined");

r = await call(db, "/api/toggle-player", "POST", { dateKey:"2026-06-07", name:"Jason" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, []);
assert.equal(r.json.data.audit.at(-1).action, "removed_self");

r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2026-06-07", name:"Ethan", adminPin:"bad" });
assert.equal(r.status, 403);
assert.equal(r.json.ok, false);

r = await call(db, "/api/admin/add-player", "POST", { dateKey:"2026-06-07", name:"Ethan", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.deepEqual(r.json.data.players, ["Ethan"]);
assert.equal(r.json.data.audit.at(-1).action, "admin_added");

r = await call(db, "/api/admin/lock", "POST", { dateKey:"2026-06-07", locked:true, adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.data.locked, true);
assert.ok(Array.isArray(r.json.data.draw));

r = await call(db, "/api/toggle-player", "POST", { dateKey:"2026-06-07", name:"Bob" });
assert.equal(r.status, 403);
assert.equal(r.json.ok, false);

r = await call(db, "/api/admin/competition", "POST", { dateKey:"2026-06-07", competition:"Stableford", adminPin:"2727" });
assert.equal(r.json.ok, true);
assert.equal(r.json.data.competition, "Stableford");

r = await call(db, "/api/schedule");
assert.equal(r.json.schedule["2026-06-07"].players[0], "Ethan");
assert.equal(r.json.schedule["2026-06-07"].competition, "Stableford");

r = await call(db, "/api/admin/export?adminPin=2727");
assert.equal(r.json.ok, true);
assert.ok(r.json.schedule["2026-06-07"]);

r = await call(db, "/api/admin/delete-day", "POST", { dateKey:"2026-06-07", adminPin:"2727" });
assert.equal(r.json.ok, true);
r = await call(db, "/api/schedule");
assert.equal(r.json.schedule["2026-06-07"], undefined);

console.log("PASS: 18 API/helper tests passed");


// v2 static checks
import fs from "fs";
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!html.includes("v9")) throw new Error("v9 marker missing");
if (!html.includes('LIVE- ${VERSION}')) throw new Error('short live version label missing');
if (html.includes('CLOUDFLARE D1 v5 BOOKING WINDOW')) throw new Error('long patch label still present');

if (html.includes('value={`${toDateKey(chosenW.sat)}|${activeDay}`}')) throw new Error("old duplicate Sat/Sun dropdown still present");
if (!html.includes("<option key={toDateKey(w.sat)} value={toDateKey(w.sat)}>{optionLabel(w,i)}</option>")) throw new Error("single-weekend dropdown option missing");
if (!html.includes("competition: savedComp || fixtureComp")) throw new Error("fixture competition fallback missing");
if (html.includes("Sat: ${satComp}") || html.includes("Sun: ${sunComp}")) throw new Error("competition names should not appear in weekend dropdown labels");
console.log("PASS: v9 static dropdown/fallback checks passed");

// v3 static feature/usability checks
const htmlV3 = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!htmlV3.includes("v9")) throw new Error("v9 marker missing");
if (!htmlV3.includes("upcoming.slice(0,8)")) throw new Error("non-admin 8-week future limit missing");
if (!htmlV3.includes("Copy confirmed attendee list for WhatsApp")) throw new Error("WhatsApp confirmed attendee list button missing");
if (!htmlV3.includes("Copy sign-up reminder for WhatsApp")) throw new Error("WhatsApp reminder button missing");
if (!htmlV3.includes("buildConfirmedListText")) throw new Error("confirmed attendee list builder missing");
if (!htmlV3.includes("buildReminderText")) throw new Error("reminder text builder missing");
if (!htmlV3.includes("setEditingComp(false); setCompInput(\"\"); }, [dateKey])")) throw new Error("competition edit reset on date change missing");
if (!htmlV3.includes("Competition name for this day only")) throw new Error("competition edit day-specific placeholder missing");
if (!htmlV3.includes(">Cancel</button>")) throw new Error("competition edit cancel button missing");
console.log("PASS: v9 admin WhatsApp/competition usability checks passed");

// v8 booking-window checks
const htmlV5 = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!htmlV5.includes("getSignupCutoff")) throw new Error("client signup cutoff helper missing");
if (!htmlV5.includes("Sign-up closes")) throw new Error("signup close message missing");
if (!htmlV5.includes("list visible only")) throw new Error("closed-but-visible list message missing");
if (!htmlV5.includes("signupClosed = isSignupClosed(currentDate)")) throw new Error("per-day signup closed logic missing");
console.log("PASS: v9 booking-window UI checks passed");

// v8 add-confirmation checks
const htmlV8 = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!htmlV8.includes("const [confirmAdd,setConfirmAdd]=useState(null)")) throw new Error("add confirmation state missing");
if (!htmlV8.includes("Add to booking?")) throw new Error("add confirmation modal heading missing");
if (!htmlV8.includes("Please confirm this is the correct player and date before saving.")) throw new Error("clear add confirmation message missing");
if (!htmlV8.includes("setConfirmAdd({ name, mode: \"toggle\" })")) throw new Error("player tap should open add confirmation instead of saving immediately");
if (!htmlV8.includes("mode:\"adminManual\"")) throw new Error("admin manual add confirmation missing");
console.log("PASS: v9 add confirmation UI checks passed");


// v9 locked-date confirmed-player visibility checks
const htmlV9 = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (!htmlV9.includes("confirmedBox")) throw new Error("locked-date confirmed summary box missing");
if (!htmlV9.includes("CONFIRMED FOR THIS DATE")) throw new Error("locked-date confirmed heading missing");
if (!htmlV9.includes("playerDisplayNames = effectiveLocked")) throw new Error("confirmed players should be sorted to top when locked/closed");
if (!htmlV9.includes("CONFIRMED PLAYERS SHOWN FIRST")) throw new Error("locked list label should explain confirmed players are shown first");
if (!htmlV9.includes('current.players.map((p,i)=><span className="chip"')) throw new Error('confirmed chips should render from current.players');
console.log("PASS: v9 locked-date confirmed-player UI checks passed");
