import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useAuth } from "@/context/auth";
import { WorkDashboardMenuSection } from "@/components/WorkDashboardMenuSection";
import { WorkDashboardStatusCard } from "@/components/WorkDashboardStatusCard";
import { OperationalLockBanner } from "@/components/OperationalLockBanner";
import { useOperationalAccess } from "@/hooks/useOperationalAccess";
import {
  getAccountRoleLabel,
  getWorkDashboardSections,
  getWorkDashboardSubtitle,
  getWorkDashboardTitle,
  getWorkSectionHint,
  isHrOrOwnerAccount,
  isOperationalWorkSectionLocked,
  type WorkDashboardTile,
} from "@/lib/work-dashboard-menu";
import { normalizeAuthModel } from "@/lib/rbac";
import { useMobileLocale } from "@/lib/i18n";
import { PWA } from "@/constants/pwaTheme";
import { getErpWebUrl } from "@/lib/env";
import { pb } from "@/lib/pocketbase";

type DeskSummary = {
  pendingLeave: number;
  suspiciousAttendance: number;
  openFindings: number;
  pendingRecruitmentApprovals: number;
  pendingOvertime?: number;
};

function applyDeskBadges(
  tiles: WorkDashboardTile[],
  summary: DeskSummary | null,
): WorkDashboardTile[] {
  if (!summary) return tiles;
  return tiles.map((tile) => {
    let badgeCount: number | undefined;
    if (tile.id === "hr-leave-queue") badgeCount = summary.pendingLeave;
    if (tile.id === "hr-overtime-queue") badgeCount = summary.pendingOvertime ?? 0;
    if (tile.id === "hr-findings") badgeCount = summary.openFindings;
    return badgeCount != null && badgeCount > 0 ? { ...tile, badgeCount } : tile;
  });
}

export default function MejaKerjaScreen() {
  const { user } = useAuth();
  const { t } = useMobileLocale();
  const { refreshing, refresh } = useOperationalAccess();
  const [summary, setSummary] = useState<DeskSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    const base = getErpWebUrl();
    if (!base || !pb.authStore.token) {
      setSummary(null);
      return;
    }
    try {
      const res = await fetch(`${base}/api/hr/desk-workbench-summary`, {
        headers: { Authorization: `Bearer ${pb.authStore.token}` },
      });
      const json = (await res.json()) as { data?: DeskSummary; error?: string };
      if (!res.ok) {
        setSummaryError(json.error || `HTTP ${res.status}`);
        setSummary(null);
        return;
      }
      setSummaryError(null);
      setSummary(json.data ?? null);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Gagal memuat ringkasan");
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const sections = useMemo(() => getWorkDashboardSections(user), [user]);
  const workTiles = useMemo(
    () => applyDeskBadges(sections.workNative, summary),
    [sections.workNative, summary],
  );
  const title = useMemo(() => getWorkDashboardTitle(user), [user]);
  const subtitle = useMemo(() => getWorkDashboardSubtitle(user), [user]);
  const workLocked = useMemo(() => isOperationalWorkSectionLocked(user), [user]);
  const roleLabel = useMemo(() => getAccountRoleLabel(user), [user]);
  const isHrOwner = useMemo(() => isHrOrOwnerAccount(user), [user]);
  const hasDashboardAccess = useMemo(() => {
    if (!user) return false;
    return normalizeAuthModel(user).dashboardAccess;
  }, [user]);

  const onRefresh = useCallback(() => {
    void refresh();
    void loadSummary();
  }, [refresh, loadSummary]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={PWA.indigo}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="briefcase" size={22} color={PWA.indigo} />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.kicker}>Meja kerja</Text>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
      </View>

      <WorkDashboardStatusCard user={user} refreshing={refreshing} onRefresh={onRefresh} />

      {summaryError ? (
        <View style={styles.errBox}>
          <Text style={styles.errTxt}>{summaryError}</Text>
        </View>
      ) : null}

      {summary &&
      (summary.pendingRecruitmentApprovals > 0 ||
        summary.pendingLeave > 0 ||
        (summary.pendingOvertime ?? 0) > 0) ? (
        <View style={styles.priorityBox}>
          <Text style={styles.priorityTitle}>Perlu tindakan (scoped)</Text>
          {summary.pendingRecruitmentApprovals > 0 ? (
            <Text style={styles.priorityLine}>
              Recruitment: {summary.pendingRecruitmentApprovals}
            </Text>
          ) : null}
          {summary.pendingLeave > 0 ? (
            <Text style={styles.priorityLine}>Cuti: {summary.pendingLeave}</Text>
          ) : null}
          {(summary.pendingOvertime ?? 0) > 0 ? (
            <Text style={styles.priorityLine}>Lembur: {summary.pendingOvertime}</Text>
          ) : null}
        </View>
      ) : null}

      {sections.personal.length > 0 ? (
        <WorkDashboardMenuSection
          title={t("reporting.hubTitle")}
          hint={t("reporting.hubHint")}
          icon="document-text-outline"
          tiles={sections.personal}
          locked={false}
        />
      ) : null}

      <View style={styles.roleChip}>
        <Text style={styles.roleChipTxt}>Peran login: {roleLabel}</Text>
        {!isHrOwner ? (
          <Text style={styles.roleChipHint}>
            Meja Kerja = action center. Profil, absensi, cuti, lembur, dan luar kantor ada di tab{" "}
            <Text style={{ fontWeight: "800" }}>Absensi</Text> / Profil — bukan di sini.
          </Text>
        ) : null}
      </View>

      {isHrOwner ? (
        <WorkDashboardMenuSection
          title="Antrean operasional"
          hint={getWorkSectionHint(user)}
          icon="flash-outline"
          tiles={workTiles}
          locked={false}
        />
      ) : workLocked ? (
        <OperationalLockBanner variant="work-section" />
      ) : workTiles.length > 0 ? (
        <>
          <WorkDashboardMenuSection
            title="Tindakan lapangan"
            hint="Scan & validasi — otorisasi sama Desktop; bukan mini ERP."
            icon="cube-outline"
            tiles={workTiles}
            locked={false}
          />
          <View style={styles.openCard}>
            <Ionicons name="checkmark-circle" size={28} color={PWA.emerald700} />
            <Text style={styles.openTitle}>Meja kerja terbuka</Text>
            <Text style={styles.openBody}>
              Check-out zona gudang dari menu Gudang jika sudah selesai shift di area tersebut.
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.openCard}>
          <Ionicons name="checkmark-circle" size={28} color={PWA.emerald700} />
          <Text style={styles.openTitle}>Meja kerja terbuka</Text>
          <Text style={styles.openBody}>
            {hasDashboardAccess
              ? "Tidak ada antrean pending. Modul lengkap tetap di Desktop ERP."
              : "Sesi operasional aktif. Lanjutkan tugas Anda; absen pulang di tab Absensi saat selesai."}
          </Text>
          <Link href="/(tabs)/attendance" asChild>
            <View style={styles.openLink}>
              <Ionicons name="today-outline" size={16} color={PWA.indigo} />
              <Text style={styles.openLinkTxt}>Ke tab Absensi</Text>
            </View>
          </Link>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 16, paddingBottom: 28, gap: 14 },
  hero: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: PWA.indigo50,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: PWA.textMuted,
  },
  h1: { marginTop: 2, fontSize: 22, fontWeight: "800", color: PWA.text },
  sub: { marginTop: 6, fontSize: 13, lineHeight: 19, color: PWA.textSecondary },
  roleChip: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: PWA.slate50,
    borderWidth: 1,
    borderColor: PWA.border,
    gap: 4,
  },
  roleChipTxt: { fontSize: 12, fontWeight: "800", color: PWA.text },
  roleChipHint: { fontSize: 12, lineHeight: 17, color: PWA.textSecondary },
  openCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    gap: 8,
  },
  openTitle: { fontSize: 17, fontWeight: "800", color: "#065f46" },
  openBody: { fontSize: 13, lineHeight: 20, color: "#047857", textAlign: "center" },
  openLink: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  openLinkTxt: { fontSize: 14, fontWeight: "700", color: PWA.indigo },
  errBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  errTxt: { fontSize: 13, color: "#991b1b" },
  priorityBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    gap: 4,
  },
  priorityTitle: { fontSize: 12, fontWeight: "800", color: "#92400e", textTransform: "uppercase" },
  priorityLine: { fontSize: 13, fontWeight: "600", color: "#78350f" },
});
