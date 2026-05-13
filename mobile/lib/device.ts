import * as Application from "expo-application";
import { Platform } from "react-native";

export async function getDeviceInfo(): Promise<{
  deviceId: string;
  ipAddress: string;
  isSuspicious: boolean;
}> {
  let deviceId = "unknown";
  try {
    if (Platform.OS === "android") {
      const aid = Application.getAndroidId();
      if (aid) deviceId = `and:${aid}`;
    } else {
      const iv = await Application.getIosIdForVendorAsync();
      if (iv) deviceId = `ios:${iv}`;
    }
  } catch {
    /* ignore */
  }
  let ipAddress = "mobile";
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = (await r.json()) as { ip?: string };
    if (j.ip) ipAddress = j.ip;
  } catch {
    /* ignore */
  }
  return { deviceId, ipAddress, isSuspicious: false };
}
