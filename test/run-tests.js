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

const { normaliseDateKey, safeDay, buildGroups } = __test;

assert.equal(normaliseDateKey("2026-06-07"), "2026-06-07");
assert.equal(normaliseDateKey("Sun May 10 2026 00:00:00 GMT+0100 (British Summer Time)"), "2026-05-10");
assert.deepEqual(safeDay({ players:["Bob", "Bob", "", "Colin"], locked: 1 }).players, ["Bob", "Colin"]);
assert.equal(buildGroups(["A","B","C","D","E"]).flat().length, 5);

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

console.log("PASS: 13 tests passed");
