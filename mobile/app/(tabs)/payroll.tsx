import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/context/auth";
import { fetchStaffPayrollSlips, type StaffPayrollSlip } from "@/lib/payroll";
import {
  downloadSerbaPayrollSlipPdf,
  formatPeriodMonthYear,
  type PayrollSlipEmployeeMeta,
} from "@/lib/payroll-slip-document";
import { ensureAndSyncProfileMobile } from "@/lib/profileEnsure";
import { canAccess } from "@/lib/rbac";
import { PWA } from "@/constants/pwaTheme";
import { AccountVerificationModal } from "@/components/AccountVerificationModal";
import {
  assertAccountVerifiedMobile,
  bumpAccountVerificationActivity,
  enterSensitiveModuleMobile,
  leaveSensitiveModuleMobile,
  onAccountVerificationRevoked,
} from "@/lib/account-verification";

function money(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

const PERIOD_STATUS_LABEL: Record<string, string> = {
  approved: "Disetujui",
  paid: "Dibayar",
  closed: "Periode ditutup",
};

function SlipCard({
  slip,
  onRequestDownload,
  downloading,
}: {
  slip: StaffPayrollSlip;
  onRequestDownload: (slip: StaffPayrollSlip) => void;
  downloading: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.periodKey}>{formatPeriodMonthYear(slip.period_key)}</Text>
        <Text style={styles.periodRange}>
          {slip.period_start} — {slip.period_end}
          {slip.pay_date ? ` · Bayar: ${slip.pay_date}` : ""}
        </Text>
        <Text style={styles.periodStatus}>
          {PERIOD_STATUS_LABEL[slip.period_status] ?? slip.period_status}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <Row label="Gaji pokok" value={money(slip.base_salary)} />
        <Row label="Lembur" value={money(slip.overtime_amount)} />
        <Row
          label="Bonus kehadiran"
          value={money(slip.attendance_bonus_amount)}
          hint={
            slip.attendance_bonus_reason
              ? slip.attendance_bonus_eligible
                ? slip.attendance_bonus_reason
                : `Tidak memenuhi syarat. ${slip.attendance_bonus_reason}`
              : slip.attendance_bonus_eligible
                ? undefined
                : "Tidak memenuhi syarat"
          }
        />
        <Row
          label="Pencairan cuti"
          value={money(slip.leave_encashment_amount)}
          hint={slip.leave_encashment_reason}
        />
        <Row label="Potongan terlambat" value={money(slip.late_deduction)} muted />
        <Row label="Potongan absensi" value={money(slip.absence_deduction)} muted />
        <View style={styles.divider} />
        <Row label="Kotor" value={money(slip.gross_amount)} strong />
        <Row label="Total potongan" value={money(slip.total_deduction)} muted />
        <View style={styles.thpRow}>
          <Text style={styles.thpLabel}>THP</Text>
          <Text style={styles.thpValue}>Rp {money(slip.net_amount)}</Text>
        </View>
        <Pressable
          style={[styles.downloadBtn, downloading && styles.downloadBtnDis]}
          onPress={() => onRequestDownload(slip)}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.downloadBtnTxt}>Unduh PDF (SERBA)</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  hint,
  muted,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.rowBlock}>
      <View style={styles.rowLine}>
        <Text style={[styles.rowLabel, muted && styles.rowMuted, strong && styles.rowStrong]}>{label}</Text>
        <Text style={[styles.rowValue, muted && styles.rowMuted, strong && styles.rowStrong]}>Rp {value}</Text>
      </View>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </View>
  );
}

export function PayrollStaffPanel({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const hasAccess = !!user && canAccess(user, "/dashboard-staff");

  const [slips, setSlips] = useState<StaffPayrollSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileMeta, setProfileMeta] = useState<PayrollSlipEmployeeMeta | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pendingSlip, setPendingSlip] = useState<StaffPayrollSlip | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const employeeMeta = useMemo((): PayrollSlipEmployeeMeta => {
    if (profileMeta) return profileMeta;
    const u = user as { name?: string; email?: string } | null;
    return {
      name: u?.name || u?.email || "Karyawan",
      email: u?.email,
    };
  }, [profileMeta, user]);

  const load = useCallback(async () => {
    if (!uid) {
      setSlips([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, prof] = await Promise.all([
        fetchStaffPayrollSlips(uid),
        ensureAndSyncProfileMobile(uid).catch(() => ({ profile: null })),
      ]);
      setSlips(list);
      const p = prof.profile;
      if (p) {
        setProfileMeta({
          name: p.name || p.email || "Karyawan",
          email: p.email,
          position: p.position,
          department: p.department,
          division: p.division,
        });
      }
    } catch {
      setSlips([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void enterSensitiveModuleMobile("payslip");
      bumpAccountVerificationActivity();
      void load();
      return () => {
        void leaveSensitiveModuleMobile("payslip");
      };
    }, [load])
  );

  useEffect(() => {
    return onAccountVerificationRevoked(() => {
      setVerifyOpen(false);
      setPendingSlip(null);
      setDownloadingId(null);
    });
  }, []);

  const runDownload = useCallback(
    async (slip: StaffPayrollSlip) => {
      setDownloadingId(slip.id);
      try {
        await assertAccountVerifiedMobile();
        bumpAccountVerificationActivity();
        await downloadSerbaPayrollSlipPdf(slip, employeeMeta);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "ACCOUNT_VERIFICATION_REQUIRED") {
          setPendingSlip(slip);
          setVerifyOpen(true);
          return;
        }
      } finally {
        setDownloadingId(null);
      }
    },
    [employeeMeta]
  );

  const handleVerified = () => {
    setVerifyOpen(false);
    const slip = pendingSlip;
    setPendingSlip(null);
    if (slip) void runDownload(slip);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    bumpAccountVerificationActivity();
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onScroll = (_e: NativeSyntheticEvent<NativeScrollEvent>) => {
    bumpAccountVerificationActivity();
  };

  if (!hasAccess) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Anda tidak memiliki akses ke slip gaji (peran / dashboard).</Text>
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

  const body = (
    <>
      {!embedded ? (
        <>
          <View style={styles.headRow}>
            <Ionicons name="cash-outline" size={28} color="#059669" />
            <Text style={styles.h1}>Slip gaji</Text>
          </View>
          <Text style={styles.sub}>
            Hanya periode yang sudah disetujui atau dibayar oleh HR — unduh PDF memerlukan verifikasi
            akun (15 menit).
          </Text>
        </>
      ) : (
        <View style={styles.embeddedHeader}>
          <View style={styles.headRow}>
            <Ionicons name="cash-outline" size={24} color="#059669" />
            <Text style={styles.embeddedTitle}>Slip gaji</Text>
          </View>
          <Text style={styles.embeddedSub}>
            Periode disetujui/dibayar HR · unduh PDF perlu verifikasi akun
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={PWA.indigo} />
          <Text style={styles.loaderTxt}>Memuat…</Text>
        </View>
      ) : slips.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTxt}>
            Belum ada slip gaji. Setelah HR menyetujui periode payroll, slip Anda akan muncul di sini.
          </Text>
        </View>
      ) : (
        slips.map((s) => (
          <SlipCard
            key={s.id}
            slip={s}
            downloading={downloadingId === s.id}
            onRequestDownload={(slip) => void runDownload(slip)}
          />
        ))
      )}

      <AccountVerificationModal
        open={verifyOpen}
        context="payslip"
        onClose={() => {
          setVerifyOpen(false);
          setPendingSlip(null);
        }}
        onVerified={handleVerified}
      />
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedWrap}>{body}</View>;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      onScroll={onScroll}
      scrollEventThrottle={400}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: PWA.screenBg },
  denied: { color: PWA.red700, fontSize: 15, textAlign: "center", lineHeight: 22 },
  muted: { color: PWA.textMuted, fontSize: 15 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  h1: { fontSize: 24, fontWeight: "800", color: PWA.text },
  sub: { marginTop: 8, fontSize: 14, color: PWA.textSecondary, lineHeight: 21 },
  loader: { marginTop: 32, alignItems: "center", gap: 10 },
  loaderTxt: { color: PWA.textMuted, fontSize: 14 },
  empty: {
    marginTop: 20,
    backgroundColor: PWA.slate50,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    padding: 18,
  },
  emptyTxt: { fontSize: 14, color: PWA.textSecondary, lineHeight: 21 },
  card: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
    overflow: "hidden",
  },
  cardHead: {
    backgroundColor: PWA.slate50,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PWA.border,
  },
  periodKey: { fontSize: 16, fontWeight: "800", color: PWA.text },
  periodRange: { marginTop: 4, fontSize: 12, color: PWA.textMuted },
  periodStatus: { marginTop: 6, fontSize: 12, fontWeight: "700", color: "#047857" },
  cardBody: { padding: 16, gap: 8 },
  rowBlock: { gap: 2 },
  rowLine: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { flex: 1, fontSize: 14, color: PWA.text },
  rowValue: { fontSize: 14 },
  rowMuted: { color: PWA.textMuted },
  rowStrong: { fontWeight: "700", color: PWA.text },
  rowHint: { fontSize: 11, color: PWA.textMuted, marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PWA.border,
    marginVertical: 8,
  },
  thpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
  },
  thpLabel: { fontSize: 17, fontWeight: "800", color: PWA.text },
  thpValue: { fontSize: 17, fontWeight: "800", color: "#047857" },
  embeddedWrap: { gap: 4 },
  embeddedHeader: { marginBottom: 12 },
  embeddedTitle: { fontSize: 17, fontWeight: "800", color: PWA.text },
  embeddedSub: { marginTop: 4, fontSize: 12, color: PWA.textSecondary, lineHeight: 17 },
  downloadBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PWA.indigo,
    paddingVertical: 13,
    borderRadius: 12,
  },
  downloadBtnDis: { opacity: 0.6 },
  downloadBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});

export default PayrollStaffPanel;
