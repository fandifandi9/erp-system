import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileLocale } from "@/lib/i18n";
import { mobileListCases } from "@/lib/hr-reporting-api";
import { caseStatusLabel, mapReportingApiError } from "@/lib/mobile-api-error";
import { PWA } from "@/constants/pwaTheme";

type Row = { id: string; title: string; category?: string; status?: string; created?: string };

export function MobileCaseList({ kind }: { kind: "report" | "finding" }) {
  const { t } = useMobileLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const prefix = kind === "finding" ? "/findings" : "/reports";

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const json = await mobileListCases(kind);
          if (live) setItems(json.items || []);
        } catch (e) {
          if (live) setError(mapReportingApiError(e, t));
        } finally {
          if (live) setLoading(false);
        }
      })();
      return () => {
        live = false;
      };
    }, [kind, t]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} />
        <Text style={styles.empty}>{t("common.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(40, insets.bottom + 24) }]}>
      <Pressable style={styles.btn} onPress={() => router.push(`${prefix}/new`)}>
        <Text style={styles.btnTxt}>{kind === "finding" ? t("reporting.newFinding") : t("reporting.newReport")}</Text>
      </Pressable>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {!items.length && !error ? <Text style={styles.empty}>{t("reporting.empty")}</Text> : null}
      {items.map((row) => (
        <Pressable key={row.id} style={styles.card} onPress={() => router.push(`${prefix}/${row.id}`)}>
          <Text style={styles.title} numberOfLines={2}>
            {row.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {t(`reporting.${row.category || "other"}`)} · {caseStatusLabel(row.status || "", t)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  center: { paddingTop: 24, alignItems: "center", gap: 8 },
  btn: {
    minHeight: 52,
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTxt: { color: "#fff", fontWeight: "700" },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 14,
    padding: 14,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
  },
  title: { fontSize: 16, fontWeight: "700", color: PWA.text },
  meta: { marginTop: 4, color: PWA.textMuted, fontSize: 13 },
  empty: { textAlign: "center", color: PWA.textMuted, marginTop: 16 },
  err: { color: "#b91c1c" },
});
