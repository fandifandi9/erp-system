import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  Keyboard,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/context/auth";
import {
  computeOvertimeHours,
  createStaffOvertimeRequest,
  fetchOvertimeForUser,
  formatOvertimeHrActionSummary,
  OVERTIME_STATUS_LABEL,
  staffAcceptAssignment,
  staffDeclineAssignment,
  type OvertimeRequest,
  type OvertimeStatus,
} from "@/lib/overtime";
import { canAccess } from "@/lib/rbac";
import { filterTimeHmTyping, formalizeTimeHmInput } from "@/lib/time-hm-input";
import { PWA } from "@/constants/pwaTheme";

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function ymdFromAny(raw: string): string {
  const s = String(raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s.slice(0, 10);
}

function formatDateId(ymdRaw: string): string {
  const ymd = ymdFromAny(ymdRaw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymdRaw;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return ymdRaw;
  return dt.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ymdToLocalDate(ymd: string): Date | null {
  const y = ymdFromAny(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return null;
  const [yy, mm, dd] = y.split("-").map(Number);
  const d = new Date(yy, mm - 1, dd);
  if (d.getFullYear() !== yy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

type TabKey = "request" | "history";

function StatMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "green" | "blue" | "red" | "gray" | "purple";
}) {
  const palette: Record<string, { bg: string; bd: string; tc: string }> = {
    amber: { bg: "#fffbeb", bd: "#fde68a", tc: "#92400e" },
    green: { bg: "#f0fdf4", bd: "#bbf7d0", tc: "#166534" },
    blue: { bg: "#eff6ff", bd: "#bfdbfe", tc: "#1e40af" },
    red: { bg: "#fef2f2", bd: "#fecaca", tc: "#b91c1c" },
    gray: { bg: "#f8fafc", bd: "#e2e8f0", tc: "#475569" },
    purple: { bg: "#f5f3ff", bd: "#ddd6fe", tc: "#5b21b6" },
  };
  const p = palette[tone];
  return (
    <View style={[otTabStyles.statMini, { backgroundColor: p.bg, borderColor: p.bd }]}>
      <Text style={[otTabStyles.statMiniLbl, { color: p.tc }]}>{label}</Text>
      <Text style={[otTabStyles.statMiniVal, { color: p.tc }]}>{value}</Text>
    </View>
  );
}

function statusStyle(status: OvertimeStatus): { bg: string; fg: string } {
  const map: Record<OvertimeStatus, { bg: string; fg: string }> = {
    waiting_staff: { bg: "#fef3c7", fg: "#92400e" },
    waiting_hr: { bg: "#dbeafe", fg: "#1e40af" },
    staff_accepted: { bg: "#d1fae5", fg: "#065f46" },
    staff_declined: { bg: "#ffedd5", fg: "#9a3412" },
    hr_approved: { bg: "#dcfce7", fg: "#166534" },
    hr_rejected: { bg: "#fee2e2", fg: "#991b1b" },
  };
  return map[status] ?? { bg: PWA.slate100, fg: PWA.text };
}

export function OvertimeStaffPanel({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const hasAccess = !!user && canAccess(user, "/dashboard-staff");

  const [rows, setRows] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const [formDate, setFormDate] = useState("");
  const [formStart, setFormStart] = useState("18:00");
  const [formEnd, setFormEnd] = useState("22:00");
  const [formReason, setFormReason] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [iosWorkDate, setIosWorkDate] = useState<Date | null>(null);
  const [tab, setTab] = useState<TabKey>("request");

  const pendingHrAssign = useMemo(
    () => rows.filter((r) => r.source === "hr_assignment" && r.status === "waiting_staff"),
    [rows]
  );

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchOvertimeForUser(uid);
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!formDate) setFormDate(todayYmd());
  }, [formDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  function openWorkDatePicker() {
    const value = ymdToLocalDate(formDate) ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "date",
        onChange: (event, selected) => {
          if (event.type === "set" && selected) setFormDate(dateToYmd(selected));
        },
      });
    } else {
      setIosWorkDate(value);
    }
  }

  async function submitRequest() {
    Keyboard.dismiss();
    setFormBusy(true);
    try {
      const startHm = formalizeTimeHmInput(formStart);
      const endHm = formalizeTimeHmInput(formEnd);
      setFormStart(startHm);
      setFormEnd(endHm);
      const res = await createStaffOvertimeRequest({
        work_date: formDate,
        start_time: startHm,
        end_time: endHm,
        reason: formReason,
      });
      Alert.alert(res.success ? "Berhasil" : "Gagal", res.message);
      if (res.success) {
        setFormReason("");
        setShowForm(false);
        await load();
        setTab("history");
      }
    } finally {
      Keyboard.dismiss();
      setFormBusy(false);
    }
  }

  function confirmAccept(id: string) {
    Alert.alert("Terima lembur?", "Konfirmasi penunjukan dari HR.", [
      { text: "Batal", style: "cancel" },
      {
        text: "Terima",
        onPress: async () => {
          setActing(id);
          try {
            const res = await staffAcceptAssignment(id);
            Alert.alert(res.success ? "Berhasil" : "Gagal", res.message);
            if (res.success) await load();
          } finally {
            setActing(null);
          }
        },
      },
    ]);
  }

  async function sendDecline() {
    if (!declineId) return;
    setActing(declineId);
    try {
      const res = await staffDeclineAssignment(declineId, declineNote);
      Alert.alert(res.success ? "Berhasil" : "Gagal", res.message);
      if (res.success) {
        setDeclineId(null);
        setDeclineNote("");
        await load();
      }
    } finally {
      setActing(null);
    }
  }

  if (!hasAccess) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Anda tidak memiliki akses ke pengajuan lembur (peran / dashboard).</Text>
      </View>
    );
  }

  if (!uid) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Silakan login.</Text>
      </View>
    );
  }

  const hoursPreview = computeOvertimeHours(formStart, formEnd);

  const tabBtn = (key: TabKey, label: string) => (
    <Pressable
      key={key}
      onPress={() => setTab(key)}
      style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
    >
      <Text style={[styles.tabBtnText, tab === key && styles.tabBtnTextActive]}>{label}</Text>
    </Pressable>
  );

  const historyStats = useMemo(
    () => ({
      waitHr: rows.filter((r) => r.status === "waiting_hr").length,
      waitStaff: rows.filter((r) => r.status === "waiting_staff").length,
      accepted: rows.filter((r) => r.status === "staff_accepted").length,
      rejected: rows.filter(
        (r) => r.status === "hr_rejected" || r.status === "staff_declined"
      ).length,
    }),
    [rows]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, embedded && styles.contentEmbedded]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {!embedded ? (
        <>
          <Text style={styles.h1}>Lembur</Text>
          <Text style={styles.heroBody}>
            Terima atau tolak penunjukan HR, ajukan lembur sendiri, dan lihat riwayat.
          </Text>
        </>
      ) : (
        <View style={styles.embeddedHeader}>
          <Text style={styles.embeddedTitle}>Pengajuan & riwayat lembur</Text>
          <Text style={styles.embeddedSub}>Tab Pengajuan = form & penunjukan HR · Tab Riwayat = status semua lembur</Text>
        </View>
      )}

      <View style={styles.tabBar}>{tabBtn("request", "Pengajuan")}{tabBtn("history", "Riwayat")}</View>

      {tab === "request" ? (
        <>
      {pendingHrAssign.length > 0 ? (
        <View style={styles.alertBox}>
          <View style={styles.alertHead}>
            <Ionicons name="warning-outline" size={20} color="#92400e" />
            <Text style={styles.alertTitle}>Perlu tanggapan ({pendingHrAssign.length})</Text>
          </View>
          {pendingHrAssign.map((r) => (
            <View key={r.id} style={styles.pendingCard}>
              <Text style={styles.pendingMain}>
                {r.work_date} · {r.start_time} – {r.end_time} ({r.hours} jam)
              </Text>
              <Text style={styles.pendingReason}>{r.reason}</Text>
              {r.hr_note ? (
                <Text style={styles.hrNote}>
                  <Text style={{ fontWeight: "700" }}>Dari HR: </Text>
                  {r.hr_note}
                </Text>
              ) : null}
              <View style={styles.pendingActions}>
                <Pressable
                  style={[styles.btnGreen, acting === r.id && styles.btnDis]}
                  disabled={acting === r.id}
                  onPress={() => confirmAccept(r.id)}
                >
                  {acting === r.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnGreenTxt}>Terima</Text>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.btnOutlineRed, acting === r.id && styles.btnDis]}
                  disabled={acting === r.id}
                  onPress={() => {
                    setDeclineId(r.id);
                    setDeclineNote("");
                  }}
                >
                  <Text style={styles.btnOutlineRedTxt}>Tolak</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Ajukan lembur</Text>
        <Pressable style={styles.btnIndigoSm} onPress={() => setShowForm((v) => !v)}>
          <Ionicons name={showForm ? "chevron-up" : "add"} size={18} color="#fff" />
          <Text style={styles.btnIndigoSmTxt}>{showForm ? "Tutup" : "Form"}</Text>
        </Pressable>
      </View>

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.label}>Tanggal kerja</Text>
          <Pressable style={styles.dateBtn} onPress={openWorkDatePicker}>
            <Ionicons name="calendar-outline" size={18} color={PWA.indigo} />
            <Text style={styles.dateBtnTxt}>{formatDateId(formDate)}</Text>
            <Text style={styles.dateBtnHint}>{formDate}</Text>
          </Pressable>
          <Text style={styles.previewJam}>
            Perkiraan jam: <Text style={{ fontWeight: "800" }}>{hoursPreview.toFixed(2)} jam</Text>
          </Text>
          <Text style={styles.label}>Jam mulai (HH:mm, 24 jam)</Text>
          <TextInput
            style={styles.input}
            value={formStart}
            onChangeText={(t) => setFormStart(filterTimeHmTyping(t))}
            onBlur={() => setFormStart((v) => formalizeTimeHmInput(v))}
            placeholder="09:00"
            placeholderTextColor={PWA.textMuted}
            keyboardType="number-pad"
            maxLength={5}
          />
          <Text style={styles.label}>Jam selesai (HH:mm, 24 jam)</Text>
          <TextInput
            style={styles.input}
            value={formEnd}
            onChangeText={(t) => setFormEnd(filterTimeHmTyping(t))}
            onBlur={() => setFormEnd((v) => formalizeTimeHmInput(v))}
            placeholder="18:00"
            placeholderTextColor={PWA.textMuted}
            keyboardType="number-pad"
            maxLength={5}
          />
          <Text style={styles.label}>Alasan (min. 10 karakter)</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={formReason}
            onChangeText={setFormReason}
            placeholder="Jelaskan kebutuhan lembur"
            placeholderTextColor={PWA.textMuted}
            multiline
          />
          <Pressable
            style={[styles.btnSubmit, formBusy && styles.btnDis]}
            disabled={formBusy}
            onPress={() => void submitRequest()}
          >
            {formBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnSubmitTxt}>Kirim ke HR</Text>
            )}
          </Pressable>
        </View>
      ) : null}

          <Pressable style={styles.linkHistory} onPress={() => setTab("history")}>
            <Text style={styles.linkHistoryText}>Lihat riwayat lembur →</Text>
          </Pressable>
        </>
      ) : (
        <>
          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={PWA.indigo} />
            </View>
          ) : (
            <>
              <View style={styles.statsRow}>
                <StatMini label="Menunggu HR" value={historyStats.waitHr} tone="blue" />
                <StatMini label="Perlu respons" value={historyStats.waitStaff} tone="amber" />
                <StatMini label="Diterima" value={historyStats.accepted} tone="green" />
                <StatMini label="Ditolak" value={historyStats.rejected} tone="red" />
              </View>

              {rows.length === 0 ? (
                <View style={styles.emptyHist}>
                  <Ionicons name="moon-outline" size={48} color={PWA.slate300} />
                  <Text style={styles.emptyHistTitle}>Belum ada riwayat lembur</Text>
                  <Pressable style={styles.emptyHistBtn} onPress={() => setTab("request")}>
                    <Text style={styles.emptyHistBtnText}>Buat pengajuan</Text>
                  </Pressable>
                </View>
              ) : (
                rows.map((r) => {
                  const st = statusStyle(r.status);
                  const hrLine = formatOvertimeHrActionSummary(r);
                  return (
                    <View key={r.id} style={styles.histCardFull}>
                      <View style={styles.histTopFull}>
                        <View style={styles.histIconWrap}>
                          <Ionicons name="moon" size={22} color={PWA.indigo} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.histTitleFull}>Lembur</Text>
                          <Text style={styles.histMetaFull}>
                            {r.source === "hr_assignment" ? "Penunjukan HR" : "Pengajuan saya"}
                            {r.created
                              ? ` · ${new Date(r.created).toLocaleString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : ""}
                          </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.badgeTxt, { color: st.fg }]}>
                            {OVERTIME_STATUS_LABEL[r.status]}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.histRowIcon}>
                        <Ionicons name="calendar-outline" size={16} color={PWA.textMuted} />
                        <Text style={styles.histRowText}>
                          {formatDateId(r.work_date)} · {r.start_time} – {r.end_time} ({r.hours} jam)
                        </Text>
                      </View>
                      <View style={styles.reasonBox}>
                        <Text style={styles.reasonLbl}>Alasan</Text>
                        <Text style={styles.reasonTxt}>{r.reason}</Text>
                      </View>
                      {r.hr_note ? (
                        <Text style={styles.hrNoteSmall}>
                          <Text style={{ fontWeight: "700" }}>Catatan HR: </Text>
                          {r.hr_note}
                        </Text>
                      ) : null}
                      {r.status === "hr_rejected" && r.rejection_reason?.trim() ? (
                        <View style={styles.rejectBox}>
                          <Text style={styles.rejectTxt}>HR: {r.rejection_reason.trim()}</Text>
                        </View>
                      ) : null}
                      {r.status === "staff_declined" && r.staff_decline_note ? (
                        <Text style={styles.declineNote}>Anda menolak: {r.staff_decline_note}</Text>
                      ) : null}
                      {hrLine ? (
                        <View style={styles.hrBox}>
                          <Text style={styles.hrBoxLbl}>Penanganan HR</Text>
                          <Text style={styles.hrBoxTxt}>{hrLine}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </>
          )}
        </>
      )}

      <Modal visible={!!declineId} transparent animationType="fade">
        <Pressable style={styles.modalBg} onPress={() => !acting && setDeclineId(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Tolak penunjukan</Text>
            <Text style={styles.modalSub}>Opsional: keterangan untuk HR.</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={declineNote}
              onChangeText={setDeclineNote}
              placeholder="Contoh: tidak bisa di tanggal tersebut."
              placeholderTextColor={PWA.textMuted}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => !acting && setDeclineId(null)}>
                <Text style={styles.modalCancelTxt}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDanger, acting && styles.btnDis]}
                disabled={!!acting}
                onPress={() => void sendDecline()}
              >
                {acting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalDangerTxt}>Kirim penolakan</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={iosWorkDate !== null} transparent animationType="slide">
        <Pressable style={styles.modalBg} onPress={() => setIosWorkDate(null)}>
          <Pressable style={styles.iosSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Tanggal lembur</Text>
            {iosWorkDate ? (
              <DateTimePicker
                value={iosWorkDate}
                mode="date"
                display="spinner"
                locale="id-ID"
                onChange={(_, d) => {
                  if (d) setIosWorkDate(d);
                }}
              />
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setIosWorkDate(null)}>
                <Text style={styles.modalCancelTxt}>Batal</Text>
              </Pressable>
              <Pressable
                style={styles.btnIndigoSm}
                onPress={() => {
                  if (iosWorkDate) setFormDate(dateToYmd(iosWorkDate));
                  setIosWorkDate(null);
                }}
              >
                <Text style={styles.btnIndigoSmTxt}>Simpan</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: PWA.screenBg },
  denied: { color: PWA.red700, fontSize: 15, textAlign: "center", lineHeight: 22 },
  muted: { color: PWA.textMuted, fontSize: 15 },
  h1: { fontSize: 24, fontWeight: "800", color: PWA.text },
  heroBody: { marginTop: 8, fontSize: 14, color: PWA.textSecondary, lineHeight: 21 },
  alertBox: {
    marginTop: 16,
    borderWidth: 2,
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  alertHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertTitle: { fontWeight: "700", color: "#92400e", fontSize: 15 },
  pendingCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    padding: 14,
    gap: 8,
  },
  pendingMain: { fontWeight: "700", color: PWA.text, fontSize: 15 },
  pendingReason: { fontSize: 14, color: PWA.textSecondary },
  hrNote: { fontSize: 12, color: "#3730a3" },
  pendingActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  btnGreen: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnGreenTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnOutlineRed: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#fecaca",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnOutlineRedTxt: { color: "#dc2626", fontWeight: "700", fontSize: 15 },
  rowBetween: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: PWA.text },
  btnIndigoSm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PWA.indigo,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnIndigoSmTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  formCard: {
    marginTop: 12,
    backgroundColor: PWA.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    padding: 16,
    gap: 10,
  },
  label: { fontSize: 12, fontWeight: "600", color: PWA.textMuted },
  input: {
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: PWA.text,
    backgroundColor: PWA.slate50,
  },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: PWA.slate50,
  },
  dateBtnTxt: { fontWeight: "700", color: PWA.text, fontSize: 15 },
  dateBtnHint: { marginLeft: "auto", fontSize: 12, color: PWA.textMuted },
  previewJam: { fontSize: 13, color: PWA.textSecondary },
  btnSubmit: {
    marginTop: 6,
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnSubmitTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  btnDis: { opacity: 0.55 },
  loader: { paddingVertical: 40, alignItems: "center" },
  empty: { alignItems: "center", paddingVertical: 36, gap: 8 },
  emptyTxt: { color: PWA.textMuted, fontSize: 14 },
  histCard: {
    marginTop: 12,
    backgroundColor: PWA.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    padding: 14,
  },
  histTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeTxt: { fontSize: 11, fontWeight: "700" },
  sourceLbl: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  histLine: { marginTop: 8, fontSize: 14, color: PWA.textSecondary },
  histReason: { marginTop: 6, fontSize: 14, color: PWA.text, lineHeight: 20 },
  hrNoteSmall: { marginTop: 6, fontSize: 12, color: "#3730a3" },
  rejectBox: {
    marginTop: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    padding: 8,
  },
  rejectTxt: { fontSize: 12, color: "#991b1b" },
  declineNote: { marginTop: 6, fontSize: 12, color: "#9a3412" },
  hrMeta: { marginTop: 8, fontSize: 11, color: PWA.textMuted },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalSheet: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
  },
  iosSheet: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: PWA.text },
  modalSub: { marginTop: 6, fontSize: 13, color: PWA.textMuted },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  modalCancelTxt: { fontSize: 14, fontWeight: "600", color: PWA.textSecondary },
  modalDanger: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    minWidth: 120,
    alignItems: "center",
  },
  modalDangerTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
  embeddedHeader: { marginBottom: 12 },
  embeddedTitle: { fontSize: 17, fontWeight: "800", color: PWA.text },
  embeddedSub: { marginTop: 4, fontSize: 12, color: PWA.textSecondary, lineHeight: 17 },
  contentEmbedded: { padding: 16, paddingBottom: 32 },
  tabBar: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    backgroundColor: PWA.slate100,
    borderRadius: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabBtnActive: { backgroundColor: PWA.indigo, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4 },
  tabBtnText: { fontSize: 14, fontWeight: "700", color: PWA.textSecondary },
  tabBtnTextActive: { color: "#fff" },
  linkHistory: { marginTop: 16, paddingVertical: 12 },
  linkHistoryText: { fontSize: 14, fontWeight: "700", color: PWA.indigo },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  emptyHist: {
    alignItems: "center",
    padding: 32,
    backgroundColor: PWA.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  emptyHistTitle: { marginTop: 12, fontSize: 16, fontWeight: "700", color: PWA.text },
  emptyHistBtn: {
    marginTop: 16,
    backgroundColor: PWA.indigo,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyHistBtnText: { color: "#fff", fontWeight: "700" },
  histCardFull: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  histTopFull: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  histIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: PWA.indigo50,
    alignItems: "center",
    justifyContent: "center",
  },
  histTitleFull: { fontSize: 17, fontWeight: "800", color: PWA.text },
  histMetaFull: { marginTop: 2, fontSize: 11, color: PWA.textMuted },
  histRowIcon: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  histRowText: { fontSize: 14, color: PWA.textSecondary, flex: 1 },
  reasonBox: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: PWA.slate50 },
  reasonLbl: { fontSize: 11, color: PWA.textMuted, marginBottom: 4 },
  reasonTxt: { fontSize: 14, color: PWA.text },
  hrBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PWA.indigo100,
    backgroundColor: "rgba(238, 242, 255, 0.85)",
  },
  hrBoxLbl: { fontSize: 10, fontWeight: "700", color: PWA.indigo700 },
  hrBoxTxt: { marginTop: 4, fontSize: 13, color: "#1e1b4b" },
});

const otTabStyles = StyleSheet.create({
  statMini: { flexGrow: 1, minWidth: "22%", padding: 10, borderRadius: 12, borderWidth: 1 },
  statMiniLbl: { fontSize: 10, fontWeight: "600" },
  statMiniVal: { fontSize: 20, fontWeight: "800", marginTop: 4 },
});

export default OvertimeStaffPanel;
