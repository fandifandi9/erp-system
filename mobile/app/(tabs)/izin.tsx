import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  mobileCancelAbsence,
  mobileListOwnAbsence,
  mobileSubmitAbsence,
} from "@/lib/hr-queue-api";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

type Row = {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  rejection_reason?: string;
};

export default function IzinOffScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [type] = useState<"izin" | "off">("off");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await mobileListOwnAbsence();
      if (!res.ok) {
        Alert.alert("Gagal", res.error || "Tidak bisa memuat Off.");
        setRows([]);
        return;
      }
      setRows(
        res.items.map((r) => ({
          id: String(r.id),
          type: String(r.type ?? "izin"),
          start_date: String(r.start_date ?? "").slice(0, 10),
          end_date: String(r.end_date ?? "").slice(0, 10),
          reason: String(r.reason ?? ""),
          status: String(r.status ?? ""),
          rejection_reason: String(r.rejection_reason ?? "").trim() || undefined,
        })),
      );
    } catch (e) {
      Alert.alert("Gagal", getErrorMessage(e, "Tidak bisa memuat Off."));
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function onSubmit() {
    setSubmitting(true);
    try {
      const res = await mobileSubmitAbsence({
        type,
        start_date: start.trim(),
        end_date: (end || start).trim(),
        reason: reason.trim(),
      });
      if (!res.success) {
        Alert.alert("Gagal", res.message);
        return;
      }
      Alert.alert("Berhasil", res.message);
      setReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel(id: string) {
    const res = await mobileCancelAbsence(id);
    if (!res.success) {
      Alert.alert("Gagal", res.message);
      return;
    }
    await load();
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.pad}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text style={styles.h1}>Off</Text>
      <Text style={styles.sub}>
        Pengajuan tidak masuk kerja. Untuk kerja di luar kantor, gunakan tab Luar kantor. Cuti
        tahunan tetap lewat menu Cuti.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Jenis: Off</Text>
        <Text style={styles.label}>Tanggal mulai (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="2026-09-07" />
        <Text style={styles.label}>Tanggal selesai</Text>
        <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="opsional" />
        <Text style={styles.label}>Alasan</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={reason}
          onChangeText={setReason}
          multiline
        />
        <Pressable style={styles.submit} disabled={submitting} onPress={() => void onSubmit()}>
          <Text style={styles.submitText}>{submitting ? "Mengirim…" : "Kirim"}</Text>
        </Pressable>
      </View>

      <Text style={styles.h2}>Pengajuan saya</Text>
      {loading ? (
        <ActivityIndicator color={PWA.indigo} />
      ) : rows.length === 0 ? (
        <Text style={styles.sub}>Belum ada pengajuan.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.itemTitle}>
              {(r.type?.toLowerCase() === "off" ? "Off" : "Absen")} · {r.start_date} · {r.status}
            </Text>
            <Text style={styles.sub}>{r.reason}</Text>
            {r.rejection_reason ? (
              <Text style={styles.reject}>Ditolak: {r.rejection_reason}</Text>
            ) : null}
            {r.status === "pending" ? (
              <Pressable onPress={() => void onCancel(r.id)}>
                <Text style={styles.cancel}>Batalkan</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: PWA.screenBg },
  pad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 20, fontWeight: "800", color: PWA.text },
  h2: { fontSize: 15, fontWeight: "700", color: PWA.text, marginTop: 16, marginBottom: 8 },
  sub: { fontSize: 13, color: PWA.textMuted, marginTop: 4 },
  card: {
    marginTop: 12,
    backgroundColor: PWA.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  chipOn: { backgroundColor: "#0f172a" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  chipTextOn: { color: "#fff" },
  label: { fontSize: 11, fontWeight: "600", color: PWA.textMuted, marginTop: 8 },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: PWA.text,
  },
  area: { minHeight: 72, textAlignVertical: "top" },
  submit: {
    marginTop: 12,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "700" },
  itemTitle: { fontWeight: "700", color: PWA.text },
  reject: { color: "#e11d48", fontSize: 12, marginTop: 4 },
  cancel: { color: "#e11d48", fontWeight: "700", marginTop: 8, fontSize: 12 },
});
