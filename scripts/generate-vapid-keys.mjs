import { createECDH } from "node:crypto";
const ecdh=createECDH("prime256v1");ecdh.generateKeys();
const b64=v=>Buffer.from(v).toString("base64url");
console.log("VAPID_PUBLIC_KEY="+b64(ecdh.getPublicKey()));
console.log("VAPID_PRIVATE_KEY="+b64(ecdh.getPrivateKey()));
console.log("VAPID_SUBJECT=mailto:YOUR_EMAIL_ADDRESS");
