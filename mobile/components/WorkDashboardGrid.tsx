import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import type { WorkDashboardTile } from "@/lib/work-dashboard-menu";
import { PWA } from "@/constants/pwaTheme";

type Props = {
  tiles: WorkDashboardTile[];
  locked?: boolean;
};

export function WorkDashboardGrid({ tiles, locked = false }: Props) {
  if (tiles.length === 0) return null;

  return (
    <View style={styles.grid}>
      {tiles.map((tile) => {
        const content = (
          <View style={[styles.card, locked && styles.cardLocked]}>
            <View style={[styles.iconBox, { backgroundColor: tile.iconBg }]}>
              <Ionicons name={tile.icon} size={22} color={tile.iconColor} />
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {tile.title}
            </Text>
            <Text style={styles.cardSub} numberOfLines={2}>
              {tile.subtitle}
            </Text>
            <View style={styles.badge}>
              <Ionicons name="flash-outline" size={11} color={PWA.indigo700} />
              <Text style={styles.badgeTxt}>Antrean HR</Text>
            </View>
          </View>
        );

        if (locked) {
          return (
            <View key={tile.id} style={styles.cell}>
              {content}
            </View>
          );
        }

        return (
          <Link key={tile.id} href={tile.nativeHref as never} asChild>
            <Pressable style={styles.cell}>{content}</Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  cell: {
    width: "50%",
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  card: {
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLocked: { borderColor: PWA.amber200, backgroundColor: PWA.slate50 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: PWA.text },
  cardSub: { marginTop: 4, fontSize: 12, lineHeight: 17, color: PWA.textSecondary },
  badge: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: PWA.indigo50,
  },
  badgeTxt: { fontSize: 10, fontWeight: "700", color: PWA.indigo700 },
});
