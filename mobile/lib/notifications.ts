import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Minta izin notifikasi + (native build) daftarkan push token.
 * Expo Go membatasi push; pakai EAS dev/production build untuk FCM/APNs penuh.
 */
export function usePushRegistration(enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || registered.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const { status: existing } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted" || cancelled) return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId =
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || undefined;
        if (projectId) {
          await Notifications.getExpoPushTokenAsync({ projectId });
        }
        registered.current = true;
      } catch {
        /* Expo Go / missing projectId */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
