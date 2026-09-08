import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { mobileListMyAttendance } from "@/lib/hr-attendance-api";
import { useMobileLocale } from "@/lib/i18n";
import { friendlyAttendanceMessage } from "@/lib/attendance-ui";
import { PWA } from "@/constants/pwaTheme";

type Row = {
  id?: string;
  date?: string;
  check_in?: string;
  check_out?: string;
  status?: string;
};

function formatDate(raw: string | undefined, locale: string): string {
  if (!raw) return "—";
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(raw?: string, locale = "id"): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(locale === "en" ? "en-GB" : "id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AttendanceHistoryPanel() {
  const { t, locale } = useMobileLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Row[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await mobileListMyAttendance(1, 40);
      if (!res.success) {
        setError(friendlyAttendanceMessage(res.message, t));
        setItems([]);
        return;
      }
      setItems((res.items || []) as Row[]);
    } catch (e) {
      setError(friendlyAttendanceMessage(e instanceof Error ? e.message : t("common.error"), t));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function statusLabel(status?: string): string {
    switch (status) {
      case "present":
        return t("attendance.statusPresent");
      case "late":
        return t("attendance.statusLate");
      case "absent":
        return t("attendance.statusAbsent");
      case "leave":
        return t("attendance.statusLeave");
      default:
        return status || "—";
    }
  }

  if (loading) {
    return <ActivityIndicator color={PWA.indigo} style={{ marginTop: 24 }} />;
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  if (!items.length) {
    return <Text style={styles.empty}>{t("attendance.emptyHistory")}</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {items.map((row) => (
        <View key={String(row.id || row.date || row.check_in)} style={styles.card}>
          <Text style={styles.date} numberOfLines={2}>
            {formatDate(row.date || row.check_in, locale)}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>{t("attendance.checkInTime")}</Text>
            <Text style={styles.metaValue}>{formatTime(row.check_in, locale)}</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>{t("attendance.checkOutTime")}</Text>
            <Text style={styles.metaValue} numberOfLines={2}>
              {row.check_out ? formatTime(row.check_out, locale) : t("attendance.stillWorking")}
            </Text>
          </View>
          <Text style={styles.status}>{statusLabel(row.status)}</Text>
        </View>
      ))}
      <Pressable onPress={() => void load()} style={styles.refresh}>
        <Text style={styles.refreshText}>{locale === "en" ? "Refresh" : "Muat ulang"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    gap: 8,
  },
  date: { fontSize: 15, fontWeight: "700", color: PWA.text, lineHeight: 20 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  metaLabel: { fontSize: 13, color: PWA.textMuted, flexShrink: 0 },
  metaValue: { fontSize: 14, color: PWA.textSecondary, fontWeight: "600", flex: 1, textAlign: "right" },
  status: { fontSize: 13, fontWeight: "700", color: PWA.indigo },
  empty: { color: PWA.textMuted, fontSize: 14, padding: 16, textAlign: "center", lineHeight: 20 },
  error: { color: "#b91c1c", fontSize: 14, padding: 16, lineHeight: 20 },
  refresh: { alignSelf: "center", padding: 12, minHeight: 48, justifyContent: "center" },
  refreshText: { color: PWA.indigo, fontWeight: "700" },
});
