import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { deactivateKeepAwake } from "expo-keep-awake";

/** Izinkan layar meredup / sleep normal saat app tidak dipakai (hindari keep-awake bawaan dev). */
export function useAllowScreenSleep() {
  useEffect(() => {
    const release = () => {
      try {
        void deactivateKeepAwake();
      } catch {
        /* ignore */
      }
    };

    release();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        release();
      }
    });

    return () => {
      release();
      sub.remove();
    };
  }, []);
}
