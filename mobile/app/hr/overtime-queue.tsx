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
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { pb } from "@/lib/pocketbase";
import {
  computeOvertimeHours,
  createHrAssignment,
  hrApproveStaffRequest,
  hrRejectStaffRequest,
  OVERTIME_STATUS_LABEL,
  type OvertimeRequest,
} from "@/lib/overtime";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

type TabKey = "queue" | "assign";

type StaffOpt = { userId: string; label: string };

function staffName(raw: Record<string, unknown>): string {
  const exp = raw.expand as { user?: { name?: string; email?: string } } | undefined;
  const u = exp?.user;
  return (u?.name || u?.email || "—").trim();
}

export default function HrOvertimeQueueScreen() {
  const [tab, setTab] = useState<TabKey>("queue");
  const [items, setItems] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [staffModal, setStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffOpt | null>(null);
  const [workDate, setWorkDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [assignReason, setAssignReason] = useState("");
  const [hrNote, setHrNote] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    try {
      const { mobileFetchOvertimeQueue } = await import("@/lib/hr-queue-api");
      const res = await mobileFetchOvertimeQueue();
      if (!res.ok) {
        Alert.alert("Gagal memuat", res.error || "Tidak bisa mengambil antrean lembur.");
        setItems([]);
        return;
      }
      const rows = res.items.map((raw) => ({
        id: String(raw.id),
        user: String(raw.user ?? ""),
        work_date: String(raw.work_date ?? ""),
        start_time: String(raw.start_time ?? ""),
        end_time: String(raw.end_time ?? ""),
        hours: Number(raw.hours) || 0,
        source: "staff_request" as const,
        status: "waiting_hr" as const,
        reason: String(raw.reason ?? ""),
        created: String(raw.created ?? ""),
        updated: String(raw.updated ?? ""),
        _name: staffName(raw),
      }));
      setItems(rows as OvertimeRequest[] & { _name?: string }[]);
    } catch (e) {
      Alert.alert("Gagal memuat", getErrorMessage(e, "Tidak bisa mengambil antrean lembur."));
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const list = await pb.collection("profiles").getFullList({
        sort: "name",
        fields: "id,user,name,email",
        requestKey: null,
      });
      const opts: StaffOpt[] = [];
      for (const p of list as unknown as Record<string, unknown>[]) {
        const uid = String(p.user ?? "").trim();
        if (!uid) continue;
        const label = String(p.name ?? p.email ?? uid).trim();
        opts.push({ userId: uid, label });
      }
      setStaff(opts);
    } catch {
      setStaff([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
      void loadStaff();
    }, [load, loadStaff])
  );

  async function onApprove(id: string) {
    setBusyId(id);
    try {
      const res = await hrApproveStaffRequest(id);
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
      const res = await hrRejectStaffRequest(rejectFor, reason);
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

  async function submitAssign() {
    if (!selectedStaff) {
      Alert.alert("Karyawan", "Pilih karyawan terlebih dahulu.");
      return;
    }
    setAssigning(true);
    try {
      const res = await createHrAssignment({
        userId: selectedStaff.userId,
        work_date: workDate.trim(),
        start_time: startTime.trim(),
        end_time: endTime.trim(),
        reason: assignReason.trim(),
        hr_note: hrNote.trim(),
      });
      if (!res.success) {
        Alert.alert("Gagal", res.message);
        return;
      }
      Alert.alert("Berhasil", res.message);
      setAssignReason("");
      setHrNote("");
      setSelectedStaff(null);
    } finally {
      setAssigning(false);
    }
  }

  const tabBtn = (key: TabKey, label: string) => (
    <Pressable style={[styles.tabBtn, tab === key && styles.tabBtnOn]} onPress={() => setTab(key)}>
      <Text style={[styles.tabBtnTxt, tab === key && styles.tabBtnTxtOn]}>{label}</Text>
    </Pressable>
  );

  if (loading && tab === "queue") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PWA.indigo} />
        <Text style={styles.muted}>Memuat…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.tabBar}>
        {tabBtn("queue", "Pengajuan staf")}
        {tabBtn("assign", "Penunjukan HR")}
      </View>

      {tab === "queue" ? (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor={PWA.indigo}
            />
          }
          ListHeaderComponent={
            <Text style={styles.lead}>
              Pengajuan lembur dari staf ({OVERTIME_STATUS_LABEL.waiting_hr}). Setujui mengirim nominal ke staf untuk
              dikonfirmasi.
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={40} color={PWA.textMuted} />
              <Text style={styles.emptyTitle}>Tidak ada pengajuan menunggu</Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            const name = (item as OvertimeRequest & { _name?: string })._name ?? "—";
            return (
              <View style={styles.card}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.meta}>
                  {item.work_date} · {item.start_time}–{item.end_time} ({item.hours || computeOvertimeHours(item.start_time, item.end_time)} jam)
                </Text>
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
      ) : (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>Kirim penunjukan lembur ke staf — mereka dapat menerima atau menolak di tab Absensi.</Text>

          <Text style={styles.lbl}>Karyawan *</Text>
          <Pressable style={styles.select} onPress={() => setStaffModal(true)}>
            <Text style={styles.selectTxt}>{selectedStaff?.label ?? "Pilih karyawan…"}</Text>
            <Ionicons name="chevron-down" size={18} color={PWA.textMuted} />
          </Pressable>

          <Text style={styles.lbl}>Tanggal (YYYY-MM-DD) *</Text>
          <TextInput style={styles.input} value={workDate} onChangeText={setWorkDate} placeholder="2026-05-16" placeholderTextColor={PWA.textMuted} />

          <View style={styles.row2}>
            <View style={styles.half}>
              <Text style={styles.lbl}>Jam mulai *</Text>
              <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="18:00" />
            </View>
            <View style={styles.half}>
              <Text style={styles.lbl}>Jam selesai *</Text>
              <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="20:00" />
            </View>
          </View>

          <Text style={styles.lbl}>Alasan / tugas *</Text>
          <TextInput style={[styles.input, styles.inputMulti]} value={assignReason} onChangeText={setAssignReason} multiline placeholder="Min. 5 karakter" />

          <Text style={styles.lbl}>Catatan HR (opsional)</Text>
          <TextInput style={styles.input} value={hrNote} onChangeText={setHrNote} placeholder="Untuk staf" />

          <Pressable style={[styles.btn, styles.btnPrimary, styles.submit]} disabled={assigning} onPress={() => void submitAssign()}>
            {assigning ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryTxt}>Kirim penunjukan</Text>}
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={!!rejectFor} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tolak pengajuan lembur</Text>
            <TextInput
              style={styles.inputMulti}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Alasan (min. 5 karakter)"
              placeholderTextColor={PWA.textMuted}
            />
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => { setRejectFor(null); setRejectReason(""); }}>
                <Text style={styles.btnOutlineTxt}>Batal</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => void submitReject()}>
                <Text style={styles.btnPrimaryTxt}>Tolak</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={staffModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.staffModal]}>
            <Text style={styles.modalTitle}>Pilih karyawan</Text>
            <FlatList
              data={staff}
              keyExtractor={(s) => s.userId}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.staffRow}
                  onPress={() => {
                    setSelectedStaff(item);
                    setStaffModal(false);
                  }}
                >
                  <Text style={styles.staffRowTxt}>{item.label}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.muted}>Tidak ada profil karyawan.</Text>}
            />
            <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => setStaffModal(false)}>
              <Text style={styles.btnOutlineTxt}>Tutup</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: PWA.screenBg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  muted: { color: PWA.textMuted, fontSize: 14 },
  tabBar: {
    flexDirection: "row",
    margin: 16,
    marginBottom: 0,
    padding: 4,
    borderRadius: 14,
    backgroundColor: PWA.slate100,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabBtnOn: { backgroundColor: PWA.surface },
  tabBtnTxt: { fontSize: 13, fontWeight: "700", color: PWA.textMuted },
  tabBtnTxtOn: { color: PWA.indigo },
  list: { padding: 16, paddingBottom: 32 },
  form: { padding: 16, paddingBottom: 40, gap: 4 },
  lead: { fontSize: 13, lineHeight: 19, color: PWA.textSecondary, marginBottom: 12 },
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
  submit: { marginTop: 16, flex: undefined, width: "100%" },
  empty: { paddingVertical: 40, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: PWA.text },
  lbl: { marginTop: 10, fontSize: 12, fontWeight: "700", color: PWA.textSecondary },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: PWA.text,
    backgroundColor: PWA.surface,
  },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },
  select: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: PWA.surface,
  },
  selectTxt: { fontSize: 14, color: PWA.text, flex: 1 },
  row2: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: PWA.surface, borderRadius: 16, padding: 18, gap: 10 },
  staffModal: { maxHeight: "80%" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: PWA.text },
  staffRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PWA.border },
  staffRowTxt: { fontSize: 15, color: PWA.text },
});
