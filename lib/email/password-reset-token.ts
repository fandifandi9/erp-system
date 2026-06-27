import { SignJWT, jwtVerify } from "jose";

const ISSUER = "serba-erp";
const AUDIENCE = "password-reset";
const EXPIRY = "1h";

function getSecret(): Uint8Array {
  const raw = process.env.PASSWORD_RESET_SECRET?.trim();
  if (!raw || raw.length < 16) {
    throw new Error(
      "PASSWORD_RESET_SECRET belum dikonfigurasi (min. 16 karakter). Tambahkan di .env.local.",
    );
  }
  return new TextEncoder().encode(raw);
}

export async function createPasswordResetToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email: email.trim().toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyPasswordResetToken(
  token: string,
): Promise<{ userId: string; email: string }> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const userId = payload.sub;
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!userId || !email) throw new Error("Token tidak valid");
  return { userId, email };
}
