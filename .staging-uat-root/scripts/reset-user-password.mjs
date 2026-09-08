/**
 * Reset password user ERP via admin PocketBase.
 * Usage (PowerShell):
 *   $env:ERP_RESET_EMAIL="fandiserba01@gmail.com"
 *   $env:ERP_RESET_PASSWORD="password-baru-anda"
 *   node --env-file=.env.local scripts/reset-user-password.mjs
 */
import PocketBase from "pocketbase";

const url = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const email = process.env.ERP_RESET_EMAIL?.trim();
const password = process.env.ERP_RESET_PASSWORD;

if (!email || !password) {
  console.error("Set ERP_RESET_EMAIL dan ERP_RESET_PASSWORD lalu jalankan ulang.");
  process.exit(1);
}

const ar = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    identity: process.env.POCKETBASE_ADMIN_EMAIL,
    password: process.env.POCKETBASE_ADMIN_PASSWORD,
  }),
});
if (!ar.ok) {
  console.error("Admin auth gagal", ar.status, await ar.text());
  process.exit(1);
}
const { token, admin } = await ar.json();
const pb = new PocketBase(url);
pb.authStore.save(token, admin);

const user = await pb.collection("users").getFirstListItem(`email="${email.replace(/"/g, '\\"')}"`);
await pb.collection("users").update(user.id, {
  password,
  passwordConfirm: password,
});
console.log("Password berhasil diubah untuk", email);
