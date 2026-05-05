import assert from "node:assert/strict";

const SITE_URL = (process.env.SITE_URL || "https://bazandnobbyschool.pages.dev").replace(/\/$/, "");
const ADMIN_PIN = process.env.ADMIN_PIN || "2727";
const PIN = "1111";
const RUN_ID = `LIVE${Date.now()}`;
const TEST_DATES = ["2099-05-01", "2099-05-02", "2099-05-03"];

async function get(path) {
  const res = await fetch(`${SITE_URL}${path}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
async function post(path, payload) {
  const res = await fetch(`${SITE_URL}${path}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
async function cleanup() {
  for (const dateKey of TEST_DATES) await post("/api/admin/delete-day", { dateKey, adminPin: ADMIN_PIN }).catch(()=>{});
}
async function check(name, fn) {
  const start = Date.now();
  await fn();
  console.log(`PASS: ${name} (${Date.now()-start}ms)`);
}

console.log(`Running live API tests against ${SITE_URL}. Run id: ${RUN_ID}`);
await cleanup();
try {
  await check("schedule endpoint returns JSON", async () => {
    const r = await get("/api/schedule");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });

  await check("admin can set player PIN", async () => {
    const r = await post("/api/admin/player-pin", { adminPin: ADMIN_PIN, name: `${RUN_ID}-Bob`, pin: PIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });

  await check("maybe status is rejected", async () => {
    const player = `${RUN_ID}-Bob`;
    const r = await post("/api/player-status", { dateKey: TEST_DATES[0], name: player, status:"maybe", playerName: player, playerPin: PIN });
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
  });

  await check("public player can add themselves as playing", async () => {
    const player = `${RUN_ID}-Bob`;
    const r = await post("/api/player-status", { dateKey: TEST_DATES[0], name: player, status:"playing", playerName: player, playerPin: PIN, competition:"Live Test" });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.data.players, [player]);
    assert.equal("maybes" in r.body.data, false);
  });

  await check("player survives schedule reload", async () => {
    const player = `${RUN_ID}-Bob`;
    const r = await get("/api/schedule");
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.schedule[TEST_DATES[0]].players, [player]);
  });

  await check("public player can remove themselves", async () => {
    const player = `${RUN_ID}-Bob`;
    const r = await post("/api/player-status", { dateKey: TEST_DATES[0], name: player, status:"none", playerName: player, playerPin: PIN });
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.data.players, []);
  });

  await check("admin add, priority and lock work", async () => {
    const player = `${RUN_ID}-AdminAdd`;
    let r = await post("/api/admin/add-player", { dateKey: TEST_DATES[1], name: player, adminPin: ADMIN_PIN, competition:"Admin Live Test" });
    assert.equal(r.body.ok, true);
    r = await post("/api/admin/priority", { dateKey: TEST_DATES[1], name: player, priority:true, adminPin: ADMIN_PIN });
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.data.priorityPlayers, [player]);
    r = await post("/api/admin/lock", { dateKey: TEST_DATES[1], locked:true, adminPin: ADMIN_PIN });
    assert.equal(r.body.ok, true);
    assert.equal(r.body.data.locked, true);
    assert.ok(Array.isArray(r.body.data.draw));
  });

  await check("locked days block public changes", async () => {
    const player = `${RUN_ID}-Locked`;
    await post("/api/admin/player-pin", { adminPin: ADMIN_PIN, name: player, pin: PIN });
    const r = await post("/api/player-status", { dateKey: TEST_DATES[1], name: player, status:"playing", playerName: player, playerPin: PIN });
    assert.equal(r.status, 403);
    assert.equal(r.body.ok, false);
  });

  console.log("PASS: live API test suite complete");
} finally {
  await cleanup();
}
