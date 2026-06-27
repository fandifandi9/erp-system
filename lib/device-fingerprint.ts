// ========================================
// 🔐 DEVICE FINGERPRINT - ANTI-CHEAT
// ========================================

/**
 * Generate device fingerprint for anti-cheat detection
 * @returns Unique device identifier string
 */
export function generateDeviceFingerprint(): string {
  const userAgent = navigator.userAgent;
  const screen = `${window.screen.width}x${window.screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;
  const platform = navigator.platform;
  const colorDepth = window.screen.colorDepth;
  const pixelRatio = window.devicePixelRatio || 1;

  const fingerprint = `${userAgent}|${screen}|${timezone}|${language}|${platform}|${colorDepth}|${pixelRatio}`;

  // Simple hash function (for production, use crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `device_${Math.abs(hash).toString(36)}`;
}

/**
 * Get user's IP address (client-side approximation)
 * Note: For accurate IP, should be done server-side
 */
export async function getClientIP(): Promise<string> {
  try {
    // Using public API (in production, use your own backend)
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    return data.ip || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Detect suspicious activity based on GPS jumps
 * @param previousLat - Previous latitude
 * @param previousLng - Previous longitude
 * @param currentLat - Current latitude
 * @param currentLng - Current longitude
 * @param timeDiffMinutes - Time difference in minutes
 * @returns true if suspicious
 */
export function detectSuspiciousGPSJump(
  previousLat: number,
  previousLng: number,
  currentLat: number,
  currentLng: number,
  timeDiffMinutes: number
): boolean {
  // Import from gps.ts
  const R = 6371e3; // Earth radius in meters
  const φ1 = (previousLat * Math.PI) / 180;
  const φ2 = (currentLat * Math.PI) / 180;
  const Δφ = ((currentLat - previousLat) * Math.PI) / 180;
  const Δλ = ((currentLng - previousLng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // meters

  // If moved > 5km in less than 5 minutes, suspicious
  if (distance > 5000 && timeDiffMinutes < 5) {
    return true;
  }

  return false;
}

/**
 * Store device info in localStorage for comparison
 */
/** ID perangkat stabil untuk terminal WMS / absensi. */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const stored = localStorage.getItem("device_id");
    if (stored?.trim()) return stored.trim();
    const id = generateDeviceFingerprint();
    storeDeviceInfo(id);
    return id;
  } catch {
    return generateDeviceFingerprint();
  }
}

export function storeDeviceInfo(deviceId: string): void {
  try {
    const lastSeen = new Date().toISOString();
    localStorage.setItem("device_id", deviceId);
    localStorage.setItem("device_last_seen", lastSeen);
  } catch (error) {
    console.warn("Failed to store device info:", error);
  }
}

/**
 * Check if device ID changed today (suspicious)
 */
export function isDeviceChanged(): boolean {
  try {
    const storedDeviceId = localStorage.getItem("device_id");
    const currentDeviceId = generateDeviceFingerprint();
    const lastSeen = localStorage.getItem("device_last_seen");

    if (!storedDeviceId || !lastSeen) {
      return false; // First time
    }

    const lastSeenDate = new Date(lastSeen);
    const today = new Date();
    const isSameDay =
      lastSeenDate.getDate() === today.getDate() &&
      lastSeenDate.getMonth() === today.getMonth() &&
      lastSeenDate.getFullYear() === today.getFullYear();

    // If device changed on same day, suspicious
    return isSameDay && storedDeviceId !== currentDeviceId;
  } catch {
    return false;
  }
}

/**
 * Get device information object
 */
export async function getDeviceInfo(): Promise<{
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  isSuspicious: boolean;
}> {
  const deviceId = generateDeviceFingerprint();
  const ipAddress = await getClientIP();
  const isSuspicious = isDeviceChanged();

  // Store for future comparison
  storeDeviceInfo(deviceId);

  return {
    deviceId,
    ipAddress,
    userAgent: navigator.userAgent,
    isSuspicious,
  };
}
