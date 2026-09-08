/**
 * mobile/app/notifications/index.tsx
 * Phase 24 — In-app Notification Center
 *
 * SECURITY:
 * - Taps only open the action path — resource re-authorizes on arrival.
 * - Notification payload contains no sensitive data (generic text only).
 */
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { PWA } from "@/constants/pwaTheme";
import {
  fetchNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/notifications-api";
import { useMobileLocale } from "@/lib/i18n";
import { getErrorMessage } from "@/lib/errors";

const NOTIF_TYPE_ICONS: Record<string, string> = {
  "leave.created": "calendar-outline",
  "leave.approved": "checkmark-circle-outline",
  "leave.rejected": "close-circle-outline",
  "leave.cancelled": "close-outline",
  "overtime.created": "moon-outline",
  "overtime.approved": "checkmark-circle-outline",
  "overtime.rejected": "close-circle-outline",
  "field_activity.created": "navigate-circle-outline",
  "field_activity.approved": "checkmark-circle-outline",
  "field_activity.rejected": "close-circle-outline",
  "report.created": "document-text-outline",
  "report.closed": "checkmark-done-outline",
  "finding.created": "alert-circle-outline",
  "rating.task_assigned": "star-outline",
  "system.test": "information-circle-outline",
};

const NOTIF_TYPE_COLORS: Record<string, string> = {
  "leave.created": "#b45309",
  "leave.approved": "#047857",
  "leave.rejected": "#b91c1c",
  "overtime.created": "#1d4ed8",
  "overtime.approved": "#047857",
  "overtime.rejected": "#b91c1c",
  "field_activity.created": "#0f766e",
  "field_activity.approved": "#047857",
  "field_activity.rejected": "#b91c1c",
  "report.created": "#3730a3",
  "report.closed": "#047857",
  "finding.created": "#991b1b",
  "rating.task_assigned": "#92400e",
  "system.test": "#475569",
};

function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  const isUnread = !item.read_at;
  const iconName = (NOTIF_TYPE_ICONS[item.type] ?? "notifications-outline") as
    | "notifications-outline"
    | "calendar-outline"
    | "checkmark-circle-outline"
    | "close-circle-outline"
    | "moon-outline"
    | "document-text-outline"
    | "alert-circle-outline"
    | "star-outline"
    | "information-circle-outline"
    | "navigate-circle-outline"
    | "close-outline"
    | "checkmark-done-outline";
  const iconColor = NOTIF_TYPE_COLORS[item.type] ?? PWA.textMuted;

  const createdAt = new Date(item.created);
  const timeLabel = createdAt.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <TouchableOpacity
      style={[styles.row, isUnread && styles.rowUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} size={22} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowTitle, isUnread && styles.rowTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {isUnread && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowTime}>{timeLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useMobileLocale();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchNotifications({ page: 1, perPage: 40 });
      setItems(result.items);
      setUnreadCount(result.unreadCount);
    } catch (e) {
      setError(getErrorMessage(e, "Gagal memuat notifikasi. Periksa koneksi Anda."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePress = useCallback(
    async (item: NotificationItem) => {
      // Mark as read (fire-and-forget, don't block navigation)
      if (!item.read_at) {
        void markNotificationRead(item.id).catch(() => {});
        setItems((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n,
          ),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }

      // Navigate to resource action path
      if (item.action) {
        router.push(item.action as `/${string}`);
      }
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => (
      <NotificationRow item={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: NotificationItem) => item.id, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifikasi",
          headerStyle: { backgroundColor: PWA.surfaceGlass },
          headerTintColor: PWA.text,
          headerTitleStyle: { fontWeight: "700", color: PWA.text },
          headerShadowVisible: false,
          headerRight: unreadCount > 0
            ? () => (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </Text>
                </View>
              )
            : undefined,
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={PWA.indigo} />
          <Text style={styles.loadingText}>Memuat notifikasi…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="wifi-outline" size={40} color={PWA.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>Coba lagi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={PWA.indigo}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <Ionicons name="notifications-off-outline" size={48} color={PWA.textMuted} />
              <Text style={styles.emptyTitle}>Belum ada notifikasi</Text>
              <Text style={styles.emptyBody}>
                Notifikasi pengajuan, persetujuan, dan tugas akan muncul di sini.
              </Text>
            </View>
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PWA.screenBg,
    gap: 12,
    padding: 24,
  },
  loadingText: { color: PWA.textMuted, fontSize: 14 },
  errorText: { color: PWA.textSecondary, fontSize: 14, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    backgroundColor: PWA.indigo,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  listContainer: { paddingBottom: 24 },
  emptyContainer: { flex: 1 },
  emptyInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: PWA.text },
  emptyBody: { fontSize: 14, color: PWA.textMuted, textAlign: "center", lineHeight: 20 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: PWA.border, marginLeft: 60 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: PWA.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowUnread: { backgroundColor: PWA.indigo50 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PWA.slate100,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: { flex: 1, gap: 2 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: "500", color: PWA.text },
  rowTitleUnread: { fontWeight: "700" },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PWA.indigo,
    flexShrink: 0,
  },
  rowBody: { fontSize: 13, color: PWA.textSecondary, lineHeight: 18 },
  rowTime: { fontSize: 11, color: PWA.textMuted, marginTop: 2 },
  unreadBadge: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
