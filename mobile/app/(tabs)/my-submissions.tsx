import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { mobileFetchMySubmissions } from "@/lib/hr-queue-api";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

type Row = {
  id: string;
  kind: string;
  title: string;
  status: string;
  dateLabel: string;
  rejectionReason?: string;
};

export default function MySubmissionsScreen() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await mobileFetchMySubmissions();
      if (!res.ok) {
        Alert.alert("Gagal", res.error || "Tidak bisa memuat pengajuan.");
        setItems([]);
        return;
      }
      setItems(
        res.items.map((r) => ({
          id: String(r.id),
          kind: String(r.kind ?? ""),
          title: String(r.title ?? r.kind ?? ""),
          status: String(r.status ?? ""),
          dateLabel: String(r.dateLabel ?? ""),
          rejectionReason: String(r.rejectionReason ?? "").trim() || undefined,
        })),
      );
    } catch (e) {
      Alert.alert("Gagal", getErrorMessage(e, "Tidak bisa memuat pengajuan."));
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(it) => `${it.kind}-${it.id}`}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
      ListEmptyComponent={<Text style={styles.empty}>Belum ada pengajuan.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>
            {item.dateLabel} · {item.status}
          </Text>
          {item.rejectionReason ? (
            <Text style={styles.reject}>Ditolak: {item.rejectionReason}</Text>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: PWA.screenBg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { textAlign: "center", color: PWA.textMuted, marginTop: 40 },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    marginBottom: 8,
  },
  title: { fontWeight: "700", color: PWA.text },
  meta: { fontSize: 12, color: PWA.textMuted, marginTop: 2 },
  reject: { fontSize: 12, color: "#e11d48", marginTop: 4 },
});
