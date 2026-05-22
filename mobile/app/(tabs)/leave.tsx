import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/context/auth";
import { pb } from "@/lib/pocketbase";
import {
  submitLeaveRequest,
  getMonthlyBookingUsage,
  getLeaveCalendarMonthSnapshot,
  getMaxBookingsPerMonth,
  resolveProfileDivisionKey,
  inclusiveEndDateForDuration,
  expandInclusiveDateRange,
  todayYmdLocal,
  getLeaveHistory,
  cancelLeaveRequest,
  canStaffCancelLeaveLocally,
  calendarDaysFromTodayUntilLeaveStart,
  formatDateRange,
  calculateDays,
  formatLeaveHrActionSummary,
  type MonthlyBookingInfo,
  type LeaveRequest,
} from "@/lib/leave";
import { checkProfileComplete } from "@/lib/profileComplete";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

const WEEK_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAYS_PER_CALENDAR_BOOKING = 1;

type TabKey = "request" | "history";

function mondayBasedWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function monthTitle(year: number, monthIndex: number): string {
  try {
    return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
      new Date(year, monthIndex, 1)
    );
  } catch {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  }
}

function LeaveMonthGrid(props: {
  year: number;
  monthIndex: number;
  divisionFull: Set<string>;
  divisionPartial: Set<string>;
  myBooked: Set<string>;
  myPending: Set<string>;
  todayYmd: string;
  loading: boolean;
  submitting: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPickDay: (ymd: string) => void;
}) {
  const {
    year,
    monthIndex,
    divisionFull,
    divisionPartial,
    myBooked,
    myPending,
    todayYmd,
    loading,
    submitting,
    onPrev,
    onNext,
    onPickDay,
  } = props;

  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const padBefore = mondayBasedWeekday(first);
  const locked = loading || submitting;
  const divisionHeatmap = divisionFull.size > 0 || divisionPartial.size > 0;

  const cells: { key: string; day: number | null; ymd: string | null }[] = [];
  for (let i = 0; i < padBefore; i++) cells.push({ key: `p-${i}`, day: null, ymd: null });
  const padM = String(monthIndex + 1).padStart(2, "0");
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    const ymd = `${year}-${padM}-${dd}`;
    cells.push({ key: ymd, day: d, ymd });
  }

  return (
    <View style={calStyles.card}>
      <View style={calStyles.navRow}>
        <Pressable
          style={[calStyles.navBtn, locked && calStyles.navBtnDis]}
          onPress={onPrev}
          disabled={locked}
        >
          <Ionicons name="chevron-back" size={22} color={PWA.text} />
        </Pressable>
        <View style={calStyles.navTitleWrap}>
          {loading || submitting ? (
            <ActivityIndicator size="small" color={PWA.indigo} style={{ marginRight: 8 }} />
          ) : null}
          <Text style={calStyles.navTitle}>{monthTitle(year, monthIndex)}</Text>
        </View>
        <Pressable
          style={[calStyles.navBtn, locked && calStyles.navBtnDis]}
          onPress={onNext}
          disabled={locked}
        >
          <Ionicons name="chevron-forward" size={22} color={PWA.text} />
        </Pressable>
      </View>

      <View style={calStyles.weekRow}>
        {WEEK_LABELS.map((w) => (
          <Text key={w} style={calStyles.weekLbl}>
            {w}
          </Text>
        ))}
      </View>

      <View style={calStyles.grid}>
        {cells.map((c) => {
          if (c.day === null || !c.ymd) {
            return <View key={c.key} style={calStyles.cellPad} />;
          }
          const ymd = c.ymd;
          const isPast = ymd < todayYmd;
          const divisionFullD = divisionFull.has(ymd);
          const mineApproved = myBooked.has(ymd);
          const minePending = myPending.has(ymd) && !mineApproved;
          const mine = mineApproved || minePending;
          const partialFree = divisionPartial.has(ymd) && !divisionFullD && !mine;
          const disabledSeat = isPast || locked || divisionFullD || mine;

          let bg = "#ecfdf5";
          let border = "#a7f3d0";
          let fg = "#065f46";
          let sub = "";

          if (mineApproved) {
            bg = "#0f766e";
            border = "#115e59";
            fg = "#fff";
            sub = "ok";
          } else if (minePending) {
            bg = "#0284c7";
            border = "#075985";
            fg = "#fff";
            sub = "HR";
          } else if (divisionFullD) {
            bg = "#4f46e5";
            border = "#4338ca";
            fg = "#fff";
            sub = "penuh";
          } else if (partialFree) {
            bg = "#fffbeb";
            border = "#fbbf24";
            fg = "#78350f";
            sub = "isi";
          } else if (isPast) {
            bg = "#f1f5f9";
            border = "#e2e8f0";
            fg = "#94a3b8";
            sub = "";
          } else {
            sub = "";
          }

          const isToday = ymd === todayYmd && !divisionFullD && !mineApproved && !minePending && !isPast;

          return (
            <Pressable
              key={c.key}
              style={[
                calStyles.cell,
                {
                  backgroundColor: bg,
                  borderColor: border,
                  opacity: disabledSeat && !mine ? 0.95 : 1,
                },
                isToday && !disabledSeat ? calStyles.cellToday : null,
              ]}
              disabled={disabledSeat}
              onPress={() => onPickDay(ymd)}
            >
              <Text style={[calStyles.cellDay, { color: fg }]}>{c.day}</Text>
              {sub ? (
                <Text style={[calStyles.cellSub, { color: fg }]} numberOfLines={1}>
                  {sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={calStyles.legend}>
        {!divisionHeatmap ? (
          <Text style={calStyles.legendNote}>
            Warna rekan se-divisi disembunyikan agar ringan. Kuota per hari dicek oleh HR saat menyetujui pengajuan.
          </Text>
        ) : null}
        <LegendRow color="#ecfdf5" border="#6ee7b7" label="Kosong — tap untuk booking" />
        {divisionHeatmap ? (
          <LegendRow color="#fffbeb" border="#fbbf24" label="Ada cuti rekan divisi (slot belum penuh)" />
        ) : null}
        <LegendRow color="#0f766e" border="#134e4a" label="Disetujui" dark />
        <LegendRow color="#0284c7" border="#075985" label="Menunggu HR" dark />
        {divisionHeatmap ? (
          <LegendRow color="#4f46e5" border="#312e81" label="Penuh — kuota divisi/hari" dark />
        ) : null}
      </View>
    </View>
  );
}

function LegendRow({
  color,
  border,
  label,
  dark,
}: {
  color: string;
  border: string;
  label: string;
  dark?: boolean;
}) {
  return (
    <View style={calStyles.legendRow}>
      <View style={[calStyles.legendSwatch, { backgroundColor: color, borderColor: border }]} />
      <Text style={[calStyles.legendText, dark && { color: PWA.text }]}>{label}</Text>
    </View>
  );
}

const calStyles = StyleSheet.create({
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
  },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  navBtn: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.slate50,
  },
  navBtnDis: { opacity: 0.4 },
  navTitleWrap: { flexDirection: "row", alignItems: "center", flex: 1, justifyContent: "center" },
  navTitle: { fontSize: 17, fontWeight: "700", color: PWA.text, textTransform: "capitalize" },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekLbl: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    color: PWA.textMuted,
    textTransform: "uppercase",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cellPad: { width: `${100 / 7}%`, aspectRatio: 1, maxHeight: 48 },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    maxHeight: 48,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: "#3b82f6",
  },
  cellDay: { fontSize: 14, fontWeight: "700" },
  cellSub: { fontSize: 8, fontWeight: "500", marginTop: 1 },
  legend: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: PWA.borderMuted, gap: 8 },
  legendNote: { fontSize: 11, color: PWA.textMuted, marginBottom: 4, lineHeight: 16 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendSwatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 2 },
  legendText: { flex: 1, fontSize: 11, color: PWA.textSecondary, lineHeight: 15 },
});

export function LeaveStaffPanel({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";

  const [tab, setTab] = useState<TabKey>("request");
  const [refreshing, setRefreshing] = useState(false);

  const [checking, setChecking] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileServerUnreachable, setProfileServerUnreachable] = useState(false);
  const [userDivision, setUserDivision] = useState("");
  const [monthlyBooking, setMonthlyBooking] = useState<MonthlyBookingInfo | null>(null);

  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [calendarSnapshot, setCalendarSnapshot] = useState<{
    maxPeoplePerDay: number;
    divisionFullDates: string[];
    divisionPartialDates: string[];
    myBookedDates: string[];
    myPendingDates: string[];
  } | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calendarBooking, setCalendarBooking] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const monthlyQuotaMax = monthlyBooking?.max ?? getMaxBookingsPerMonth();

  const divisionFullDatesSet = useMemo(
    () => new Set(calendarSnapshot?.divisionFullDates ?? []),
    [calendarSnapshot]
  );
  const divisionPartialDatesSet = useMemo(
    () => new Set(calendarSnapshot?.divisionPartialDates ?? []),
    [calendarSnapshot]
  );
  const myBookedDatesSet = useMemo(
    () => new Set(calendarSnapshot?.myBookedDates ?? []),
    [calendarSnapshot]
  );
  const myPendingDatesSet = useMemo(
    () => new Set(calendarSnapshot?.myPendingDates ?? []),
    [calendarSnapshot]
  );

  const loadCalendarSnapshot = useCallback(async () => {
    if (!uid || !userDivision || profileIncomplete || checking) return;
    setCalLoading(true);
    try {
      const snap = await getLeaveCalendarMonthSnapshot(
        uid,
        userDivision,
        viewMonth.getFullYear(),
        viewMonth.getMonth()
      );
      setCalendarSnapshot(snap);
    } finally {
      setCalLoading(false);
    }
  }, [uid, userDivision, profileIncomplete, checking, viewMonth]);

  const runProfileGate = useCallback(async () => {
    if (!uid) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const profileCheck = await checkProfileComplete(uid);
    setProfileServerUnreachable(!!profileCheck.serverUnreachable);

    if (!profileCheck.isComplete) {
      setProfileIncomplete(true);
      setProfileMessage(profileCheck.message);
      setUserDivision("");
      setMonthlyBooking(null);
    } else {
      setProfileIncomplete(false);
      setProfileMessage("");
      try {
        const profile = await pb.collection("profiles").getFirstListItem(`user="${uid}"`, {
          requestKey: null,
        });
        setUserDivision(
          resolveProfileDivisionKey(profile as { division?: string; department?: string })
        );
        const usage = await getMonthlyBookingUsage(uid);
        setMonthlyBooking(usage);
      } catch (err) {
        console.warn("division/usage", err);
      }
    }
    setChecking(false);
  }, [uid]);

  const loadHistory = useCallback(async () => {
    if (!uid) return;
    setHistLoading(true);
    try {
      const result = await getLeaveHistory(uid, page, 10);
      setRequests(result.items);
      setTotalPages(result.totalPages);
    } catch (e) {
      console.error(e);
    } finally {
      setHistLoading(false);
    }
  }, [uid, page]);

  useFocusEffect(
    useCallback(() => {
      void runProfileGate();
    }, [runProfileGate])
  );

  useEffect(() => {
    void loadCalendarSnapshot();
  }, [loadCalendarSnapshot]);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runProfileGate();
      await loadCalendarSnapshot();
      if (tab === "history") await loadHistory();
    } finally {
      setRefreshing(false);
    }
  }, [runProfileGate, loadCalendarSnapshot, loadHistory, tab]);

  const shiftCalendarMonth = useCallback((delta: number) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const isMonthlyLimitReached =
    monthlyBooking !== null && monthlyBooking.used >= monthlyBooking.max;

  const bookingFlow = async (startDate: string, endDate: string): Promise<boolean> => {
    if (!uid) {
      setError("Silakan login terlebih dahulu");
      return false;
    }
    setCalendarBooking(true);
    setError("");
    setSuccess("");
    try {
      const result = await submitLeaveRequest({
        userId: uid,
        start_date: startDate,
        end_date: endDate,
      });
      if (result.success) {
        setSuccess(result.message);
        const usage = await getMonthlyBookingUsage(uid);
        setMonthlyBooking(usage);
        await loadCalendarSnapshot();
        Alert.alert("Berhasil", result.message, [
          { text: "OK", onPress: () => setTab("history") },
        ]);
        return true;
      }
      setError(result.message);
      return false;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal mengirim pengajuan cuti"));
      return false;
    } finally {
      Keyboard.dismiss();
      setCalendarBooking(false);
    }
  };

  const handleCalendarQuickBook = async (ymd: string) => {
    if (!uid) {
      setError("Silakan login terlebih dahulu.");
      return;
    }
    if (isMonthlyLimitReached) {
      setError(
        `Kuota booking bulan ini sudah habis (${monthlyQuotaMax}× per bulan kalender). Batalkan salah satu booking yang belum mulai atau tunggu bulan depan.`
      );
      return;
    }

    const dur = DAYS_PER_CALENDAR_BOOKING;
    const todayStr = todayYmdLocal();
    if (ymd < todayStr) return;

    const endDate = inclusiveEndDateForDuration(ymd, dur);
    const span = expandInclusiveDateRange(ymd, endDate);

    for (const d of span) {
      if (divisionFullDatesSet.has(d)) {
        setError(`Tanggal ${d} bentrok dengan kuota divisi yang sudah penuh. Pilih tanggal lain.`);
        return;
      }
      if (myBookedDatesSet.has(d) || myPendingDatesSet.has(d)) {
        setError(`Tanggal ${d} overlap dengan pengajuan atau cuti Anda. Pilih rentang lain.`);
        return;
      }
    }

    await bookingFlow(ymd, endDate);
  };

  const handleCancel = (requestId: string) => {
    Alert.alert("Batalkan booking?", "Yakin ingin membatalkan pengajuan cuti ini?", [
      { text: "Tidak", style: "cancel" },
      {
        text: "Ya, batalkan",
        style: "destructive",
        onPress: async () => {
          setCancelling(requestId);
          try {
            const result = await cancelLeaveRequest(requestId);
            Alert.alert(result.success ? "Berhasil" : "Gagal", result.message);
            if (result.success) {
              await loadHistory();
              await runProfileGate();
              await loadCalendarSnapshot();
            }
          } catch (e: unknown) {
            Alert.alert("Gagal", getErrorMessage(e, "Gagal membatalkan"));
          } finally {
            setCancelling(null);
          }
        },
      },
    ]);
  };

  const maxPeopleDisplay = calendarSnapshot?.maxPeoplePerDay ?? 2;

  const tabBtn = (key: TabKey, label: string) => (
    <Pressable
      key={key}
      onPress={() => {
        setTab(key);
        setError("");
        setSuccess("");
      }}
      style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
    >
      <Text style={[styles.tabBtnText, tab === key && styles.tabBtnTextActive]}>{label}</Text>
    </Pressable>
  );

  if (!uid) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Silakan login.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {!embedded ? (
        <View style={styles.pageHeader}>
          <Text style={styles.h1}>Cuti</Text>
          <Text style={styles.sub}>
            Pengajuan lewat kalender dan riwayat status HR — selaras dengan web ERP.
          </Text>
        </View>
      ) : (
        <View style={styles.embeddedHeader}>
          <Text style={styles.embeddedTitle}>Pengajuan & riwayat cuti</Text>
          <Text style={styles.embeddedSub}>Tab Pengajuan = kalender · Tab Riwayat = status HR</Text>
        </View>
      )}

      <View style={styles.tabBar}>{tabBtn("request", "Pengajuan")}{tabBtn("history", "Riwayat")}</View>

      {tab === "request" ? (
        <>
          {checking ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color={PWA.indigo} />
            </View>
          ) : profileIncomplete ? (
            <View style={[styles.callout, profileServerUnreachable ? styles.calloutAmber : styles.calloutRed]}>
              <Ionicons
                name={profileServerUnreachable ? "cloud-offline-outline" : "alert-circle-outline"}
                size={28}
                color={profileServerUnreachable ? "#92400e" : "#b91c1c"}
              />
              <Text style={styles.calloutTitle}>
                {profileServerUnreachable ? "Tidak terhubung ke PocketBase" : "Data HR Belum Lengkap"}
              </Text>
              <Text style={styles.calloutBody}>{profileMessage}</Text>
              <Pressable style={styles.retryBtn} onPress={() => void runProfileGate()}>
                <Text style={styles.retryBtnText}>Coba lagi</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {monthlyBooking ? (
                <View style={styles.quotaCard}>
                  <View style={styles.quotaHead}>
                    <Ionicons name="trending-up" size={22} color="#6b21a8" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quotaTitle}>
                        Booking bulan ini
                        {monthlyBooking.monthLabel ? ` — ${monthlyBooking.monthLabel}` : ""}
                      </Text>
                      <Text style={styles.quotaSub}>
                        Maksimal {monthlyBooking.max}× pengajuan (pending + disetujui) per bulan kalender.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.quotaGrid}>
                    <View style={styles.quotaCell}>
                      <Text style={styles.quotaLbl}>Sudah dipakai</Text>
                      <Text style={styles.quotaNum}>{monthlyBooking.used}</Text>
                    </View>
                    <View style={styles.quotaCell}>
                      <Text style={styles.quotaLbl}>Sisa</Text>
                      <Text style={[styles.quotaNum, { color: PWA.emerald }]}>
                        {Math.max(0, monthlyBooking.max - monthlyBooking.used)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.barWrap}>
                    <View style={styles.barTop}>
                      <Text style={styles.barLbl}>Pemakaian slot booking</Text>
                      <Text style={styles.barPct}>
                        {Math.round((monthlyBooking.used / monthlyBooking.max) * 100)}%
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${Math.min(100, (monthlyBooking.used / monthlyBooking.max) * 100)}%`,
                            backgroundColor:
                              monthlyBooking.used >= monthlyBooking.max
                                ? "#ef4444"
                                : monthlyBooking.used >= monthlyBooking.max - 1
                                  ? "#f97316"
                                  : "#22c55e",
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.sectionHead}>
                <Text style={styles.h2}>Kalender bulan penuh</Text>
                <Text style={styles.sectionSub}>
                  Kalender memuat cuti <Text style={{ fontWeight: "700" }}>Anda</Text> saja:{" "}
                  <Text style={{ color: "#0f766e", fontWeight: "700" }}>teal</Text> = disetujui,{" "}
                  <Text style={{ color: "#0284c7", fontWeight: "700" }}>biru</Text> = menunggu HR. Tap tanggal{" "}
                  <Text style={{ color: PWA.emerald700, fontWeight: "700" }}>hijau</Text> untuk kirim pengajuan{" "}
                  <Text style={{ fontWeight: "700" }}>satu hari</Text>.
                </Text>
              </View>

              <LeaveMonthGrid
                year={viewMonth.getFullYear()}
                monthIndex={viewMonth.getMonth()}
                divisionFull={divisionFullDatesSet}
                divisionPartial={divisionPartialDatesSet}
                myBooked={myBookedDatesSet}
                myPending={myPendingDatesSet}
                todayYmd={todayYmdLocal()}
                loading={calLoading}
                submitting={calendarBooking}
                onPrev={() => shiftCalendarMonth(-1)}
                onNext={() => shiftCalendarMonth(1)}
                onPickDay={(ymd) => void handleCalendarQuickBook(ymd)}
              />

              <View style={styles.infoCard}>
                <Ionicons name="information-circle-outline" size={22} color={PWA.indigo} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>Ketentuan booking cuti</Text>
                  <Text style={styles.infoBody}>
                    Satu tanggal = satu pengajuan ({DAYS_PER_CALENDAR_BOOKING} hari). Kuota bulan: maks.{" "}
                    {monthlyQuotaMax}×. Divisi untuk kuota: <Text style={{ fontWeight: "700" }}>{userDivision || "—"}</Text>
                    . Maks. {maxPeopleDisplay} orang/divisi/hari (saat ACC HR).
                  </Text>
                </View>
              </View>

              {error ? (
                <View style={styles.bannerErr}>
                  <Ionicons name="warning-outline" size={20} color="#b91c1c" />
                  <Text style={{ flex: 1, color: "#991b1b", fontSize: 13 }}>{error}</Text>
                </View>
              ) : null}
              {success ? (
                <View style={styles.bannerOk}>
                  <Ionicons name="checkmark-circle" size={20} color={PWA.emerald700} />
                  <Text style={{ flex: 1, color: "#047857", fontSize: 13 }}>{success}</Text>
                </View>
              ) : null}

              <Pressable style={styles.linkHistory} onPress={() => setTab("history")}>
                <Text style={styles.linkHistoryText}>Lihat riwayat cuti →</Text>
              </Pressable>
            </>
          )}
        </>
      ) : (
        <>
          {histLoading && page === 1 ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color={PWA.indigo} />
            </View>
          ) : (
            <>
              <View style={styles.statsRow}>
                <StatMini label="Menunggu HR" value={requests.filter((r) => r.status === "pending").length} tone="amber" />
                <StatMini label="Disetujui" value={requests.filter((r) => r.status === "approved").length} tone="green" />
                <StatMini label="Ditolak" value={requests.filter((r) => r.status === "rejected").length} tone="red" />
                <StatMini label="Dibatalkan" value={requests.filter((r) => r.status === "cancelled").length} tone="gray" />
              </View>

              {requests.length === 0 ? (
                <View style={styles.emptyHist}>
                  <Ionicons name="calendar-outline" size={48} color={PWA.slate300} />
                  <Text style={styles.emptyHistTitle}>Belum ada riwayat booking</Text>
                  <Pressable style={styles.emptyHistBtn} onPress={() => setTab("request")}>
                    <Text style={styles.emptyHistBtnText}>Pengajuan di kalender</Text>
                  </Pressable>
                </View>
              ) : (
                requests.map((req) => (
                  <HistoryCard
                    key={req.id}
                    request={req}
                    cancelling={cancelling === req.id}
                    onCancel={() => handleCancel(req.id)}
                  />
                ))
              )}

              {totalPages > 1 ? (
                <View style={styles.pager}>
                  <Pressable
                    style={[styles.pagerBtn, page === 1 && styles.pagerBtnDis]}
                    disabled={page === 1 || histLoading}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <Text>Sebelumnya</Text>
                  </Pressable>
                  <Text style={styles.pagerInfo}>
                    {page} / {totalPages}
                  </Text>
                  <Pressable
                    style={[styles.pagerBtn, page === totalPages && styles.pagerBtnDis]}
                    disabled={page === totalPages || histLoading}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <Text>Berikutnya</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

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
    <View style={[styles.statMini, { backgroundColor: bg, borderColor: bd }]}>
      <Text style={[styles.statMiniLbl, { color: tc }]}>{label}</Text>
      <Text style={[styles.statMiniVal, { color: tc }]}>{value}</Text>
    </View>
  );
}

function HistoryCard({
  request,
  cancelling,
  onCancel,
}: {
  request: LeaveRequest;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const canCancel =
    (request.status === "pending" || request.status === "approved") &&
    canStaffCancelLeaveLocally(request.status, request.start_date);

  const hrSummary =
    request.status === "approved" || request.status === "rejected"
      ? formatLeaveHrActionSummary(request)
      : null;

  const warnH2 =
    request.status === "approved" &&
    (() => {
      const d = calendarDaysFromTodayUntilLeaveStart(request.start_date);
      return d !== null && d >= 1 && d < 2;
    })();

  return (
    <View
      style={[
        styles.histCard,
        request.status === "cancelled" && { opacity: 0.65 },
      ]}
    >
      <View style={styles.histTop}>
        <View style={styles.histIconWrap}>
          <Ionicons name="calendar" size={22} color={PWA.indigo} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.histTitle}>Cuti</Text>
          <Text style={styles.histMeta}>
            Diajukan:{" "}
            {request.created
              ? new Date(request.created).toLocaleString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </Text>
        </View>
        <StatusBadge status={request.status} />
      </View>

      <View style={styles.histRow}>
        <Ionicons name="calendar-outline" size={16} color={PWA.textMuted} />
        <Text style={styles.histRowText}>{formatDateRange(request.start_date, request.end_date)}</Text>
      </View>
      <View style={styles.histRow}>
        <Ionicons name="time-outline" size={16} color={PWA.textMuted} />
        <Text style={styles.histRowText}>{calculateDays(request.start_date, request.end_date)} hari</Text>
      </View>
      <View style={styles.histRow}>
        <Ionicons name="business-outline" size={16} color={PWA.textMuted} />
        <Text style={styles.histRowText}>Divisi: {request.division?.trim() || "—"}</Text>
      </View>

      <View style={styles.reasonBox}>
        <Text style={styles.reasonLbl}>Alasan</Text>
        <Text style={styles.reasonTxt}>{request.reason}</Text>
      </View>

      {hrSummary ? (
        <View style={styles.hrBox}>
          <Text style={styles.hrBoxLbl}>Penanganan oleh HR</Text>
          <Text style={styles.hrBoxTxt}>{hrSummary}</Text>
        </View>
      ) : null}

      {warnH2 ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Sudah disetujui HR</Text>
          <Text style={styles.warnBody}>
            Pembatalan dari app hanya sampai H−2 sebelum tanggal mulai cuti. Mulai H−1 hubungi HR.
          </Text>
        </View>
      ) : null}

      {request.status === "rejected" ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectTitle}>Ditolak HR</Text>
          <Text style={styles.rejectBody}>
            {request.rejection_reason?.trim() ||
              "(Belum ada teks penolakan — hubungi HR jika perlu.)"}
          </Text>
        </View>
      ) : null}

      {canCancel ? (
        <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={cancelling}>
          {cancelling ? (
            <ActivityIndicator color="#dc2626" />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={18} color="#dc2626" />
              <Text style={styles.cancelBtnText}>Batalkan</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {request.status === "approved" && !canCancel ? (
        <Text style={styles.hintFoot}>Cuti sudah dimulai, H−1, atau lewat — pembatalan via HR.</Text>
      ) : null}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: "#fef3c7", fg: "#92400e", label: "Menunggu HR" },
    approved: { bg: "#dcfce7", fg: "#166534", label: "Disetujui" },
    rejected: { bg: "#fee2e2", fg: "#991b1b", label: "Ditolak HR" },
    cancelled: { bg: "#f1f5f9", fg: "#475569", label: "Dibatalkan" },
  };
  const b = map[status] || { bg: "#f1f5f9", fg: PWA.text, label: status };
  return (
    <View style={[styles.badge, { backgroundColor: b.bg }]}>
      <Text style={[styles.badgeText, { color: b.fg }]}>{b.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  scrollContent: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  muted: { color: PWA.textMuted },
  pageHeader: { marginBottom: 16 },
  h1: { fontSize: 26, fontWeight: "800", color: PWA.text },
  sub: { marginTop: 6, fontSize: 14, color: PWA.textSecondary, lineHeight: 20 },
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
  loaderBox: { paddingVertical: 48, alignItems: "center" },
  callout: { padding: 18, borderRadius: 16, borderWidth: 2, marginBottom: 12 },
  calloutRed: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  calloutAmber: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  calloutTitle: { fontSize: 18, fontWeight: "800", color: PWA.text, marginTop: 8 },
  calloutBody: { marginTop: 8, fontSize: 14, color: PWA.textSecondary, lineHeight: 20 },
  retryBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: PWA.indigo,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: { color: "#fff", fontWeight: "700" },
  quotaCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e9d5ff",
    backgroundColor: "#faf5ff",
  },
  quotaHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  quotaTitle: { fontSize: 16, fontWeight: "800", color: "#581c87" },
  quotaSub: { marginTop: 4, fontSize: 13, color: "#6b21a8", lineHeight: 18 },
  quotaGrid: { flexDirection: "row", gap: 10, marginTop: 12 },
  quotaCell: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  quotaLbl: { fontSize: 11, color: PWA.textMuted },
  quotaNum: { fontSize: 22, fontWeight: "800", color: "#7e22ce", marginTop: 4 },
  barWrap: { marginTop: 12, backgroundColor: "#fff", borderRadius: 10, padding: 10 },
  barTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLbl: { fontSize: 11, color: PWA.textMuted },
  barPct: { fontSize: 11, fontWeight: "800", color: "#7e22ce" },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: "#e5e7eb", overflow: "hidden" },
  barFill: { height: 8, borderRadius: 999 },
  sectionHead: { marginBottom: 10 },
  h2: { fontSize: 18, fontWeight: "800", color: PWA.text },
  sectionSub: { marginTop: 6, fontSize: 13, color: PWA.textSecondary, lineHeight: 19 },
  infoCard: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PWA.indigo100,
    backgroundColor: PWA.indigo50,
  },
  infoTitle: { fontSize: 15, fontWeight: "700", color: PWA.text },
  infoBody: { marginTop: 6, fontSize: 13, color: PWA.textSecondary, lineHeight: 19 },
  bannerErr: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  bannerOk: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  linkHistory: { marginTop: 16, paddingVertical: 12 },
  linkHistoryText: { fontSize: 14, fontWeight: "700", color: PWA.indigo },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  statMini: { flexGrow: 1, minWidth: "22%", padding: 10, borderRadius: 12, borderWidth: 1 },
  statMiniLbl: { fontSize: 10, fontWeight: "600" },
  statMiniVal: { fontSize: 20, fontWeight: "800", marginTop: 4 },
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
  histCard: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  histTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  histIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: PWA.indigo50,
    alignItems: "center",
    justifyContent: "center",
  },
  histTitle: { fontSize: 17, fontWeight: "800", color: PWA.text },
  histMeta: { marginTop: 2, fontSize: 11, color: PWA.textMuted },
  histRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  histRowText: { fontSize: 14, color: PWA.textSecondary },
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
  warnBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PWA.amber200,
    backgroundColor: PWA.amber50,
  },
  warnTitle: { fontWeight: "700", color: PWA.amber900, fontSize: 13 },
  warnBody: { marginTop: 4, fontSize: 12, color: "#92400e", lineHeight: 17 },
  rejectBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PWA.red200,
    backgroundColor: PWA.red50,
  },
  rejectTitle: { fontWeight: "700", color: PWA.red800, fontSize: 13 },
  rejectBody: { marginTop: 4, fontSize: 13, color: PWA.red800, lineHeight: 18 },
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
  hintFoot: { marginTop: 8, fontSize: 11, color: PWA.textMuted, textAlign: "center" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 },
  pagerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
  },
  pagerBtnDis: { opacity: 0.45 },
  pagerInfo: { fontSize: 14, fontWeight: "700", color: PWA.text },
  embeddedHeader: { marginBottom: 12 },
  embeddedTitle: { fontSize: 17, fontWeight: "800", color: PWA.text },
  embeddedSub: { marginTop: 4, fontSize: 12, color: PWA.textSecondary, lineHeight: 17 },
});

export default LeaveStaffPanel;
