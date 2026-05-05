import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));

const SITE_URL = (process.env.SITE_URL || args.url || "https://bazandnobbyschool.pages.dev").replace(/\/$/, "");
const ADMIN_PIN = process.env.ADMIN_PIN || args.adminPin || "2727";
const MINUTES = Number(process.env.SOAK_MINUTES || args.minutes || 60);
const INTERVAL_MS = Number(process.env.SOAK_INTERVAL_MS || args.intervalMs || 500);
const RUN_ID = `SOAK${Date.now()}`;
const PIN = "1111";

const TEST_DATES = [
  "2099-02-01", "2099-02-02", "2099-02-03", "2099-02-04", "2099-02-05", "2099-02-06", "2099-02-07",
  "2099-02-08", "2099-02-09", "2099-02-10", "2099-02-11", "2099-02-12", "2099-02-13", "2099-02-14"
];
const PLAYERS = ["Baby Dave", "Bob", "Colin", "Dean", "Doc", "Ethan", "Jason", "Kevin", "Lewis", "Major", "Mark Mark", "Matt", "Meeky", "Muller", "Nathan", "Pedders", "Ryan", "Sam"]
  .map(n => `${RUN_ID}-${n}`);

const expected = new Map(TEST_DATES.map(d => [d, { players: new Set(), maybes: new Set(), locked: false, competition: "", removed: false }]));
const stats = {
  siteUrl: SITE_URL,
  runId: RUN_ID,
  minutes: MINUTES,
  intervalMs: INTERVAL_MS,
  startedAt: new Date().toISOString(),
  iterations: 0,
  passes: 0,
  failures: [],
  timings: [],
  operations: {}
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function inc(op) { stats.operations[op] = (stats.operations[op] || 0) + 1; }

async function api(pathname, options = {}) {
  const started = Date.now();
  const res = await fetch(`${SITE_URL}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  const ms = Date.now() - started;
  stats.timings.push(ms);
  return { status: res.status, body, ms };
}
async function post(pathname, data) { return api(pathname, { method: "POST", body: JSON.stringify(data) }); }

async function cleanup() {
  for (const dateKey of TEST_DATES) {
    await post("/api/admin/delete-day", { adminPin: ADMIN_PIN, dateKey });
  }
}

function assertNoDuplicates(players) {
  assert.equal(players.length, new Set(players).size, `duplicate players found: ${players.join(", ")}`);
}

function assertExpectedDay(dateKey, day) {
  const e = expected.get(dateKey);
  assert.ok(day, `missing date ${dateKey}`);
  assertNoDuplicates(day.players || []);
  assertNoDuplicates(day.maybes || []);
  const got = new Set((day.players || []).filter(p => p.startsWith(RUN_ID)));
  const gotMaybes = new Set((day.maybes || []).filter(p => p.startsWith(RUN_ID)));
  assert.deepEqual([...got].sort(), [...e.players].sort(), `players mismatch for ${dateKey}`);
  assert.deepEqual([...gotMaybes].sort(), [...e.maybes].sort(), `maybes mismatch for ${dateKey}`);
  for (const p of got) assert.equal(gotMaybes.has(p), false, `player cannot be both playing and maybe: ${p}`);
  if (e.competition) assert.equal(day.competition, e.competition, `competition mismatch for ${dateKey}`);
}

async function verifyRandomDate(dateKey) {
  const r = await api("/api/schedule");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const day = r.body.schedule[dateKey] || { players: [], maybes: [], competition: "" };
  assertExpectedDay(dateKey, day);
}

async function opTogglePublic() {
  const dateKey = pick(TEST_DATES);
  const player = pick(PLAYERS);
  const e = expected.get(dateKey);
  if (e.locked) return opAdminUnlock(dateKey);
  const beforeHad = e.players.has(player);
  const r = await post("/api/player-status", { dateKey, name: player, status: beforeHad ? "none" : "playing", playerName: player, playerPin: PIN, competition: e.competition || "Soak Test" });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  if (beforeHad) e.players.delete(player); else { e.players.add(player); e.maybes.delete(player); }
  assertExpectedDay(dateKey, r.body.data);
  inc("public toggle");
  await verifyRandomDate(dateKey);
}

async function opAdminAdd() {
  const dateKey = pick(TEST_DATES);
  const player = pick(PLAYERS);
  const e = expected.get(dateKey);
  const r = await post("/api/admin/add-player", { dateKey, name: player, adminPin: ADMIN_PIN, competition: e.competition || "Soak Test" });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  e.players.add(player);
  e.maybes.delete(player);
  assertExpectedDay(dateKey, r.body.data);
  inc("admin add");
}

async function opAdminRemove() {
  const dateKey = pick(TEST_DATES);
  const e = expected.get(dateKey);
  const player = e.players.size ? pick([...e.players]) : pick(PLAYERS);
  const r = await post("/api/admin/remove-player", { dateKey, name: player, adminPin: ADMIN_PIN });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  e.players.delete(player);
  e.maybes.delete(player);
  assertExpectedDay(dateKey, r.body.data);
  inc("admin remove");
}

async function opMaybePublic() {
  const dateKey = pick(TEST_DATES);
  const player = pick(PLAYERS);
  const e = expected.get(dateKey);
  if (e.locked) return opAdminUnlock(dateKey);
  const r = await post("/api/player-status", { dateKey, name: player, status: "maybe", playerName: player, playerPin: PIN, competition: e.competition || "Soak Test" });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  e.players.delete(player);
  e.maybes.add(player);
  assertExpectedDay(dateKey, r.body.data);
  inc("public maybe");
  await verifyRandomDate(dateKey);
}

async function opPromoteMaybe() {
  const dateKey = pick(TEST_DATES);
  const e = expected.get(dateKey);
  if (e.locked) return opAdminUnlock(dateKey);
  const player = e.maybes.size ? pick([...e.maybes]) : pick(PLAYERS);
  const r = await post("/api/player-status", { dateKey, name: player, status: "playing", playerName: player, playerPin: PIN, competition: e.competition || "Soak Test" });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  e.players.add(player);
  e.maybes.delete(player);
  assertExpectedDay(dateKey, r.body.data);
  inc("promote maybe");
}

async function opCompetition() {
  const dateKey = pick(TEST_DATES);
  const comp = `Soak Comp ${Math.floor(Math.random() * 1000)}`;
  const e = expected.get(dateKey);
  const r = await post("/api/admin/competition", { dateKey, competition: comp, adminPin: ADMIN_PIN });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  e.competition = comp;
  assert.equal(r.body.data.competition, comp);
  inc("competition edit");
}

async function opAdminLock(dateKey = pick(TEST_DATES)) {
  const e = expected.get(dateKey);
  const r = await post("/api/admin/lock", { dateKey, locked: true, adminPin: ADMIN_PIN });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  e.locked = true;
  assert.equal(r.body.data.locked, true);
  inc("admin lock");
  // Public write should now be blocked.
  const blockedPlayer = pick(PLAYERS);
  const blocked = await post("/api/player-status", { dateKey, name: blockedPlayer, status:"playing", playerName: blockedPlayer, playerPin: PIN });
  assert.equal(blocked.status, 403);
  inc("locked public block check");
}

async function opAdminUnlock(dateKey = pick(TEST_DATES)) {
  const e = expected.get(dateKey);
  const r = await post("/api/admin/lock", { dateKey, locked: false, adminPin: ADMIN_PIN });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  e.locked = false;
  assert.equal(r.body.data.locked, false);
  inc("admin unlock");
}

async function opCutoffCheck() {
  const closedName = `${RUN_ID}-Closed`;
  await post("/api/admin/player-pin", { adminPin: ADMIN_PIN, name: closedName, pin: PIN });
  const r = await post("/api/player-status", { dateKey: "2000-01-01", name: closedName, status:"playing", playerName: closedName, playerPin: PIN });
  assert.equal(r.status, 403);
  inc("cutoff public block check");
}

const ops = [opTogglePublic, opTogglePublic, opMaybePublic, opPromoteMaybe, opAdminAdd, opAdminRemove, opCompetition, opAdminLock, opAdminUnlock, opCutoffCheck];

try {
  console.log(`Starting soak test against ${SITE_URL} for ${MINUTES} minute(s). Run id: ${RUN_ID}`);
  await cleanup();
  for (const player of PLAYERS) await post("/api/admin/player-pin", { adminPin: ADMIN_PIN, name: player, pin: PIN });
  const end = Date.now() + MINUTES * 60 * 1000;
  while (Date.now() < end) {
    stats.iterations++;
    try {
      await pick(ops)();
      stats.passes++;
    } catch (err) {
      const failure = { iteration: stats.iterations, error: err.stack || err.message, at: new Date().toISOString() };
      stats.failures.push(failure);
      console.error(`FAIL iteration ${stats.iterations}: ${err.message}`);
      // Keep going; soak tests should find intermittent failures, not stop at the first one.
    }
    if (INTERVAL_MS > 0) await sleep(INTERVAL_MS);
  }

  // Full final verification of every test date.
  const schedule = (await api("/api/schedule")).body.schedule;
  for (const dateKey of TEST_DATES) {
    assertExpectedDay(dateKey, schedule[dateKey] || { players: [], maybes: [], competition: "" });
  }
} finally {
  await cleanup();
  stats.finishedAt = new Date().toISOString();
  stats.averageMs = stats.timings.length ? Math.round(stats.timings.reduce((a,b)=>a+b,0) / stats.timings.length) : null;
  stats.slowestMs = stats.timings.length ? Math.max(...stats.timings) : null;
  stats.passed = stats.failures.length === 0;

  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const reportDir = path.join(testDir, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `soak-${RUN_ID}.json`);
  const mdPath = path.join(reportDir, `soak-${RUN_ID}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(stats, null, 2));
  fs.writeFileSync(mdPath, `# Soak test report\n\n` +
    `Site: ${stats.siteUrl}\n\nRun ID: ${stats.runId}\n\nDuration requested: ${stats.minutes} minute(s)\n\n` +
    `Iterations: ${stats.iterations}\n\nPasses: ${stats.passes}\n\nFailures: ${stats.failures.length}\n\nAverage API ms: ${stats.averageMs}\n\nSlowest API ms: ${stats.slowestMs}\n\n` +
    `Operations:\n\n${Object.entries(stats.operations).map(([k,v]) => `- ${k}: ${v}`).join("\n")}\n\n` +
    `Failure details:\n\n${stats.failures.length ? stats.failures.map(f => `## Iteration ${f.iteration}\n\n\`${f.at}\`\n\n\`\`\`\n${f.error}\n\`\`\``).join("\n\n") : "None"}\n`);

  console.log("\nSoak test report written to:");
  console.log(jsonPath);
  console.log(mdPath);
  console.log(JSON.stringify({ passed: stats.passed, iterations: stats.iterations, failures: stats.failures.length, averageMs: stats.averageMs, slowestMs: stats.slowestMs }, null, 2));
  if (!stats.passed) process.exit(1);
}
