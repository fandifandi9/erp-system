import { useMemo } from "react";
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
} from "@/lib/work-dashboard-menu";
import { normalizeAuthModel } from "@/lib/rbac";
import { PWA } from "@/constants/pwaTheme";

export default function MejaKerjaScreen() {
  const { user } = useAuth();
  const { refreshing, refresh } = useOperationalAccess();

  const sections = useMemo(() => getWorkDashboardSections(user), [user]);
  const title = useMemo(() => getWorkDashboardTitle(user), [user]);
  const subtitle = useMemo(() => getWorkDashboardSubtitle(user), [user]);
  const workLocked = useMemo(() => isOperationalWorkSectionLocked(user), [user]);
  const roleLabel = useMemo(() => getAccountRoleLabel(user), [user]);
  const isHrOwner = useMemo(() => isHrOrOwnerAccount(user), [user]);
  const hasDashboardAccess = useMemo(() => {
    if (!user) return false;
    return normalizeAuthModel(user).dashboardAccess;
  }, [user]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
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

      <WorkDashboardStatusCard user={user} refreshing={refreshing} onRefresh={() => void refresh()} />

      <View style={styles.roleChip}>
        <Text style={styles.roleChipTxt}>Peran login: {roleLabel}</Text>
        {!isHrOwner ? (
          <Text style={styles.roleChipHint}>
            Tab ini mengikuti check-in/out. Absensi, cuti, lembur, dan luar kantor ada di tab{" "}
            <Text style={{ fontWeight: "800" }}>Absensi</Text>.
          </Text>
        ) : null}
      </View>

      {isHrOwner ? (
        <WorkDashboardMenuSection
          title="Antrean operasional"
          hint={getWorkSectionHint(user)}
          icon="flash-outline"
          tiles={sections.workNative}
          locked={false}
        />
      ) : workLocked ? (
        <OperationalLockBanner variant="work-section" />
      ) : sections.workNative.length > 0 ? (
        <>
          <WorkDashboardMenuSection
            title="Gudang & inventory"
            hint="Scan zona dan cek stok di lapangan."
            icon="cube-outline"
            tiles={sections.workNative}
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
              ? "Sesi operasional aktif. Modul lengkap (sama laptop) bisa Anda buka di browser setelah login ERP."
              : "Sesi operasional aktif. Lanjutkan tugas Anda; check-out di tab Absensi saat selesai."}
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
});
