import PocketBase from "pocketbase";

// ✅ SECURE: Use environment variable instead of hardcoded URL
const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://72.62.194.224:8091";

export const pb = new PocketBase(POCKETBASE_URL);

// 🔍 DEBUG: Log PocketBase URL to verify connection
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🔗 POCKETBASE CONNECTION");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("URL:", POCKETBASE_URL);
console.log("Auth Store:", pb.authStore.isValid ? "✅ Valid" : "❌ Invalid");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Optional: Enable auto-cancellation for better performance
pb.autoCancellation(false);
