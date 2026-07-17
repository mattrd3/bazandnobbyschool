import { buildPushPayload } from "@block65/webcrypto-web-push";

export const PUSH_TABLE_SQL = `CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  playerName TEXT NOT NULL,
  subscriptionJson TEXT NOT NULL,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  lastSuccessAt INTEGER,
  lastFailureAt INTEGER,
  lastFailureStatus INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1
)`;
export const PUSH_PLAYER_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_player ON push_subscriptions (playerName, enabled)`;
const PIN_CONFIG_KEY = "__config_member_pins__";

export function json(data, status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
export async function readJson(request){try{return await request.json()}catch{return {}}}
export async function ensurePushTable(db){await db.prepare(PUSH_TABLE_SQL).run();await db.prepare(PUSH_PLAYER_INDEX_SQL).run()}
async function getPinConfig(db){const row=await db.prepare("SELECT data FROM days WHERE dateKey = ?").bind(PIN_CONFIG_KEY).first();if(!row)return {};try{const parsed=JSON.parse(row.data);return parsed&&parsed.pins&&typeof parsed.pins==='object'?parsed.pins:{}}catch{return {}}}
export async function verifyPlayer(db,name,pin){const cleanName=String(name||'').trim(),cleanPin=String(pin||'').trim();if(!cleanName||!cleanPin)return false;const pins=await getPinConfig(db);return String(pins[cleanName]||'')===cleanPin}
export function verifyAdmin(pin){return String(pin||'').trim()==='2727'}
export function cleanSubscription(value){if(!value||typeof value!=='object')return null;const endpoint=String(value.endpoint||'').trim();const p256dh=String(value.keys&&value.keys.p256dh||'').trim();const auth=String(value.keys&&value.keys.auth||'').trim();if(!endpoint.startsWith('https://')||!p256dh||!auth)return null;return {endpoint,expirationTime:value.expirationTime??null,keys:{p256dh,auth}}}
export function vapidFromEnv(env){const publicKey=env.VAPID_PUBLIC_KEY||env.VAPID_SERVER_PUBLIC_KEY;const privateKey=env.VAPID_PRIVATE_KEY||env.VAPID_SERVER_PRIVATE_KEY;const subject=env.VAPID_SUBJECT||'mailto:weekendgolf@example.com';if(!publicKey||!privateKey)throw new Error('Push is not configured: missing VAPID keys');return {publicKey,privateKey,subject}}
export async function sendPush(env,subscription,message){const vapid=vapidFromEnv(env);const payload=await buildPushPayload({data:JSON.stringify(message),options:{ttl:120,urgency:'high'}},subscription,vapid);return fetch(subscription.endpoint,payload)}
