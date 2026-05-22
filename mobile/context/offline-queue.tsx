import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { AppState, type AppStateStatus, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth";
import { drainOfflineQueue, peekQueueForUi, setOfflineQueueNotifier } from "@/lib/offline-queue";
import type { OfflineQueueItem } from "@/lib/offline-queue/types";

type BannerTone = "offline" | "pending" | "sync_ok" | "failed" | "idle";

type OfflineQueueContextValue = {
  /** Dari NetInfo — false = tidak ada jalur data. */
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  lastDrain: { at: string; processed: number; error?: string } | null;
  /** Panggil setelah operasi penting (opsional). */
  refreshQueue: () => Promise<void>;
  /** Paksa sinkron (throttle internal). */
  syncNow: () => Promise<void>;
};

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

export function useOfflineQueue(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) {
    throw new Error("useOfflineQueue harus di dalam OfflineQueueProvider");
  }
  return ctx;
}

/** Hook aman jika provider belum dipasang (mis. layar auth). */
export function useOfflineQueueOptional(): OfflineQueueContextValue | null {
  return useContext(OfflineQueueContext);
}

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const { user, hydrated } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const [lastDrain, setLastDrain] = useState<{
    at: string;
    processed: number;
    error?: string;
  } | null>(null);
  const [bannerTone, setBannerTone] = useState<BannerTone>("idle");
  const [showSyncOk, setShowSyncOk] = useState(false);
  const drainLock = useRef(false);
  const syncOkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshQueue = useCallback(async () => {
    const list = await peekQueueForUi();
    setItems(list);
  }, []);

  const runDrain = useCallback(async () => {
    if (!user?.id || !hydrated) return;
    if (!isOnline) return;
    if (drainLock.current) return;
    drainLock.current = true;
    try {
      const r = await drainOfflineQueue({ maxItems: 10 });
      await refreshQueue();
      setLastDrain({
        at: new Date().toISOString(),
        processed: r.processed,
      });
      if (r.processed > 0) {
        if (syncOkTimer.current) clearTimeout(syncOkTimer.current);
        setShowSyncOk(true);
        syncOkTimer.current = setTimeout(() => {
          setShowSyncOk(false);
          syncOkTimer.current = null;
        }, 2800);
      }
    } catch (e: unknown) {
      setLastDrain({
        at: new Date().toISOString(),
        processed: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      drainLock.current = false;
    }
  }, [user?.id, hydrated, isOnline, refreshQueue]);

  useEffect(() => {
    return () => {
      if (syncOkTimer.current) clearTimeout(syncOkTimer.current);
    };
  }, []);

  useEffect(() => {
    setOfflineQueueNotifier(() => {
      void refreshQueue();
    });
    return () => setOfflineQueueNotifier(null);
  }, [refreshQueue]);

  useEffect(() => {
    void refreshQueue();
  }, [user?.id, refreshQueue]);

  useEffect(() => {
    void NetInfo.fetch().then((s) => {
      const online = !!(s.isConnected && s.isInternetReachable !== false);
      setIsOnline(online);
    });
  }, []);

  useEffect(() => {
    const sub = NetInfo.addEventListener((s: NetInfoState) => {
      const online = !!(s.isConnected && s.isInternetReachable !== false);
      setIsOnline(online);
    });
    return () => {
      sub();
    };
  }, []);

  useEffect(() => {
    if (isOnline && user?.id) void runDrain();
  }, [isOnline, user?.id, runDrain]);

  useEffect(() => {
    const onApp = (s: AppStateStatus) => {
      if (s === "active" && user?.id) void runDrain();
    };
    const sub = AppState.addEventListener("change", onApp);
    return () => sub.remove();
  }, [user?.id, runDrain]);

  /** Interval ringan saat ada pending + online. */
  useEffect(() => {
    const pending = items.filter((i) => i.status === "pending").length;
    if (!pending || !isOnline || !user?.id) return;
    const t = setInterval(() => {
      void runDrain();
    }, 45_000);
    return () => clearInterval(t);
  }, [items, isOnline, user?.id, runDrain]);

  const pendingCount = useMemo(
    () => items.filter((i) => i.status === "pending").length,
    [items]
  );
  const failedCount = useMemo(
    () => items.filter((i) => i.status === "failed").length,
    [items]
  );

  useEffect(() => {
    if (showSyncOk) {
      setBannerTone("sync_ok");
      return;
    }
    if (!isOnline) {
      setBannerTone("offline");
      return;
    }
    if (pendingCount > 0) {
      setBannerTone("pending");
      return;
    }
    if (failedCount > 0) {
      setBannerTone("failed");
      return;
    }
    setBannerTone("idle");
  }, [isOnline, pendingCount, failedCount, showSyncOk]);

  const value = useMemo<OfflineQueueContextValue>(
    () => ({
      isOnline,
      pendingCount,
      failedCount,
      lastDrain,
      refreshQueue,
      syncNow: runDrain,
    }),
    [isOnline, pendingCount, failedCount, lastDrain, refreshQueue, runDrain]
  );

  const showBanner = !!user?.id && hydrated && bannerTone !== "idle";

  return (
    <View style={{ flex: 1 }}>
      <OfflineQueueContext.Provider value={value}>
        {children}
        {showBanner ? (
          <OfflineStrip tone={bannerTone} pending={pendingCount} failed={failedCount} />
        ) : null}
      </OfflineQueueContext.Provider>
    </View>
  );
}

function OfflineStrip({
  tone,
  pending,
  failed,
}: {
  tone: BannerTone;
  pending: number;
  failed: number;
}) {
  const insets = useSafeAreaInsets();
  const label =
    tone === "offline"
      ? "Offline — scan/absensi tetap dicatat lokal"
      : tone === "pending"
        ? `Menunggu sinkron${pending > 1 ? ` (${pending})` : ""}`
        : tone === "sync_ok"
          ? "Sinkron OK"
          : tone === "failed"
            ? failed > 0
              ? `${failed} antrean gagal — cek jaringan / hubungi IT`
              : "Beberapa antrean gagal"
            : "";

  const bg =
    tone === "offline"
      ? "#475569"
      : tone === "pending"
        ? "#b45309"
        : tone === "sync_ok"
          ? "#047857"
          : tone === "failed"
            ? "#991b1b"
            : "#475569";

  return (
    <View
      style={[styles.strip, { backgroundColor: bg, paddingTop: insets.top + 4 }]}
      pointerEvents="none"
    >
      <Text style={styles.stripText} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingBottom: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    zIndex: 9999,
    elevation: 20,
  },
  stripText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});
