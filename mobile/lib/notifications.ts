import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "@/lib/notifications-api";

const ERP_NOTIFICATION_CHANNEL_ID = "erp-notifications";

let notificationHandlerReady = false;

function ensureNotificationHandler() {
  if (notificationHandlerReady) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerReady = true;
  } catch {
    /* release APK tanpa FCM penuh */
  }
}

/**
 * Minta izin notifikasi + (native build) daftarkan push token ke server ERP.
 * Expo Go membatasi push; pakai EAS dev/production build untuk FCM/APNs penuh.
 *
 * Phase 24: Token sekarang didaftarkan ke /api/push-tokens agar server dapat
 * mengirim push notification berbasis RBAC/capability.
 */
export function usePushRegistration(enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || registered.current) return;
    let cancelled = false;

    void (async () => {
      try {
        ensureNotificationHandler();
        const { status: existing } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted" || cancelled) return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync(ERP_NOTIFICATION_CHANNEL_ID, {
            name: "ERP Notifications",
            importance: Notifications.AndroidImportance.HIGH,
            sound: "default",
          });
          // Keep legacy "default" channel for backward compatibility
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId =
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || undefined;

        if (projectId) {
          const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
          if (!cancelled && tokenData.data) {
            // Register token with ERP server for RBAC-based push dispatch
            try {
              await registerPushToken({
                token: tokenData.data,
                platform: Platform.OS === "ios" ? "ios" : "android",
              });
            } catch {
              // Token registration failure must not break the app
            }
          }
        }
        registered.current = true;
      } catch {
        /* Expo Go / missing projectId — expected in dev */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
