import { json } from "../../../lib/push.js";
export async function onRequestGet({env}){const key=env.VAPID_PUBLIC_KEY||env.VAPID_SERVER_PUBLIC_KEY;if(!key)return json({ok:false,error:"Push notifications are not configured yet."},503);return json({ok:true,publicKey:key})}
