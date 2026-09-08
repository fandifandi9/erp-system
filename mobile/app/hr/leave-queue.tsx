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
import { approveLeaveRequestByHr, rejectLeaveRequestByHr } from "@/lib/leave";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

type PbUser = { id?: string; name?: string; email?: string };

type Row = {
  id: string;
  name: string;
  range: string;
  division: string;
  reason: string;
};

function ymdFrom(raw: unknown): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw ?? "").trim());
  return m ? m[1] : "";
}

function mapRow(raw: Record<string, unknown>): Row {
  const exp = raw.expand as { user?: PbUser } | undefined;
  const u = exp?.user;
  const name = (u?.name || u?.email || "—").trim();
  const d0 = raw.date ?? raw.Date;
  const s0 = raw.start_date ?? raw.startDate;
  const e0 = raw.end_date ?? raw.endDate;
  let range: string;
  if (ymdFrom(d0)) {
    const a = ymdFrom(d0);
    const note = String(raw.note ?? "");
    const m = /\|\s*s\.d\.\s*(\d{4}-\d{2}-\d{2})/i.exec(note);
    const b = m?.[1] && m[1] >= a ? m[1] : a;
    range = a === b ? a : `${a} – ${b}`;
  } else {
    const s = ymdFrom(s0) || String(s0 ?? "").slice(0, 10);
    const e = ymdFrom(e0) || String(e0 ?? "").slice(0, 10);
    range = s && e ? (s === e ? s : `${s} – ${e}`) : "—";
  }
  const division = String(raw.division ?? raw.devision ?? "").trim() || "—";
  const reason =
    String(raw.reason ?? raw.note ?? "")
      .trim()
      .slice(0, 200) || "—";
  return { id: String(raw.id), name, range, division, reason };
}

export default function HrLeaveQueueScreen() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const { mobileFetchLeaveQueue } = await import("@/lib/hr-queue-api");
      const res = await mobileFetchLeaveQueue();
      if (!res.ok) {
        Alert.alert("Gagal memuat", res.error || "Tidak bisa mengambil antrean cuti.");
        setItems([]);
        return;
      }
      setItems(res.items.map(mapRow));
    } catch (e) {
      console.error(e);
      Alert.alert("Gagal memuat", getErrorMessage(e, "Tidak bisa mengambil antrean cuti."));
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

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  async function onApprove(id: string) {
    setBusyId(id);
    try {
      const res = await approveLeaveRequestByHr(id);
      if (!res.success) {
        Alert.alert("Tidak bisa menyetujui", res.message);
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
      const res = await rejectLeaveRequestByHr(rejectFor, { reason });
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PWA.indigo} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={40} color={PWA.textMuted} />
            <Text style={styles.emptyTitle}>Tidak ada pengajuan menunggu</Text>
            <Text style={styles.emptyBody}>Semua cuti sudah diproses atau belum ada pengajuan baru.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          return (
            <View style={styles.card}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.range}</Text>
              <Text style={styles.meta}>Divisi: {item.division}</Text>
              <Text style={styles.reason} numberOfLines={4}>
                {item.reason}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnOutline]}
                  disabled={busy}
                  onPress={() => {
                    setRejectReason("");
                    setRejectFor(item.id);
                  }}
                >
                  <Text style={styles.btnOutlineTxt}>Tolak</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  disabled={busy}
                  onPress={() => void onApprove(item.id)}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnPrimaryTxt}>Setujui</Text>
                  )}
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
            <Text style={styles.modalHint}>Alasan untuk staf (min. 5 karakter)</Text>
            <TextInput
              style={styles.input}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Contoh: Kuota divisi penuh pada tanggal tersebut"
              placeholderTextColor={PWA.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.btn, styles.btnOutline]}
                onPress={() => {
                  setRejectFor(null);
                  setRejectReason("");
                }}
              >
                <Text style={styles.btnOutlineTxt}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                disabled={busyId === rejectFor}
                onPress={() => void submitReject()}
              >
                {busyId === rejectFor ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryTxt}>Kirim penolakan</Text>
                )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: PWA.screenBg },
  muted: { color: PWA.textMuted, fontSize: 14 },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
    marginBottom: 4,
  },
  name: { fontSize: 17, fontWeight: "800", color: PWA.text },
  meta: { marginTop: 4, fontSize: 13, color: PWA.textSecondary },
  reason: { marginTop: 10, fontSize: 13, lineHeight: 19, color: PWA.text },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnOutline: { borderWidth: 1, borderColor: PWA.border, backgroundColor: PWA.surface },
  btnOutlineTxt: { fontWeight: "700", color: PWA.text },
  btnPrimary: { backgroundColor: PWA.indigo },
  btnPrimaryTxt: { fontWeight: "700", color: "#fff" },
  btnDanger: { backgroundColor: "#b91c1c" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: PWA.text },
  emptyBody: { fontSize: 13, color: PWA.textSecondary, textAlign: "center", paddingHorizontal: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: PWA.surface,
    padding: 18,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: PWA.text },
  modalHint: { fontSize: 12, color: PWA.textSecondary },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 14,
    color: PWA.text,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
});
