import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileLocale } from "@/lib/i18n";
import {
  mobileCreateCase,
  mobileDeleteEvidence,
  mobilePatchCase,
  mobileSubmitCase,
  mobileUploadEvidence,
  reportingFileSource,
} from "@/lib/hr-reporting-api";
import { EVIDENCE_MAX_COUNT, validateEvidenceAsset } from "@/lib/evidence-file";
import { mapReportingApiError } from "@/lib/mobile-api-error";
import { PWA } from "@/constants/pwaTheme";

type Kind = "report" | "finding";
type Att = { id: string; url: string; original_name?: string };

const REPORT_CATS = ["facility", "safety", "other"] as const;
const FINDING_CATS = ["safety", "misconduct", "operations", "other"] as const;

const PICKER_OPTS = {
  quality: 0.7,
  allowsEditing: false,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
} as const;

export function MobileCaseForm({ kind }: { kind: Kind }) {
  const { t } = useMobileLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cats = kind === "finding" ? FINDING_CATS : REPORT_CATS;
  const [id, setId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>(cats[0]);
  const [priority, setPriority] = useState("medium");
  const [location, setLocation] = useState("");
  const [items, setItems] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<Att | null>(null);
  const [err, setErr] = useState("");

  async function ensureDraft() {
    if (id) return id;
    if (!title.trim() || !body.trim()) {
      throw new Error(t("reporting.required"));
    }
    const json = await mobileCreateCase(kind, {
      title: title.trim(),
      body: body.trim(),
      category,
      priority,
      location_text: location,
      submit: false,
    });
    const newId = String(json.id || (json.data as { id?: string } | undefined)?.id);
    setId(newId);
    return newId;
  }

  const pick = useCallback(
    async (fromCamera: boolean) => {
      setErr("");
      if (items.length >= EVIDENCE_MAX_COUNT) {
        setErr(t("reporting.maxEvidence"));
        return;
      }
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(t("common.error"), t("reporting.cameraDenied"));
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(t("common.error"), t("reporting.galleryDenied"));
          return;
        }
      }
      const shot = fromCamera
        ? await ImagePicker.launchCameraAsync(PICKER_OPTS)
        : await ImagePicker.launchImageLibraryAsync({
            ...PICKER_OPTS,
            mediaTypes: ["images"],
          });
      if (shot.canceled || !shot.assets[0]) return;
      const checked = validateEvidenceAsset(shot.assets[0]);
      if (!checked.ok) {
        setErr(t(`reporting.${checked.errorKey}`));
        return;
      }
      setBusy(true);
      try {
        const caseId = await ensureDraft();
        const json = await mobileUploadEvidence(kind, caseId, checked.file);
        setItems((prev) => [...prev, json.data as Att]);
      } catch (e) {
        setErr(mapReportingApiError(e, t));
      } finally {
        setBusy(false);
      }
    },
    [items.length, kind, t, title, body, category, priority, location, id],
  );

  async function remove(att: Att) {
    if (!id) return;
    setBusy(true);
    try {
      await mobileDeleteEvidence(kind, id, att.id);
      setItems((prev) => prev.filter((x) => x.id !== att.id));
    } catch (e) {
      setErr(mapReportingApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setErr("");
    if (!title.trim() || !body.trim()) {
      setErr(t("reporting.required"));
      return;
    }
    setBusy(true);
    try {
      const caseId = await ensureDraft();
      await mobilePatchCase(kind, caseId, {
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        location_text: location,
      });
      await mobileSubmitCase(kind, caseId);
      router.replace(kind === "finding" ? `/findings/${caseId}` : `/reports/${caseId}`);
    } catch (e) {
      setErr(mapReportingApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(24, insets.bottom) + 88 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.label}>{t("reporting.titleField")}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t("reporting.titlePlaceholder")}
          placeholderTextColor={PWA.textMuted}
        />
        <Text style={styles.label}>{t("reporting.category")}</Text>
        <View style={styles.chips}>
          {cats.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipOn]}>
              <Text style={[styles.chipTxt, category === c && styles.chipTxtOn]}>{t(`reporting.${c}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>{t("reporting.priority")}</Text>
        <View style={styles.chips}>
          {["low", "medium", "high"].map((p) => (
            <Pressable key={p} onPress={() => setPriority(p)} style={[styles.chip, priority === p && styles.chipOn]}>
              <Text style={[styles.chipTxt, priority === p && styles.chipTxtOn]}>{t(`reporting.${p}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>{t("reporting.location")}</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder={t("reporting.locationPlaceholder")}
          placeholderTextColor={PWA.textMuted}
        />
        <Text style={styles.label}>{t("reporting.bodyField")}</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={body}
          onChangeText={setBody}
          multiline
          placeholder={t("reporting.bodyPlaceholder")}
          placeholderTextColor={PWA.textMuted}
        />

        <Text style={styles.label}>
          {t("reporting.evidenceCount", { x: items.length, y: EVIDENCE_MAX_COUNT })}
        </Text>
        <View style={styles.thumbs}>
          {items.map((att) => (
            <View key={att.id} style={styles.thumbWrap}>
              <Pressable onPress={() => setViewer(att)} accessibilityLabel={t("reporting.evidence")}>
                <Image source={reportingFileSource(att.url)} style={styles.thumb} />
              </Pressable>
              <Pressable
                style={styles.del}
                onPress={() => void remove(att)}
                hitSlop={8}
                accessibilityLabel={t("common.close")}
              >
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable style={styles.btn} onPress={() => void pick(true)} disabled={busy}>
          <Ionicons name="camera-outline" size={18} color="#fff" />
          <Text style={styles.btnTxt}>{t("reporting.takePhoto")}</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={() => void pick(false)} disabled={busy}>
          <Ionicons name="image-outline" size={18} color={PWA.indigo} />
          <Text style={styles.btnGhostTxt}>{t("reporting.pickGallery")}</Text>
        </Pressable>
        {err ? (
          <View style={styles.errBanner}>
            <Ionicons name="warning-outline" size={18} color="#b91c1c" />
            <Text style={styles.err}>{err}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.stickyFooter,
          { paddingBottom: Math.max(12, insets.bottom + 8) },
        ]}
      >
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => void submit()}
          disabled={busy}
          accessibilityLabel={t("reporting.submit")}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{t("reporting.submit")}</Text>}
        </Pressable>
      </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 8 },
  label: { fontSize: 14, fontWeight: "700", color: PWA.text, marginTop: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: PWA.text,
    backgroundColor: PWA.surface,
  },
  area: { minHeight: 96, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PWA.border,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: PWA.indigo, borderColor: PWA.indigo },
  chipTxt: { fontWeight: "600", color: PWA.text },
  chipTxtOn: { color: "#fff" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: { width: 88, height: 88 },
  thumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: PWA.slate100 },
  del: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  btn: {
    minHeight: 52,
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnTxt: { color: "#fff", fontWeight: "700" },
  btnGhost: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: PWA.surface,
  },
  btnGhostTxt: { color: PWA.indigo, fontWeight: "700" },
  errBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    marginTop: 8,
  },
  err: { flex: 1, color: "#b91c1c", fontSize: 14, lineHeight: 20 },
  btnDisabled: { opacity: 0.55 },
  stickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PWA.border,
    backgroundColor: PWA.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
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
  viewerInner: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  viewerImg: { width: "100%", height: "80%" },
});
