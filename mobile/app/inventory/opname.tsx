import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { pb } from "@/lib/pocketbase";
import { fetchOpnameDetailMobile, submitOpnameLineMobile } from "@/lib/inventory/api";
import { PWA } from "@/constants/pwaTheme";

type OpnameRow = {
  id: string;
  opname_no: string;
  status: string;
  warehouse: string;
};

type LineRow = {
  id: string;
  system_qty: number;
  counted_qty?: number;
  variance_qty?: number;
  expand?: { product?: { sku?: string; name?: string } };
};

export default function OpnameScreen() {
  const [sessions, setSessions] = useState<OpnameRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pb.collection("inv_stock_opname_sessions").getList(1, 30, {
        filter: 'status = "counting"',
        sort: "-created",
      });
      setSessions(res.items as unknown as OpnameRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat opname.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const openSession = async (id: string) => {
    setSessionId(id);
    setError("");
    try {
      const d = await fetchOpnameDetailMobile(id);
      setLines(d.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat baris.");
    }
  };

  const saveLine = async (lineId: string) => {
    if (!sessionId) return;
    const qty = Number(counts[lineId]);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Qty tidak valid.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitOpnameLineMobile(sessionId, lineId, qty);
      setNotice("Tersimpan.");
      const d = await fetchOpnameDetailMobile(sessionId);
      setLines(d.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? (
        <View style={styles.errBox}>
          <Text style={styles.errTxt}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.okBox}>
          <Text style={styles.okTxt}>{notice}</Text>
        </View>
      ) : null}

      {!sessionId ? (
        <>
          <Text style={styles.title}>Sesi opname (counting)</Text>
          {sessions.length === 0 ? (
            <Text style={styles.muted}>Tidak ada sesi opname aktif. Supervisor buat di web ERP.</Text>
          ) : (
            sessions.map((s) => (
              <Pressable key={s.id} style={styles.card} onPress={() => void openSession(s.id)}>
                <Text style={styles.cardTitle}>{s.opname_no}</Text>
                <Text style={styles.muted}>{s.status}</Text>
              </Pressable>
            ))
          )}
        </>
      ) : (
        <>
          <Pressable onPress={() => setSessionId(null)}>
            <Text style={styles.link}>← Daftar sesi</Text>
          </Pressable>
          {lines.map((l) => (
            <View key={l.id} style={styles.card}>
              <Text style={styles.cardTitle}>{l.expand?.product?.sku}</Text>
              <Text style={styles.muted}>{l.expand?.product?.name}</Text>
              <Text style={styles.muted}>Sistem: {l.system_qty}</Text>
              <View style={styles.row}>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="number-pad"
                  placeholder="Hitung"
                  value={counts[l.id] ?? String(l.counted_qty ?? "")}
                  onChangeText={(t) => setCounts((c) => ({ ...c, [l.id]: t }))}
                />
                <Pressable
                  style={[styles.btnSm, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => void saveLine(l.id)}
                >
                  <Text style={styles.btnSmTxt}>Simpan</Text>
                </Pressable>
              </View>
              {l.variance_qty != null ? (
                <Text style={styles.muted}>Selisih: {l.variance_qty}</Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 17, fontWeight: "800", color: PWA.text },
  errBox: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 12 },
  errTxt: { color: "#b91c1c", fontSize: 13 },
  okBox: { backgroundColor: "#ecfdf5", borderRadius: 12, padding: 12 },
  okTxt: { color: "#047857", fontSize: 13 },
  muted: { color: PWA.textMuted, fontSize: 13 },
  link: { color: PWA.indigo, fontWeight: "600", marginBottom: 8 },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PWA.border,
    padding: 14,
    gap: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: PWA.text },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  qtyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  btnSm: {
    backgroundColor: PWA.indigo,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnSmTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  disabled: { opacity: 0.6 },
});
