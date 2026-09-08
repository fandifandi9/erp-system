import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import {
  getWorkDashboardAccessSummary,
  WORK_DASHBOARD_GUIDE,
  type AccessState,
  type WorkDashboardStatusRow,
} from "@/lib/work-dashboard-status";
import { PWA } from "@/constants/pwaTheme";

type Props = {
  user: Record<string, unknown> | null | undefined;
  refreshing?: boolean;
  onRefresh?: () => void;
};

function stateColors(state: AccessState): { bg: string; fg: string; border: string; icon: keyof typeof Ionicons.glyphMap } {
  if (state === "always" || state === "open") {
    return { bg: "#ecfdf5", fg: PWA.emerald700, border: "#a7f3d0", icon: "checkmark-circle" };
  }
  return { bg: PWA.amber50, fg: PWA.amber900, border: PWA.amber200, icon: "lock-closed" };
}

function StatusRow({ row }: { row: WorkDashboardStatusRow }) {
  const c = stateColors(row.state);
  return (
    <View style={[styles.row, { borderColor: c.border, backgroundColor: c.bg }]}>
      <View style={styles.rowTop}>
        <Ionicons name={c.icon} size={18} color={c.fg} />
        <Text style={styles.rowLabel}>{row.label}</Text>
        <View style={[styles.badge, { backgroundColor: c.fg }]}>
          <Text style={styles.badgeTxt}>{row.headline}</Text>
        </View>
      </View>
      <Text style={styles.rowDetail}>{row.detail}</Text>
    </View>
  );
}

export function WorkDashboardStatusCard({ user, refreshing, onRefresh }: Props) {
  const [guideOpen, setGuideOpen] = useState(false);
  const summary = getWorkDashboardAccessSummary(user);

  const overallBg =
    summary.overallTone === "success"
      ? "#ecfdf5"
      : summary.overallTone === "warning"
        ? PWA.amber50
        : PWA.indigo50;
  const overallFg =
    summary.overallTone === "success"
      ? PWA.emerald700
      : summary.overallTone === "warning"
        ? PWA.amber900
        : PWA.indigo700;
  const overallBorder =
    summary.overallTone === "success"
      ? "#a7f3d0"
      : summary.overallTone === "warning"
        ? PWA.amber200
        : PWA.indigo100;

  return (
    <View style={styles.wrap}>
      <View style={[styles.overall, { backgroundColor: overallBg, borderColor: overallBorder }]}>
        <View style={styles.overallLeft}>
          <Ionicons
            name={
              summary.overallTone === "success"
                ? "shield-checkmark"
                : summary.overallTone === "warning"
                  ? "lock-closed"
                  : "information-circle"
            }
            size={22}
            color={overallFg}
          />
          <View style={styles.overallText}>
            <Text style={styles.overallTitle}>Status akses</Text>
            <Text style={[styles.overallValue, { color: overallFg }]}>{summary.overallLabel}</Text>
          </View>
        </View>
        {onRefresh ? (
          <Pressable
            style={styles.refreshBtn}
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityLabel="Muat ulang status"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={PWA.indigo} />
            ) : (
              <Ionicons name="refresh" size={20} color={PWA.indigo700} />
            )}
          </Pressable>
        ) : null}
      </View>

      {summary.rows.map((row) => (
        <StatusRow key={row.id} row={row} />
      ))}

      {!summary.bypass && summary.workSectionLocked ? (
        <Link href="/(tabs)/attendance" asChild>
          <Pressable style={styles.cta}>
            <Ionicons name="today" size={16} color="#fff" />
            <Text style={styles.ctaTxt}>Absen masuk untuk buka pekerjaan operasional</Text>
          </Pressable>
        </Link>
      ) : null}

      <Pressable
        style={styles.guideToggle}
        onPress={() => setGuideOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: guideOpen }}
      >
        <Ionicons name="help-circle-outline" size={18} color={PWA.indigo700} />
        <Text style={styles.guideToggleTxt}>Panduan: terbuka vs terkunci</Text>
        <Ionicons name={guideOpen ? "chevron-up" : "chevron-down"} size={18} color={PWA.textMuted} />
      </Pressable>

      {guideOpen ? (
        <View style={styles.guideBox}>
          {WORK_DASHBOARD_GUIDE.map((g) => (
            <View key={g.title} style={styles.guideItem}>
              <Text style={styles.guideTitle}>{g.title}</Text>
              <Text style={styles.guideBody}>{g.body}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  overall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  overallLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  overallText: { flex: 1, minWidth: 0 },
  overallTitle: { fontSize: 11, fontWeight: "700", color: PWA.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  overallValue: { marginTop: 2, fontSize: 16, fontWeight: "800" },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: PWA.surface,
    borderWidth: 1,
    borderColor: PWA.border,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: PWA.text, minWidth: 120 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeTxt: { fontSize: 10, fontWeight: "800", color: "#fff", textTransform: "uppercase" },
  rowDetail: { fontSize: 12, lineHeight: 17, color: PWA.textSecondary },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: PWA.indigo,
  },
  ctaTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  guideToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  guideToggleTxt: { flex: 1, fontSize: 13, fontWeight: "600", color: PWA.indigo700 },
  guideBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.slate50,
    padding: 12,
    gap: 12,
  },
  guideItem: { gap: 4 },
  guideTitle: { fontSize: 13, fontWeight: "800", color: PWA.text },
  guideBody: { fontSize: 12, lineHeight: 18, color: PWA.textSecondary },
});
