import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  ACTIVITY_TYPE_LABEL,
  hrApproveFieldActivity,
  hrRejectFieldActivity,
  type FieldActivityType,
} from "@/lib/field_activity";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

type PbUser = { name?: string; email?: string };

type Row = {
  id: string;
  name: string;
  period: string;
  typeLabel: string;
  destination: string;
  reason: string;
};

function mapRow(raw: Record<string, unknown>): Row {
  const exp = raw.expand as { user?: PbUser } | undefined;
  const u = exp?.user;
  const name = (u?.name || u?.email || "—").trim();
  const start = String(raw.start_date ?? "").slice(0, 10);
  const end = String(raw.end_date ?? "").slice(0, 10);
  const period = start && end ? (start === end ? start : `${start} – ${end}`) : "—";
  const t = String(raw.activity_type ?? "other") as FieldActivityType;
  return {
    id: String(raw.id),
    name,
    period,
    typeLabel: ACTIVITY_TYPE_LABEL[t] ?? t,
    destination: String(raw.destination ?? "").trim() || "—",
    reason: String(raw.reason ?? "").trim().slice(0, 240) || "—",
  };
}

export default function HrFieldQueueScreen() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const { mobileFetchFieldQueue } = await import("@/lib/hr-queue-api");
      const res = await mobileFetchFieldQueue();
      if (!res.ok) {
        Alert.alert("Gagal memuat", res.error || "Tidak bisa mengambil antrean luar kantor.");
        setItems([]);
        return;
      }
      setItems(res.items.map(mapRow));
    } catch (e) {
      Alert.alert("Gagal memuat", getErrorMessage(e, "Tidak bisa mengambil antrean luar kantor."));
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  async function onApprove(id: string) {
    setBusyId(id);
    try {
      const res = await hrApproveFieldActivity(id);
      if (!res.success) {
        Alert.alert("Gagal", res.message);
        return;
      }
      Alert.alert("Berhasil", res.message);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejectFor) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      Alert.alert("Alasan", "Minimal 5 karakter.");
      return;
    }
    setBusyId(rejectFor);
    try {
      const res = await hrRejectFieldActivity(rejectFor, reason);
      if (!res.success) {
        Alert.alert("Gagal", res.message);
        return;
      }
      setRejectFor(null);
      setRejectReason("");
      Alert.alert("Berhasil", res.message);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PWA.indigo} />
        <Text style={styles.muted}>Memuat antrean…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={PWA.indigo} />
        }
        ListHeaderComponent={
          <Text style={styles.lead}>Pengajuan menunggu persetujuan HR. Setelah disetujui, staf bisa absen masuk di luar radius pada tanggal tersebut.</Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={40} color={PWA.textMuted} />
            <Text style={styles.emptyTitle}>Tidak ada antrean</Text>
            <Text style={styles.emptyBody}>Semua pengajuan luar kantor sudah diproses.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          return (
            <View style={styles.card}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.typeLabel} · {item.period}</Text>
              <Text style={styles.meta}>Tujuan: {item.destination}</Text>
              <Text style={styles.reason} numberOfLines={4}>{item.reason}</Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnOutline]}
                  disabled={busy}
                  onPress={() => { setRejectReason(""); setRejectFor(item.id); }}
                >
                  <Text style={styles.btnOutlineTxt}>Tolak</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={() => void onApprove(item.id)}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryTxt}>Setujui</Text>}
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <Modal visible={!!rejectFor} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tolak pengajuan</Text>
            <TextInput
              style={styles.input}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Alasan untuk staf (min. 5 karakter)"
              placeholderTextColor={PWA.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => { setRejectFor(null); setRejectReason(""); }}>
                <Text style={styles.btnOutlineTxt}>Batal</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => void submitReject()}>
                <Text style={styles.btnDangerTxt}>Tolak</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: PWA.screenBg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10, backgroundColor: PWA.screenBg },
  muted: { color: PWA.textMuted, fontSize: 14 },
  list: { padding: 16, paddingBottom: 32 },
  lead: { fontSize: 13, lineHeight: 19, color: PWA.textSecondary, marginBottom: 14 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
    marginBottom: 10,
  },
  name: { fontSize: 15, fontWeight: "800", color: PWA.text },
  meta: { marginTop: 4, fontSize: 13, color: PWA.textSecondary },
  reason: { marginTop: 8, fontSize: 13, color: PWA.text, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  btnOutline: { borderWidth: 1, borderColor: PWA.border },
  btnOutlineTxt: { fontWeight: "700", color: PWA.textSecondary },
  btnPrimary: { backgroundColor: PWA.indigo },
  btnPrimaryTxt: { fontWeight: "800", color: "#fff" },
  btnDanger: { backgroundColor: "#dc2626" },
  btnDangerTxt: { fontWeight: "800", color: "#fff" },
  empty: { paddingVertical: 48, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: PWA.text },
  emptyBody: { fontSize: 13, color: PWA.textMuted, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: PWA.surface, borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: PWA.text },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: PWA.text,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: 10 },
});
