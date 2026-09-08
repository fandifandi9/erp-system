import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileLocale } from "@/lib/i18n";
import { mobileGetCase, reportingFileSource } from "@/lib/hr-reporting-api";
import { caseStatusLabel, mapReportingApiError } from "@/lib/mobile-api-error";
import { PWA } from "@/constants/pwaTheme";

type Att = { id: string; url: string };

export function MobileCaseDetail({ kind }: { kind: "report" | "finding" }) {
  const { t } = useMobileLocale();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [atts, setAtts] = useState<Att[]>([]);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<Att | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        try {
          const json = await mobileGetCase(kind, String(id));
          if (!live) return;
          setData(json.data || null);
          setAtts(json.attachments || []);
        } catch (e) {
          if (live) setError(mapReportingApiError(e, t));
        }
      })();
      return () => {
        live = false;
      };
    }, [id, kind, t]),
  );

  if (error && !data) {
    return (
      <View style={[styles.center, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
        <Ionicons name="alert-circle-outline" size={44} color="#b91c1c" />
        <Text style={styles.errTitle}>{t("common.error")}</Text>
        <Text style={styles.err}>{error}</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} />
        <Text style={styles.meta}>{t("common.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(40, insets.bottom + 24) }]}>
      <Text style={styles.title}>{String(data.title || "")}</Text>
      <Text style={styles.meta}>
        {t(`reporting.${String(data.category || "other")}`)} · {caseStatusLabel(String(data.status || ""), t)}
      </Text>
      {data.location_text ? <Text style={styles.meta}>{String(data.location_text)}</Text> : null}
      <Text style={styles.body}>{String(data.body || "")}</Text>
      <Text style={styles.label}>{t("reporting.evidenceCount", { x: atts.length, y: 5 })}</Text>
      {atts.length === 0 ? (
        <View style={styles.emptyAtt}>
          <Ionicons name="images-outline" size={28} color={PWA.textMuted} />
          <Text style={styles.emptyAttText}>{t("reporting.noEvidence")}</Text>
        </View>
      ) : (
        <View style={styles.thumbs}>
          {atts.map((att) => (
            <Pressable key={att.id} onPress={() => setViewer(att)} accessibilityLabel={t("reporting.evidence")}>
              <Image source={reportingFileSource(att.url)} style={styles.thumb} />
            </Pressable>
          ))}
        </View>
      )}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable
            style={[styles.viewerClose, { top: Math.max(16, insets.top + 8) }]}
            onPress={() => setViewer(null)}
            accessibilityLabel={t("common.close")}
          >
            <Ionicons name="close" size={22} color="#111" />
          </Pressable>
          {viewer ? (
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={styles.viewerInner}>
              <Image source={reportingFileSource(viewer.url)} style={styles.viewerImg} resizeMode="contain" />
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  center: { paddingTop: 24, alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: PWA.text },
  meta: { color: PWA.textMuted, fontSize: 13 },
  body: { fontSize: 16, lineHeight: 22, color: PWA.text },
  label: { fontWeight: "700", color: PWA.text },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 10, backgroundColor: PWA.slate100 },
  emptyAtt: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
    borderStyle: "dashed",
    backgroundColor: PWA.slate50,
  },
  emptyAttText: { fontSize: 13, color: PWA.textMuted, textAlign: "center" },
  errTitle: { fontSize: 16, fontWeight: "700", color: PWA.text },
  err: { color: "#b91c1c", paddingHorizontal: 16, textAlign: "center", lineHeight: 20 },
  viewer: { flex: 1, backgroundColor: "rgba(15,23,42,0.92)", justifyContent: "center" },
  viewerClose: {
    position: "absolute",
    right: 16,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerInner: { flexGrow: 1, justifyContent: "center" },
  viewerImg: { width: "100%", height: "80%" },
});
