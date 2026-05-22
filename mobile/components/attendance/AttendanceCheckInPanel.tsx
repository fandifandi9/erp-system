import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import type { RecordModel } from "pocketbase";
import { useAuth } from "@/context/auth";
import {
  checkIn,
  checkOut,
  getTodayAttendance,
  getUserProfile,
  profileRequiresCheckinSelfie,
  type AttendanceRecord,
  type Office,
} from "@/lib/attendance";
import { formatDistance } from "@/lib/gps";
import { pb } from "@/lib/pocketbase";
import { useFocusEffect } from "@react-navigation/native";
import { hasOperationalBypass } from "@/lib/operational-access-gate";
import { PWA } from "@/constants/pwaTheme";

type SelfiePick = { uri: string; name: string; type: string };

function formatTodayId(): string {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeConfig(status?: string): {
  label: string;
  bg: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  switch (status) {
    case "present":
      return {
        label: "Hadir",
        bg: "#d1fae5",
        text: "#065f46",
        icon: "checkmark-circle",
      };
    case "late":
      return {
        label: "Terlambat",
        bg: "#fef3c7",
        text: "#92400e",
        icon: "alert-circle",
      };
    case "absent":
      return {
        label: "Tidak hadir",
        bg: "#fee2e2",
        text: "#991b1b",
        icon: "close-circle",
      };
    case "leave":
      return {
        label: "Cuti",
        bg: "#e0f2fe",
        text: "#0369a1",
        icon: "calendar-outline",
      };
    default:
      return {
        label: "—",
        bg: PWA.slate100,
        text: PWA.textSecondary,
        icon: "time-outline",
      };
  }
}

export function AttendanceCheckInPanel() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const opsBypass = hasOperationalBypass(user as Record<string, unknown> | null);
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selfie, setSelfie] = useState<SelfiePick | null>(null);
  const [requireSelfieHr, setRequireSelfieHr] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());
  const [inlineError, setInlineError] = useState("");
  const [inlineSuccess, setInlineSuccess] = useState("");

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setInlineError("");
    setInlineSuccess("");
    try {
      const [r, { profile, office: o }] = await Promise.all([
        getTodayAttendance(uid),
        getUserProfile(uid),
      ]);
      setRecord(r);
      setOffice(o);
      setRequireSelfieHr(profileRequiresCheckinSelfie(profile));
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function pickSelfieCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin kamera", "Aktifkan kamera di pengaturan.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!shot.canceled && shot.assets[0]) {
      const a = shot.assets[0];
      setSelfie({
        uri: a.uri,
        name: "checkin_selfie.jpg",
        type: a.mimeType ?? "image/jpeg",
      });
      setInlineError("");
    }
  }

  async function pickSelfieGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin galeri", "Aktifkan akses foto di pengaturan.");
      return;
    }
    const shot = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!shot.canceled && shot.assets[0]) {
      const a = shot.assets[0];
      const mime = a.mimeType ?? "image/jpeg";
      const ext = mime.includes("png") ? "png" : "jpg";
      setSelfie({
        uri: a.uri,
        name: a.fileName?.replace(/\s+/g, "_") || `checkin_selfie.${ext}`,
        type: mime,
      });
      setInlineError("");
    }
  }

  async function onCheckIn() {
    if (!uid) return;
    setInlineError("");
    setInlineSuccess("");
    if (requireSelfieHr && !selfie) {
      setInlineError(
        "HR mewajibkan foto selfie saat check-in untuk akun Anda. Ambil atau pilih foto terlebih dahulu."
      );
      return;
    }
    setBusy(true);
    try {
      const res = await checkIn(
        uid,
        selfie
          ? {
              selfie: {
                uri: selfie.uri,
                name: selfie.name,
                type: selfie.type,
              },
            }
          : {}
      );
      if (!res.success) {
        setInlineError(res.message);
        return;
      }
      setInlineSuccess(res.message);
      setSelfie(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onCheckOut() {
    if (!uid) return;
    setInlineError("");
    setInlineSuccess("");
    setBusy(true);
    try {
      const res = await checkOut(uid);
      if (!res.success) {
        setInlineError(res.message);
        return;
      }
      setInlineSuccess(res.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const checkedIn = !!(record?.check_in && !record?.check_out);
  const doneDay = !!(record?.check_in && record?.check_out);
  const hasCheckIn = !!record?.check_in;

  const savedSelfieUrl =
    record?.check_in_selfie && record.id
      ? pb.files.getURL(record as unknown as RecordModel, record.check_in_selfie)
      : null;

  const badge = statusBadgeConfig(record?.status);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* Hero — check-in/out hanya dari app native */}
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>Hari ini</Text>
        <Text style={styles.h1}>Absensi</Text>
        <View style={styles.dateRow}>
          <Ionicons name="time-outline" size={16} color={PWA.indigo} />
          <Text style={styles.dateLine}>{formatTodayId()}</Text>
        </View>
        <Text style={styles.lastUp}>
          Terakhir diperbarui: {lastUpdate.toLocaleTimeString("id-ID")} (saat buka layar)
        </Text>
        {opsBypass ? (
          <View style={styles.bypassHint}>
            <Ionicons name="shield-checkmark" size={16} color={PWA.emerald700} />
            <Text style={styles.bypassHintText}>
              Akun Owner/HR: check-in/out di sini sama seperti staf. Antrean HR ada di tab{" "}
              <Text style={{ fontWeight: "800" }}>Meja kerja</Text>.
            </Text>
          </View>
        ) : null}
        {!record?.check_in ? (
          <View style={styles.heroHint}>
            <Text style={styles.heroHintText}>
              <Text style={styles.heroHintBold}>Foto selfie: </Text>
              blok <Text style={styles.heroHintIndigo}>Foto selfie check-in</Text> ada setelah info kantor
              (jika ada) dan sebelum kartu <Text style={styles.heroHintBold}>Status Hari Ini</Text>. Gunakan{" "}
              <Text style={styles.heroHintBold}>Ambil foto</Text> atau <Text style={styles.heroHintBold}>Pilih dari galeri</Text>
              {requireSelfieHr ? (
                <Text style={{ fontWeight: "600", color: PWA.amber900 }}>
                  {" "}
                  — wajib sebelum Check in.
                </Text>
              ) : (
                <Text> sebelum Check in jika ingin melampirkan foto (opsional).</Text>
              )}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.hubHint}>
        <Ionicons name="swap-horizontal" size={18} color={PWA.indigo700} />
        <Text style={styles.hubHintText}>
          Cuti, lembur, dan luar kantor: pilih tab di atas layar ini. Slip gaji ada di tab Profil.
        </Text>
      </View>

      {inlineError ? (
        <View style={styles.bannerErr}>
          <Ionicons name="warning-outline" size={20} color={PWA.red800} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.bannerErrTitle}>Gagal</Text>
            <Text style={styles.bannerErrMsg}>{inlineError}</Text>
          </View>
        </View>
      ) : null}

      {inlineSuccess ? (
        <View style={styles.bannerOk}>
          <Ionicons name="checkmark-circle" size={20} color={PWA.emerald700} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.bannerOkTitle}>Berhasil</Text>
            <Text style={styles.bannerOkMsg}>{inlineSuccess}</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={PWA.indigo} style={{ marginTop: 24 }} />
      ) : (
        <>
          {office ? (
            <View style={styles.officeCard}>
              <Ionicons name="location-outline" size={22} color={PWA.indigo} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.officeName}>{office.name}</Text>
                <Text style={styles.officeSub}>
                  Radius: {formatDistance(office.radius || 100)}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Selfie sebelum check-in */}
          {!hasCheckIn ? (
            <View
              style={[
                styles.selfieCard,
                requireSelfieHr ? styles.selfieCardRequired : styles.selfieCardOptional,
              ]}
            >
              <View style={styles.selfieCardHeader}>
                <View style={styles.selfieIconWrap}>
                  <Ionicons name="camera" size={22} color={PWA.indigo} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.selfieCardTitle}>Foto selfie check-in</Text>
                  <Text style={styles.selfieCardSub}>
                    {requireSelfieHr ? (
                      <Text style={{ fontWeight: "600", color: PWA.amber900 }}>
                        Wajib untuk akun Anda (HR mengaktifkan audit selfie). Tanpa foto, check-in ditolak.
                      </Text>
                    ) : (
                      "Opsional — membantu HR memverifikasi kehadiran. Anda tetap bisa check-in tanpa foto."
                    )}
                  </Text>
                </View>
              </View>

              <View style={styles.selfieActions}>
                <Pressable style={styles.btnPick} onPress={pickSelfieCamera}>
                  <Ionicons name="camera-outline" size={18} color={PWA.indigo700} />
                  <Text style={styles.btnPickText}>{selfie ? "Ganti (kamera)" : "Ambil foto"}</Text>
                </Pressable>
                <Pressable style={styles.btnPick} onPress={pickSelfieGallery}>
                  <Ionicons name="images-outline" size={18} color={PWA.indigo700} />
                  <Text style={styles.btnPickText}>{selfie ? "Ganti (galeri)" : "Pilih dari galeri"}</Text>
                </Pressable>
              </View>

              {selfie ? (
                <Pressable onPress={() => setSelfie(null)}>
                  <Text style={styles.linkMuted}>Hapus foto</Text>
                </Pressable>
              ) : null}

              {selfie ? (
                <Image source={{ uri: selfie.uri }} style={styles.preview} />
              ) : null}
            </View>
          ) : null}

          {/* Status hari ini */}
          <View style={styles.statusCard}>
            <View style={styles.statusHead}>
              <Text style={styles.statusTitle}>Status Hari Ini</Text>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Ionicons name={badge.icon} size={14} color={badge.text} />
                <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
              </View>
            </View>

            <View style={styles.grid2}>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Check in</Text>
                <Text style={styles.gridTime}>{formatTime(record?.check_in)}</Text>
                {record?.late_minutes != null && record.late_minutes > 0 ? (
                  <Text style={styles.lateHint}>Terlambat {record.late_minutes} menit</Text>
                ) : null}
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Check out</Text>
                <Text style={styles.gridTime}>{formatTime(record?.check_out)}</Text>
                {record?.work_hours != null && record.work_hours > 0 ? (
                  <Text style={styles.workHint}>Jam kerja: {record.work_hours}h</Text>
                ) : null}
              </View>
            </View>

            {record?.distance_meter != null && Number.isFinite(record.distance_meter) ? (
              <View style={styles.skyRow}>
                <Ionicons name="location" size={16} color={PWA.sky700} />
                <Text style={styles.skyRowText}>
                  Jarak dari kantor: {formatDistance(record.distance_meter)}
                </Text>
              </View>
            ) : null}

            {record?.is_suspicious ? (
              <View style={styles.suspiciousRow}>
                <Ionicons name="warning" size={16} color={PWA.red800} />
                <Text style={styles.suspiciousText}>
                  Aktivitas mencurigakan terdeteksi. HR akan meninjau absensi Anda.
                </Text>
              </View>
            ) : null}

            {savedSelfieUrl ? (
              <View style={styles.selfieSavedInCard}>
                <View style={styles.selfieSavedLabelRow}>
                  <Ionicons name="camera" size={14} color={PWA.indigo700} />
                  <Text style={styles.selfieSavedLabel}>Selfie check-in tersimpan</Text>
                </View>
                <Image
                  source={{ uri: savedSelfieUrl }}
                  style={styles.selfieSavedImg}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>
        </>
      )}

      {/* Tombol aksi */}
      <View style={styles.actionGrid}>
        <Pressable
          style={[
            styles.btnIn,
            (busy || !!record?.check_in) && styles.btnDisabled,
          ]}
          disabled={busy || !!record?.check_in}
          onPress={onCheckIn}
        >
          {busy && !checkedIn && !doneDay ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.btnInText}>Check in</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[
            styles.btnOut,
            (busy || !record?.check_in || !!record?.check_out) && styles.btnDisabled,
          ]}
          disabled={busy || !record?.check_in || !!record?.check_out}
          onPress={onCheckOut}
        >
          {busy && (checkedIn || doneDay) ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={22} color="#fff" />
              <Text style={styles.btnOutText}>Check out</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.helpCard}>
        <View style={styles.helpHead}>
          <Ionicons name="clipboard-outline" size={18} color={PWA.indigo} />
          <Text style={styles.helpTitle}>Catatan penting</Text>
        </View>
        <Text style={styles.helpBullet}>{"\u2022"} Pastikan GPS aktif dan izin lokasi diberikan</Text>
        <Text style={styles.helpBullet}>{"\u2022"} Check-in hanya bisa dilakukan di area kantor</Text>
        <Text style={styles.helpBullet}>{"\u2022"} Check-out otomatis menghitung jam kerja</Text>
        <Text style={styles.helpBullet}>
          {"\u2022"} Gunakan tab Cuti / Lembur / Luar kantor di atas untuk pengajuan & riwayat
        </Text>
        <Text style={styles.helpBullet}>{"\u2022"} Hubungi HR jika ada kendala</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: PWA.screenBg },
  container: {
    padding: 20,
    paddingBottom: 32,
    flexGrow: 1,
    gap: 0,
  },
  hero: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: PWA.indigo,
  },
  h1: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "700",
    color: PWA.text,
    letterSpacing: -0.5,
  },
  dateRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateLine: { fontSize: 14, color: PWA.textSecondary, flex: 1, lineHeight: 20 },
  lastUp: { marginTop: 6, fontSize: 11, color: PWA.textMuted },
  heroHint: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: PWA.slate50,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  heroHintText: { fontSize: 11, lineHeight: 17, color: PWA.textSecondary },
  heroHintBold: { fontWeight: "700", color: PWA.text },
  heroHintIndigo: { fontWeight: "700", color: PWA.indigo700 },
  hubHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: PWA.indigo50,
    borderWidth: 1,
    borderColor: PWA.indigo100,
  },
  hubHintText: { flex: 1, fontSize: 13, color: PWA.textSecondary, lineHeight: 19 },
  bannerErr: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: PWA.red50,
    borderWidth: 1,
    borderColor: PWA.red200,
    marginBottom: 14,
  },
  bannerErrTitle: { fontWeight: "700", color: PWA.red800, fontSize: 14 },
  bannerErrMsg: { marginTop: 2, fontSize: 13, color: PWA.red700, lineHeight: 18 },
  bannerOk: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    marginBottom: 14,
  },
  bannerOkTitle: { fontWeight: "700", color: "#065f46", fontSize: 14 },
  bannerOkMsg: { marginTop: 2, fontSize: 13, color: "#047857", lineHeight: 18 },
  officeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: PWA.indigo50,
    borderWidth: 1,
    borderColor: PWA.indigo100,
    marginBottom: 16,
  },
  officeName: { fontSize: 14, fontWeight: "700", color: "#1e1b4b" },
  officeSub: { marginTop: 4, fontSize: 12, color: PWA.indigo700 },
  statusCard: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 14,
  },
  statusHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusTitle: { fontSize: 17, fontWeight: "700", color: PWA.text },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
  grid2: { flexDirection: "row", gap: 12 },
  gridCell: {
    flex: 1,
    backgroundColor: PWA.slate50,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: PWA.borderMuted,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: PWA.textMuted,
    marginBottom: 6,
  },
  gridTime: { fontSize: 26, fontWeight: "700", color: PWA.text },
  lateHint: { marginTop: 6, fontSize: 11, fontWeight: "600", color: "#b45309" },
  workHint: { marginTop: 6, fontSize: 11, fontWeight: "600", color: PWA.emerald700 },
  skyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: PWA.sky50,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  skyRowText: { fontSize: 13, color: "#0c4a6e", flex: 1 },
  suspiciousRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: PWA.red50,
    borderWidth: 1,
    borderColor: PWA.red200,
  },
  suspiciousText: { fontSize: 13, color: PWA.red800, flex: 1, lineHeight: 18 },
  selfieSavedInCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.indigo100,
    backgroundColor: PWA.indigo50,
    padding: 12,
  },
  selfieSavedLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  selfieSavedLabel: { fontSize: 12, fontWeight: "700", color: PWA.indigo700 },
  selfieSavedImg: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    backgroundColor: PWA.slate100,
  },
  selfieCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  selfieCardOptional: {
    backgroundColor: PWA.surface,
    borderColor: PWA.border,
  },
  selfieCardRequired: {
    backgroundColor: PWA.amber50,
    borderColor: PWA.amber200,
  },
  selfieCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  selfieIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: PWA.indigo100,
    alignItems: "center",
    justifyContent: "center",
  },
  selfieCardTitle: { fontSize: 16, fontWeight: "700", color: PWA.text },
  selfieCardSub: { marginTop: 6, fontSize: 13, color: PWA.textSecondary, lineHeight: 19 },
  selfieActions: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  btnPick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.indigo100,
    backgroundColor: PWA.indigo50,
  },
  btnPickText: { fontSize: 13, fontWeight: "700", color: PWA.indigo700 },
  linkMuted: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    color: PWA.textMuted,
    textDecorationLine: "underline",
  },
  preview: {
    marginTop: 14,
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: PWA.slate100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
  },
  actionGrid: { flexDirection: "row", gap: 12, marginBottom: 16 },
  btnIn: {
    flex: 1,
    flexDirection: "row",
    minHeight: 52,
    backgroundColor: PWA.emerald,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: PWA.emerald,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btnInText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  btnOut: {
    flex: 1,
    flexDirection: "row",
    minHeight: 52,
    backgroundColor: PWA.indigo,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: PWA.indigo,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btnOutText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.45 },
  bypassHint: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  bypassHintText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#065f46" },
  helpCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: PWA.border,
  },
  helpHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  helpTitle: { fontSize: 14, fontWeight: "700", color: PWA.text },
  helpBullet: { fontSize: 12, color: PWA.textSecondary, lineHeight: 20, marginLeft: 2 },
});
