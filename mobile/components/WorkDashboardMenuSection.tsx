import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WorkDashboardTile } from "@/lib/work-dashboard-menu";
import { WorkDashboardGrid } from "@/components/WorkDashboardGrid";
import { OperationalLockBanner } from "@/components/OperationalLockBanner";
import { PWA } from "@/constants/pwaTheme";

type Props = {
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  tiles: WorkDashboardTile[];
  locked?: boolean;
  emptyMessage?: string;
};

export function WorkDashboardMenuSection({
  title,
  hint,
  icon,
  tiles,
  locked = false,
  emptyMessage,
}: Props) {
  if (tiles.length === 0 && !locked) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name={icon} size={18} color={PWA.indigo700} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        {locked ? (
          <View style={styles.lockPill}>
            <Ionicons name="lock-closed" size={12} color={PWA.amber900} />
            <Text style={styles.lockPillTxt}>Terkunci</Text>
          </View>
        ) : (
          <View style={styles.openPill}>
            <Ionicons name="checkmark-circle" size={12} color={PWA.emerald700} />
            <Text style={styles.openPillTxt}>Aktif</Text>
          </View>
        )}
      </View>

      {locked ? (
        <OperationalLockBanner compact variant="work-section" />
      ) : null}

      {tiles.length === 0 ? (
        <Text style={styles.empty}>{emptyMessage ?? "Belum ada modul di bagian ini."}</Text>
      ) : (
        <View style={locked ? styles.gridLocked : undefined} pointerEvents={locked ? "none" : "auto"}>
          <WorkDashboardGrid tiles={tiles} locked={locked} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: PWA.indigo50,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: PWA.text,
  },
  hint: { marginTop: 3, fontSize: 12, lineHeight: 17, color: PWA.textSecondary },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: PWA.amber50,
    borderWidth: 1,
    borderColor: PWA.amber200,
  },
  lockPillTxt: { fontSize: 10, fontWeight: "800", color: PWA.amber900 },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  openPillTxt: { fontSize: 10, fontWeight: "800", color: PWA.emerald700 },
  gridLocked: { opacity: 0.42 },
  empty: {
    fontSize: 13,
    color: PWA.textMuted,
    fontStyle: "italic",
    paddingVertical: 8,
  },
});
