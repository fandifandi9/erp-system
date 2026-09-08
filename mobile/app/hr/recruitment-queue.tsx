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
  mobileApproveRecruitment,
  mobileFetchRecruitmentQueue,
  mobileRejectRecruitment,
} from "@/lib/hr-queue-api";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

type Row = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  orgPositionName: string;
  companyLabel: string;
  requesterLabel: string;
  status: string;
};

function mapItem(raw: Record<string, unknown>): Row {
  return {
    id: String(raw.id ?? ""),
    candidateName: String(raw.candidateName ?? raw.candidate_name ?? "—"),
    candidateEmail: String(raw.candidateEmail ?? raw.candidate_email ?? ""),
    orgPositionName: String(raw.orgPositionName ?? raw.org_position_name ?? "—"),
    companyLabel: String(raw.companyId ?? raw.company_id ?? "—"),
    requesterLabel: String(raw.requestedBy ?? raw.requested_by ?? "—"),
    status: String(raw.status ?? "pending"),
  };
}

export default function HrRecruitmentQueueScreen() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await mobileFetchRecruitmentQueue();
      if (!res.ok) {
        Alert.alert("Gagal memuat", res.error || "Antrean rekrutmen gagal.");
        setItems([]);
        return;
      }
      setItems(res.items.map(mapItem));
    } catch (e) {
      Alert.alert("Gagal memuat", getErrorMessage(e, "Antrean rekrutmen gagal."));
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
    }, [load]),
  );

  async function onApprove(id: string) {
    setBusyId(id);
    try {
      const res = await mobileApproveRecruitment(id);
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
    if (reason.length < 3) {
      Alert.alert("Alasan", "Minimal 3 karakter.");
      return;
    }
    setBusyId(rejectFor);
    try {
      const res = await mobileRejectRecruitment(rejectFor, reason);
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={PWA.indigo}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={PWA.textMuted} />
            <Text style={styles.emptyTitle}>Tidak ada pending</Text>
            <Text style={styles.emptyBody}>
              Tidak ada permintaan rekrutmen yang menunggu persetujuan Anda.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.candidateName}</Text>
            {item.candidateEmail ? <Text style={styles.meta}>{item.candidateEmail}</Text> : null}
            <Text style={styles.meta}>Posisi: {item.orgPositionName}</Text>
            <Text style={styles.meta}>Entitas: {item.companyLabel}</Text>
            <Text style={styles.meta}>Requester: {item.requesterLabel}</Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, styles.approve]}
                disabled={busyId === item.id}
                onPress={() => void onApprove(item.id)}
              >
                <Text style={styles.btnText}>Setujui</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.reject]}
                disabled={busyId === item.id}
                onPress={() => {
                  setRejectFor(item.id);
                  setRejectReason("");
                }}
              >
                <Text style={styles.btnText}>Tolak</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal visible={!!rejectFor} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Alasan penolakan</Text>
            <TextInput
              style={styles.input}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholder="Wajib diisi"
            />
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.ghost]} onPress={() => setRejectFor(null)}>
                <Text style={styles.ghostText}>Batal</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.reject]} onPress={() => void submitReject()}>
                <Text style={styles.btnText}>Tolak</Text>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  muted: { color: PWA.textMuted, fontSize: 14 },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { alignItems: "center", paddingTop: 48, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: PWA.text },
  emptyBody: { fontSize: 13, color: PWA.textMuted, textAlign: "center" },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: "700", color: PWA.text },
  meta: { fontSize: 12, color: PWA.textMuted, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  approve: { backgroundColor: "#059669" },
  reject: { backgroundColor: "#e11d48" },
  ghost: { backgroundColor: PWA.surface, borderWidth: 1, borderColor: PWA.border },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ghostText: { color: PWA.text, fontWeight: "600", fontSize: 13 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: PWA.surface, borderRadius: 16, padding: 16 },
  modalTitle: { fontWeight: "700", fontSize: 16, marginBottom: 8, color: PWA.text },
  input: {
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 10,
    minHeight: 80,
    padding: 10,
    textAlignVertical: "top",
    color: PWA.text,
  },
});
