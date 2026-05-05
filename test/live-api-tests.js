import assert from "node:assert/strict";

const SITE_URL = (process.env.SITE_URL || process.argv.find(a => a.startsWith("--url="))?.slice(6) || "https://bazandnobbyschool.pages.dev").replace(/\/$/, "");
const ADMIN_PIN = process.env.ADMIN_PIN || process.argv.find(a => a.startsWith("--adminPin="))?.slice(11) || "2727";
const RUN_ID = `LIVE${Date.now()}`;
const TEST_DATES = ["2099-01-02", "2099-01-03", "2099-01-04"];

const report = { siteUrl: SITE_URL, runId: RUN_ID, startedAt: new Date().toISOString(), tests: [], failures: [] };

function record(name, ok, extra = {}) {
  report.tests.push({ name, ok, ...extra });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}: ${name}`);
}

async function api(path, options = {}) {
  const started = Date.now();
  const res = await fetch(`${SITE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body, ms: Date.now() - started };
}

async function post(path, data) {
  return api(path, { method: "POST", body: JSON.stringify(data) });
}

async function cleanup() {
  for (const dateKey of TEST_DATES) {
    await post("/api/admin/delete-day", { adminPin: ADMIN_PIN, dateKey });
  }
}

async function check(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch (err) {
    record(name, false, { error: err.message });
    report.failures.push({ name, error: err.stack || err.message });
  }
}

try {
  await cleanup();

  await check("/api/schedule returns JSON", async () => {
    const r = await api("/api/schedule");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(typeof r.body.schedule, "object");
    assert.ok(Number.isFinite(r.body.serverNow));
  });

  await check("public player add saves to exact date", async () => {
    const r = await post("/api/toggle-player", { dateKey: TEST_DATES[0], name: `${RUN_ID}-Bob`, competition: "Live Test" });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.dateKey, TEST_DATES[0]);
    assert.deepEqual(r.body.data.players, [`${RUN_ID}-Bob`]);
  });

  await check("saved player survives schedule reload", async () => {
    const r = await api("/api/schedule");
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.schedule[TEST_DATES[0]].players, [`${RUN_ID}-Bob`]);
  });

  await check("public player remove toggles and audits", async () => {
    const r = await post("/api/toggle-player", { dateKey: TEST_DATES[0], name: `${RUN_ID}-Bob` });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.data.players, []);
    assert.equal(r.body.data.audit.at(-1).action, "removed_self");
  });

  await check("admin PIN required", async () => {
    const r = await post("/api/admin/add-player", { dateKey: TEST_DATES[0], name: `${RUN_ID}-Ethan`, adminPin: "bad" });
    assert.equal(r.status, 403);
    assert.equal(r.body.ok, false);
  });

  await check("admin add works", async () => {
    const r = await post("/api/admin/add-player", { dateKey: TEST_DATES[0], name: `${RUN_ID}-Ethan`, adminPin: ADMIN_PIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.data.players, [`${RUN_ID}-Ethan`]);
  });

  await check("admin competition persists", async () => {
    const r = await post("/api/admin/competition", { dateKey: TEST_DATES[0], competition: "Live Stableford", adminPin: ADMIN_PIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.competition, "Live Stableford");
    const s = await api("/api/schedule");
    assert.equal(s.body.schedule[TEST_DATES[0]].competition, "Live Stableford");
  });

  await check("admin lock creates draw and blocks public add", async () => {
    let r = await post("/api/admin/lock", { dateKey: TEST_DATES[0], locked: true, adminPin: ADMIN_PIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.locked, true);
    assert.ok(Array.isArray(r.body.data.draw));
    r = await post("/api/toggle-player", { dateKey: TEST_DATES[0], name: `${RUN_ID}-Jason` });
    assert.equal(r.status, 403);
  });

  await check("admin unlock allows public add again", async () => {
    let r = await post("/api/admin/lock", { dateKey: TEST_DATES[0], locked: false, adminPin: ADMIN_PIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.locked, false);
    r = await post("/api/toggle-player", { dateKey: TEST_DATES[0], name: `${RUN_ID}-Jason` });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.players.includes(`${RUN_ID}-Jason`));
  });

  await check("cutoff blocks old-date public add", async () => {
    const r = await post("/api/toggle-player", { dateKey: "2000-01-01", name: `${RUN_ID}-Blocked` });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /closed/i);
  });

  await check("admin can amend old-date cutoff", async () => {
    const r = await post("/api/admin/add-player", { dateKey: TEST_DATES[1], name: `${RUN_ID}-AdminOld`, adminPin: ADMIN_PIN });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.players.includes(`${RUN_ID}-AdminOld`));
  });

  await check("admin export returns schedule", async () => {
    const r = await api(`/api/admin/export?adminPin=${encodeURIComponent(ADMIN_PIN)}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.ok(r.body.schedule[TEST_DATES[0]]);
  });

} finally {
  await cleanup();
  report.finishedAt = new Date().toISOString();
  report.passed = report.failures.length === 0;
  console.log("\nLive API test report:");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exit(1);
}
