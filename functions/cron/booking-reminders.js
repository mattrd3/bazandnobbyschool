import { json, ensurePushTable, sendPush } from "../../lib/push.js";

const REMINDER_LOG_TABLE_SQL = `CREATE TABLE IF NOT EXISTS push_reminder_log (
  reminderKey TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  playerName TEXT NOT NULL,
  dateKey TEXT NOT NULL,
  sentAt INTEGER NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (reminderKey, endpoint)
)`;
const REMINDER_DATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_push_reminder_log_date ON push_reminder_log (dateKey, sentAt)`;

function cleanToken(value) {
  return String(value || "").trim();
}

function authorised(request, env) {
  const expected = cleanToken(env.REMINDER_CRON_TOKEN);
  if (!expected) return false;
  const header = cleanToken(request.headers.get("Authorization"));
  return header === `Bearer ${expected}`;
}

function londonParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = type => (parts.find(part => part.type === type) || {}).value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}

function addDaysToDateKey(year, month, day, days) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function targetForRun(parts) {
  if (parts.weekday !== "Wed" && parts.weekday !== "Thu") return null;
  const minutes = parts.hour * 60 + parts.minute;
  // GitHub Actions invokes every 15 minutes. The broad window tolerates delayed jobs;
  // the database log ensures only the first eligible run sends notifications.
  if (minutes < 17 * 60 + 25 || minutes > 18 * 60 + 20) return null;
  const dateKey = addDaysToDateKey(parts.year, parts.month, parts.day, 10);
  return {
    dateKey,
    dayLabel: parts.weekday === "Wed" ? "Saturday" : "Sunday",
    reminderKey: `closing-day:${dateKey}`
  };
}

function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

async function ensureReminderTable(db) {
  await db.prepare(REMINDER_LOG_TABLE_SQL).run();
  await db.prepare(REMINDER_DATE_INDEX_SQL).run();
}

async function eligibleSubscriptions(db, dateKey, reminderKey) {
  const result = await db.prepare(`
    SELECT ps.endpoint, ps.playerName, ps.subscriptionJson
    FROM push_subscriptions ps
    LEFT JOIN player_status st
      ON st.dateKey = ? AND st.name = ps.playerName
    LEFT JOIN push_reminder_log log
      ON log.reminderKey = ? AND log.endpoint = ps.endpoint
    WHERE ps.enabled = 1
      AND st.name IS NULL
      AND log.endpoint IS NULL
    ORDER BY ps.playerName, ps.endpoint
  `).bind(dateKey, reminderKey).all();
  return result.results || [];
}

async function recordResult(db, row, target, status) {
  await db.prepare(`
    INSERT OR IGNORE INTO push_reminder_log
      (reminderKey, endpoint, playerName, dateKey, sentAt, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(target.reminderKey, row.endpoint, row.playerName, target.dateKey, Date.now(), status).run();
}

async function runReminders(env, target) {
  await ensurePushTable(env.DB);
  await ensureReminderTable(env.DB);
  const rows = await eligibleSubscriptions(env.DB, target.dateKey, target.reminderKey);
  const longDate = formatLongDate(target.dateKey);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const row of rows) {
    let subscription;
    try {
      subscription = JSON.parse(row.subscriptionJson);
    } catch {
      failed++;
      await recordResult(env.DB, row, target, "invalid-subscription");
      continue;
    }

    try {
      const response = await sendPush(env, subscription, {
        title: `${target.dayLabel} booking — reply needed`,
        body: `${longDate}: bookings close at 6:50pm today. Tap to answer Yes or No.`,
        url: `/simple/?from=closing-reminder&date=${target.dateKey}`,
        tag: target.reminderKey,
        renotify: false
      });

      if (response.ok) {
        sent++;
        await env.DB.prepare("UPDATE push_subscriptions SET lastSuccessAt=?, lastFailureAt=NULL, lastFailureStatus=NULL WHERE endpoint=?")
          .bind(Date.now(), row.endpoint).run();
        await recordResult(env.DB, row, target, "sent");
      } else if (response.status === 404 || response.status === 410) {
        removed++;
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(row.endpoint).run();
        await recordResult(env.DB, row, target, `removed-${response.status}`);
      } else {
        failed++;
        await env.DB.prepare("UPDATE push_subscriptions SET lastFailureAt=?, lastFailureStatus=? WHERE endpoint=?")
          .bind(Date.now(), response.status, row.endpoint).run();
        // Do not log a transient failure as completed; a later scheduled run may retry.
      }
    } catch {
      failed++;
      await env.DB.prepare("UPDATE push_subscriptions SET lastFailureAt=?, lastFailureStatus=0 WHERE endpoint=?")
        .bind(Date.now(), row.endpoint).run();
    }
  }

  return { dateKey: target.dateKey, eligible: rows.length, sent, failed, removed };
}

export async function onRequestPost({ request, env }) {
  if (!authorised(request, env)) return json({ ok: false, error: "Unauthorised." }, 401);

  const parts = londonParts();
  const target = targetForRun(parts);
  if (!target) {
    return json({
      ok: true,
      skipped: true,
      reason: "Not inside the Wednesday/Thursday closing-day reminder window.",
      londonTime: `${parts.weekday} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
    });
  }

  const result = await runReminders(env, target);
  return json({ ok: true, skipped: false, ...result });
}

export { londonParts, targetForRun, addDaysToDateKey, formatLongDate };
