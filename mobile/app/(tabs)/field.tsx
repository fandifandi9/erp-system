import { useCallback, useEffect, useState } from "react";
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
import { Link } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/context/auth";
import {
  ACTIVITY_TYPE_LABEL,
  createFieldActivityRequest,
  fetchFieldActivityForUser,
  formatFieldActivityHrSummary,
  staffCancelPending,
  type FieldActivityRequest,
  type FieldActivityType,
} from "@/lib/field_activity";
import { PWA } from "@/constants/pwaTheme";

const TYPES: FieldActivityType[] = ["meeting", "visit", "out_of_town", "other"];

/** Terima YYYY-MM-DD atau DD/MM/YYYY (satu slash). */
function parseFlexibleDateToYmd(raw: string): string | null {
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const yyyy = dmy[3];
    const y = Number(yyyy);
    const m = Number(mm);
    const d = Number(dd);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== m - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
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

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
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
  tone: "amber" | "green" | "red" | "gray";
}) {
  const bg =
    tone === "amber"
      ? "#fffbeb"
      : tone === "green"
        ? "#f0fdf4"
        : tone === "red"
          ? "#fef2f2"
          : "#f8fafc";
  const bd =
    tone === "amber"
      ? "#fde68a"
      : tone === "green"
        ? "#bbf7d0"
        : tone === "red"
          ? "#fecaca"
          : "#e2e8f0";
  const tc =
    tone === "amber"
      ? "#92400e"
      : tone === "green"
        ? "#166534"
        : tone === "red"
          ? "#b91c1c"
          : "#475569";
  return (
    <View style={[fieldTabStyles.statMini, { backgroundColor: bg, borderColor: bd }]}>
      <Text style={[fieldTabStyles.statMiniLbl, { color: tc }]}>{label}</Text>
      <Text style={[fieldTabStyles.statMiniVal, { color: tc }]}>{value}</Text>
    </View>
  );
}

function statusBadge(status: FieldActivityRequest["status"]): {
  bg: string;
  fg: string;
  label: string;
} {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending_hr: { bg: "#fef3c7", fg: "#92400e", label: "Menunggu persetujuan HR" },
    approved: { bg: "#dcfce7", fg: "#166534", label: "Disetujui" },
    rejected: { bg: "#fee2e2", fg: "#991b1b", label: "Ditolak" },
    cancelled: { bg: "#f1f5f9", fg: "#475569", label: "Dibatalkan" },
  };
  return map[status] ?? { bg: PWA.slate100, fg: PWA.text, label: status };
}

export function FieldStaffPanel({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";

  const [rows, setRows] = useState<FieldActivityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activityType, setActivityType] = useState<FieldActivityType>("meeting");
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [typeModal, setTypeModal] = useState(false);
  const [iosPicker, setIosPicker] = useState<{ field: "start" | "end"; date: Date } | null>(
    null
  );
  const [tab, setTab] = useState<TabKey>("request");

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchFieldActivityForUser(uid);
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
    const y = todayYmd();
    if (!startDate) setStartDate(y);
    if (!endDate) setEndDate(y);
  }, [startDate, endDate]);

  const reasonLen = reason.trim().length;
  const destLen = destination.trim().length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  async function submit() {
    if (!uid) {
      Alert.alert("Sesi", "Silakan login kembali.");
      return;
    }
    if (destLen < 2) {
      Alert.alert("Validasi", "Isi tujuan / lokasi minimal 2 karakter.");
      return;
    }
    if (reasonLen < 10) {
      Alert.alert(
        "Validasi",
        `Keterangan minimal 10 karakter (saat ini: ${reasonLen}).`
      );
      return;
    }
    const sd = parseFlexibleDateToYmd(startDate) ?? ymdFromAny(startDate);
    const ed = parseFlexibleDateToYmd(endDate) ?? ymdFromAny(endDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
      Alert.alert("Validasi", "Pilih tanggal mulai dan selesai lewat kalender.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createFieldActivityRequest({
        start_date: sd,
        end_date: ed,
        activity_type: activityType,
        destination,
        reason,
      });
      Alert.alert(res.success ? "Berhasil" : "Gagal", res.message);
      if (res.success) {
        setDestination("");
        setReason("");
        const y = todayYmd();
        setStartDate(y);
        setEndDate(y);
        await load();
        setTab("history");
      }
    } finally {
      Keyboard.dismiss();
      setSubmitting(false);
    }
  }

  function confirmCancel(id: string) {
    Alert.alert("Batalkan?", "Batalkan pengajuan ini?", [
      { text: "Tidak", style: "cancel" },
      {
        text: "Ya",
        style: "destructive",
        onPress: async () => {
          setCancelling(id);
          try {
            const out = await staffCancelPending(id);
            Alert.alert(out.success ? "Berhasil" : "Gagal", out.message);
            if (out.success) await load();
          } finally {
            setCancelling(null);
          }
        },
      },
    ]);
  }

  function openDatePicker(field: "start" | "end") {
    const raw = field === "start" ? startDate : endDate;
    const normalized =
      parseFlexibleDateToYmd(raw) ?? (/^\d{4}-\d{2}-\d{2}$/.test(ymdFromAny(raw)) ? ymdFromAny(raw) : null);
    const value = ymdToLocalDate(normalized ?? "") ?? new Date();

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "date",
        onChange: (event, selected) => {
          if (event.type === "set" && selected) {
            const ymd = dateToYmd(selected);
            if (field === "start") setStartDate(ymd);
            else setEndDate(ymd);
          }
        },
      });
    } else {
      setIosPicker({ field, date: value });
    }
  }

  function confirmIosDate() {
    if (!iosPicker) return;
    const ymd = dateToYmd(iosPicker.date);
    if (iosPicker.field === "start") setStartDate(ymd);
    else setEndDate(ymd);
    setIosPicker(null);
  }

  if (!uid) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Silakan login.</Text>
      </View>
    );
  }

  const tabBtn = (key: TabKey, label: string) => (
    <Pressable
      key={key}
      onPress={() => setTab(key)}
      style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
    >
      <Text style={[styles.tabBtnText, tab === key && styles.tabBtnTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, embedded && styles.contentEmbedded]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {embedded ? (
        <View style={styles.embeddedHeader}>
          <Text style={styles.embeddedTitle}>Pengajuan & riwayat luar kantor</Text>
          <Text style={styles.embeddedSub}>
            Tab Pengajuan = form baru · Tab Riwayat = status semua pengajuan luar kantor
          </Text>
        </View>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.h1}>Aktivitas luar kantor</Text>
          <Text style={styles.heroBody}>
            Ajukan <Text style={{ fontWeight: "800" }}>sebelum</Text> tanggal tugas. Setelah HR menyetujui, absen masuk di
            hari itu boleh di luar radius kantor (GPS tetap dipakai untuk audit).
          </Text>
          <Link href="/(tabs)/attendance" asChild>
            <Pressable style={styles.backLink}>
              <Ionicons name="arrow-back-outline" size={16} color={PWA.indigo} />
              <Text style={styles.backLinkText}>Kembali ke Absensi</Text>
            </Pressable>
          </Link>
        </View>
      )}

      <View style={styles.tabBar}>{tabBtn("request", "Pengajuan")}{tabBtn("history", "Riwayat")}</View>

      {tab === "request" ? (
        <>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Form pengajuan</Text>

        <Text style={styles.lbl}>Jenis aktivitas</Text>
        <Pressable style={styles.selectBtn} onPress={() => setTypeModal(true)}>
          <Text style={styles.selectBtnText}>{ACTIVITY_TYPE_LABEL[activityType]}</Text>
          <Ionicons name="chevron-down" size={20} color={PWA.textMuted} />
        </Pressable>

        <Text style={styles.lbl}>Tujuan / lokasi singkat *</Text>
        <TextInput
          style={styles.input}
          value={destination}
          onChangeText={setDestination}
          placeholder="Contoh: Client PT ABC, Jakarta / Meeting cabang Bandung"
          placeholderTextColor={PWA.textMuted}
        />

        <Text style={styles.lbl}>Tanggal mulai *</Text>
        <Pressable style={styles.dateRow} onPress={() => openDatePicker("start")}>
          <Ionicons name="calendar-outline" size={22} color={PWA.indigo} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dateMain}>{formatDateId(startDate)}</Text>
            <Text style={styles.dateSub}>{ymdFromAny(startDate)}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={PWA.textMuted} />
        </Pressable>
        <Text style={styles.hint}>Tap baris untuk membuka kalender</Text>

        <Text style={styles.lbl}>Tanggal selesai *</Text>
        <Pressable style={styles.dateRow} onPress={() => openDatePicker("end")}>
          <Ionicons name="calendar-outline" size={22} color={PWA.indigo} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dateMain}>{formatDateId(endDate)}</Text>
            <Text style={styles.dateSub}>{ymdFromAny(endDate)}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={PWA.textMuted} />
        </Pressable>
        <Text style={styles.hint}>Tap baris untuk membuka kalender</Text>

        <Text style={styles.lbl}>Keterangan / agenda (min. 10 karakter) *</Text>
        <TextInput
          style={[
            styles.textarea,
            reason.length > 0 && reasonLen < 10 ? styles.textareaWarn : null,
          ]}
          multiline
          textAlignVertical="top"
          value={reason}
          onChangeText={setReason}
          placeholder="Uraian keperluan dinas agar HR dapat menilai."
          placeholderTextColor={PWA.textMuted}
        />
        <Text style={[styles.counter, reasonLen < 10 && reason.length > 0 ? styles.counterWarn : null]}>
          {reasonLen}/10 karakter
        </Text>

        <Pressable
          style={[styles.submitBtn, submitting && styles.submitBtnDis]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Kirim pengajuan</Text>
            </>
          )}
        </Pressable>
      </View>

          <Pressable style={styles.linkHistory} onPress={() => setTab("history")}>
            <Text style={styles.linkHistoryText}>Lihat riwayat luar kantor →</Text>
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
                <StatMini label="Menunggu HR" value={rows.filter((r) => r.status === "pending_hr").length} tone="amber" />
                <StatMini label="Disetujui" value={rows.filter((r) => r.status === "approved").length} tone="green" />
                <StatMini label="Ditolak" value={rows.filter((r) => r.status === "rejected").length} tone="red" />
                <StatMini label="Dibatalkan" value={rows.filter((r) => r.status === "cancelled").length} tone="gray" />
              </View>

              {rows.length === 0 ? (
                <View style={styles.emptyHist}>
                  <Ionicons name="navigate-outline" size={48} color={PWA.slate300} />
                  <Text style={styles.emptyHistTitle}>Belum ada riwayat luar kantor</Text>
                  <Pressable style={styles.emptyHistBtn} onPress={() => setTab("request")}>
                    <Text style={styles.emptyHistBtnText}>Buat pengajuan</Text>
                  </Pressable>
                </View>
              ) : (
                rows.map((r) => {
                  const b = statusBadge(r.status);
                  const hrLine = formatFieldActivityHrSummary(r);
                  return (
                    <View key={r.id} style={styles.histCardFull}>
                      <View style={styles.histTopFull}>
                        <View style={styles.histIconWrap}>
                          <Ionicons name="navigate" size={22} color={PWA.indigo} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.histTitleFull}>{ACTIVITY_TYPE_LABEL[r.activity_type]}</Text>
                          <Text style={styles.histMetaFull}>
                            Diajukan:{" "}
                            {r.created
                              ? new Date(r.created).toLocaleString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: b.bg }]}>
                          <Text style={[styles.badgeTxt, { color: b.fg }]}>{b.label}</Text>
                        </View>
                      </View>
                      <View style={styles.histRow}>
                        <Ionicons name="calendar-outline" size={16} color={PWA.textMuted} />
                        <Text style={styles.histRowText}>
                          {formatDateId(r.start_date)} s.d. {formatDateId(r.end_date)}
                        </Text>
                      </View>
                      <View style={styles.histRow}>
                        <Ionicons name="location-outline" size={16} color={PWA.textMuted} />
                        <Text style={styles.histRowText}>{r.destination}</Text>
                      </View>
                      <View style={styles.reasonBox}>
                        <Text style={styles.reasonLbl}>Keterangan</Text>
                        <Text style={styles.reasonTxt}>{r.reason}</Text>
                      </View>
                      {r.status === "rejected" && r.rejection_reason?.trim() ? (
                        <View style={styles.rejectBox}>
                          <Text style={styles.rejectLbl}>HR</Text>
                          <Text style={styles.rejectTxt}>{r.rejection_reason.trim()}</Text>
                        </View>
                      ) : null}
                      {hrLine ? (
                        <View style={styles.hrBox}>
                          <Text style={styles.hrBoxLbl}>Penanganan HR</Text>
                          <Text style={styles.hrBoxTxt}>{hrLine}</Text>
                        </View>
                      ) : null}
                      {r.status === "pending_hr" ? (
                        <Pressable
                          style={styles.cancelBtn}
                          onPress={() => confirmCancel(r.id)}
                          disabled={cancelling === r.id}
                        >
                          {cancelling === r.id ? (
                            <ActivityIndicator color="#dc2626" size="small" />
                          ) : (
                            <>
                              <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                              <Text style={styles.cancelBtnText}>Batalkan pengajuan</Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })
              )}
            </>
          )}
        </>
      )}

      <Modal visible={iosPicker !== null} transparent animationType="slide">
        <Pressable style={styles.iosModalBg} onPress={() => setIosPicker(null)}>
          <Pressable style={styles.iosSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.iosSheetTitle}>
              {iosPicker?.field === "start" ? "Tanggal mulai" : "Tanggal selesai"}
            </Text>
            {iosPicker ? (
              <DateTimePicker
                value={iosPicker.date}
                mode="date"
                display="spinner"
                locale="id-ID"
                onChange={(_, d) => {
                  if (d) setIosPicker((prev) => (prev ? { ...prev, date: d } : null));
                }}
              />
            ) : null}
            <View style={styles.iosActions}>
              <Pressable style={styles.iosCancel} onPress={() => setIosPicker(null)}>
                <Text style={styles.iosCancelTxt}>Batal</Text>
              </Pressable>
              <Pressable style={styles.iosOk} onPress={confirmIosDate}>
                <Text style={styles.iosOkTxt}>Simpan</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={typeModal} transparent animationType="fade">
        <Pressable style={styles.modalBg} onPress={() => setTypeModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Jenis aktivitas</Text>
            {TYPES.map((t) => (
              <Pressable
                key={t}
                style={[styles.typeRow, activityType === t && styles.typeRowOn]}
                onPress={() => {
                  setActivityType(t);
                  setTypeModal(false);
                }}
              >
                <Text style={[styles.typeRowTxt, activityType === t && styles.typeRowTxtOn]}>
                  {ACTIVITY_TYPE_LABEL[t]}
                </Text>
                {activityType === t ? (
                  <Ionicons name="checkmark-circle" size={22} color={PWA.indigo} />
                ) : null}
              </Pressable>
            ))}
            <Pressable style={styles.modalClose} onPress={() => setTypeModal(false)}>
              <Text style={styles.modalCloseTxt}>Tutup</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  muted: { color: PWA.textMuted },
  hero: { marginBottom: 20 },
  h1: { fontSize: 24, fontWeight: "800", color: PWA.text },
  heroBody: { marginTop: 8, fontSize: 14, color: PWA.textSecondary, lineHeight: 21 },
  backLink: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  backLinkText: { fontSize: 14, fontWeight: "700", color: PWA.indigo },
  formCard: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    marginBottom: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  formTitle: { fontSize: 16, fontWeight: "800", color: PWA.text, marginBottom: 14 },
  lbl: { fontSize: 12, fontWeight: "600", color: PWA.textSecondary, marginTop: 10, marginBottom: 6 },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: PWA.surface,
  },
  selectBtnText: { fontSize: 15, color: PWA.text, fontWeight: "600", flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: PWA.text,
    backgroundColor: PWA.surface,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: PWA.surface,
  },
  dateMain: { fontSize: 16, fontWeight: "700", color: PWA.text },
  dateSub: { marginTop: 2, fontSize: 12, color: PWA.textMuted },
  textarea: {
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: PWA.text,
    minHeight: 100,
    backgroundColor: PWA.surface,
  },
  textareaWarn: { borderColor: "#fbbf24", backgroundColor: "rgba(254, 243, 199, 0.35)" },
  hint: { marginTop: 4, fontSize: 12, color: PWA.textMuted },
  warnHint: { marginTop: 4, fontSize: 12, color: "#b45309", fontWeight: "600" },
  counter: { marginTop: 4, fontSize: 12, color: PWA.textMuted },
  counterWarn: { color: "#92400e", fontWeight: "700" },
  submitBtn: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PWA.indigo,
    paddingVertical: 14,
    borderRadius: 14,
  },
  submitBtnDis: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: PWA.text, marginBottom: 12 },
  loader: { paddingVertical: 32, alignItems: "center" },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: PWA.border,
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyText: { fontSize: 14, color: PWA.textMuted },
  histCard: {
    backgroundColor: PWA.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
  },
  histTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeTxt: { fontSize: 11, fontWeight: "700" },
  typeLbl: { fontSize: 12, fontWeight: "700", color: PWA.text },
  histRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  histMain: { fontSize: 15, fontWeight: "700", color: PWA.text, flex: 1 },
  histDest: { fontSize: 14, color: PWA.textSecondary, flex: 1 },
  histReason: { marginTop: 8, fontSize: 14, color: PWA.textSecondary, lineHeight: 20 },
  rejectBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PWA.red100,
    backgroundColor: PWA.red50,
  },
  rejectLbl: { fontSize: 10, fontWeight: "800", color: PWA.red800 },
  rejectTxt: { marginTop: 4, fontSize: 13, color: PWA.red800 },
  hrLine: { marginTop: 8, fontSize: 11, color: PWA.textMuted },
  cancelLink: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cancelLinkText: { fontSize: 13, fontWeight: "700", color: "#dc2626" },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
    padding: 12,
  },
  modalSheet: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 12,
    maxHeight: "70%",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: PWA.text, marginBottom: 8, paddingHorizontal: 8 },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  typeRowOn: { backgroundColor: PWA.indigo50 },
  typeRowTxt: { fontSize: 15, color: PWA.text },
  typeRowTxtOn: { fontWeight: "800", color: PWA.indigo700 },
  modalClose: { paddingVertical: 14, alignItems: "center" },
  modalCloseTxt: { fontSize: 15, fontWeight: "700", color: PWA.indigo },
  iosModalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  iosSheet: {
    backgroundColor: PWA.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
    paddingTop: 8,
  },
  iosSheetTitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: PWA.text,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  iosActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  iosCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
    alignItems: "center",
  },
  iosCancelTxt: { fontWeight: "700", color: PWA.textSecondary },
  iosOk: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: PWA.indigo,
    alignItems: "center",
  },
  iosOkTxt: { fontWeight: "800", color: "#fff" },
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
  hrBoxTxt: { marginTop: 4, fontSize: 13, color: "#1a1a1a" },
  cancelBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fecaca",
  },
  cancelBtnText: { fontWeight: "700", color: "#dc2626" },
});

const fieldTabStyles = StyleSheet.create({
  statMini: { flexGrow: 1, minWidth: "22%", padding: 10, borderRadius: 12, borderWidth: 1 },
  statMiniLbl: { fontSize: 10, fontWeight: "600" },
  statMiniVal: { fontSize: 20, fontWeight: "800", marginTop: 4 },
});

export default FieldStaffPanel;
