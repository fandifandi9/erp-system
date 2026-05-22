import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchActiveZoneSession, type ZoneSessionActive } from "@/lib/inventory/api";
import { zoneCheckOutOrQueue } from "@/lib/inventory/offline-resilient";
import { getErpWebUrl } from "@/lib/inventory/env";
import { PWA } from "@/constants/pwaTheme";

export default function InventoryHubScreen() {
  const [session, setSession] = useState<ZoneSessionActive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (!getErpWebUrl()) {
        setError("Set EXPO_PUBLIC_ERP_WEB_URL di mobile/.env (URL ERP web).");
        setSession(null);
        return;
      }
      setSession(await fetchActiveZoneSession());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat sesi.");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkout = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await zoneCheckOutOrQueue(session?.id);
      setSession(null);
      await load();
      if (r.queued) {
        setNotice("Check-out disimpan — akan disinkron otomatis.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-out gagal.");
    } finally {
      setBusy(false);
    }
  };

  const zoneLabel = session?.expand?.zone
    ? `${session.expand.zone.name || session.expand.zone.code} (${session.expand.zone.code})`
    : session?.zone;

  const whLabel = session?.expand?.warehouse
    ? `${session.expand.warehouse.code} — ${session.expand.warehouse.name}`
    : session?.warehouse;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      {notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTxt}>{notice}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errBox}>
          <Text style={styles.errTxt}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sesi zona aktif</Text>
        {loading ? (
          <ActivityIndicator color={PWA.indigo} style={{ marginTop: 12 }} />
        ) : session ? (
          <>
            <Text style={styles.sessionMain}>{zoneLabel}</Text>
            <Text style={styles.sessionSub}>{whLabel}</Text>
            <Text style={styles.sessionTime}>
              Masuk {new Date(session.check_in_at).toLocaleString("id-ID")}
            </Text>
            <Pressable
              style={[styles.btnDanger, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void checkout()}
            >
              <Text style={styles.btnDangerTxt}>{busy ? "Memproses…" : "Check-out zona"}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.muted}>Belum check-in ke zona kerja.</Text>
        )}
      </View>

      <Link href="/inventory/zone-scan" asChild>
        <Pressable style={styles.tile}>
          <View style={[styles.iconBox, { backgroundColor: "#d1fae5" }]}>
            <Ionicons name="qr-code-outline" size={26} color="#047857" />
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>Scan QR zona</Text>
            <Text style={styles.tileSub}>Check-in / ganti zona di gudang</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={PWA.textMuted} />
        </Pressable>
      </Link>

      <Link href="/inventory/product-scan" asChild>
        <Pressable style={styles.tile}>
          <View style={[styles.iconBox, { backgroundColor: "#e0e7ff" }]}>
            <Ionicons name="barcode-outline" size={26} color={PWA.indigo} />
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>Scan produk</Text>
            <Text style={styles.tileSub}>Cek stok per gudang dari barcode/SKU</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={PWA.textMuted} />
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  errBox: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 12 },
  errTxt: { color: "#b91c1c", fontSize: 13 },
  noticeBox: { backgroundColor: "#ecfdf5", borderRadius: 12, padding: 12 },
  noticeTxt: { color: "#047857", fontSize: 13 },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.border,
    padding: 16,
  },
  cardTitle: { fontSize: 12, fontWeight: "700", color: PWA.textMuted, textTransform: "uppercase" },
  sessionMain: { marginTop: 8, fontSize: 18, fontWeight: "800", color: PWA.text },
  sessionSub: { marginTop: 4, fontSize: 14, color: PWA.textMuted },
  sessionTime: { marginTop: 4, fontSize: 12, color: PWA.textMuted },
  muted: { marginTop: 8, fontSize: 14, color: PWA.textMuted },
  btnDanger: {
    marginTop: 14,
    backgroundColor: "#047857",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDangerTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: PWA.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.border,
    padding: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { flex: 1 },
  tileTitle: { fontSize: 16, fontWeight: "700", color: PWA.text },
  tileSub: { fontSize: 12, color: PWA.textMuted, marginTop: 2 },
});
