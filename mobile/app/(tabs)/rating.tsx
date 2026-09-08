import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  mobileGetMyRatingResult,
  mobileGetRatingTask,
  mobileListMyRatingTasks,
  mobileSaveRatingDraft,
  mobileSubmitRating,
  isRatingApiConfigured,
} from "@/lib/hr-rating-api";
import { mapRatingApiError } from "@/lib/mobile-api-error";
import { useMobileLocale } from "@/lib/i18n";
import { PWA } from "@/constants/pwaTheme";

const ASPECT_ALIASES: Record<string, string> = {
  disiplin: "discipline",
  discipline: "discipline",
  "tanggung_jawab": "responsibility",
  "tanggung jawab": "responsibility",
  responsibility: "responsibility",
  "kerja_sama": "teamwork",
  "kerja sama": "teamwork",
  teamwork: "teamwork",
  komunikasi: "communication",
  communication: "communication",
  "kualitas_kerja": "work_quality",
  "kualitas kerja": "work_quality",
  "work quality": "work_quality",
  work_quality: "work_quality",
};

function aspectLabel(raw: string, t: (k: string) => string): string {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const code = ASPECT_ALIASES[key] || ASPECT_ALIASES[String(raw || "").trim().toLowerCase()] || key;
  const path = `rating.aspect.${code}`;
  const translated = t(path);
  return translated === path ? String(raw || "") : translated;
}

function reviewerStatusLabel(status: string, t: (k: string) => string): string {
  const s = String(status || "").toLowerCase();
  if (s === "locked") return t("rating.locked");
  if (s === "submitted") return t("rating.submittedStatus");
  if (s === "draft") return t("rating.draft");
  if (s === "assigned") return t("rating.assigned");
  return status;
}

function isLockedStatus(status: string): boolean {
  const s = String(status || "").toLowerCase();
  return s === "locked" || s === "submitted";
}

function subjectNameFromExpand(row: Record<string, unknown> | null | undefined): string | null {
  const expand = row?.expand as
    | { assignment?: { expand?: { subject?: { name?: string } } } }
    | undefined;
  const name = expand?.assignment?.expand?.subject?.name;
  return name ? String(name) : null;
}

export default function RatingScreen() {
  const { t } = useMobileLocale();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"result" | "tasks">("result");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSubject, setActiveSubject] = useState<string>("");
  const [taskLocked, setTaskLocked] = useState(false);
  const [aspects, setAspects] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({});

  const load = useCallback(async () => {
    if (!isRatingApiConfigured()) {
      setError(t("common.serverUrlMissing"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [r, taskRes] = await Promise.all([mobileGetMyRatingResult(), mobileListMyRatingTasks()]);
      setResult((r.data as Record<string, unknown>) || null);
      setTasks((taskRes.items as Array<Record<string, unknown>>) || []);
    } catch (e) {
      setError(mapRatingApiError(e, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openTask(id: string, listStatus?: string) {
    try {
      const json = await mobileGetRatingTask(id);
      const reviewer = (json.reviewer as Record<string, unknown> | undefined) || {};
      const status = String(reviewer.status || listStatus || "");
      setActiveId(id);
      setActiveSubject(subjectNameFromExpand(reviewer) || t("rating.subject"));
      setTaskLocked(isLockedStatus(status));
      const asps = (json.aspects || []) as Array<{ id: string; name: string; code?: string }>;
      setAspects(asps);
      const next: Record<string, { score: number; comment: string }> = {};
      for (const a of asps) next[a.id] = { score: 3, comment: "" };
      for (const s of (json.scores || []) as Array<Record<string, unknown>>) {
        next[String(s.aspect)] = {
          score: Number(s.score) || 3,
          comment: String(s.comment || ""),
        };
      }
      setScores(next);
    } catch (e) {
      Alert.alert(t("common.error"), mapRatingApiError(e, t));
    }
  }

  async function submit() {
    if (!activeId || taskLocked) return;
    setSubmitting(true);
    try {
      const payload = Object.entries(scores).map(([aspect_id, v]) => ({
        aspect_id,
        score: Number(v.score),
        comment: v.comment,
      }));
      await mobileSaveRatingDraft(activeId, payload);
      await mobileSubmitRating(activeId);
      Alert.alert(t("rating.submitted"));
      setTaskLocked(true);
      setActiveId(null);
      await load();
    } catch (e) {
      Alert.alert(t("common.error"), mapRatingApiError(e, t));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} />
        <Text style={styles.muted}>{t("common.loading")}</Text>
      </View>
    );
  }

  const res = (result?.result as Record<string, unknown> | null) || null;
  const aspectsAgg = (res?.aspect_scores as Array<Record<string, unknown>>) || [];

  function taskTitle(row: Record<string, unknown>): string {
    const name = subjectNameFromExpand(row);
    if (name) return name;
    return `${t("rating.myTasks")} ${String(row.id || "").slice(0, 8)}`;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(48, insets.bottom + 96) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.tabs}>
          <Pressable onPress={() => setTab("result")} style={[styles.tab, tab === "result" && styles.tabOn]}>
            <Text style={styles.tabText} numberOfLines={1}>
              {t("rating.resultTab")}
            </Text>
          </Pressable>
          <Pressable onPress={() => setTab("tasks")} style={[styles.tab, tab === "tasks" && styles.tabOn]}>
            <Text style={styles.tabText} numberOfLines={1}>
              {t("rating.tasksTab")}
            </Text>
          </Pressable>
        </View>

        {tab === "result" && (
          <View style={styles.card}>
            {!res ? (
              <>
                <Text style={styles.sectionTitle}>{t("rating.myResult")}</Text>
                <Text style={styles.muted}>{t("rating.emptyResult")}</Text>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>{t("rating.myResult")}</Text>
                <Text style={styles.score}>{String(res.overall_score)}</Text>
                <Text style={styles.cat}>{String(res.category)}</Text>
                <Text style={styles.muted}>
                  {t("rating.respondents")}: {String(res.respondents_label || res.respondent_count)}
                </Text>
                {String(res.aggregate_kind) === "current" ? (
                  <Text style={styles.muted}>{t("rating.currentAggregate")}</Text>
                ) : (
                  <Text style={styles.muted}>{t("rating.finalAggregate")}</Text>
                )}
                {res.summary ? (
                  <Text style={styles.body}>
                    {t("rating.summary")}: {String(res.summary)}
                  </Text>
                ) : null}
                {res.strengths ? (
                  <Text style={styles.body}>
                    {t("rating.strengths")}: {String(res.strengths)}
                  </Text>
                ) : null}
                {res.improvements ? (
                  <Text style={styles.body}>
                    {t("rating.improvements")}: {String(res.improvements)}
                  </Text>
                ) : null}
                {res.suggestions ? (
                  <Text style={styles.body}>
                    {t("rating.suggestion")}: {String(res.suggestions)}
                  </Text>
                ) : null}
                {aspectsAgg.map((a) => (
                  <Text key={String(a.aspectId || a.aspectName)} style={styles.muted}>
                    {aspectLabel(String(a.aspectName || a.aspectCode || ""), t)}: {String(a.average)}
                  </Text>
                ))}
                <Text style={styles.privacy}>{t("rating.privacy")}</Text>
              </>
            )}
          </View>
        )}

        {tab === "tasks" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("rating.myTasks")}</Text>
            {tasks.map((row) => (
              <Pressable
                key={String(row.id)}
                onPress={() => void openTask(String(row.id), String(row.status || ""))}
                style={styles.task}
              >
                <Text style={styles.taskTitle} numberOfLines={2}>
                  {taskTitle(row)}
                </Text>
                <Text style={styles.muted}>{reviewerStatusLabel(String(row.status), t)}</Text>
              </Pressable>
            ))}
            {!tasks.length && <Text style={styles.muted}>{t("rating.emptyTasks")}</Text>}

            {activeId && (
              <View style={styles.form}>
                <Text style={styles.sectionTitle} numberOfLines={2}>
                  {activeSubject}
                </Text>
                {taskLocked ? <Text style={styles.lockedHint}>{t("rating.lockedHint")}</Text> : null}
                {aspects.map((a) => (
                  <View key={a.id} style={styles.aspect}>
                    <Text style={styles.taskTitle} numberOfLines={2}>
                      {aspectLabel(a.code || a.name, t)}
                    </Text>
                    <Text style={styles.helper}>{t("rating.scoreHelp")}</Text>
                    <View style={styles.scoreRow}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Pressable
                          key={n}
                          disabled={taskLocked}
                          onPress={() =>
                            setScores((p) => ({
                              ...p,
                              [a.id]: { score: n, comment: p[a.id]?.comment || "" },
                            }))
                          }
                          style={[
                            styles.scoreChip,
                            scores[a.id]?.score === n && styles.scoreChipOn,
                            taskLocked && styles.scoreChipOff,
                          ]}
                          hitSlop={4}
                        >
                          <Text style={[styles.scoreChipText, scores[a.id]?.score === n && styles.scoreChipTextOn]}>
                            {n}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.helper}>{t("rating.comment")}</Text>
                    <TextInput
                      style={[styles.input, styles.comment, taskLocked && styles.inputOff]}
                      placeholder={t("rating.commentPlaceholder")}
                      placeholderTextColor={PWA.textMuted}
                      value={scores[a.id]?.comment || ""}
                      multiline
                      editable={!taskLocked}
                      textAlignVertical="top"
                      onChangeText={(txt) =>
                        setScores((p) => ({
                          ...p,
                          [a.id]: { score: p[a.id]?.score || 3, comment: txt },
                        }))
                      }
                    />
                  </View>
                ))}
                {taskLocked ? null : (
                  <Pressable
                    style={[styles.submit, submitting && styles.submitOff]}
                    disabled={submitting}
                    onPress={() => void submit()}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitText}>{t("rating.submit")}</Text>
                    )}
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  error: { color: "#b91c1c", fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: PWA.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    justifyContent: "center",
  },
  tabOn: { backgroundColor: "#e0e7ff" },
  tabText: { textAlign: "center", fontWeight: "600", color: PWA.text, fontSize: 14 },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: PWA.text, lineHeight: 22 },
  score: { fontSize: 28, fontWeight: "800", color: PWA.text, lineHeight: 34 },
  cat: { fontSize: 16, fontWeight: "600", color: PWA.indigo, lineHeight: 22 },
  muted: { color: PWA.textMuted, fontSize: 13, lineHeight: 18 },
  helper: { color: PWA.textMuted, fontSize: 13, lineHeight: 18 },
  body: { color: PWA.text, fontSize: 15, lineHeight: 22 },
  privacy: { marginTop: 8, fontSize: 12, color: PWA.textMuted, lineHeight: 18 },
  lockedHint: { color: PWA.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  task: {
    paddingVertical: 12,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PWA.border,
  },
  taskTitle: { fontWeight: "600", color: PWA.text, fontSize: 15, lineHeight: 20 },
  form: { marginTop: 12, gap: 14 },
  aspect: { gap: 8 },
  scoreRow: { flexDirection: "row", gap: 6 },
  scoreChip: {
    flex: 1,
    minHeight: 48,
    minWidth: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PWA.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PWA.surface,
  },
  scoreChipOn: { backgroundColor: PWA.indigo, borderColor: PWA.indigo },
  scoreChipOff: { opacity: 0.7 },
  scoreChipText: { fontWeight: "700", color: PWA.text, fontSize: 18 },
  scoreChipTextOn: { color: "#fff" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: PWA.text,
    fontSize: 16,
  },
  inputOff: { backgroundColor: PWA.screenBg },
  comment: { minHeight: 88, textAlignVertical: "top" },
  submit: { backgroundColor: PWA.indigo, borderRadius: 10, padding: 14, minHeight: 52, justifyContent: "center" },
  submitOff: { opacity: 0.6 },
  submitText: { color: "#fff", textAlign: "center", fontWeight: "700" },
});
